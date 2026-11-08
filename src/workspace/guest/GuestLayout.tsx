import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { FiMenu, FiX, FiPhone, FiMail, FiFacebook, FiArrowRight, FiArrowUpRight, FiLock } from 'react-icons/fi';
import Brand from '../Brand';
import BlossomIntro from './BlossomIntro';
import { CONTACT_LINKS } from '../../constants/contact';
import '../workspace.css';
import '../zones.css';

/**
 * Guest zone (khách thuê phòng). Every surface a visitor sees lives inside
 * this frame — warm Saigon boutique atmosphere, zero management jargon.
 * Staff access is reduced to a discreet lock link in the footer sub-bar.
 */
const links = [
  { to: '/#stays', label: 'Không gian lưu trú' },
  { to: '/#story', label: 'Câu chuyện Sài Gòn' },
  { to: '/#reviews', label: 'Nhật ký khách lưu trú' },
  { to: '/#contact', label: 'Liên hệ' },
];

export default function GuestLayout() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname, location.hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [location.pathname, location.hash]);

  return (
    <div className="maoki-ui mk-zone-guest">
      <BlossomIntro />
      <a className="mk-skip" href="#guest-main">Đến nội dung chính</a>

      <header className={`mk-guest-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="mk-guest-header-inner">
          <div className="mk-guest-brand-cluster">
            <Brand />
            <span className="mk-guest-city-stamp" aria-label="Tọa độ Sài Gòn">
              Sài Gòn · 10°46′N
            </span>
          </div>

          <nav className={`mk-guest-nav ${open ? 'is-open' : ''}`} aria-label="Điều hướng dành cho khách">
            {links.map(link => (
              <Link key={link.to} to={link.to} className="mk-guest-nav-link">
                <span>{link.label}</span>
              </Link>
            ))}
            <NavLink className="mk-button primary mk-guest-cta" to="/#stays">
              <span>Chọn phòng ngay</span>
              <FiArrowRight />
            </NavLink>
          </nav>

          <button
            className="mk-icon-button mk-guest-menu"
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
          >
            {open ? <FiX /> : <FiMenu />}
          </button>
        </div>
      </header>

      <main id="guest-main" tabIndex={-1} className="mk-guest-main">
        <Outlet />
      </main>

      <footer className="mk-guest-footer" id="contact">
        <div className="mk-guest-footer-marquee" aria-hidden="true">
          <span>Make yourself at home in Saigon · MaokiHouse · Thảo Điền · Đa Kao · Bình Thạnh · Quận 3</span>
        </div>

        <div className="mk-guest-footer-inner">
          <div className="mk-guest-footer-brand">
            <Brand />
            <p>
              Một góc yên bình giữa nhịp sống Sài Gòn. Chọn căn phòng hợp gu bạn, phần chu đáo còn lại cứ để MaokiHouse lo.
            </p>
            <div className="mk-guest-footer-direct">
              <a className="mk-guest-pill-action" href={CONTACT_LINKS.whatsapp} target="_blank" rel="noreferrer">
                <FiPhone /> Nhắn WhatsApp giữ phòng <FiArrowUpRight />
              </a>
            </div>
          </div>

          <div>
            <h2>Liên hệ đặt phòng</h2>
            <ul className="mk-guest-contact">
              <li>
                <a href={CONTACT_LINKS.whatsapp} target="_blank" rel="noreferrer">
                  <FiPhone /> {CONTACT_LINKS.whatsappDisplay}
                </a>
              </li>
              <li>
                <a href={CONTACT_LINKS.emailHref}>
                  <FiMail /> {CONTACT_LINKS.email}
                </a>
              </li>
              <li>
                <a href={CONTACT_LINKS.facebook} target="_blank" rel="noreferrer">
                  <FiFacebook /> Maoki House trên Facebook
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2>Hành trình của khách</h2>
            <ul className="mk-guest-contact">
              <li><Link to="/#stays">Bốn không gian lưu trú tại Sài Gòn</Link></li>
              <li><Link to="/#story">Free Walking Street Tour cùng chủ nhà</Link></li>
              <li><Link to="/#reviews">Nhật ký khách quốc tế &amp; nội địa</Link></li>
              <li>
                <a href={CONTACT_LINKS.airbnb} target="_blank" rel="noreferrer">
                  Hồ sơ chủ nhà trên Airbnb <FiArrowUpRight />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mk-guest-footer-bottom">
          <span>© {new Date().getFullYear()} MaokiHouse · Sài Gòn, Việt Nam · Chăm chút từng kỳ nghỉ</span>
          <Link to="/admin" className="mk-guest-staff-link">
            <FiLock /> Đăng nhập quản trị (dành cho nhân viên)
          </Link>
        </div>
      </footer>
    </div>
  );
}
