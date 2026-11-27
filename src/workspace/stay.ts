import type { Reservation, Conversation } from '../../shared/workspace';
import { addDays, nights } from './utils';

export type StayStage = 'arriving' | 'staying' | 'leaving';
export const stageLabels: Record<StayStage, string> = { arriving: 'Nhận phòng hôm nay', staying: 'Đang ở', leaving: 'Trả phòng hôm nay hoặc mai' };

/** Where a confirmed or pending reservation stands relative to today (cancelled ones have no stage). */
export function stageOf(booking: Pick<Reservation, 'checkIn' | 'checkOut' | 'status'>, today: string): StayStage | null {
  if (booking.status === 'cancelled') return null;
  const tomorrow = addDays(today, 1);
  if (booking.checkOut === today || booking.checkOut === tomorrow) return booking.checkIn <= today ? 'leaving' : null;
  if (booking.checkIn === today) return 'arriving';
  if (booking.checkIn < today && booking.checkOut > today) return 'staying';
  return null;
}

/** Urgency for sorting: guests arriving or leaving soon are answered first. */
export const stagePriority: Record<StayStage, number> = { arriving: 0, leaving: 1, staying: 2 };

/** The reservation worth showing beside a conversation: current stay, else the next upcoming one, else the latest past one. */
export function relevantBooking(bookings: Reservation[], today: string): Reservation | undefined {
  const live = bookings.filter(item => item.status !== 'cancelled');
  const current = live.find(item => item.checkIn <= today && item.checkOut >= today);
  if (current) return current;
  const upcoming = live.filter(item => item.checkIn > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  return upcoming || [...live].sort((a, b) => b.checkOut.localeCompare(a.checkOut))[0];
}

export function conversationStage(conversation: Conversation, bookings: Reservation[], today: string): StayStage | null {
  const stages = bookings.filter(item => item.contactId === conversation.contactId && conversation.contactId).map(item => stageOf(item, today)).filter((value): value is StayStage => !!value);
  return stages.sort((a, b) => stagePriority[a] - stagePriority[b])[0] || null;
}

export type AlertKind = 'overlap' | 'no_property' | 'pending_old' | 'unpaid_soon' | 'no_guest_contact' | 'channel_error' | 'channel_stale' | 'queue_failed';
export interface StayAlert { kind: AlertKind; severity: 'high' | 'normal'; title: string; detail: string; bookingId?: string; propertyId?: string }

interface AlertInput { bookings: Reservation[]; propertyIds: string[]; propertyNames: Record<string, string>; today: string; connections?: { propertyId: string; label: string; platform: string; lastError: string; stale: boolean }[]; failedQueue?: number }

/** Everything the owner should look at before it costs a night: double bookings, unattached orders, unpaid arrivals, broken channels. */
export function computeAlerts(input: AlertInput): StayAlert[] {
  const out: StayAlert[] = []; const live = input.bookings.filter(item => item.status !== 'cancelled'); const name = (id: string) => input.propertyNames[id] || 'Chưa gắn phòng';
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]; const b = live[j];
    if (a.propertyId && a.propertyId === b.propertyId && a.checkIn < b.checkOut && b.checkIn < a.checkOut && a.checkOut >= input.today && b.checkOut >= input.today)
      out.push({ kind: 'overlap', severity: 'high', title: `Trùng lịch ở ${name(a.propertyId)}`, detail: `${a.guestName} (${a.checkIn} → ${a.checkOut}) và ${b.guestName} (${b.checkIn} → ${b.checkOut})`, bookingId: a.id, propertyId: a.propertyId });
  }
  for (const item of live) {
    if (!item.propertyId || !input.propertyIds.includes(item.propertyId)) out.push({ kind: 'no_property', severity: 'high', title: 'Đơn chưa gắn với phòng nào', detail: `${item.guestName}, ${item.checkIn} → ${item.checkOut}. Đơn này chưa vào lịch của phòng nào.`, bookingId: item.id });
    if (item.status === 'pending' && item.checkIn >= input.today && nights(input.today, item.checkIn) <= 7) out.push({ kind: 'pending_old', severity: 'normal', title: 'Đơn chờ xác nhận sắp đến ngày ở', detail: `${item.guestName} nhận phòng ${item.checkIn} nhưng vẫn chờ xác nhận.`, bookingId: item.id, propertyId: item.propertyId });
    if (item.status === 'confirmed' && item.paymentStatus !== 'paid' && item.checkIn >= input.today && nights(input.today, item.checkIn) <= 3) out.push({ kind: 'unpaid_soon', severity: 'normal', title: 'Sắp nhận phòng mà chưa thanh toán', detail: `${item.guestName} nhận phòng ${item.checkIn}. Tin có mã cửa hoặc wifi theo mẫu "đã thanh toán" sẽ chưa gửi.`, bookingId: item.id, propertyId: item.propertyId });
    if (item.status === 'confirmed' && item.checkIn >= input.today && nights(input.today, item.checkIn) <= 3 && !item.guestEmail && !item.contactId) out.push({ kind: 'no_guest_contact', severity: 'normal', title: 'Chưa có cách liên hệ khách', detail: `${item.guestName}: chưa có email hoặc hồ sơ khách, tin nhắn tự động sẽ không gửi được.`, bookingId: item.id, propertyId: item.propertyId });
  }
  for (const connection of input.connections || []) {
    if (connection.lastError) out.push({ kind: 'channel_error', severity: 'high', title: `Đồng bộ lịch lỗi: ${connection.label || connection.platform}`, detail: `${name(connection.propertyId)}: ${connection.lastError}`, propertyId: connection.propertyId });
    else if (connection.stale) out.push({ kind: 'channel_stale', severity: 'normal', title: `Lịch chưa được cập nhật: ${connection.label || connection.platform}`, detail: `${name(connection.propertyId)}: quá lâu chưa đồng bộ, có nguy cơ bán trùng.`, propertyId: connection.propertyId });
  }
  if (input.failedQueue) out.push({ kind: 'queue_failed', severity: 'high', title: `${input.failedQueue} tin nhắn gửi thất bại`, detail: 'Xem mục Kết nối kênh để biết lỗi và thử gửi lại.' });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}
