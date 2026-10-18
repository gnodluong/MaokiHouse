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

Lần đầu sử dụng, mở **`/setup`** trên website: trang này có SQL sẵn để sao chép hoặc tải xuống, liên kết đúng SQL Editor, nút kiểm tra kết nối và hướng dẫn tạo tài khoản/bật AI. Không cần terminal. Xem thêm [kích hoạt Supabase](docs/SUPABASE.md). Đường dẫn `/admin` mở đăng nhập/đăng ký; `/admin/dashboard` mở không gian quản lý. Website công khai hiển thị phòng được chủ nhà chủ động xuất bản. Dữ liệu Firebase cũ chưa được nhập sang Supabase.

## Các luồng đã xây dựng

| Nhóm | Chức năng |
| --- | --- |
| Kết nối lịch | Thêm từng phòng Airbnb/Booking.com bằng iCal, nhập ngày bận thủ công, xuất lịch Maoki, kiểm tra trùng và gỡ kết nối |
| Lưu trú | Phòng/căn hộ, lịch 7/14 ngày, đặt phòng và chống trùng lịch, giá theo ngày, đóng ngày bán, số đêm tối thiểu |
| Vận hành | Công việc, phân công, hoàn tất công việc, sổ tay khách qua liên kết riêng |
| Khách hàng | Hồ sơ, thẻ, ghi chú, lịch sử đặt phòng, tìm kiếm và CSV |
| Social | Hộp thư theo kênh, phân công, trạng thái, mẫu trả lời, chat website với phiên khách riêng |
| Tự động hóa | Sự kiện hội thoại mới/đặt phòng xác nhận; tạo việc, gắn thẻ, lưu phản hồi; trước nhận phòng chạy thủ công |
| Kinh doanh | Thu/chi, báo cáo dòng tiền/công suất, đối soát chủ sở hữu, thống kê hội thoại theo kênh |
| Đội ngũ | Chủ không gian, quản lý, nhân viên, chỉ xem; mời đúng email đã xác minh; thu hồi; chuyển không gian |
| Công khai | Danh sách phòng đã xuất bản, báo giá từ máy chủ, yêu cầu đặt phòng, sổ tay, widget chat |
| AI | Trợ lý Gemini với tài khoản Supabase, soạn phản hồi từ hộp thư, viết nội dung social, số liệu vận hành tùy chọn, sao chép và dừng yêu cầu |
| Giao diện | Desktop/điện thoại, sáng/tối, giảm chuyển động, bàn phím, bẫy focus hộp thoại, kiểm tra tương phản |

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
# API AI cục bộ, chạy song song với npm run dev:
npm run server:ai
```

`test:db` chạy migration thật trên PostgreSQL nhúng PGlite, kiểm tra RLS, phân quyền, cô lập tài khoản, lời mời, chống trùng lịch, giá máy chủ và phiên chat. `test:supabase-browser` chạy SDK thật với PostgreSQL đó qua cầu REST cục bộ và Auth giả lập; không kiểm tra Supabase Auth đang host. Nó cũng chạy axe cho trang đăng nhập, tổng quan, hộp thoại và hộp thư sáng/tối/điện thoại. `test:browser` dùng Auth/Firestore Emulator thật và hai phiên trình duyệt độc lập; dọn dữ liệu/tài khoản do lần kiểm tra tạo ra.

Các script trình duyệt mặc định dùng Chromium hệ thống `/usr/bin/chromium`; có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. `TEST_WEB_ORIGIN` đổi địa chỉ ứng dụng, `TEST_ARTIFACT_DIR` đổi thư mục ảnh/kết quả. Không dùng `test:browser` cho website production: nó dành riêng cho máy phát triển có emulator loopback.

## Cloud environment và REA

Bộ cài/khởi động demo đã chuẩn bị tại `/workspace/.maokihouse`. Xem [ghi chú môi trường và REA](docs/ENVIRONMENT.md). REA 6.5.0 đã đăng ký cho Codex, qua doctor và kiểm tra MCP; phiên agent cần kết nối lại để nạp server mới.

[Skill thiết kế do người dùng gửi](docs/apple-design-skill.md) được giữ để tham khảo. Các file HIG `references/` đi kèm không có trong bản tải lên; giao diện áp dụng các nguyên tắc trong tài liệu và được kiểm tra trực tiếp, không đưa ra trích dẫn HIG chưa đọc.

Đối chiếu với các nền tảng thương mại và QloApps/Chatwoot: [PRODUCT_COMPARISON.md](docs/PRODUCT_COMPARISON.md). Xem [thông báo nguồn/giấy phép](docs/THIRD_PARTY_NOTICES.md) cho các file upstream được giữ trong repository.

## Trợ lý AI và nhận diện Maoki

Logo gốc `src/assets/images/logo.png` được dùng trực tiếp trên website, đăng nhập, sidebar và trang hướng dẫn. Bảng màu trở về nâu đất `#8a4a34`, nâu espresso `#5c2f20`, kem `#fdf6ee`, với màu nhấn vàng đồng của bộ nhận diện cũ. Logo không phụ thuộc Cloudinary.

