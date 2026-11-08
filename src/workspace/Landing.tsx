import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  FiArrowRight,
  FiArrowUpRight,
  FiCalendar,
  FiCompass,
  FiHome,
  FiKey,
  FiMapPin,
  FiSearch,
  FiStar,
  FiSun,
  FiUsers,
} from 'react-icons/fi';
import { CONTACT_LINKS } from '../constants/contact';
import about1 from '../assets/images/about1.jpg';
import about2 from '../assets/images/about2.jpg';
import about3 from '../assets/images/about3.jpg';
import morganAvatar from '../assets/images/reviews/morgan.jpg';
import myAvatar from '../assets/images/reviews/my.jpg';
import paigeAvatar from '../assets/images/reviews/paige.jpg';
import { publicFetch, publicPath } from './publicApi';
import { addDays, money, todayIn } from './utils';
import './workspace.css';
import './zones.css';

interface PublicStay {
  id: string;
  title: string;
  address: string;
  description: string;
  imageURLs: string[];
  basePrice: number;
  capacity: number;
  bedrooms?: number;
  currency: string;
  businessName: string;
}

interface HeroChapter {
  id: string;
  roomKey: string;
  district: string;
  coordinates: string;
  title: string;
  atmosphere: string;
  timeNote: string;
  image: string;
  rateHint: string;
  specs: string;
}

const heroChapters: HeroChapter[] = [
  {
    id: 'nest-thao-dien',
    roomKey: 'RM · 01',
    district: 'Thảo Điền · TP. Thủ Đức',
    coordinates: '10°48′14″N · 106°44′08″E',
    title: 'The Nest · Thảo Điền',
    atmosphere: 'Nắng sớm xuyên qua rèm voan mỏng, ban công nhiều cây xanh và góc bếp yên tĩnh cho buổi sáng chậm rãi.',
    timeNote: '07:30 · Nắng sớm bên cửa sổ',
    image: '/rooms/maoki-1.jpg',
    rateHint: '950.000 ₫ / đêm',
    specs: '2 khách · Studio ban công xanh',
  },
  {
    id: 'garden-loft-q1',
    roomKey: 'RM · 02',
    district: 'Đa Kao · Quận 1',
    coordinates: '10°47′22″N · 106°41′52″E',
    title: 'Garden Loft · Quận 1',
    atmosphere: 'Căn loft hai phòng ngủ giữa lòng Đa Kao cổ kính — khoảng sân vườn riêng để cả nhóm ngồi trò chuyện sau một ngày dạo phố.',
    timeNote: '16:15 · Bóng cây đổ dài trên hiên nhà',
    image: '/rooms/maoki-2.jpg',
    rateHint: '1.450.000 ₫ / đêm',
    specs: '4 khách · 2 phòng ngủ · Sân vườn',
  },
  {
    id: 'riverside-binh-thanh',
    roomKey: 'RM · 03',
    district: 'Phường 22 · Bình Thạnh',
    coordinates: '10°47′41″N · 106°43′15″E',
    title: 'Riverside · Bình Thạnh',
    atmosphere: 'Gió mát từ nhánh sông Sài Gòn, phòng khách rộng ngập ánh chiều và kệ sách nhỏ chờ bạn mở trang đầu tiên.',
    timeNote: '17:45 · Hoàng hôn ven sông',
    image: '/rooms/maoki-3.jpg',
    rateHint: '1.200.000 ₫ / đêm',
    specs: '2 khách · Phòng khách rộng & góc đọc sách',
  },
  {
    id: 'little-saigon-q3',
    roomKey: 'RM · 04',
    district: 'Võ Thị Sáu · Quận 3',
    coordinates: '10°46′55″N · 106°41′18″E',
    title: 'Little Saigon · Quận 3',
    atmosphere: 'Góc nhỏ ấm cúng ngay trung tâm Quận 3, bước xuống phố là tiệm cà phê rang củi, quán ăn bản địa và tự nhận phòng linh hoạt.',
    timeNote: '20:30 · Nhịp đêm Sài Gòn dịu lại',
    image: '/rooms/maoki-4.jpg',
    rateHint: '850.000 ₫ / đêm',
    specs: '2 khách · Tự nhận phòng 24/7',
  },
];

