import ICAL from 'ical.js';

import { BlockList, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

export interface CalendarEvent { uid: string; checkIn: string; checkOut: string }
export class CalendarInputError extends Error {}

export const calendarPlatforms = ['airbnb', 'booking', 'agoda', 'vrbo', 'expedia', 'traveloka', 'tripcom', 'google', 'ical'] as const;
export type CalendarPlatform = typeof calendarPlatforms[number];

// Host names that never denote a public calendar server.
const reservedSuffixes = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.home.arpa', '.localdomain', '.test', '.example', '.invalid', '.onion'];

export function calendarURL(value: string, platform: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new CalendarInputError('Liên kết lịch không hợp lệ.'); }
  if (!(calendarPlatforms as readonly string[]).includes(platform)) throw new CalendarInputError('Kênh lịch không được hỗ trợ.');
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || value.length > 4096) throw new CalendarInputError('Dùng liên kết HTTPS xuất lịch (iCal) chính thức, không kèm tài khoản hay cổng riêng.');
  // IP literals and private-looking names are refused before any lookup; public names are checked again after DNS.
  if (isIP(host.replace(/^\[|\]$/g, '')) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}$/.test(host) || reservedSuffixes.some(suffix => host.endsWith(suffix)) || host === 'localhost') throw new CalendarInputError('Liên kết lịch phải dùng tên miền công khai của kênh.');
  if (platform === 'airbnb') {
    if (!['www.airbnb.com', 'airbnb.com', 'www.airbnb.com.vn', 'airbnb.com.vn'].includes(host)) throw new CalendarInputError('Dùng liên kết HTTPS xuất lịch chính thức của Airbnb.');
    if (!url.pathname.startsWith('/calendar/ical/') || !url.pathname.endsWith('.ics')) throw new CalendarInputError('Hãy sao chép liên kết Export calendar, không dùng địa chỉ trang quản lý phòng.');
  } else if (platform === 'booking') {
    if (!['admin.booking.com', 'ical.booking.com'].includes(host)) throw new CalendarInputError('Dùng liên kết HTTPS xuất lịch chính thức của Booking.com.');
    if (host === 'admin.booking.com' && url.pathname !== '/hotel/hoteladmin/ical.html') throw new CalendarInputError('Hãy sao chép liên kết Export calendar, không dùng địa chỉ trang quản lý phòng.');
  } else if (platform === 'google') {
    if (host !== 'calendar.google.com' || !url.pathname.startsWith('/calendar/ical/')) throw new CalendarInputError('Dùng “Địa chỉ bí mật ở định dạng iCal” trong cài đặt lịch Google.');
  }
  return url;
}

// Every address range that is not the public internet (RFC 6890 and friends).
// Separate lists: a single BlockList would match IPv4 queries against the IPv4-mapped IPv6 subnet.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked6.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked4.check(address, 'ipv4');
  if (family === 6) {
    // Public calendar hosts never resolve to IPv4-mapped/compatible forms; refuse them outright.
    if (/^::(ffff:)?\d+\.\d+\.\d+\.\d+$/i.test(address)) return false;
    return !blocked6.check(address, 'ipv6');
  }
  return false;
}

/** DNS lookup used for the actual socket: every resolved address must be public. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as unknown as LookupAddress[];
    if (!list.length || list.some(item => !isPublicAddress(item.address))) return callback(Object.assign(new Error('Calendar host resolves to a non-public address'), { code: 'EMAOKIPRIVATE' }), '', 0);
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

/** Minimal GET-only fetch whose sockets can only reach public addresses; never follows redirects. */
export const publicFetch = ((input: string | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
  const url = new URL(String(input));
  if (url.protocol !== 'https:') return reject(new CalendarInputError('Chỉ hỗ trợ HTTPS.'));
  const headers: Record<string, string> = { 'User-Agent': 'MaokiHouse-Calendar/1.0', Accept: 'text/calendar, text/plain;q=0.8' };
  const request = httpsRequest(url, { method: 'GET', headers, lookup: guardedLookup, agent: false, timeout: 15000, signal: init?.signal ?? undefined }, response => {
    const status = response.statusCode || 502;
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    const nullBody = [101, 204, 205, 304].includes(status);
    if (nullBody) response.resume();
    resolve(new Response(nullBody ? null : Readable.toWeb(response) as ReadableStream<Uint8Array>, { status: status < 200 || status > 599 ? 502 : status, headers: responseHeaders }));
  });
  request.on('timeout', () => request.destroy(new Error('timeout')));
  request.on('error', reject);
  request.end();
})) as typeof fetch;

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
export async function fetchCalendar(value: string, platform: string, transport: typeof fetch = publicFetch): Promise<CalendarEvent[]> {
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
  } catch (error) {
    if (error instanceof CalendarInputError) throw error;
    if ((error as { code?: string })?.code === 'EMAOKIPRIVATE') throw new CalendarInputError('Tên miền lịch trỏ tới địa chỉ nội bộ nên không được tải.');
    throw new CalendarInputError('Không tải được lịch. Kiểm tra liên kết và thử lại.');
  }
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
