import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL, entityLine } from '../constants/legal';

function Page({ title, children }: { title: string; english?: string; children: ReactNode }) {
  useEffect(() => { const previous = document.title; document.title = `${title} · MaokiHouse`; return () => { document.title = previous; }; }, [title]);
  return <article className="mk-legal">
    <p className="mk-legal-meta">Hiệu lực từ {LEGAL.effectiveDate} · {entityLine()}</p>
    <h1>{title}</h1>
    {children}
    <p className="mk-legal-nav"><Link to="/privacy">Quyền riêng tư</Link> · <Link to="/terms">Điều khoản</Link> · <Link to="/data-deletion">Xóa dữ liệu</Link> · <Link to="/">Trang chủ</Link></p>
  </article>;
}

export function Privacy() {
  return <Page title="Chính sách quyền riêng tư" english="Privacy policy (summary in English)">
    <p>MaokiHouse (“chúng tôi”) vận hành website đặt phòng dành cho khách và ứng dụng <b>Maoki Admin</b> cho chủ nhà, quản lý và nhân viên các cơ sở lưu trú. Chính sách này giải thích chúng tôi thu thập dữ liệu nào, dùng để làm gì và bạn kiểm soát nó ra sao.</p>
    <h2>1. Đơn vị chịu trách nhiệm</h2>
    <p>{entityLine()}. Liên hệ về dữ liệu: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>{LEGAL.phone ? <> · {LEGAL.phone}</> : null}.</p>
    <h2>2. Dữ liệu chúng tôi xử lý</h2>
    <ul>
      <li><b>Khách đặt phòng / nhắn tin trên website:</b> tên, email, số điện thoại, ngày lưu trú, nội dung yêu cầu và tin nhắn trong khung chat. Khung chat lưu một khóa phiên trong bộ nhớ cục bộ của trình duyệt để bạn xem lại cuộc trò chuyện.</li>
      <li><b>Chủ nhà và nhân viên (Maoki Admin):</b> email đăng nhập, tên, vai trò; thông tin cơ sở lưu trú, đặt phòng, công việc, sổ thu chi; nhật ký hoạt động (hành động, người thực hiện, thời điểm).</li>
      <li><b>Tin nhắn qua các kênh chủ nhà kết nối:</b> khi chủ nhà kết nối Trang Facebook, Instagram chuyên nghiệp, WhatsApp Business, Zalo Official Account, email, YouTube hoặc Google Business Profile, chúng tôi nhận và lưu nội dung tin nhắn, bình luận, đánh giá gửi tới <i>chính tài khoản của chủ nhà đó</i>, kèm mã định danh người gửi do nền tảng cấp (ví dụ PSID, số điện thoại WhatsApp, mã Zalo) và tên hiển thị nếu nền tảng cung cấp.</li>
      <li><b>Cuộc gọi:</b> với chủ nhà dùng tổng đài, nhà cung cấp tổng đài gửi cho chúng tôi số điện thoại, hướng gọi, kết quả, thời lượng và liên kết ghi âm (nếu có).</li>
      <li><b>Thông tin kết nối kênh:</b> khóa/ token do chủ nhà cung cấp để Maoki nhận và gửi tin thay họ. Được lưu trong vùng riêng của cơ sở dữ liệu, không bao giờ được trả về trình duyệt hay ứng dụng; chủ nhà xóa bất cứ lúc nào bằng nút “Xóa kết nối”.</li>
    </ul>
    <h2>3. Mục đích sử dụng</h2>
    <p>Chỉ để cung cấp dịch vụ cho chủ nhà: nhận và trả lời tin nhắn của khách của họ, quản lý đặt phòng và vận hành, phản hồi đánh giá và bình luận công khai. Chúng tôi <b>không bán dữ liệu, không dùng dữ liệu cho quảng cáo hoặc lập hồ sơ người dùng, không chia sẻ dữ liệu nền tảng cho môi giới dữ liệu</b>. Website khách không dùng công cụ phân tích hay quảng cáo của bên thứ ba.</p>
    <h2>4. Dữ liệu lấy từ các nền tảng</h2>
    <p>Maoki chỉ truy cập tài khoản mà chủ nhà chủ động cấp quyền, và chỉ dùng quyền đó cho đúng chức năng: Facebook Messenger / Instagram (nhận và trả lời tin nhắn gửi tới Trang/tài khoản của chủ nhà), WhatsApp (nhận tin và gửi trả lời hoặc mẫu tin đã duyệt), Zalo OA (nhận và gửi tin tư vấn), Google Business Profile (đọc đánh giá và đăng phản hồi của chủ sở hữu), YouTube (đọc bình luận trên kênh của chủ nhà và đăng phản hồi). Việc sử dụng và chuyển giao thông tin nhận từ Google API tuân thủ <i>Google API Services User Data Policy</i>, bao gồm các yêu cầu Sử dụng Hạn chế.</p>
    <h2>5. Bên xử lý và chia sẻ dữ liệu</h2>
    <ul>
      <li><b>Supabase</b> — cơ sở dữ liệu và xác thực.</li>
      <li><b>Supabase Edge Functions</b> — chạy các điểm cuối API (nhận webhook, gửi tin); cùng nhà cung cấp với cơ sở dữ liệu.</li>
      <li><b>GitHub Pages</b> — phục vụ website khách (trang chủ, đặt phòng, sổ tay, trang pháp lý); chỉ thấy địa chỉ IP người truy cập.</li>
      <li><b>Nhà cung cấp gửi email</b> (SMTP của chủ nhà hoặc Resend) — khi chủ nhà bật kênh email.</li>
      <li><b>Nhà cung cấp tổng đài</b> do chủ nhà chọn — khi chủ nhà bật nhật ký cuộc gọi.</li>
      <li><b>Các nền tảng chủ nhà kết nối</b> (Meta, Zalo, Google) — nhận tin trả lời mà chủ nhà gửi qua Maoki.</li>
      <li>Website khách tải phông chữ từ Google Fonts và biểu tượng từ jsDelivr; các nhà cung cấp này có thể nhận địa chỉ IP của bạn.</li>
    </ul>
    <p>Ngoài các bên trên, chúng tôi không chia sẻ dữ liệu cá nhân, trừ khi pháp luật yêu cầu.</p>
    <h2>6. Nơi lưu trữ và chuyển dữ liệu</h2>
    <p>Dữ liệu được lưu trên hạ tầng của Supabase (cơ sở dữ liệu và API), có thể đặt ngoài lãnh thổ Việt Nam. Chúng tôi áp dụng các biện pháp bảo vệ được nêu ở mục 8 khi truyền và lưu trữ dữ liệu.</p>
    <h2>7. Thời gian lưu và xóa</h2>
    <p>Dữ liệu được lưu cho đến khi chủ nhà xóa hoặc đóng không gian làm việc. Chúng tôi hoàn tất yêu cầu xóa đã xác minh trong vòng {LEGAL.deletionDays} ngày. Cách yêu cầu: xem <Link to="/data-deletion">hướng dẫn xóa dữ liệu</Link>.</p>
    <h2>8. Bảo mật</h2>
    <ul>
      <li>Mọi kết nối dùng HTTPS.</li>
      <li>Mỗi không gian làm việc chỉ truy cập được dữ liệu của chính nó (phân quyền theo từng dòng dữ liệu ở cơ sở dữ liệu) và phân vai: chủ, quản lý, nhân viên, chỉ xem.</li>
      <li>Webhook từ nền tảng được xác thực bằng chữ ký (HMAC-SHA256 của Meta, chữ ký sự kiện của Zalo) hoặc mã bí mật riêng cho từng kết nối.</li>
      <li>Token và khóa API lưu trong vùng cơ sở dữ liệu riêng, không có quyền đọc từ trình duyệt.</li>
      <li>Giới hạn tần suất yêu cầu và kiểm tra địa chỉ để ngăn lạm dụng.</li>
    </ul>
    <h2>9. Quyền của bạn</h2>
    <p>Bạn có quyền truy cập, chỉnh sửa, xóa, hạn chế hoặc phản đối việc xử lý dữ liệu của mình, và rút lại sự đồng ý đã cấp. Gửi yêu cầu tới {LEGAL.email}. Nếu dữ liệu của bạn nằm trong hệ thống của một chủ nhà (bạn là khách của họ), chúng tôi chuyển yêu cầu cho chủ nhà đó và hỗ trợ thực hiện.</p>
    <h2>10. Cuộc gọi và ghi âm</h2>
    <p>Chủ nhà dùng tổng đài có trách nhiệm thông báo cho người gọi khi cuộc gọi được ghi âm. Maoki chỉ lưu liên kết do nhà cung cấp tổng đài gửi.</p>
    <h2>11. Thay đổi chính sách</h2>
    <p>Chúng tôi cập nhật chính sách khi dịch vụ thay đổi và ghi rõ ngày hiệu lực ở đầu trang.</p>
    <h2>12. Liên hệ</h2>
    <p>{LEGAL.email}{LEGAL.phone ? ` · ${LEGAL.phone}` : ''}</p>
    {/* English summary */}
    <section lang="en" className="mk-legal-en"><hr /><h2>Privacy policy (summary)</h2>
      <p>MaokiHouse runs a guest booking website and <b>Maoki Admin</b>, an app for property owners and staff of small hotels and homestays. We process guest booking details and the messages, comments and reviews that reach accounts a property owner has explicitly connected (Facebook Page, Instagram professional account, WhatsApp Business, Zalo Official Account, email, YouTube, Google Business Profile), plus call-log entries from the owner’s telephony provider. We use this data only to let that owner reply to and manage their own guests. We do not sell data, use it for advertising or profiling, or share platform data with data brokers. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</p>
      <p>Sub-processors: Supabase (database, auth and API hosting), GitHub Pages (static website), the owner’s email provider, the owner’s telephony provider. Channel tokens are stored in a private database area never returned to the browser and are deleted when the owner disconnects the channel. Data is kept until the owner deletes it or closes the workspace; verified deletion requests are completed within {LEGAL.deletionDays} days. Contact: {LEGAL.email}.</p>
    </section>
  </Page>;
}

