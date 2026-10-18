import { z } from 'zod';

const text = z.string().trim().max(1000);
const name = z.string().trim().min(1, 'Vui lòng nhập tên').max(150);
const notes = z.string().trim().max(10000).default('');
const email = z.union([z.email(), z.literal('')]).default('');
export const date = z.iso.date();
const amount = z.number().finite().min(0).max(1e12);
const id = z.string().max(150).regex(/^[\w-]*$/);
const platforms = ['direct', 'airbnb', 'booking', 'agoda', 'facebook', 'instagram', 'zalo', 'email', 'webchat'] as const;
const tags = z.array(z.string().trim().min(1).max(50)).max(30).default([]);
const optionalId = id.default('');
export const schemas = {
  properties: z.object({ title: name, address: text.default(''), description: notes, status: z.enum(['active', 'inactive']).default('active'), imageURLs: z.array(z.string().max(2000).refine(value => value.startsWith('/') || /^https:\/\//.test(value), 'Sử dụng đường dẫn ảnh HTTPS')).max(15).default([]), basePrice: amount, bedrooms: z.number().int().min(0).max(100).default(1), capacity: z.number().int().min(1).max(1000).default(2), published: z.boolean().default(false) }),
  bookings: z.object({ propertyId: id.min(1), guestName: name, guestEmail: email, guestPhone: text.default(''), contactId: optionalId, source: z.enum(['direct', 'airbnb', 'booking', 'agoda']).default('direct'), checkIn: date, checkOut: date, status: z.enum(['pending', 'confirmed', 'cancelled']).default('pending'), payoutAmount: amount, notes }),
  contacts: z.object({ name, email, phone: text.default(''), source: z.enum(platforms).default('direct'), stage: z.enum(['lead', 'guest', 'returning']).default('lead'), tags, notes }),
  conversations: z.object({ guestName: name, platform: z.enum(platforms).default('direct'), contactId: optionalId, assignee: text.default(''), status: z.enum(['open', 'pending', 'closed']).default('open'), tags, unread: z.boolean().default(false), initialMessage: z.string().trim().max(3000).optional() }),
  tasks: z.object({ title: name, propertyId: optionalId, assignee: text.default(''), dueDate: date, status: z.enum(['todo', 'doing', 'done']).default('todo'), priority: z.enum(['normal', 'high']).default('normal'), type: z.enum(['cleaning', 'maintenance', 'checkin']).default('cleaning'), notes }),
  rates: z.object({ name, propertyId: id.min(1), startDate: date, endDate: date, nightlyRate: amount, minNights: z.number().int().min(1).max(365).default(1), closed: z.boolean().default(false) }),
  guidebooks: z.object({ title: name, propertyId: id.min(1), welcome: notes, checkin: notes, wifiName: text.default(''), wifiPassword: text.default(''), houseRules: notes, recommendations: notes, published: z.boolean().default(false) }),
  owners: z.object({ name, email, phone: text.default(''), propertyIds: z.array(id.min(1)).max(100).default([]), commissionRate: z.number().min(0).max(100).default(15) }),
  automations: z.object({ name, trigger: z.enum(['new_conversation', 'booking_confirmed', 'before_checkin']), action: z.enum(['send_reply', 'create_task', 'add_tag']), content: z.string().trim().min(1).max(5000), enabled: z.boolean().default(true) }).refine(value => value.trigger === 'new_conversation' ? value.action !== 'create_task' : value.action === 'create_task', 'Hội thoại mới dùng trả lời/gắn nhãn; sự kiện đặt phòng dùng tạo công việc'),
  campaigns: z.object({ name, channel: z.enum(['email', 'zalo', 'facebook']).default('email'), audienceTag: text.default(''), subject: name, content: z.string().trim().min(1).max(10000), status: z.enum(['draft', 'scheduled']).default('draft'), scheduledAt: z.union([z.iso.datetime({ local: true }), z.literal('')]).default('') }),
  replies: z.object({ title: name, content: z.string().trim().min(1).max(5000) }),
  integrations: z.object({ platform: z.enum(platforms), label: name, status: z.enum(['demo', 'disconnected']).default('disconnected') }),
  employees: z.object({ name, role: name, email, phone: text.default(''), status: z.enum(['active', 'inactive']).default('active') }),
  revenue: z.object({ propertyId: optionalId, type: z.enum(['booking_payout', 'expense', 'adjustment']), amount: z.number().finite().min(-1e12).max(1e12), description: name, date }),
};
export const settingsSchema = z.object({ businessName: name, email, phone: text.default(''), address: text.default(''), currency: z.enum(['VND', 'USD']), timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('vi', { timeZone: value }); return true; } catch { return false; } }, 'Múi giờ không hợp lệ'), checkinTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), checkoutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), widgetEnabled: z.boolean(), widgetGreeting: z.string().trim().min(1).max(1000) });
export const collections = { properties: 'properties', bookings: 'bookings', contacts: 'contacts', conversations: 'messageThreads', tasks: 'operationTasks', rates: 'ratePlans', guidebooks: 'guidebooks', owners: 'owners', automations: 'automations', campaigns: 'campaigns', replies: 'savedReplies', integrations: 'workspaceIntegrations', employees: 'employees', revenue: 'revenueEntries' } as const;