const curatedShowcase: PublicStay[] = [
  {
    id: 'nest-thao-dien',
    title: 'The Nest · Thảo Điền',
    address: 'Thảo Điền, TP. Thủ Đức',
    description: 'Một khoảng yên giữa lòng thành phố. Căn studio sáng thoáng, ban công xanh và góc bếp riêng.',
    imageURLs: ['/rooms/maoki-1.jpg'],
    basePrice: 950000,
    capacity: 2,
    bedrooms: 1,
    currency: 'VND',
    businessName: 'MaokiHouse',
  },
  {
    id: 'garden-loft-q1',
    title: 'Garden Loft · Quận 1',
    address: 'Đa Kao, Quận 1',
    description: 'Căn loft hai phòng ngủ, sân vườn riêng và ánh sáng tự nhiên. Dành cho những chuyến đi cùng người thân.',
    imageURLs: ['/rooms/maoki-2.jpg'],
    basePrice: 1450000,
    capacity: 4,
    bedrooms: 2,
    currency: 'VND',
    businessName: 'MaokiHouse',
  },
  {
    id: 'riverside-binh-thanh',
    title: 'Riverside · Bình Thạnh',
    address: 'Phường 22, Bình Thạnh',
    description: 'Căn hộ bên sông với phòng khách rộng, bếp đầy đủ tiện nghi và góc đọc sách.',
    imageURLs: ['/rooms/maoki-3.jpg'],
    basePrice: 1200000,
    capacity: 2,
    bedrooms: 1,
    currency: 'VND',
    businessName: 'MaokiHouse',
  },
  {
    id: 'little-saigon-q3',
    title: 'Little Saigon · Quận 3',
    address: 'Võ Thị Sáu, Quận 3',
    description: 'Không gian nhỏ ấm áp để khám phá nhịp sống Sài Gòn. Thuận tiện di chuyển và tự nhận phòng.',
    imageURLs: ['/rooms/maoki-4.jpg'],
    basePrice: 850000,
    capacity: 2,
    bedrooms: 1,
    currency: 'VND',
    businessName: 'MaokiHouse',
  },
];

const saigonMoments = [
  {
    title: 'Dạo bộ qua những con hẻm nhỏ',
    time: 'Buổi sáng · Cùng chủ nhà bản địa',
    story:
      'Xuất phát từ những năm làm tình nguyện viên dẫn tour đường phố Sài Gòn, tụi mình đưa bạn đi bộ qua những con hẻm rợp bóng cây, kể hàng trăm câu chuyện nhỏ của thành phố suốt 15 năm qua.',
    image: about1,
    alt: 'Dạo phố Sài Gòn cùng người bản địa tại MaokiHouse',
  },
  {
    title: 'Cà phê vợt, tiệm ẩn & góc nghệ thuật',
    time: 'Buổi chiều · Sổ tay lưu trú riêng',
    story:
      'Mỗi căn phòng đều kèm sổ tay lưu trú số hóa: từ mật khẩu Wi-Fi, hướng dẫn tự nhận phòng bằng mã khóa đến bản đồ quán cà phê ẩn trong hẻm và quán ăn đêm do chính chủ nhà chọn.',
    image: about2,
    alt: 'Khám phá quán nhỏ và góc nghệ thuật Sài Gòn',
  },
  {
    title: 'Lắng nghe câu chuyện từ khắp thế giới',
    time: 'Buổi tối · Trò chuyện như người nhà',
    story:
      'MaokiHouse không chỉ là chỗ ngủ qua đêm — đó là nơi những vị khách từ Manila, Munich hay Hà Nội ngồi lại chia sẻ hành trình và cảm nhận một Sài Gòn thật gần.',
    image: about3,
    alt: 'Giao lưu văn hóa cùng du khách tại MaokiHouse',
  },
];

