import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { firestore } from '../config/firebase';
import { collection, getSettings, listRecords, route, saveReservation, WorkspaceError, appendMessage, triggerAutomations } from './router';
import { date } from './schemas';
import type { Stay } from '../../../shared/workspace';

const router = Router();
const visitors = new Map<string, { count: number; until: number }>();
router.use((req, res, next) => {
  const key = req.ip || 'unknown'; const now = Date.now();
  if (visitors.size > 10000) for (const [id, value] of visitors) if (value.until < now) visitors.delete(id);
  const state = visitors.get(key);
  if (!state || state.until < now) visitors.set(key, { count: 1, until: now + 60000 });
  else if (++state.count > 120) { res.status(429).json({ error: 'Bạn thao tác hơi nhanh. Vui lòng thử lại sau một phút.' }); return; }
  next();
});
const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);
const datesSchema = z.object({ checkIn: date, checkOut: date }).refine(value => value.checkIn < value.checkOut, 'Ngày trả phòng phải sau ngày nhận phòng');
export async function publicProperty(id: string) {
  if (!/^[\w-]{1,150}$/.test(id)) throw new WorkspaceError(404, 'Không tìm thấy phòng');
  const doc = await collection('properties').doc(id).get();
  const property = doc.data();
  if (!property || !property.published || property.status !== 'active') throw new WorkspaceError(404, 'Phòng chưa mở đặt trực tiếp');
  return { ...property, id: doc.id } as Stay;
}
export async function quoteStay(id: string, checkIn: string, checkOut: string) {
  datesSchema.parse({ checkIn, checkOut });
  const property = await publicProperty(id);
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  if (nights > 90) throw new WorkspaceError(400, 'Mỗi yêu cầu đặt phòng tối đa 90 đêm');
  const settings = await getSettings(String(property.hostId));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone }).format(new Date());
  if (checkIn < today) throw new WorkspaceError(400, 'Không thể đặt phòng trong quá khứ');
  const plans = (await listRecords('rates', String(property.hostId))).filter(rate => rate.propertyId === id).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  let total = 0; let minNights = 1;
  for (let i = 0; i < nights; i++) {
    const night = new Date(Date.parse(checkIn) + i * 86400000).toISOString().slice(0, 10);
    const rate = plans.find(plan => String(plan.startDate) <= night && String(plan.endDate) >= night);
    if (rate?.closed) throw new WorkspaceError(409, 'Phòng tạm ngừng nhận khách trong một số ngày đã chọn');
    total += Number(rate?.nightlyRate ?? property.basePrice);
    minNights = Math.max(minNights, Number(rate?.minNights || 1));
  }
  if (nights < minNights) throw new WorkspaceError(400, `Khoảng ngày này yêu cầu tối thiểu ${minNights} đêm`);
  const reservations = await listRecords('bookings', String(property.hostId));
  if (reservations.some(booking => booking.propertyId === id && booking.status !== 'cancelled' && String(booking.checkIn) < checkOut && String(booking.checkOut) > checkIn)) throw new WorkspaceError(409, 'Phòng đã có đặt phòng trong khoảng ngày này');
  return { property, nights, total, currency: settings.currency };
}
router.get('/properties', route(async (_req, res) => {
  const docs = await collection('properties').where('published', '==', true).limit(50).get();
  res.json(await Promise.all(docs.docs.filter(doc => doc.data().status === 'active').map(async doc => {
    const p = doc.data(); const settings = await getSettings(String(p.hostId));
    return { id: doc.id, title: p.title, address: p.address, description: p.description, imageURLs: p.imageURLs, basePrice: p.basePrice, capacity: p.capacity, currency: settings.currency, businessName: settings.businessName };
  })));
}));
router.get('/properties/:id', route(async (req, res) => {
  const property = await publicProperty(req.params.id);
  const settings = await getSettings(String(property.hostId));
  const { id, title, address, description, imageURLs, basePrice, capacity, bedrooms } = property;
  res.json({ id, title, address, description, imageURLs, basePrice, capacity, bedrooms, businessName: settings.businessName, currency: settings.currency, checkinTime: settings.checkinTime, checkoutTime: settings.checkoutTime });
}));
router.get('/properties/:id/quote', route(async (req, res) => {
  const dates = datesSchema.parse(req.query);
  const { nights, total, currency } = await quoteStay(req.params.id, dates.checkIn, dates.checkOut);
  res.json({ nights, total, currency });
}));
router.post('/properties/:id/book', route(async (req, res) => {
  const input = datesSchema.and(z.object({ name: z.string().trim().min(1).max(150), email: z.email(), phone: z.string().trim().min(5).max(50), notes: z.string().trim().max(2000).default('') })).parse(req.body);
  const quote = await quoteStay(req.params.id, input.checkIn, input.checkOut);
  const hostId = String(quote.property.hostId);
  const contact = await collection('contacts').add({ hostId, name: input.name, email: input.email, phone: input.phone, source: 'direct', stage: 'lead', tags: ['Đặt trực tiếp'], notes: '', createdAt: Date.now() });
  try {
    const booking = await saveReservation(hostId, { propertyId: req.params.id, contactId: contact.id, guestName: input.name, guestEmail: input.email, guestPhone: input.phone, source: 'direct', checkIn: input.checkIn, checkOut: input.checkOut, status: 'pending', payoutAmount: quote.total, notes: input.notes });
    res.status(201).json({ reference: booking.id, status: 'pending', total: quote.total, currency: quote.currency });
  } catch (error) { await contact.delete(); throw error; }
}));
router.get('/guidebooks/:token', route(async (req, res) => {
  const token = tokenSchema.parse(req.params.token);
  const docs = await collection('guidebooks').where('publicToken', '==', token).limit(1).get();
  const guide = docs.docs[0]?.data();
  if (!guide?.published) throw new WorkspaceError(404, 'Sổ tay chưa được xuất bản');
  const property = await collection('properties').doc(guide.propertyId).get();
  if (property.data()?.hostId !== guide.hostId) throw new WorkspaceError(404, 'Không tìm thấy phòng');
  res.json({ title: guide.title, welcome: guide.welcome, checkin: guide.checkin, wifiName: guide.wifiName, wifiPassword: guide.wifiPassword, houseRules: guide.houseRules, recommendations: guide.recommendations, propertyTitle: property.data()?.title });
}));

