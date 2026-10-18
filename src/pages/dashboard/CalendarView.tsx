import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Modal, Spinner } from 'react-bootstrap';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../config/firebase';
import { bookingService } from '../../services/bookingService';
import { propertyService } from '../../services/propertyService';
import type { Booking, BookingSource, Property } from '../../types';

const locales = { vi };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { locale: vi }), getDay, locales });

const SOURCE_LABELS: Record<BookingSource, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  agoda: 'Agoda',
  direct: 'Trực tiếp',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận',
  pending: 'Chờ xác nhận',
  cancelled: 'Đã hủy',
};

const SOURCE_COLORS: Record<BookingSource, string> = {
  airbnb: '#e07a5f',
  booking: '#3d5a80',
  agoda: '#c9a15a',
  direct: '#6b8f71',
};

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  booking: Booking;
}

const CalendarView = () => {
  const [user] = useAuthState(auth);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Booking | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const [bks, props] = await Promise.all([bookingService.list(idToken), propertyService.list(idToken)]);
        setBookings(bks);
        setProperties(props);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const propertyName = useCallback((id: string) => properties.find((p) => p.id === id)?.title || '—', [properties]);

  const events: CalEvent[] = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== 'cancelled')
        .map((b) => ({
          id: b.id,
          title: `${propertyName(b.propertyId)} · ${b.guestName}`,
          start: new Date(b.checkIn),
          end: new Date(b.checkOut),
          booking: b,
        })),
    [bookings, propertyName]
  );

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <div className="eyebrow">Vận hành</div>
        <h1 className="font-display" style={{ fontSize: '1.9rem' }}>Lịch đặt phòng</h1>
      </div>

      <div className="elevated-card">
        <div className="card-body p-3">
          <div className="d-flex gap-3 mb-3 flex-wrap">
            {Object.entries(SOURCE_COLORS).map(([source, color]) => (
              <div key={source} className="d-flex align-items-center gap-2 small">
                <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
                {SOURCE_LABELS[source as BookingSource]}
              </div>
            ))}
          </div>
          <div className="maoki-calendar" style={{ height: 640 }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              views={['month']}
              defaultView="month"
              culture="vi"
              messages={{
                today: 'Hôm nay',
                previous: 'Trước',
                next: 'Sau',
                month: 'Tháng',
                showMore: (total: number) => `+${total} khác`,
              }}
              onSelectEvent={(event: CalEvent) => setSelected(event.booking)}
              eventPropGetter={(event: CalEvent) => ({
                style: {
                  backgroundColor: SOURCE_COLORS[event.booking.source],
                  borderRadius: 8,
                  border: 'none',
                  boxShadow: '0 2px 6px rgba(43, 24, 16, 0.18)',
                },
              })}
            />
          </div>
        </div>
      </div>

      <style>
        {`
          .maoki-calendar .rbc-toolbar {
            margin-bottom: 1.25rem;
            flex-wrap: wrap;
            gap: 0.75rem;
          }

          .maoki-calendar .rbc-toolbar button {
            font-family: var(--font-body);
            font-weight: 600;
            font-size: 0.85rem;
            color: var(--color-ink);
            background: var(--color-blush);
            border: none;
            border-radius: 999px;
            padding: 0.45rem 1.1rem;
            transition: all 0.2s ease;
          }

          .maoki-calendar .rbc-toolbar button:hover {
            background: var(--color-gold-light);
            color: var(--color-ink);
          }

          .maoki-calendar .rbc-toolbar button.rbc-active,
          .maoki-calendar .rbc-toolbar button.rbc-active:hover {
            background: linear-gradient(135deg, var(--color-gold), var(--color-primary-light));
            color: var(--color-ink);
            box-shadow: var(--shadow-soft);
          }

          .maoki-calendar .rbc-toolbar-label {
            font-family: var(--font-display);
            font-size: 1.35rem;
            font-weight: 700;
            color: var(--color-ink);
            letter-spacing: 0.02em;
          }

          .maoki-calendar .rbc-month-view,
          .maoki-calendar .rbc-header,
          .maoki-calendar .rbc-day-bg,
          .maoki-calendar .rbc-month-row,
          .maoki-calendar .rbc-header + .rbc-header,
          .maoki-calendar .rbc-day-bg + .rbc-day-bg {
            border-color: rgba(43, 24, 16, 0.1) !important;
          }

          .maoki-calendar .rbc-month-view {
            border-radius: 14px;
            overflow: hidden;
          }

          .maoki-calendar .rbc-header {
            padding: 0.6rem 0;
            font-family: var(--font-body);
            font-weight: 700;
            font-size: 0.78rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--color-primary-dark);
            background: var(--color-blush);
            border-bottom: none;
          }

          .maoki-calendar .rbc-off-range-bg {
            background: rgba(43, 24, 16, 0.035);
          }

          .maoki-calendar .rbc-off-range {
            color: rgba(43, 24, 16, 0.35);
          }

          .maoki-calendar .rbc-today {
            background-color: var(--color-gold-light);
            opacity: 0.35;
          }

          .maoki-calendar .rbc-date-cell {
            font-family: var(--font-body);
            font-weight: 600;
            color: var(--color-ink);
            padding: 0.35rem 0.5rem;
          }

          .maoki-calendar .rbc-event {
            font-family: var(--font-body);
            font-size: 0.78rem;
            font-weight: 600;
            padding: 2px 6px;
          }

          .maoki-calendar .rbc-event:focus {
            outline: 2px solid var(--color-gold);
          }

          .maoki-calendar .rbc-show-more {
            font-family: var(--font-body);
            font-weight: 700;
            color: var(--color-primary);
            background: transparent;
          }
        `}
      </style>

      <Modal show={!!selected} onHide={() => setSelected(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết đặt phòng</Modal.Title>
        </Modal.Header>
        {selected && (
          <Modal.Body>
            <p><strong>Khách:</strong> {selected.guestName}</p>
            <p><strong>Phòng:</strong> {propertyName(selected.propertyId)}</p>
            <p><strong>Kênh:</strong> {SOURCE_LABELS[selected.source]}</p>
            <p><strong>Nhận phòng:</strong> {selected.checkIn}</p>
            <p><strong>Trả phòng:</strong> {selected.checkOut}</p>
            <p><strong>Trạng thái:</strong> {STATUS_LABELS[selected.status]}</p>
            <p className="mb-0"><strong>Thanh toán:</strong> {selected.payoutAmount.toLocaleString('vi-VN')} đ</p>
          </Modal.Body>
        )}
      </Modal>
    </div>
  );
};

export default CalendarView;
