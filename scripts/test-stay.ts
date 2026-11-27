import assert from 'node:assert/strict';
import { stageOf, relevantBooking, conversationStage, computeAlerts } from '../src/workspace/stay';
import type { Reservation, Conversation } from '../shared/workspace';

let checks = 0; const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
const TODAY = '2026-11-27';
const b = (over: Partial<Reservation>): Reservation => ({ id: 'b' + Math.random(), hostId: 'h', propertyId: 'p1', guestName: 'Lan', source: 'direct', checkIn: '2026-11-27', checkOut: '2026-11-29', status: 'confirmed', payoutAmount: 1, createdAt: 0, ...over });

ok(stageOf(b({}), TODAY) === 'arriving', 'check-in today is arriving');
ok(stageOf(b({ checkIn: '2026-11-25', checkOut: '2026-11-30' }), TODAY) === 'staying', 'a guest in the middle of a stay is staying');
ok(stageOf(b({ checkIn: '2026-11-25', checkOut: '2026-11-28' }), TODAY) === 'leaving', 'check-out tomorrow is leaving');
ok(stageOf(b({ checkIn: '2026-11-25', checkOut: '2026-11-27' }), TODAY) === 'leaving', 'check-out today is leaving');
ok(stageOf(b({ checkIn: '2026-12-05', checkOut: '2026-12-07' }), TODAY) === null, 'a later stay has no stage yet');
ok(stageOf(b({ status: 'cancelled' }), TODAY) === null, 'cancelled bookings have no stage');
ok(relevantBooking([b({ checkIn: '2026-12-05', checkOut: '2026-12-07', id: 'next' }), b({ checkIn: '2026-10-01', checkOut: '2026-10-03', id: 'old' })], TODAY)?.id === 'next', 'the next stay beats a past one');
ok(relevantBooking([b({ id: 'now' }), b({ checkIn: '2026-12-05', checkOut: '2026-12-07', id: 'next' })], TODAY)?.id === 'now', 'the current stay beats an upcoming one');
const conv = { contactId: 'c1' } as Conversation;
ok(conversationStage(conv, [b({ contactId: 'c1' }), b({ contactId: 'c2' })], TODAY) === 'arriving', 'a conversation takes the stage of its own guest');
ok(conversationStage({ contactId: '' } as Conversation, [b({ contactId: '' })], TODAY) === null, 'a conversation with no guest profile has no stage');

const base = { propertyIds: ['p1'], propertyNames: { p1: 'Villa' }, today: TODAY };
const overlap = computeAlerts({ ...base, bookings: [b({ id: 'a', checkIn: '2026-12-01', checkOut: '2026-12-04', guestEmail: 'x@y.z' }), b({ id: 'c', guestName: 'Minh', checkIn: '2026-12-03', checkOut: '2026-12-06', guestEmail: 'x@y.z' })] });
ok(overlap.filter(item => item.kind === 'overlap').length === 1 && overlap[0].severity === 'high', 'overlapping stays in one room are a high alert');
ok(!computeAlerts({ ...base, bookings: [b({ checkIn: '2026-12-01', checkOut: '2026-12-03' }), b({ checkIn: '2026-12-03', checkOut: '2026-12-05' })] }).some(item => item.kind === 'overlap'), 'back-to-back stays do not overlap');
ok(!computeAlerts({ ...base, bookings: [b({ checkIn: '2026-10-01', checkOut: '2026-10-05' }), b({ checkIn: '2026-10-03', checkOut: '2026-10-06' })] }).some(item => item.kind === 'overlap'), 'past overlaps are ignored');
ok(computeAlerts({ ...base, bookings: [b({ propertyId: 'gone' })] }).some(item => item.kind === 'no_property'), 'an order without a known room is flagged');
ok(computeAlerts({ ...base, bookings: [b({ checkIn: '2026-11-29', checkOut: '2026-12-01', guestEmail: 'a@b.c' })] }).some(item => item.kind === 'unpaid_soon'), 'a confirmed unpaid arrival within 3 days is flagged');
ok(!computeAlerts({ ...base, bookings: [b({ checkIn: '2026-11-29', checkOut: '2026-12-01', guestEmail: 'a@b.c', paymentStatus: 'paid' })] }).some(item => item.kind === 'unpaid_soon'), 'a paid arrival is not flagged');
ok(computeAlerts({ ...base, bookings: [b({ checkIn: '2026-11-29', checkOut: '2026-12-01', paymentStatus: 'paid' })] }).some(item => item.kind === 'no_guest_contact'), 'an arrival with no way to reach the guest is flagged');
ok(computeAlerts({ ...base, bookings: [b({ status: 'pending', checkIn: '2026-11-30', checkOut: '2026-12-02', guestEmail: 'a@b.c' })] }).some(item => item.kind === 'pending_old'), 'a pending order close to arrival is flagged');
const channels = computeAlerts({ ...base, bookings: [], failedQueue: 2, connections: [{ propertyId: 'p1', label: 'Airbnb', platform: 'airbnb', lastError: 'HTTP 404', stale: true }, { propertyId: 'p1', label: 'Booking', platform: 'booking', lastError: '', stale: true }] });
ok(channels.some(item => item.kind === 'channel_error') && channels.some(item => item.kind === 'channel_stale') && channels.some(item => item.kind === 'queue_failed'), 'channel errors, stale calendars and failed messages are flagged');
ok(channels[channels.length - 1].severity === 'normal', 'high alerts sort first');
console.log(`${checks} stay checks passed`);
