import { Link } from 'react-router-dom';
import { FiDownload, FiMonitor, FiSmartphone } from 'react-icons/fi';

const RELEASES = 'https://github.com/gnodluong/MaokiHouse/releases/latest';

/** Staff used to sign in on the website; the admin now lives in the Maoki Admin apps. */
export default function AppDownload() {
  return <div className="maoki-ui mk-public"><div className="mk-public-card">
    <h1>Quản trị MaokiHouse đã chuyển sang ứng dụng</h1>
    <p>Chủ nhà và nhân viên quản lý phòng, đặt phòng, hộp thư và công việc trong ứng dụng <strong>Maoki Admin</strong> trên máy tính và điện thoại. Trang web này chỉ dành cho khách đặt phòng.</p>
    <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', display: 'grid', gap: 10 }}>
      <li><FiMonitor aria-hidden="true" /> Windows và macOS — bộ cài trong mục Releases</li>
      <li><FiSmartphone aria-hidden="true" /> Android — tệp APK trong mục Releases</li>
    </ul>
    <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><a className="mk-button primary" href={RELEASES} target="_blank" rel="noreferrer"><FiDownload aria-hidden="true" />Tải ứng dụng</a><Link className="mk-button" to="/">Về trang chủ</Link></p>
  </div></div>;
}
