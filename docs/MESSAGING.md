# Zalo OA và Email

1. Supabase → SQL Editor: chạy `supabase/migrations/20261123090000_maoki_messaging_channels.sql`.
2. Triển khai API: Supabase không cần Vercel. Mã API nằm ở `supabase/functions/api` và chạy như một Edge Function của chính dự án. Cách nhanh nhất: GitHub → Settings → Secrets → thêm `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens), rồi chạy workflow **Deploy Maoki API**. Hoặc tự chạy `npx supabase functions deploy api --project-ref <mã-dự-án> --no-verify-jwt`.
3. App tự dùng địa chỉ `https://<mã-dự-án>.supabase.co/functions/v1/api/…`; không cần nhập máy chủ API.
4. App desktop → **Thiết lập → Zalo OA & Email**: nhập thông tin từng kênh, bấm Lưu, sao chép địa chỉ webhook.

**Zalo OA**: Zalo Developers → Webhook → dán địa chỉ, bật “người dùng gửi tin nhắn văn bản”. Chữ ký `X-ZEvent-Signature` được kiểm tra bằng sha256(app_id + nội dung + timestamp + secret key); nếu Zalo đổi quy tắc ký, sửa trong `maoki_private.channel_inbound`.
**Email gửi đi**: SMTP (cổng 25/465/587/2525, máy chủ phải là địa chỉ công khai) hoặc Resend.
**Email nhận**: chuyển tiếp thư tới địa chỉ webhook bằng Postmark Inbound / Mailgun Routes (JSON hoặc form).
Thông tin xác thực nằm trong bảng riêng `maoki_private`, không có trong dữ liệu trả về cho trình duyệt; chủ/quản lý/nhân viên có quyền trả lời có thể lấy chúng khi gửi tin.

## Facebook Messenger và Instagram
1. Chạy thêm `supabase/migrations/20261124090000_maoki_meta_channels.sql` (sau file kênh nhắn tin ở trên).
2. developers.facebook.com → tạo ứng dụng Business, thêm Messenger (và Instagram), liên kết Fanpage (đã kết nối Instagram chuyên nghiệp nếu dùng Instagram).
3. App desktop → Thiết lập → Kênh nhắn tin: nhập App Secret, Page ID, Page access token → Lưu.
4. Meta → Webhooks: đối tượng **Page** (Facebook) hoặc **Instagram**, dán Callback URL + Verify token hiển thị trong app, đăng ký trường `messages`.
Chữ ký `X-Hub-Signature-256` (HMAC-SHA256 bằng App Secret) được kiểm tra trong SQL. Chỉ trả lời được trong 24 giờ kể từ tin cuối của khách; để nhận tin từ khách thật cần Meta App Review (quyền `pages_messaging`, `instagram_manage_messages`).

## WhatsApp và TikTok
1. Chạy thêm `supabase/migrations/20261125090000_maoki_whatsapp_tiktok.sql`.
2. **WhatsApp (Cloud API)**: Meta for Developers → sản phẩm WhatsApp → lấy Phone number ID, App Secret, token hệ thống vĩnh viễn → nhập ở Kênh nhắn tin → dán Callback URL + Verify token vào WhatsApp → Configuration → Webhook, đăng ký `messages`. Chỉ nhắn tự do trong 24 giờ; ngoài khung cần template đã duyệt (app chưa gửi template).
3. **TikTok**: không có API nhắn tin công khai tự đăng ký. Cần đối tác hoặc automation (Make, n8n…) có quyền truy cập: dịch vụ đó POST tin của khách tới Webhook URL (`{from,name,text,messageId,timestamp}`) và nhận trả lời qua “địa chỉ cầu nối” (POST `{to,text,conversationId}`, kèm `Authorization: Bearer`).

## Tổng đài và Google Business
Chạy `supabase/migrations/20261126090000_maoki_calls_reviews.sql`, triển khai lại Edge Function (workflow **Deploy Maoki API**).

**Tổng đài (nhật ký cuộc gọi)**: Kênh nhắn tin → “Tổng đài” → Lưu → sao chép Webhook URL → cấu hình webhook sự kiện cuộc gọi của nhà cung cấp (Stringee, VoiceCloud, Twilio…) POST tới đó. Hỗ trợ JSON `{callId,direction,from,to,status,durationSec,startedAt,recordingUrl}` hoặc form kiểu Twilio (`CallSid, From, To, CallStatus, CallDuration, Direction, RecordingUrl`). Cuộc gọi tự khớp khách theo số điện thoại; sự kiện sau của cùng `callId` cập nhật bản ghi. Webhook xác thực bằng địa chỉ bí mật (chưa kiểm tra chữ ký riêng của từng nhà cung cấp). Gọi ra: nút “Gọi điện” mở ứng dụng gọi của máy (`tel:`).

