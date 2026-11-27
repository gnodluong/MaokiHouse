# MaokiHouse

Không gian quản lý lưu trú và chăm sóc khách hàng bằng tiếng Việt. React/Vite dùng Supabase cho tài khoản, dữ liệu, phân quyền và chat website. Bản demo phát triển dùng Firebase Emulator riêng biệt và chỉ mở khi có cấu hình emulator; bản production không có nút demo.

## Khởi chạy với Supabase

Dùng Node.js 24.x (đã kiểm tra 24.19.0); lệnh Management API dùng hỗ trợ proxy của Node 24.

```bash
npm ci
cp .env.example .env
# Điền publishable key của dự án vào .env nếu chưa có.
npm run dev
```

`.env` hiện tại đã được điền theo thông tin người dùng cung cấp và được Git bỏ qua. Không ghi đè nếu file đã tồn tại. Hai biến trình duyệt có thể ghi đè cấu hình dự án mặc định là `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Các biến `VITE_*` có mặt trong bundle; chỉ dùng publishable key tại đây. `src/config/supabase.public.ts` giữ URL/publishable key công khai của dự án đã được người dùng chọn, để bản build Vercel không phụ thuộc file `.env` chỉ có trên máy cloud. Không có token quản trị hoặc secret key trong cấu hình này.

Lần đầu sử dụng, mở **`/setup`** trên website: trang này có SQL sẵn để sao chép hoặc tải xuống, liên kết đúng SQL Editor, nút kiểm tra kết nối và hướng dẫn tạo tài khoản. Không cần terminal. Xem thêm [kích hoạt Supabase](docs/SUPABASE.md). Đường dẫn `/admin` mở đăng nhập/đăng ký; `/admin/dashboard` mở không gian quản lý. Website công khai hiển thị phòng được chủ nhà chủ động xuất bản. Dữ liệu Firebase cũ chưa được nhập sang Supabase.

> **Cập nhật 2026-11:** trang web chỉ còn dành cho **khách** (trang chủ, đặt phòng, sổ tay, chat). Quản trị nằm trong ứng dụng **Maoki Admin** (`desktop/` cho Windows/macOS, `mobile/` cho Android/iOS), dùng chung dự án Supabase. Các script `test:browser`, `test:supabase-browser`, `screenshots:admin` kiểm tra giao diện quản trị cũ trên web nên không còn áp dụng; kiểm tra bằng `npm run test:db` và các test API.

## Các luồng đã xây dựng

| Nhóm | Chức năng |
| --- | --- |
| Kết nối lịch | Trình hướng dẫn 3 bước cho Airbnb, Booking.com, Agoda, Vrbo, Expedia, Traveloka, Trip.com, Google Calendar và mọi lịch iCal (.ics); xuất lịch Maoki cho từng phòng; đồng bộ tất cả và tự đồng bộ khi mở trang quản trị nếu lịch đã quá 1 giờ |
| Lưu trú | Phòng/căn hộ, lịch 7/14 ngày, đặt phòng và chống trùng lịch, giá theo ngày, đóng ngày bán, số đêm tối thiểu |
| Vận hành | Công việc, phân công, hoàn tất công việc, sổ tay khách qua liên kết riêng |
| Khách hàng | Hồ sơ, thẻ, ghi chú, lịch sử đặt phòng, tìm kiếm và CSV |
| Social | Hộp thư theo kênh, phân công, trạng thái, mẫu trả lời, chat website với phiên khách riêng |
| Tự động hóa | Sự kiện hội thoại mới/đặt phòng xác nhận; tạo việc, gắn thẻ, lưu phản hồi; trước nhận phòng chạy thủ công |
| Kinh doanh | Thu/chi, báo cáo dòng tiền/công suất, đối soát chủ sở hữu, thống kê hội thoại theo kênh |
| Đội ngũ | Chủ không gian, quản lý, nhân viên, chỉ xem; mời đúng email đã xác minh; thu hồi; chuyển không gian |
| Công khai | Danh sách phòng đã xuất bản, báo giá từ máy chủ, yêu cầu đặt phòng, sổ tay, widget chat |
| Giao diện | Admin có giao diện Sáng/Tối (nút trên thanh trên cùng và trong Cài đặt), hướng dẫn nhanh trên mỗi trang, danh sách “Bắt đầu” ở Tổng quan; website khách vẽ màu nước hoa anh đào trên giấy cổ |

Airbnb/Booking.com đã có nhập/xuất lịch iCal; cần bấm Đồng bộ để nhập lịch mới và phía OTA lấy lịch theo chu kỳ riêng. Giá, chi tiết đặt phòng, tin nhắn OTA và các kênh Agoda/Facebook/Instagram/Zalo/email vẫn cần API nhà cung cấp. Xem [hướng dẫn kết nối từng kênh](docs/CHANNELS.md). Hội thoại ngoài Website lưu phản hồi nội bộ; màn hình ghi rõ trạng thái. Chiến dịch lưu bản nháp/lịch dự kiến, chưa có bộ gửi. Trợ lý AI cần `GEMINI_API_KEY` trên máy chủ Vercel và Redeploy; không đưa key vào `VITE_*`. Thanh toán và tải ảnh lên storage chưa được kết nối. Ảnh phòng hiện nhập bằng URL HTTPS/đường dẫn tài nguyên; danh bạ nhân viên vận hành tách khỏi quyền đăng nhập.

Yêu cầu đặt phòng công khai ở trạng thái chờ cũng giữ lịch; chủ nhà cần xác nhận hoặc hủy để giải phóng lịch. Số tiền đối soát là ước tính từ sổ thu chi, không thực hiện chuyển tiền. Quy tắc giá cập nhật gần nhất có hiệu lực khi trùng ngày.

Phạm vi được xây theo kế hoạch người dùng đã duyệt, lấy các nhóm công việc GoHost/Hostfully/Subiz làm định hướng. Các website tham chiếu bị chặn bởi mạng trong phiên này; chưa xác minh được toàn bộ chức năng của từng dịch vụ. Mã giao diện/trang cũ vẫn được giữ trong repository; entry point hiện tại là `src/workspace/Application.tsx`.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm run build
npm test
# Xem kế hoạch và áp dụng Supabase thật khi đã có token quản trị an toàn:
npm run supabase:plan
npm run supabase:status
npm run supabase:apply
# Cần Vite đang chạy và Chromium:
npm run test:supabase-browser
# Cần thêm bộ emulator/API demo đang chạy:
npm run test:browser
# API cục bộ (kênh, tin nhắn, tác vụ nền), chạy song song với npm run dev:
npm run server:api
```