async function widgetSettings(token: string) {
  tokenSchema.parse(token);
  const docs = await firestore.collection('workspaceSettings').where('widgetToken', '==', token).limit(1).get();
  const settings = docs.docs[0]?.data();
  if (!settings?.widgetEnabled) throw new WorkspaceError(404, 'Kênh trò chuyện chưa được mở');
  return { ...settings, businessName: String(settings.businessName), widgetGreeting: String(settings.widgetGreeting), hostId: docs.docs[0].id };
}
async function visitorConversation(token: string, session: string) {
  if (!/^[a-f0-9]{64}$/.test(session)) throw new WorkspaceError(404, 'Phiên trò chuyện không hợp lệ');
  const stored = await firestore.collection('visitorSessions').doc(createHash('sha256').update(session).digest('hex')).get();
  const value = stored.data();
  if (!value || value.widgetToken !== token || value.expiresAt < Date.now()) throw new WorkspaceError(404, 'Phiên trò chuyện đã hết hạn');
  const doc = await collection('conversations').doc(value.conversationId).get();
  if (!doc.exists || doc.data()?.hostId !== value.hostId) throw new WorkspaceError(404, 'Hội thoại không tồn tại');
  return { ...value, conversationId: String(value.conversationId), conversation: doc.data()! };
}
router.get('/widget/:token', route(async (req, res) => {
  const settings = await widgetSettings(req.params.token);
  const session = req.query.session ? await visitorConversation(req.params.token, String(req.query.session)) : undefined;
  res.json({ businessName: settings.businessName, greeting: settings.widgetGreeting, messages: session?.conversation.messages || [] });
}));
router.post('/widget/:token', route(async (req, res) => {
  const settings = await widgetSettings(req.params.token);
  const input = z.object({ text: z.string().trim().min(1).max(2000), name: z.string().trim().min(1).max(100).optional(), email: z.union([z.email(), z.literal('')]).default(''), session: z.string().optional() }).parse(req.body);
  if (input.session) {
    const session = await visitorConversation(req.params.token, input.session);
    const conversation = await appendMessage(settings.hostId, String(session.conversationId), input.text, 'guest');
    res.json({ session: input.session, messages: conversation.messages }); return;
  }
  if (!input.name) throw new WorkspaceError(400, 'Bạn cho MaokiHouse biết tên nhé');
  const session = randomBytes(32).toString('hex'); const timestamp = Date.now();
  const contact = collection('contacts').doc(); const conversation = collection('conversations').doc();
  const messages = [{ sender: 'guest', text: input.text, timestamp, delivery: 'local' }];
  const batch = firestore.batch();
  batch.set(contact, { hostId: settings.hostId, name: input.name, email: input.email, phone: '', source: 'webchat', stage: 'lead', tags: ['Website'], notes: '', createdAt: timestamp });
  batch.set(conversation, { hostId: settings.hostId, contactId: contact.id, guestName: input.name, platform: 'webchat', status: 'open', assignee: '', tags: ['Website'], messages, unread: true, lastMessageAt: timestamp, createdAt: timestamp });
  batch.set(firestore.collection('visitorSessions').doc(createHash('sha256').update(session).digest('hex')), { hostId: settings.hostId, widgetToken: req.params.token, conversationId: conversation.id, expiresAt: timestamp + 7 * 86400000 });
  await batch.commit();
  await triggerAutomations(settings.hostId, 'new_conversation', { conversationId: conversation.id });
  res.status(201).json({ session, messages: (await conversation.get()).data()?.messages || messages });
}));
export default router;
