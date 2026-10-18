import type { Booking, Employee, Property, RevenueEntry } from '../src/types';

export type Platform = 'direct' | 'airbnb' | 'booking' | 'agoda' | 'facebook' | 'instagram' | 'zalo' | 'email' | 'webchat';
export interface RecordBase { id: string; hostId: string; createdAt?: number; updatedAt?: number }
export interface Stay extends Property { description?: string; bedrooms?: number; capacity?: number; published?: boolean }
export interface Reservation extends Booking { contactId?: string; guestEmail?: string; guestPhone?: string; notes?: string }
export interface Contact extends RecordBase { name: string; email: string; phone: string; source: Platform; stage: 'lead' | 'guest' | 'returning'; tags: string[]; notes: string }
export interface ConversationMessage { sender: 'guest' | 'host'; text: string; timestamp: number; delivery?: 'local' }
export interface Conversation extends RecordBase { guestName: string; platform: Platform; contactId: string; assignee: string; status: 'open' | 'pending' | 'closed'; tags: string[]; messages: ConversationMessage[]; lastMessageAt: number; unread: boolean }
export interface OperationTask extends RecordBase { title: string; propertyId: string; assignee: string; dueDate: string; status: 'todo' | 'doing' | 'done'; priority: 'normal' | 'high'; type: 'cleaning' | 'maintenance' | 'checkin'; notes: string }
export interface RatePlan extends RecordBase { name: string; propertyId: string; startDate: string; endDate: string; nightlyRate: number; minNights: number; closed: boolean }
export interface Guidebook extends RecordBase { title: string; propertyId: string; welcome: string; checkin: string; wifiName: string; wifiPassword: string; houseRules: string; recommendations: string; published: boolean; publicToken: string }
export interface Owner extends RecordBase { name: string; email: string; phone: string; propertyIds: string[]; commissionRate: number }
export interface Automation extends RecordBase { name: string; trigger: 'new_conversation' | 'booking_confirmed' | 'before_checkin'; action: 'send_reply' | 'create_task' | 'add_tag'; content: string; enabled: boolean; runCount: number; lastRunAt?: number }
export interface Campaign extends RecordBase { name: string; channel: 'email' | 'zalo' | 'facebook'; audienceTag: string; subject: string; content: string; status: 'draft' | 'scheduled'; scheduledAt: string }
export interface SavedReply extends RecordBase { title: string; content: string }
export interface Integration extends RecordBase { platform: Platform; status: 'demo' | 'disconnected'; label: string }
export interface AuditEvent extends RecordBase { action: string; resource: string; label: string; actor: string; timestamp: number }
export interface BusinessSettings { businessName: string; email: string; phone: string; address: string; currency: 'VND' | 'USD'; timezone: string; checkinTime: string; checkoutTime: string; widgetEnabled: boolean; widgetGreeting: string; widgetToken: string }
export interface Resources {
  properties: Stay; bookings: Reservation; contacts: Contact; conversations: Conversation;
  tasks: OperationTask; rates: RatePlan; guidebooks: Guidebook; owners: Owner;
  automations: Automation; campaigns: Campaign; replies: SavedReply; integrations: Integration;
  employees: Employee; revenue: RevenueEntry;
}
export type ResourceName = keyof Resources;
export type ResourceRecord = Resources[ResourceName];
export type WorkspaceData = { [K in ResourceName]: Resources[K][] };
export type WorkspaceRole = 'owner' | 'manager' | 'agent' | 'viewer';
export interface CalendarBlock { id: string; propertyId: string; checkIn: string; checkOut: string; platform: 'airbnb' | 'booking' }
export interface WorkspaceSnapshot extends WorkspaceData { workspaceId?: string; channelBlocks?: CalendarBlock[]; settings: BusinessSettings; activity: AuditEvent[]; capabilities: { localDemo: boolean; aiConfigured: boolean; role?: WorkspaceRole } }
export const platformLabels: Record<Platform, string> = { direct: 'Trực tiếp', airbnb: 'Airbnb', booking: 'Booking.com', agoda: 'Agoda', facebook: 'Facebook', instagram: 'Instagram', zalo: 'Zalo', email: 'Email', webchat: 'Website' };
export const defaultSettings: BusinessSettings = { businessName: 'MaokiHouse', email: '', phone: '', address: 'Thành phố Hồ Chí Minh', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', checkinTime: '14:00', checkoutTime: '12:00', widgetEnabled: false, widgetGreeting: 'Chào bạn! MaokiHouse có thể giúp gì cho chuyến đi của bạn?', widgetToken: '' };