export function Terms() {
  return <Page title="Điều khoản sử dụng" english="Terms of service (summary in English)">
    <h2>1. Dịch vụ</h2>
    <p>Maoki cung cấp website đặt phòng cho khách và ứng dụng Maoki Admin để quản lý lưu trú, hộp thư khách, đặt phòng, công việc, báo cáo và kết nối các kênh liên lạc. Một số tính năng chỉ có ở gói dịch vụ nhất định.</p>
    <h2>2. Tài khoản</h2>
    <p>Bạn chịu trách nhiệm về thông tin đăng nhập và về các hành động của người được bạn mời vào không gian làm việc. Thông báo ngay cho chúng tôi nếu nghi ngờ bị truy cập trái phép.</p>
    <h2>3. Kênh kết nối và chính sách của bên thứ ba</h2>
    <p>Khi kết nối Facebook, Instagram, WhatsApp, Zalo, Google hoặc YouTube, bạn xác nhận mình có quyền quản trị tài khoản đó và đồng ý tuân thủ điều khoản của từng nền tảng (bao gồm quy định về khung thời gian trả lời, mẫu tin, tin nhắn quảng cáo và quyền riêng tư). Bạn chịu trách nhiệm về nội dung do bạn hoặc nhân viên gửi đi. Chúng tôi có thể ngắt một kết nối nếu nền tảng yêu cầu hoặc nếu có dấu hiệu lạm dụng.</p>
    <h2>4. Sử dụng được chấp nhận</h2>
    <p>Không gửi thư rác hay tin nhắn không được yêu cầu; không dùng dịch vụ cho nội dung trái pháp luật; không cố truy cập dữ liệu của không gian khác; không phá hoại hoặc quá tải hệ thống.</p>
    <h2>5. Dữ liệu của bạn</h2>
    <p>Bạn giữ quyền sở hữu dữ liệu của mình. Chúng tôi xử lý dữ liệu theo <Link to="/privacy">Chính sách quyền riêng tư</Link> và chỉ để cung cấp dịch vụ.</p>
    <h2>6. Tính sẵn sàng và thay đổi</h2>
    <p>Chúng tôi nỗ lực duy trì dịch vụ ổn định nhưng không cam kết không gián đoạn; các nền tảng bên thứ ba có thể thay đổi hoặc ngừng API mà chúng tôi không kiểm soát. Chúng tôi có thể cập nhật dịch vụ và các điều khoản này; thay đổi quan trọng được thông báo trước.</p>
    <h2>7. Giới hạn trách nhiệm</h2>
    <p>Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp, mất doanh thu hoặc mất dữ liệu phát sinh từ việc dùng dịch vụ hoặc từ hành động của nền tảng bên thứ ba. Trách nhiệm tối đa không vượt quá phí bạn đã trả trong 12 tháng gần nhất.</p>
    <h2>8. Chấm dứt</h2>
    <p>Bạn có thể ngừng dùng và yêu cầu xóa dữ liệu bất cứ lúc nào. Chúng tôi có thể tạm ngừng hoặc chấm dứt tài khoản vi phạm điều khoản.</p>
    <h2>9. Luật áp dụng và liên hệ</h2>
    <p>Điều khoản này chịu sự điều chỉnh của pháp luật Việt Nam. Liên hệ: {LEGAL.email}.</p>
    <section lang="en" className="mk-legal-en"><hr /><h2>Terms of service (summary)</h2>
      <p>Maoki provides a guest booking website and the Maoki Admin app. You are responsible for your account and for content you or your staff send. When you connect Facebook, Instagram, WhatsApp, Zalo, Google or YouTube you confirm you administer that account and agree to comply with each platform’s terms and messaging policies. Do not send spam or unlawful content. You keep ownership of your data; we process it under the Privacy policy. Third-party APIs may change outside our control. Liability is limited as permitted by law. Governing law: Vietnam. Contact: {LEGAL.email}.</p>
    </section>
  </Page>;
}

