import ICAL from 'ical.js';

export interface CalendarEvent { uid: string; checkIn: string; checkOut: string }
export class CalendarInputError extends Error {}
export function calendarURL(value: string, platform: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new CalendarInputError('Liên kết lịch không hợp lệ.'); }
  const hosts = platform === 'airbnb' ? ['www.airbnb.com', 'airbnb.com', 'www.airbnb.com.vn', 'airbnb.com.vn'] : platform === 'booking' ? ['admin.booking.com', 'ical.booking.com'] : [];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !hosts.includes(url.hostname) || value.length > 4096) throw new CalendarInputError('Dùng liên kết HTTPS xuất lịch chính thức của Airbnb hoặc Booking.com.');
  if (platform === 'airbnb' && (!url.pathname.startsWith('/calendar/ical/') || !url.pathname.endsWith('.ics')) || platform === 'booking' && url.hostname === 'admin.booking.com' && url.pathname !== '/hotel/hoteladmin/ical.html') throw new CalendarInputError('Hãy sao chép liên kết Export calendar, không dùng địa chỉ trang quản lý phòng.');
  return url;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new CalendarInputError('Lịch chứa ngày không hợp lệ.');
  return value;
}
export function parseCalendar(text: string): CalendarEvent[] {
  if (text.length > 2_000_000 || !text.trim().startsWith('BEGIN:VCALENDAR') || !text.trim().endsWith('END:VCALENDAR')) throw new CalendarInputError('Liên kết chưa trả về file lịch iCal hợp lệ.');
  try {
    const calendar = new ICAL.Component(ICAL.parse(text));
    if (calendar.name !== 'vcalendar') throw new Error('Invalid root');
    const components = calendar.getAllSubcomponents('vevent');
    if (components.length > 2000) throw new CalendarInputError('Lịch vượt quá 2.000 khoảng ngày.');
    const seen = new Set<string>(); const events: CalendarEvent[] = [];
    for (const component of components) {
      if (String(component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') continue;
      const uid = String(component.getFirstPropertyValue('uid') || '');
      if (!uid || uid.length > 512 || seen.has(uid)) throw new CalendarInputError('Lịch thiếu mã sự kiện hoặc có mã trùng. Lịch cũ được giữ.');
      seen.add(uid);
      if (/^maoki-.*@maokihouse$/.test(uid)) continue;
      if (['rrule', 'rdate', 'exdate', 'recurrence-id'].some(key => component.hasProperty(key))) throw new CalendarInputError('Lịch có sự kiện lặp. Hãy dùng lịch xuất tiêu chuẩn của kênh lưu trú.');
      const start = component.getFirstProperty('dtstart'); const end = component.getFirstProperty('dtend');
      if (!start || !end || start.type !== 'date' || end.type !== 'date') throw new CalendarInputError('Chỉ hỗ trợ lịch lưu trú theo ngày; lịch hẹn theo giờ chưa được nhập.');
      const checkIn = date(start.toJSON()[3]); const checkOut = date(end.toJSON()[3]);
      if (checkOut <= checkIn || Date.parse(checkOut) - Date.parse(checkIn) > 3660 * 86400000) throw new CalendarInputError('Khoảng ngày trong lịch không hợp lệ.');
      events.push({ uid, checkIn, checkOut });
    }
    return events;
  } catch (error) { if (error instanceof CalendarInputError) throw error; throw new CalendarInputError('Không đọc được file iCal. Lịch cũ được giữ.'); }
}
export async function fetchCalendar(value: string, platform: string, transport: typeof fetch = fetch): Promise<CalendarEvent[]> {
  let url = calendarURL(value, platform);
  let response: Response | undefined; const signal = AbortSignal.timeout(15000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await transport(url, { redirect: 'manual', signal, headers: { Accept: 'text/calendar, text/plain;q=0.8' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location || redirects === 3) throw new CalendarInputError('Liên kết lịch chuyển hướng quá nhiều lần.');
      // Validate every hop; a provider redirect cannot reach an arbitrary host.
      url = calendarURL(new URL(location, url).toString(), platform);
    }
  } catch (error) { if (error instanceof CalendarInputError) throw error; throw new CalendarInputError('Không tải được lịch. Kiểm tra liên kết và thử lại.'); }
  if (!response?.ok || !response.body) throw new CalendarInputError('Kênh chưa trả về lịch. Dùng liên kết xuất lịch, không dùng liên kết yêu cầu đăng nhập.');
  if (Number(response.headers.get('content-length')) > 2_000_000) throw new CalendarInputError('File lịch quá lớn.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value: chunk } = await reader.read(); if (done) break; size += chunk.byteLength; if (size > 2_000_000) { await reader.cancel(); throw new CalendarInputError('File lịch quá lớn.'); } chunks.push(chunk); } }
  catch (error) { if (error instanceof CalendarInputError) throw error; throw new CalendarInputError('Tải lịch bị gián đoạn. Lịch cũ được giữ.'); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseCalendar(new TextDecoder().decode(bytes));
}
export function exportCalendar(events: CalendarEvent[]): string {
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('version', '2.0'); calendar.updatePropertyWithValue('prodid', '-//MaokiHouse//Availability//EN'); calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
  if (events.length > 5000) throw new CalendarInputError('Lịch quá lớn.');
  for (const item of events) {
    if (!/^[a-zA-Z0-9@._-]{1,180}$/.test(item.uid)) throw new CalendarInputError('Mã lịch không hợp lệ.');
    const start = date(item.checkIn), end = date(item.checkOut); if (start >= end) throw new CalendarInputError('Khoảng ngày không hợp lệ.');
    const event = new ICAL.Event(); event.uid = item.uid; event.startDate = ICAL.Time.fromDateString(start); event.endDate = ICAL.Time.fromDateString(end); event.summary = 'Unavailable';
    event.component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true)); event.component.updatePropertyWithValue('transp', 'OPAQUE'); calendar.addSubcomponent(event.component);
  }
  return calendar.toString() + '\r\n';
}