`/admin/dashboard/ai` gọi function `/api/assistant` riêng, không khởi tạo Firebase Admin. Function xác minh người dùng với Supabase Auth, kiểm tra vai trò owner/manager/agent trong không gian hiện tại và gọi Gemini bằng key máy chủ. Vai trò chỉ xem không được dùng AI. API không dùng service-role key. Chọn “Dùng số liệu vận hành” để gửi thống kê/phòng; mặc định tắt, không tự gửi danh bạ, hội thoại khách, token widget hay mật khẩu Wi-Fi. Nội dung người dùng nhập vẫn được chuyển đến Gemini. AI tạo bản nháp, không tự gửi tin hoặc sửa dữ liệu. Lịch sử trò chuyện chỉ ở bộ nhớ trang.

Trên Vercel: Settings → Environment Variables → thêm `GEMINI_API_KEY` cho Production → Redeploy. Model mặc định `gemini-flash-latest`, đối chiếu ví dụ trong [SDK chính thức Google](https://github.com/googleapis/js-genai#readme); có thể đổi bằng `GEMINI_MODEL`. Nếu dùng một dự án Supabase khác, cấu hình thêm `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY` ở máy chủ cho khớp hai biến Vite. Chạy local bằng `npm run server:ai` cùng `npm run dev`; Vite chuyển `/api/assistant` đến cổng 5001.

Có giới hạn 8 yêu cầu/phút/không gian trong mỗi instance; giới hạn này không bảo đảm tổng mức dùng khi Vercel chạy nhiều instance. Đặt quota/giới hạn chi tiêu ở Google trước khi mở rộng dùng. `npm run test:ai` kiểm tra xác thực, vai trò, giới hạn đầu vào, cô lập dữ liệu, chọn gửi số liệu, lỗi provider và routing bằng mạng giả lập; không gọi Gemini thật. Kiểm thử trình duyệt cũng dùng câu trả lời AI giả lập. Chưa xác minh Gemini trên deployment thật khi chưa có quyền truy cập/key máy chủ.

API AI đọc cấu hình publishable dùng chung từ `shared/supabase-public.json`; không import module trình duyệt vào function Node CommonJS. `api/tsconfig.json` khai báo rõ target ES2022 và CommonJS cho bộ đóng gói Vercel. `npm run test:ai:deployment` dùng chính builder `@vercel/node` đã pin để đóng gói, nạp và gọi handler JavaScript đầu ra bằng Node, kiểm tra trạng thái key và luồng AI với mạng giả lập. Bộ kiểm tra này nằm trong `npm test`; không cần key Gemini thật hoặc quyền Vercel. Thêm/thay key trên Vercel cần deployment mới; chọn đúng bản từ main mới nhất và scope Production.

## Cập nhật lịch kênh

Mở `/setup?mode=channels` để lấy SQL nâng cấp iCal cho dự án đã thiết lập. Migration mới là `20261018085535_maoki_channel_calendars.sql`; không chạy lại initial migration trên dữ liệu đang có. Chủ không gian/quản lý mở `/admin/dashboard/channels` để chọn kênh, phòng và dán URL xuất lịch chính thức. Liên kết xuất Maoki cần được nhập lại ở phía OTA cho chiều đồng bộ ngược. Daily use không cần token quản trị hoặc service-role key.

`npm run server:ai` hiện phục vụ cả `/api/assistant` và `/api/channels` trên cổng 5001, Vite chuyển cả hai route tới máy chủ này. Trên Vercel hai function độc lập với Firebase. Logo giữ nguyên; dòng Hospitality Workspace đã bỏ khỏi giao diện/tab. Chuyển động chỉ dùng animation ngắn và bị tắt khi `prefers-reduced-motion: reduce`.