export function DataDeletion() {
  return <Page title="Hướng dẫn xóa dữ liệu" english="Data deletion instructions (English)">
    <p>Trang này mô tả cách bạn xóa dữ liệu của mình khỏi Maoki, bao gồm dữ liệu lấy từ Facebook, Instagram, WhatsApp, Zalo, Google và YouTube.</p>
    <h2>A. Bạn là chủ nhà / quản lý (người dùng Maoki Admin)</h2>
    <ol>
      <li><b>Ngắt một kênh:</b> Thiết lập → Kênh nhắn tin → chọn kênh → <b>Xóa kết nối</b>. Token và khóa của kênh bị xóa ngay; Maoki không còn nhận hoặc gửi tin cho kênh đó.</li>
      <li><b>Xóa hội thoại, khách, đặt phòng:</b> dùng nút xóa trong từng danh sách (Khách hàng, Hộp thư, Đặt phòng…).</li>
      <li><b>Xóa toàn bộ dữ liệu của một khách theo yêu cầu:</b> Khách hàng → chọn khách → <b>Xóa dữ liệu của khách</b>. Công cụ xóa mọi hội thoại, liên kết kênh và tin nhắn đang chờ gửi của khách đó, rồi xóa hồ sơ; các đặt phòng được giữ lại cho sổ sách nhưng bỏ tên, email và số điện thoại.</li>
      <li><b>Xóa toàn bộ không gian làm việc và tài khoản:</b> gửi yêu cầu tới <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> từ chính email đăng nhập, tiêu đề “Yêu cầu xóa dữ liệu”.</li>
    </ol>
    <h2>B. Bạn là khách (đã nhắn tin hoặc đặt phòng với một cơ sở dùng Maoki)</h2>
    <p>Gửi email tới <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>, tiêu đề “Yêu cầu xóa dữ liệu”, ghi tên Trang/tài khoản bạn đã nhắn tin và email hoặc số điện thoại bạn dùng (để chúng tôi tìm đúng dữ liệu). Chúng tôi xác minh yêu cầu và xóa hội thoại, hồ sơ khách liên quan trong vòng <b>{LEGAL.deletionDays} ngày</b>, rồi gửi email xác nhận. Nếu cơ sở lưu trú là bên quyết định mục đích xử lý, chúng tôi thông báo cho họ để cùng thực hiện.</p>
    <h2>C. Thu hồi quyền đã cấp cho Maoki</h2>
    <ul>
      <li><b>Facebook / Instagram:</b> Cài đặt Facebook → Ứng dụng và trang web → xóa “Maoki Admin”. Sau đó gửi yêu cầu xóa dữ liệu như mục B để chúng tôi xóa dữ liệu đã nhận.</li>
      <li><b>Google / YouTube:</b> <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a> → chọn Maoki Admin → Xóa quyền truy cập.</li>
      <li><b>Zalo:</b> quản trị OA vào trang quản lý ứng dụng liên kết với OA và hủy liên kết Maoki.</li>
    </ul>
    <h2>D. Dữ liệu nào bị xóa</h2>
    <p>Hội thoại và tin nhắn, hồ sơ khách và các giá trị bổ sung, nhật ký cuộc gọi, đánh giá và bình luận đã đồng bộ, token kết nối. Nhật ký hoạt động chỉ ghi nhãn hành động nên được ẩn danh khi tài khoản bị xóa. Dữ liệu sao lưu của nhà cung cấp hạ tầng được loại bỏ theo chu kỳ của họ.</p>
    <section lang="en" className="mk-legal-en"><hr /><h2>Data deletion instructions</h2>
      <p><b>Property owners / managers:</b> Settings → Messaging channels → choose a channel → “Remove connection” deletes its tokens immediately; delete conversations, guests and bookings from their lists; to erase everything about one guest, use Guests → choose the guest → “Delete guest data” (removes conversations, channel links and queued messages; bookings are kept but anonymised); to delete the whole workspace, email {LEGAL.email} from your login email with the subject “Data deletion request”. <b>Guests:</b> email {LEGAL.email} with that subject, naming the Page/account you messaged and your email or phone number; we verify and delete within {LEGAL.deletionDays} days and confirm by email. <b>Revoke access:</b> Facebook → Settings → Apps and websites → remove “Maoki Admin”; Google → myaccount.google.com/permissions; Zalo → unlink the app from your OA.</p>
    </section>
  </Page>;
}
