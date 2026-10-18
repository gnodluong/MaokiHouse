import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { ZodError } from 'zod';
import { auth, firestore } from '../config/firebase';
import { requireAuth } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';
import { collections, schemas, settingsSchema } from './schemas';
import { defaultSettings } from '../../../shared/workspace';
import type { ResourceName, Resources, AuditEvent } from '../../../shared/workspace';
import { seedWorkspace } from './seed';

export class WorkspaceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const localDemo = () => Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST === '127.0.0.1:9099' && process.env.FIREBASE_PROJECT_ID?.startsWith('demo-') && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080');
export const collection = (resource: ResourceName) => firestore.collection(collections[resource]);
export async function listRecords<K extends ResourceName>(resource: K, hostId: string): Promise<Resources[K][]> {
  const result = await collection(resource).where('hostId', '==', hostId).get();
  return result.docs.map(doc => {
    const raw = doc.data();
    const normalized = schemas[resource].safeParse(raw);
    return { ...(normalized.success ? normalized.data : {}), ...raw, id: doc.id } as unknown as Resources[K];
  });
}
function resourceName(raw: string): ResourceName {
  if (!Object.hasOwn(collections, raw)) throw new WorkspaceError(404, 'Không tìm thấy danh mục');
  return raw as ResourceName;
}
function checkedId(value: string) {
  if (!/^[\w-]{1,150}$/.test(value)) throw new WorkspaceError(400, 'Mã bản ghi không hợp lệ');
  return value;
}
export async function ownedRecord(resource: ResourceName, id: string, hostId: string) {
  const doc = await collection(resource).doc(checkedId(id)).get();
  if (!doc.exists || doc.data()?.hostId !== hostId) throw new WorkspaceError(404, 'Không tìm thấy bản ghi');
  return { ...doc.data(), id: doc.id } as Record<string, unknown>;
}
async function audit(hostId: string, action: string, resource: string, label: string, actor: string) {
  await firestore.collection('workspaceActivity').add({ hostId, action, resource, label, actor, timestamp: Date.now() });
}
export const route = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, _next: NextFunction) => {
  try { await handler(req, res); }
  catch (error) {
    if (error instanceof ZodError) { res.status(400).json({ error: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }); return; }
    if (error instanceof WorkspaceError) { res.status(error.status).json({ error: error.message }); return; }
    console.error('Workspace operation failed:', error);
    res.status(500).json({ error: 'Không thể hoàn tất thao tác. Vui lòng thử lại.' });
  }
};

export async function getSettings(hostId: string) {
  const doc = await firestore.collection('workspaceSettings').doc(hostId).get();
  return { ...defaultSettings, ...doc.data() };
}
async function checkReferences(resource: ResourceName, data: Record<string, unknown>, hostId: string) {
  if (typeof data.propertyId === 'string' && data.propertyId) await ownedRecord('properties', data.propertyId, hostId);
  if (typeof data.contactId === 'string' && data.contactId) await ownedRecord('contacts', data.contactId, hostId);
  if (resource === 'owners') await Promise.all((data.propertyIds as string[]).map(id => ownedRecord('properties', id, hostId)));
  if (resource === 'bookings' && String(data.checkIn) >= String(data.checkOut)) throw new WorkspaceError(400, 'Ngày trả phòng phải sau ngày nhận phòng');
  if (resource === 'rates' && String(data.startDate) > String(data.endDate)) throw new WorkspaceError(400, 'Ngày kết thúc phải từ ngày bắt đầu trở đi');
  if (resource === 'revenue' && data.type !== 'adjustment' && Number(data.amount) < 0) throw new WorkspaceError(400, 'Nhập số tiền dương cho khoản thu/chi');
  if (resource === 'campaigns' && data.status === 'scheduled') {
    if (!data.scheduledAt || new Date(String(data.scheduledAt)).getTime() <= Date.now()) throw new WorkspaceError(400, 'Chọn thời gian gửi trong tương lai');
  }
}

/** All reservation entry points share one transaction, including direct booking. */
export async function saveReservation(hostId: string, data: Record<string, unknown>, id?: string) {
  if (String(data.checkIn) >= String(data.checkOut)) throw new WorkspaceError(400, 'Ngày trả phòng phải sau ngày nhận phòng');
  const ref = id ? collection('bookings').doc(checkedId(id)) : collection('bookings').doc();
  await firestore.runTransaction(async transaction => {
    const own = id ? await transaction.get(ref) : null;
    if (id && (!own?.exists || own.data()?.hostId !== hostId)) throw new WorkspaceError(404, 'Không tìm thấy đặt phòng');
    const property = await transaction.get(collection('properties').doc(String(data.propertyId)));
    if (!property.exists || property.data()?.hostId !== hostId || (property.data()?.status !== 'active' && data.status !== 'cancelled')) throw new WorkspaceError(400, 'Phòng không hoạt động hoặc không tồn tại');
    const bookings = await transaction.get(collection('bookings').where('hostId', '==', hostId));
    if (data.status !== 'cancelled' && bookings.docs.some(doc => {
      const booking = doc.data();
      return doc.id !== id && booking.propertyId === data.propertyId && booking.status !== 'cancelled' && String(booking.checkIn) < String(data.checkOut) && String(booking.checkOut) > String(data.checkIn);
    })) throw new WorkspaceError(409, 'Phòng đã có đặt phòng trong khoảng ngày này. Vui lòng chọn ngày khác.');
    transaction.set(ref, { ...own?.data(), ...data, hostId, createdAt: own?.data()?.createdAt || Date.now(), updatedAt: Date.now() });
  });
  return { ...(await ref.get()).data(), id: ref.id };
}