`test:db` chạy migration thật trên PostgreSQL nhúng PGlite, kiểm tra RLS, phân quyền, cô lập tài khoản, lời mời, chống trùng lịch, giá máy chủ và phiên chat. `test:supabase-browser` chạy SDK thật với PostgreSQL đó qua cầu REST cục bộ và Auth giả lập; không kiểm tra Supabase Auth đang host. Nó cũng chạy axe cho trang đăng nhập, tổng quan, hộp thoại và hộp thư sáng/tối/điện thoại. `test:browser` dùng Auth/Firestore Emulator thật và hai phiên trình duyệt độc lập; dọn dữ liệu/tài khoản do lần kiểm tra tạo ra.

Các script trình duyệt mặc định dùng Chromium hệ thống `/usr/bin/chromium`; có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. `TEST_WEB_ORIGIN` đổi địa chỉ ứng dụng, `TEST_ARTIFACT_DIR` đổi thư mục ảnh/kết quả. Không dùng `test:browser` cho website production: nó dành riêng cho máy phát triển có emulator loopback.

## Cloud environment và REA

Bộ cài/khởi động demo đã chuẩn bị tại `/workspace/.maokihouse`. Xem [ghi chú môi trường và REA](docs/ENVIRONMENT.md). REA 6.5.0 đã đăng ký cho Codex, qua doctor và kiểm tra MCP; phiên agent cần kết nối lại để nạp server mới.

[Skill thiết kế do người dùng gửi](docs/apple-design-skill.md) được giữ để tham khảo. Các file HIG `references/` đi kèm không có trong bản tải lên; giao diện áp dụng các nguyên tắc trong tài liệu và được kiểm tra trực tiếp, không đưa ra trích dẫn HIG chưa đọc.

Đối chiếu với các nền tảng thương mại và QloApps/Chatwoot: [PRODUCT_COMPARISON.md](docs/PRODUCT_COMPARISON.md). Xem [thông báo nguồn/giấy phép](docs/THIRD_PARTY_NOTICES.md) cho các file upstream được giữ trong repository.

Kết quả kiểm tra bảo mật: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md).

## Nhận diện Maoki

Logo gốc `src/assets/images/logo.png` được dùng trực tiếp trên website, đăng nhập, sidebar và trang hướng dẫn. Bảng màu trở về nâu đất `#8a4a34`, nâu espresso `#5c2f20`, kem `#fdf6ee`, với màu nhấn vàng đồng của bộ nhận diện cũ. Logo không phụ thuộc Cloudinary.



## Cập nhật lịch kênh

Mở `/setup?mode=channels` để lấy SQL nâng cấp iCal cho dự án đã thiết lập. Migration mới là `20261018085535_maoki_channel_calendars.sql`; không chạy lại initial migration trên dữ liệu đang có. Chủ không gian/quản lý mở `/admin/dashboard/channels` để chọn kênh, phòng và dán URL xuất lịch chính thức. Liên kết xuất Maoki cần được nhập lại ở phía OTA cho chiều đồng bộ ngược. Daily use không cần token quản trị hoặc service-role key.

API (tin nhắn, đánh giá, YouTube, kênh, webhook, worker) chạy như một **Supabase Edge Function** tại `supabase/functions/api`, địa chỉ `https://<mã-dự-án>.supabase.co/functions/v1/api/<endpoint>`; không còn dùng Vercel. Triển khai bằng workflow GitHub **Deploy Maoki API** (cần secret `SUPABASE_ACCESS_TOKEN`) hoặc `npx supabase functions deploy api --no-verify-jwt`. Kiểm thử: `npm run test:edge` (cần Deno). Phát triển cục bộ: `npm run server:api` phục vụ `/api/*` trên cổng 5001; đặt `VITE_API_ORIGIN=http://localhost:5173` để app gọi qua proxy của Vite. Website khách là trang tĩnh, workflow **Deploy guest website** đưa lên GitHub Pages (cần tên miền riêng). Logo giữ nguyên; dòng Hospitality Workspace đã bỏ khỏi giao diện/tab. Chuyển động chỉ dùng animation ngắn và bị tắt khi `prefers-reduced-motion: reduce`.
