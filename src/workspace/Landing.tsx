import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiFeather, FiMapPin, FiUsers, FiKey, FiCoffee, FiMessageCircle, FiShield } from 'react-icons/fi';
import { publicFetch, publicPath } from './publicApi';
import { money } from './utils';
import './workspace.css';
import './zones.css';

interface PublicStay { id: string; title: string; address: string; description: string; imageURLs: string[]; basePrice: number; capacity: number; currency: string; businessName: string }

/** Guest home page. Rendered inside GuestLayout, so it only contains guest content. */
export default function Landing() {
  const [stays, setStays] = useState<PublicStay[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === '1';
  useEffect(() => { let active = true; void publicFetch<PublicStay[]>('/public/properties').then(result => { if (active) setStays(result); }).catch(() => { if (active) setError('Danh sách phòng đang được cập nhật. Bạn có thể quay lại sau hoặc liên hệ trực tiếp với MaokiHouse ở cuối trang.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const filtered = stays.filter(stay => (stay.title + stay.address).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));

  return <>
    <section className="mk-site-hero">
      <div>
        <span className="mk-eyebrow">MAOKIHOUSE · MỘT CHÚT RIÊNG, MỘT CHÚT NHÀ</span>
        <h1>Ở lại một nơi.<br />Mang về một<br /><em>cảm giác.</em></h1>
        <p>Một góc yên bình giữa nhịp sống thành phố. Chọn không gian bạn thích, để MaokiHouse chăm chút phần còn lại.</p>
        <div className="mk-guest-hero-actions">
          <Link className="mk-button primary" to="/#stays">Tìm phòng cho kỳ nghỉ<FiArrowRight /></Link>
          <Link className="mk-button" to="/#contact">Hỏi MaokiHouse</Link>
        </div>
      </div>
      <div className="mk-site-hero-image"><img src="/rooms/maoki-1.jpg" alt="Không gian lưu trú MaokiHouse với ánh sáng tự nhiên" /><span><FiFeather />Những điều nhỏ làm nên một kỳ nghỉ đẹp.</span></div>
    </section>

    <section id="stays" className="mk-site-section">
      <div className="mk-site-section-header">
        <div><span className="mk-eyebrow">CHỌN MỘT GÓC CHO RIÊNG MÌNH</span><h2>Những không gian đang chờ bạn.</h2></div>
        <label className="mk-field"><span className="mk-sr">Tìm phòng</span><input placeholder="Tên phòng hoặc khu vực…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      {loading ? <p role="status">Đang tìm những không gian…</p>
        : error ? <p className="mk-alert" role="status">{error}</p>
        : filtered.length ? <div className="mk-site-stays">{filtered.map(stay => <article className="mk-property" key={stay.id}>
          <Link to={publicPath('/book/' + stay.id, demo)} className="mk-property-image">{stay.imageURLs[0] && <img src={stay.imageURLs[0]} alt={stay.title} loading="lazy" />}</Link>
          <div className="mk-property-body">
            <span className="mk-eyebrow">{stay.businessName}</span>
            <h3>{stay.title}</h3>
            <p><FiMapPin />{stay.address}</p>
            <div className="mk-property-meta"><span><FiUsers />{stay.capacity || 2} khách</span><strong>{money(stay.basePrice, stay.currency)}<small> / đêm</small></strong></div>
            <Link className="mk-button primary" to={publicPath('/book/' + stay.id, demo)}>Xem phòng &amp; đặt<FiArrowRight /></Link>
          </div>
        </article>)}</div>
        : <p className="mk-alert">{stays.length ? 'Chưa tìm thấy phòng phù hợp với từ khóa.' : 'Những không gian mới đang được chuẩn bị. Hãy liên hệ MaokiHouse để được tư vấn phòng phù hợp.'}</p>}
    </section>

    <section id="experience" className="mk-site-section mk-guest-experience">
      <div className="mk-site-section-header"><div><span className="mk-eyebrow">KỲ NGHỈ CỦA BẠN</span><h2>Đặt phòng nhẹ nhàng, ở như ở nhà.</h2></div></div>
      <div className="mk-guest-perks">
        {[
          { icon: FiShield, title: 'Không thanh toán trước', text: 'Gửi yêu cầu đặt phòng miễn phí. MaokiHouse xác nhận rồi mới trao đổi thanh toán.' },
          { icon: FiKey, title: 'Nhận phòng dễ dàng', text: 'Sổ tay lưu trú riêng với hướng dẫn nhận phòng, Wi-Fi và nội quy gửi tới bạn.' },
          { icon: FiCoffee, title: 'Gợi ý địa phương', text: 'Quán cà phê, món ngon và góc đẹp quanh nhà do chính chủ nhà chọn.' },
          { icon: FiMessageCircle, title: 'Luôn có người hỗ trợ', text: 'Nhắn qua WhatsApp, email hoặc Facebook, MaokiHouse phản hồi nhanh chóng.' },
        ].map(({ icon: Icon, title, text }) => <article key={title}><span className="mk-guest-perk-icon"><Icon /></span><h3>{title}</h3><p>{text}</p></article>)}
      </div>
    </section>
  </>;
}