**Google Business (đánh giá)**: cần Google Cloud: bật Business Profile API và được Google duyệt quyền truy cập API; OAuth client + refresh token với scope `business.manage`; Account ID và Location ID (chữ số). Nhập ở Kênh nhắn tin → “Google Business”, rồi vào **Đánh giá Google** → “Đồng bộ từ Google”. Phản hồi được đăng lên Google bằng `PUT …/reviews/{id}/reply`.

## YouTube (bình luận)
Chạy `supabase/migrations/20261127090000_maoki_youtube.sql`, triển khai lại Edge Function. Google Cloud: bật YouTube Data API v3, tạo OAuth client, cấp scope `youtube.force-ssl` cho tài khoản sở hữu kênh, lấy refresh token. Nhập Client ID, Client secret, Refresh token, Channel ID (UC…) ở Kênh nhắn tin → “YouTube”, rồi vào **Bình luận YouTube** → “Đồng bộ từ YouTube”. Đồng bộ dùng `commentThreads?allThreadsRelatedToChannelId=…`; phản hồi đăng bằng `comments.insert` (50 đơn vị hạn mức/lần, hạn mức mặc định 10.000/ngày). Bình luận có phản hồi từ chính kênh được đánh dấu “Đã phản hồi”.

## Tự động hóa chạy nền (bot, chia chat, chu trình, IMAP, template WhatsApp, tự trả lời đánh giá)
Thiết kế: `docs/plans/2026-11-23-background-automation-design.md`.
1. Chạy `supabase/migrations/20261128090000_maoki_background_automation.sql`.
2. Đặt khóa bí mật cho Edge Function: `SUPABASE_SERVICE_ROLE_KEY` do Supabase tự cấp cho hàm, bạn chỉ cần đặt `WORKER_SECRET` (chuỗi ngẫu nhiên ≥ 24 ký tự): `npx supabase secrets set WORKER_SECRET=<chuỗi> --project-ref <mã-dự-án>`. Không đưa khóa service_role vào mã nguồn hay app.
3. Lên lịch gọi `POST https://<mã-dự-án>.supabase.co/functions/v1/api/worker` với header `Authorization: Bearer <WORKER_SECRET>` mỗi 5 phút:
   - **GitHub Actions** (miễn phí): repo → Settings → Secrets → thêm `WORKER_URL` (`https://<mã-dự-án>.supabase.co/functions/v1/api`) và `WORKER_SECRET`; workflow `.github/workflows/worker.yml` đã có sẵn (cần nằm ở nhánh mặc định).
   - hoặc **Supabase pg_cron + pg_net**: `select cron.schedule('maoki-worker','*/5 * * * *', $$select net.http_post('https://<mã-dự-án>.supabase.co/functions/v1/api/worker', '{}'::jsonb, headers => jsonb_build_object('Authorization','Bearer <WORKER_SECRET>'))$$);`
4. Cấu hình:
   - **Bot**/**Quy tắc chia chat**/**Giờ làm việc** (Thiết lập): chạy ngay khi có tin đến từ Zalo, Facebook, Instagram, WhatsApp, TikTok, email (webchat chưa hỗ trợ). Bot trả lời một lần cho hội thoại mới; bot ngoài giờ chờ 6 giờ mới trả lời lại; bot từ khóa trả lời mỗi khi khớp.
   - **Chu trình**: mỗi dòng “Sau 2 giờ: nội dung”, “Trước 1 ngày: …” (chỉ với trigger “trước nhận phòng”). Đặt phòng cần có email khách và kênh Email bật; “khách mới”/“không phản hồi” gửi qua kênh của hội thoại. Mỗi bước gửi đúng một lần.
   - **Nhận email qua IMAP**: nhập IMAP trong kênh Email (cổng 993); worker đọc thư chưa đọc mỗi lần chạy (tối đa 20/lần).
   - **Template WhatsApp**: nhập tên mẫu + ngôn ngữ; khi quá 24 giờ worker/Hộp thư gửi mẫu thay vì báo lỗi.
   - **Tự trả lời đánh giá Google**: mặc định TẮT; nhập ngưỡng sao và nội dung ở kênh Google Business (phản hồi đăng công khai).
5. Theo dõi: Thiết lập → Kênh nhắn tin → “Hàng đợi gửi tự động” (đang chờ/đã gửi/lỗi, 5 lỗi gần nhất). Mỗi tin thử tối đa 3 lần.

## Thứ tự chạy SQL (dự án Supabase mới)
Chạy `npm run sql:bundle` rồi dán `dist-sql/maoki-all-migrations.sql` vào SQL Editor (một lần). Dự án đã có dữ liệu: chỉ chạy các file mới hơn file đã chạy, theo thứ tự tên:
`20261122090000_maoki_subiz_features` → `20261122120000_maoki_subiz_features_2` → `20261123090000_maoki_messaging_channels` → `20261124090000_maoki_meta_channels` → `20261125090000_maoki_whatsapp_tiktok` → `20261126090000_maoki_calls_reviews` → `20261127090000_maoki_youtube` → `20261128090000_maoki_background_automation`.
