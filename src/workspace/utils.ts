import type { WorkspaceSnapshot, ResourceRecord, Reservation, Stay } from '../../shared/workspace';

export const valueOf = (record: ResourceRecord, key: string): unknown => (record as unknown as Record<string, unknown>)[key];
export const money = (value: number, currency = 'VND') => new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);
export const dateLabel = (date: string) => date ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(date.slice(0, 10) + 'T12:00:00')) : '—';
export const todayIn = (timezone = 'Asia/Ho_Chi_Minh') => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
export const addDays = (value: string, offset: number) => { const day = new Date(value + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() + offset); return day.toISOString().slice(0, 10); };
export const nights = (start: string, end: string) => Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86400000));
export const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(word => word[0]).join('').toUpperCase();
export const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Không thể hoàn tất thao tác';
export function propertyName(data: WorkspaceSnapshot, id: unknown) { return data.properties.find(item => item.id === id)?.title || 'Chưa gắn phòng'; }
export function stayPrice(data: WorkspaceSnapshot, property: Stay, checkIn: string, checkOut: string) {
  const length = nights(checkIn, checkOut); let total = 0;
  if (length > 90) return 0;
  const plans = data.rates.filter(rate => rate.propertyId === property.id).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  for (let i = 0; i < length; i++) { const day = addDays(checkIn, i); total += plans.find(rate => rate.startDate <= day && rate.endDate >= day)?.nightlyRate ?? property.basePrice; }
  return total;
}
export function occupancy(bookings: Reservation[], start: string, days: number, propertyCount: number) {
  if (!propertyCount || !days) return 0;
  const end = addDays(start, days);
  const booked = bookings.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + nights(b.checkIn > start ? b.checkIn : start, b.checkOut < end ? b.checkOut : end), 0);
  return Math.min(100, Math.round(booked / (propertyCount * days) * 100));
}
export function exportCSV(filename: string, rows: (string | number)[][]) {
  const cell = (value: string | number) => { let text = String(value); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