const guestNotes = [
  {
    name: 'Morgan Louise',
    origin: 'Manila, Philippines',
    date: 'Tháng 7 · 2025',
    room: 'Near Bến Thành · Saigon',
    avatar: morganAvatar,
    quote:
      'We really love the place! Very clean and cozy. It’s also near Ben Thanh and there are a lot of restaurants and spa nearby. We will come back and book this place again.',
  },
  {
    name: 'My',
    origin: 'Munich, Germany',
    date: 'Tháng 7 · 2025',
    room: 'Modern Studio · Saigon',
    avatar: myAvatar,
    quote:
      'Our stay was very relaxing and the place was very clean, modern, and as described. Wonderful host who responded promptly and gave us valuable local tips. +1 for in-building laundry.',
  },
  {
    name: 'Paige',
    origin: 'Ho Chi Minh City, Vietnam',
    date: 'Tháng 7 · 2025',
    room: 'Weekend Retreat · Saigon',
    avatar: paigeAvatar,
    quote:
      'Loved this place! Had such a great stay. The space is amazing and just as described. Would love to stay again!',
  },
];

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Landing() {
  const prefersReducedMotion = useReducedMotion();
  const [stays, setStays] = useState<PublicStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveReady, setLiveReady] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [activeMoment, setActiveMoment] = useState(0);

  const [query, setQuery] = useState('');
  const [guestCount, setGuestCount] = useState(2);
  const [dates, setDates] = useState(() => ({
    checkIn: todayIn(),
    checkOut: addDays(todayIn(), 2),
  }));

  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === '1';

  useEffect(() => {
    let active = true;
    void publicFetch<PublicStay[]>('/public/properties')
      .then(result => {
        if (!active) return;
        if (Array.isArray(result) && result.length > 0) {
          setStays(result);
          setLiveReady(true);
        } else {
          setStays(curatedShowcase);
          setLiveReady(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setStays(curatedShowcase);
        setLiveReady(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || paused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setActiveChapter(current => (current + 1) % heroChapters.length);
      }
    }, 5600);
    return () => window.clearInterval(timer);
  }, [prefersReducedMotion, paused]);

  const chapter = heroChapters[activeChapter] || heroChapters[0];
  const displayStays = stays.length ? stays : curatedShowcase;

  const filtered = displayStays.filter(stay => {
    const matchesText = (stay.title + ' ' + stay.address + ' ' + stay.description)
      .toLocaleLowerCase('vi')
      .includes(query.trim().toLocaleLowerCase('vi'));
    const matchesCapacity = (stay.capacity || 2) >= guestCount;
    return matchesText && matchesCapacity;
  });

  const matchingHeroStay = stays.find(stay =>
    stay.title.toLocaleLowerCase('vi').includes(chapter.title.split('·')[0].trim().toLocaleLowerCase('vi'))
  ) || stays[activeChapter] || null;

  const jumpToStays = (event: React.FormEvent) => {
    event.preventDefault();
    document.getElementById('stays')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="mk-guest-canvas">
      {/* ───────────── FOCAL HERO: SHUTTERED SAIGON RESIDENCE STAGE ───────────── */}
      <section
        className="mk-hero-stage"
        aria-label="Không gian nổi bật tại MaokiHouse"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="mk-hero-grid">
          <div className="mk-hero-editorial">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: easeOutExpo }}
            >
              <div className="mk-hero-ledger">
                <span className="mk-hero-key-badge">{chapter.roomKey}</span>
                <span>{chapter.district}</span>
                <span className="mk-hero-coords">{chapter.coordinates}</span>
              </div>

              <h1 className="mk-hero-headline">
                Ở lại một nơi.
                <br />
                Mang về một <em>cảm giác.</em>
              </h1>

              <p className="mk-hero-lead">
                Bốn góc trốn nắng dịu dàng giữa lòng Sài Gòn — nơi ánh sáng tự nhiên, ban công xanh và sự hiếu khách của người trẻ bản địa đón bạn về như nhà mình.
              </p>
            </motion.div>

            {/* Interactive Key Fob Switcher */}
            <div className="mk-hero-keyfobs" role="tablist" aria-label="Chọn phòng tiêu biểu">
              {heroChapters.map((item, index) => {
                const selected = index === activeChapter;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`hero-tab-${item.id}`}
                    aria-selected={selected}
                    aria-controls={`hero-panel-${item.id}`}
                    className={`mk-keyfob ${selected ? 'is-active' : ''}`}
                    onClick={() => setActiveChapter(index)}
                  >
                    <span className="mk-keyfob-num">{item.roomKey}</span>
                    <strong>{item.title.split('·')[0].trim()}</strong>
                    <small>{item.district.split('·')[0].trim()}</small>
                    {selected && !prefersReducedMotion && (
                      <motion.span
                        layoutId="mk-keyfob-indicator"
                        className="mk-keyfob-active-bar"
                        transition={{ duration: 0.4, ease: easeOutExpo }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Live Booking Concierge Strip */}
            <form className="mk-concierge-bar" onSubmit={jumpToStays} aria-label="Tìm nhanh phòng theo ngày và số khách">
              <label className="mk-concierge-field" htmlFor="guest-checkin">
                <span><FiCalendar /> Nhận phòng</span>
                <input
                  id="guest-checkin"
                  type="date"
                  min={todayIn()}
                  value={dates.checkIn}
                  onChange={event => {
                    const nextIn = event.target.value;
                    setDates(curr => ({
                      checkIn: nextIn,
                      checkOut: curr.checkOut <= nextIn ? addDays(nextIn, 1) : curr.checkOut,
                    }));
                  }}
                />
              </label>

              <label className="mk-concierge-field" htmlFor="guest-checkout">
                <span><FiCalendar /> Trả phòng</span>
                <input
                  id="guest-checkout"
                  type="date"
                  min={dates.checkIn ? addDays(dates.checkIn, 1) : todayIn()}
                  value={dates.checkOut}
                  onChange={event => setDates(curr => ({ ...curr, checkOut: event.target.value }))}
                />
              </label>

              <label className="mk-concierge-field" htmlFor="guest-count">
                <span><FiUsers /> Số khách</span>
                <select
                  id="guest-count"
                  value={guestCount}
                  onChange={event => setGuestCount(Number(event.target.value))}
                >
                  <option value={1}>1 khách</option>
                  <option value={2}>2 khách</option>
                  <option value={3}>3 khách</option>
                  <option value={4}>4 khách</option>
                </select>
              </label>

              <button type="submit" className="mk-button primary mk-concierge-submit">
                <span>Xem {filtered.length} phòng phù hợp</span>
                <FiArrowRight />
              </button>
            </form>
          </div>

          {/* Focal Window Aperture with Crossfade & Tactile Dossier Card */}
          <div
            className="mk-hero-aperture-wrap"
            id={`hero-panel-${chapter.id}`}
            role="tabpanel"
            aria-labelledby={`hero-tab-${chapter.id}`}
          >
            <div className="mk-hero-aperture">
              <AnimatePresence mode="wait">
                <motion.figure
                  key={chapter.id}
                  className="mk-hero-photo-frame"
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.65, ease: easeOutExpo }}
                >
                  <img
                    src={chapter.image}
                    alt={`${chapter.title} tại ${chapter.district}`}
                  />
                  <figcaption className="mk-hero-sun-pill">
                    <FiSun />
                    <span>{chapter.timeNote}</span>
                  </figcaption>
                </motion.figure>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.aside
                  key={chapter.id + '-card'}
                  className="mk-hero-dossier"
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.45, ease: easeOutExpo }}
                >
                  <div className="mk-hero-dossier-top">
                    <div>
                      <span className="mk-hero-dossier-tag">{chapter.district}</span>
                      <h2>{chapter.title}</h2>
                    </div>
                    <strong>{chapter.rateHint}</strong>
                  </div>
                  <p>{chapter.atmosphere}</p>
                  <div className="mk-hero-dossier-foot">
                    <span><FiKey /> {chapter.specs}</span>
                    {matchingHeroStay && liveReady ? (
                      <Link className="mk-text-button" to={publicPath('/book/' + matchingHeroStay.id, demo)}>
                        Đặt phòng này <FiArrowRight />
                      </Link>
                    ) : (
                      <a className="mk-text-button" href="#stays">
                        Khám phá chi tiết <FiArrowRight />
                      </a>
                    )}
                  </div>
                </motion.aside>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── COLLECTION LEDGER: STAGGERED ARCHITECTURAL DOSSIERS ───────────── */}
      <section id="stays" className="mk-guest-section mk-stays-ledger">
        <div className="mk-ledger-header">
          <div>
            <h2>Bốn góc trú ẩn giữa Sài Gòn.</h2>
            <p className="mk-ledger-sub">
              Mỗi căn phòng được chăm chút ánh sáng tự nhiên, bếp riêng và hướng dẫn tự nhận phòng chi tiết. Bạn chưa bị tính phí khi gửi yêu cầu giữ lịch.
            </p>
          </div>

          <div className="mk-ledger-controls">
            <label className="mk-ledger-search" htmlFor="stay-filter-input">
              <FiSearch />
              <input
                id="stay-filter-input"
                placeholder="Tìm Thảo Điền, Quận 1, ban công, sân vườn…"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </label>
            <div className="mk-ledger-pills" role="group" aria-label="Lọc theo số khách">
              {[
                [1, 'Mọi quy mô'],
                [2, '2+ khách'],
                [4, 'Nhóm 4 khách'],
              ].map(([count, label]) => (
                <button
                  key={count}
                  type="button"
                  className={guestCount === count ? 'is-selected' : ''}
                  onClick={() => setGuestCount(Number(count))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!liveReady && !loading && (
          <div className="mk-curated-banner" role="status">
            <div>
              <strong>Bộ sưu tập không gian tiêu biểu của MaokiHouse</strong>
              <span>
                Lịch trực tuyến đang đồng bộ — bạn có thể xem chi tiết từng căn và nhắn trực tiếp qua WhatsApp để giữ ngày ưu tiên.
              </span>
            </div>
            <a className="mk-button primary" href={CONTACT_LINKS.whatsapp} target="_blank" rel="noreferrer">
              Nhắn WhatsApp giữ lịch <FiArrowUpRight />
            </a>
          </div>
        )}

        {loading ? (
          <div className="mk-stays-skeleton" role="status">
            {[0, 1, 2, 3].map(item => (
              <div key={item} className="mk-stay-skeleton-card" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="mk-stays-editorial-grid">
            {filtered.map((stay, index) => {
              const roomNumber = String(index + 1).padStart(2, '0');
              const canBookOnline = liveReady;
              const bookingHref = publicPath(
                `/book/${stay.id}?checkIn=${encodeURIComponent(dates.checkIn)}&checkOut=${encodeURIComponent(dates.checkOut)}`,
                demo
              );
              return (
                <motion.article
                  key={stay.id}
                  layout
                  className={`mk-stay-dossier ${index % 2 === 1 ? 'is-offset' : ''}`}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: (index % 4) * 0.07, ease: easeOutExpo }}
                >
                  <div className="mk-stay-dossier-media">
                    {canBookOnline ? (
                      <Link to={bookingHref} className="mk-stay-photo-link">
                        {stay.imageURLs[0] && <img src={stay.imageURLs[0]} alt={stay.title} loading="lazy" />}
                        <span className="mk-stay-room-tag">NO. {roomNumber}</span>
                        <span className="mk-stay-hover-pill">
                          Kiểm tra lịch trống <FiArrowRight />
                        </span>
                      </Link>
                    ) : (
                      <a href={CONTACT_LINKS.whatsapp} target="_blank" rel="noreferrer" className="mk-stay-photo-link">
                        {stay.imageURLs[0] && <img src={stay.imageURLs[0]} alt={stay.title} loading="lazy" />}
                        <span className="mk-stay-room-tag">NO. {roomNumber}</span>
                        <span className="mk-stay-hover-pill">
                          Hỏi phòng qua WhatsApp <FiArrowUpRight />
                        </span>
                      </a>
                    )}
                  </div>

                  <div className="mk-stay-dossier-body">
                    <div className="mk-stay-dossier-meta">
                      <span><FiMapPin /> {stay.address}</span>
                      <span><FiUsers /> Tối đa {stay.capacity || 2} khách</span>
                      <span><FiHome /> {stay.bedrooms || 1} phòng ngủ</span>
                    </div>

                    <h3>{stay.title}</h3>
                    <p>{stay.description}</p>

                    <div className="mk-stay-dossier-footer">
                      <div className="mk-stay-price-block">
                        <small>Giá tham khảo mỗi đêm</small>
                        <strong>{money(stay.basePrice, stay.currency)}</strong>
                      </div>

                      {canBookOnline ? (
                        <Link className="mk-button primary" to={bookingHref}>
                          <span>Xem lịch &amp; giữ phòng</span>
                          <FiArrowRight />
                        </Link>
                      ) : (
                        <a
                          className="mk-button primary"
                          href={`${CONTACT_LINKS.whatsapp}?text=${encodeURIComponent(
                            `Chào MaokiHouse, mình muốn hỏi phòng ${stay.title} từ ${dates.checkIn} đến ${dates.checkOut} cho ${guestCount} khách.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>Giữ phòng qua WhatsApp</span>
                          <FiArrowUpRight />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        ) : (
          <div className="mk-empty-filter">
            <p>Chưa có phòng nào khớp bộ lọc hiện tại.</p>
            <button
              type="button"
              className="mk-button"
              onClick={() => {
                setQuery('');
                setGuestCount(1);
              }}
            >
              Xem lại toàn bộ 4 không gian
            </button>
          </div>
        )}
      </section>

      {/* ───────────── SAIGON COMPANION STORY: INTERACTIVE EDITORIAL TRIPTYCH ───────────── */}
      <section id="story" className="mk-guest-section mk-story-band">
        <div className="mk-story-inner">
          <div className="mk-story-copy">
            <h2>Đồng hành cùng người trẻ Sài Gòn suốt 15 năm.</h2>
            <p className="mk-story-intro">
              <em>“We love wandering around, talking, sharing things about our lovely Saigon.”</em> — Khởi đầu từ những buổi dẫn khách đi bộ miễn phí qua từng góc phố, tụi mình tạo nên MaokiHouse để mỗi vị khách đều có một người bạn bản địa thực sự.
            </p>

            <div className="mk-story-steps" role="tablist" aria-label="Ba trải nghiệm đặc trưng tại MaokiHouse">
              {saigonMoments.map((moment, index) => {
                const active = index === activeMoment;
                return (
                  <button
                    key={moment.title}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`mk-story-step ${active ? 'is-active' : ''}`}
                    onClick={() => setActiveMoment(index)}
                    onMouseEnter={() => setActiveMoment(index)}
                  >
                    <div className="mk-story-step-head">
                      <span>{moment.time}</span>
                      <FiCompass />
                    </div>
                    <h3>{moment.title}</h3>
                    <p>{moment.story}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mk-story-stage">
            <AnimatePresence mode="wait">
              <motion.figure
                key={saigonMoments[activeMoment].title}
                className="mk-story-portrait"
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.5, ease: easeOutExpo }}
              >
                <img src={saigonMoments[activeMoment].image} alt={saigonMoments[activeMoment].alt} loading="lazy" />
                <figcaption>
                  <strong>{saigonMoments[activeMoment].title}</strong>
                  <span>{saigonMoments[activeMoment].time}</span>
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ───────────── GUESTBOOK: AUTHENTIC TRAVELER POSTCARDS ───────────── */}
      <section id="reviews" className="mk-guest-section mk-guestbook-section">
        <div className="mk-guestbook-header">
          <div>
            <h2>Những trang lưu bút để lại sau kỳ nghỉ.</h2>
            <p>Cảm nhận thật từ những vị khách đã chọn MaokiHouse làm nhà tại Sài Gòn.</p>
          </div>
          <a
            className="mk-button"
            href={CONTACT_LINKS.airbnb}
            target="_blank"
            rel="noreferrer"
          >
            Xem hồ sơ trên Airbnb <FiArrowUpRight />
          </a>
        </div>

        <div className="mk-guestbook-grid">
          {guestNotes.map((note, index) => (
            <motion.article
              key={note.name}
              className="mk-postcard"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: index * 0.07, ease: easeOutExpo }}
            >
              <div className="mk-postcard-top">
                <img src={note.avatar} alt={note.name} loading="lazy" />
                <div>
                  <h3>{note.name}</h3>
                  <small>{note.origin}</small>
                </div>
                <span className="mk-postcard-stars" aria-label="5 trên 5 sao">
                  <FiStar /><FiStar /><FiStar /><FiStar /><FiStar />
                </span>
              </div>

              <blockquote>“{note.quote}”</blockquote>

              <footer className="mk-postcard-foot">
                <span>{note.room}</span>
                <time>{note.date}</time>
              </footer>
            </motion.article>
          ))}
        </div>
      </section>
    </div>
  );
}