export async function appendMessage(hostId: string, id: string, text: string, sender: 'host' | 'guest' = 'host') {
  const ref = collection('conversations').doc(checkedId(id));
  return firestore.runTransaction(async transaction => {
    const doc = await transaction.get(ref);
    if (!doc.exists || doc.data()?.hostId !== hostId) throw new WorkspaceError(404, 'Không tìm thấy hội thoại');
    const data = doc.data()!;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length >= 200) throw new WorkspaceError(409, 'Hội thoại đã đạt giới hạn 200 tin nhắn. Vui lòng mở hội thoại mới.');
    const timestamp = Date.now();
    const update = { messages: [...messages, { sender, text, timestamp, delivery: 'local' }], lastMessageAt: timestamp, unread: sender === 'guest', status: 'open', updatedAt: timestamp };
    transaction.update(ref, update);
    return { ...data, ...update, id: doc.id };
  });
}

export async function runAutomation(hostId: string, automationId: string, context: { conversationId?: string; bookingId?: string }) {
  const automation = await ownedRecord('automations', automationId, hostId);
  if (!automation.enabled) throw new WorkspaceError(400, 'Quy tắc đang tạm dừng');
  const conversation = context.conversationId ? await ownedRecord('conversations', context.conversationId, hostId) : undefined;
  const booking = context.bookingId ? await ownedRecord('bookings', context.bookingId, hostId) : undefined;
  if (automation.action === 'create_task') {
    if (!booking) throw new WorkspaceError(400, 'Chọn một đặt phòng để tạo công việc');
    await collection('tasks').add({ hostId, title: String(automation.content).replaceAll('{{guest}}', String(booking.guestName)), propertyId: booking.propertyId, assignee: '', dueDate: booking.checkIn, status: 'todo', priority: 'normal', type: 'checkin', notes: `Tạo bởi quy tắc: ${automation.name}`, createdAt: Date.now() });
  } else {
    if (!conversation) throw new WorkspaceError(400, 'Chọn một hội thoại để chạy quy tắc này');
    if (automation.action === 'send_reply') await appendMessage(hostId, String(conversation.id), String(automation.content).replaceAll('{{guest}}', String(conversation.guestName)));
    else {
      const ref = collection('conversations').doc(String(conversation.id));
      await firestore.runTransaction(async transaction => {
        const doc = await transaction.get(ref);
        if (doc.data()?.hostId !== hostId) throw new WorkspaceError(404, 'Không tìm thấy hội thoại');
        transaction.update(ref, { tags: [...new Set([...(doc.data()?.tags || []), String(automation.content)])] });
      });
    }
  }
  const ref = collection('automations').doc(automationId);
  await firestore.runTransaction(async transaction => {
    const doc = await transaction.get(ref);
    transaction.update(ref, { runCount: (doc.data()?.runCount || 0) + 1, lastRunAt: Date.now() });
  });
  await audit(hostId, 'automation', 'automations', String(automation.name), 'Tự động hóa');
}
export async function triggerAutomations(hostId: string, trigger: string, context: { conversationId?: string; bookingId?: string }) {
  const automations = await listRecords('automations', hostId);
  const warnings: string[] = [];
  for (const automation of automations) {
    if (automation.enabled && automation.trigger === trigger) {
      try { await runAutomation(hostId, automation.id, context); }
      catch { warnings.push(`Quy tắc ${automation.name} chưa chạy được. Kiểm tra ngữ cảnh và thử lại.`); }
    }
  }
  return warnings;
}

