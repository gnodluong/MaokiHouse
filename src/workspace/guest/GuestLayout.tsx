import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { FiMenu, FiX, FiPhone, FiMail, FiFacebook, FiArrowRight, FiLock } from 'react-icons/fi';
import Brand from '../Brand';
import { CONTACT_LINKS } from '../../constants/contact';
import '../workspace.css';
import '../zones.css';

/**
 * Guest zone (khách thuê phòng). Everything a visitor sees lives inside this
 * frame: no management actions, no staff vocabulary. The only path to the
 * admin zone is a small, clearly labelled link in the footer.
 */
const links = [
  { to: '/#stays', label: 'Phòng nghỉ' },
  { to: '/#experience', label: 'Trải nghiệm' },
  { to: '/#contact', label: 'Liên hệ' },
];

export default function GuestLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [location.pathname, location.hash]);

  return <div className="maoki-ui mk-zone-guest">
    <a className="mk-skip" href="#guest-main">Đến nội dung chính</a>
    <header className="mk-guest-header">
      <div className="mk-guest-header-inner">
        <Brand />
        <nav className={`mk-guest-nav ${open ? 'is-open' : ''}`} aria-label="Điều hướng dành cho khách">
          {links.map(link => <Link key={link.to} to={link.to}>{link.label}</Link>)}
          <NavLink className="mk-button primary" to="/#stays">Đặt phòng ngay<FiArrowRight /></NavLink>
        </nav>
        <button className="mk-icon-button mk-guest-menu" aria-label={open ? 'Đóng menu' : 'Mở menu'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <FiX /> : <FiMenu />}</button>
      </div>
    </header>
    <main id="guest-main" tabIndex={-1} className="mk-guest-main"><Outlet /></main>
    <footer className="mk-guest-footer" id="contact">
      <div className="mk-guest-footer-inner">
        <div className="mk-guest-footer-brand">
          <Brand />
          <p>Một góc yên bình giữa nhịp sống Sài Gòn. Chọn không gian bạn thích, để MaokiHouse chăm chút phần còn lại.</p>
        </div>
        <div>
          <h2>Liên hệ đặt phòng</h2>
          <ul className="mk-guest-contact">
            <li><a href={CONTACT_LINKS.whatsapp} target="_blank" rel="noreferrer"><FiPhone />{CONTACT_LINKS.whatsappDisplay}</a></li>
            <li><a href={CONTACT_LINKS.emailHref}><FiMail />{CONTACT_LINKS.email}</a></li>
            <li><a href={CONTACT_LINKS.facebook} target="_blank" rel="noreferrer"><FiFacebook />Maoki House trên Facebook</a></li>
          </ul>
        </div>
        <div>
          <h2>Dành cho khách</h2>
          <ul className="mk-guest-contact">
            <li><Link to="/#stays">Xem phòng còn trống</Link></li>
            <li><Link to="/#experience">Vì sao chọn MaokiHouse</Link></li>
            <li><a href={CONTACT_LINKS.airbnb} target="_blank" rel="noreferrer">Đánh giá trên Airbnb</a></li>
          </ul>
        </div>
      </div>
      <div className="mk-guest-footer-bottom">
        <span>© {new Date().getFullYear()} MaokiHouse · Chăm chút từng kỳ nghỉ</span>
        <Link to="/admin" className="mk-guest-staff-link"><FiLock />Đăng nhập quản trị (dành cho nhân viên)</Link>
      </div>
    </footer>
  </div>;
}