const router = Router();
router.use(requireAuth);
router.post('/demo', route(async (req, res) => {
  if (!localDemo()) throw new WorkspaceError(404, 'Không tìm thấy');
  await auth.setCustomUserClaims(req.user!.uid, { admin: true });
  const seeded = await seedWorkspace(req.user!.uid);
  res.json({ seeded });
}));
router.use(adminOnly);
router.get('/', route(async (req, res) => {
  const hostId = req.user!.uid;
  const pairs = await Promise.all((Object.keys(collections) as ResourceName[]).map(async name => [name, await listRecords(name, hostId)]));
  const activity = await firestore.collection('workspaceActivity').where('hostId', '==', hostId).get();
  res.json({ ...Object.fromEntries(pairs), settings: await getSettings(hostId), activity: activity.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditEvent)).sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 50), capabilities: { localDemo: localDemo(), aiConfigured: Boolean(process.env.GEMINI_API_KEY) } });
}));
router.put('/settings', route(async (req, res) => {
  const hostId = req.user!.uid;
  const input = settingsSchema.parse(req.body);
  const existing = await getSettings(hostId);
  const data = { ...input, widgetToken: existing.widgetToken || randomBytes(24).toString('hex'), hostId };
  await firestore.collection('workspaceSettings').doc(hostId).set(data, { merge: true });
  await audit(hostId, 'update', 'settings', input.businessName, req.user!.email || 'Chủ nhà');
  res.json(data);
}));
router.post('/seed', route(async (req, res) => {
  if (!localDemo()) throw new WorkspaceError(403, 'Dữ liệu mẫu chỉ dành cho môi trường demo');
  res.json({ seeded: await seedWorkspace(req.user!.uid) });
}));
router.post('/conversations/:id/messages', route(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text || text.length > 3000) throw new WorkspaceError(400, 'Tin nhắn cần từ 1 đến 3.000 ký tự');
  const sender = req.body.sender === 'guest' ? 'guest' : 'host';
  if (sender === 'guest' && !localDemo()) throw new WorkspaceError(403, 'Mô phỏng tin đến chỉ có trong môi trường demo');
  res.json(await appendMessage(req.user!.uid, req.params.id, text, sender));
}));
router.post('/automations/:id/run', route(async (req, res) => {
  await runAutomation(req.user!.uid, checkedId(req.params.id), { conversationId: req.body.conversationId, bookingId: req.body.bookingId });
  res.json({ ok: true });
}));
async function save(req: Request, res: Response) {
  const resource = resourceName(req.params.resource);
  const hostId = req.user!.uid;
  const existing = req.params.id ? await ownedRecord(resource, req.params.id, hostId) : undefined;
  const raw = req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new WorkspaceError(400, 'Dữ liệu không hợp lệ');
  const forbidden = ['id', 'hostId', 'messages', 'publicToken', 'runCount', 'createdAt'];
  if (forbidden.some(key => key in raw)) throw new WorkspaceError(400, 'Không thể thay đổi trường hệ thống');
  const data: Record<string, unknown> = schemas[resource].parse({ ...existing, ...raw });
  await checkReferences(resource, data, hostId);
  let saved: Record<string, unknown>;
  if (resource === 'bookings') saved = await saveReservation(hostId, data, req.params.id);
  else {
    const ref = existing ? collection(resource).doc(String(existing.id)) : collection(resource).doc();
    if (!existing && resource === 'conversations') Object.assign(data, { messages: data.initialMessage ? [{ sender: 'guest', text: data.initialMessage, timestamp: Date.now(), delivery: 'local' }] : [], unread: true, lastMessageAt: Date.now() });
    delete data.initialMessage;
    if (resource === 'guidebooks' && !/^[a-f0-9]{48}$/.test(String(existing?.publicToken || ''))) data.publicToken = randomBytes(24).toString('hex');
    if (!existing && resource === 'automations') data.runCount = 0;
    saved = { ...existing, ...data, hostId, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() };
    delete saved.id;
    await ref.set(saved);
    saved = { ...saved, id: ref.id };
  }
  await audit(hostId, existing ? 'update' : 'create', resource, String(data.title || data.name || data.guestName || data.description || resource), req.user!.email || 'Chủ nhà');
  let warnings: string[] = [];
  if (!existing && resource === 'conversations') warnings = await triggerAutomations(hostId, 'new_conversation', { conversationId: String(saved.id) });
  if (resource === 'bookings' && data.status === 'confirmed' && existing?.status !== 'confirmed') warnings = await triggerAutomations(hostId, 'booking_confirmed', { bookingId: String(saved.id) });
  res.status(existing ? 200 : 201).json({ ...saved, ...(warnings.length ? { warnings } : {}) });
}
router.post('/:resource', route(save));
router.patch('/:resource/:id', route(save));
router.delete('/:resource/:id', route(async (req, res) => {
  const resource = resourceName(req.params.resource);
  const hostId = req.user!.uid;
  const existing = await ownedRecord(resource, req.params.id, hostId);
  if (resource === 'properties') {
    for (const dependent of ['bookings', 'rates', 'guidebooks', 'tasks', 'revenue'] as const) {
      if ((await listRecords(dependent, hostId)).some(record => record.propertyId === existing.id)) throw new WorkspaceError(409, 'Phòng đang được sử dụng. Hãy chuyển sang ngừng hoạt động để giữ lịch sử.');
    }
    if ((await listRecords('owners', hostId)).some(owner => Array.isArray(owner.propertyIds) && owner.propertyIds.includes(String(existing.id)))) throw new WorkspaceError(409, 'Gỡ phòng khỏi chủ sở hữu trước khi xóa.');
  }
  if (resource === 'contacts') {
    for (const dependent of ['bookings', 'conversations'] as const) {
      if ((await listRecords(dependent, hostId)).some(record => record.contactId === existing.id)) throw new WorkspaceError(409, 'Khách hàng đang có đặt phòng hoặc hội thoại. Giữ hồ sơ để bảo toàn lịch sử.');
    }
  }
  await collection(resource).doc(req.params.id).delete();
  await audit(hostId, 'delete', resource, String(existing.title || existing.name || existing.guestName || resource), req.user!.email || 'Chủ nhà');
  res.status(204).send();
}));
export default router;
