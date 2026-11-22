# Zalo OA và Email

1. Supabase → SQL Editor: chạy `supabase/migrations/20261123090000_maoki_messaging_channels.sql`.
2. Triển khai bản mới lên Vercel (thêm `/api/messaging` và `/api/inbound`).
3. App desktop → **Giao diện & ngôn ngữ → Máy chủ API**: nhập địa chỉ website Vercel.
4. App desktop → **Thiết lập → Zalo OA & Email**: nhập thông tin từng kênh, bấm Lưu, sao chép địa chỉ webhook.

**Zalo OA**: Zalo Developers → Webhook → dán địa chỉ, bật “người dùng gửi tin nhắn văn bản”. Chữ ký `X-ZEvent-Signature` được kiểm tra bằng sha256(app_id + nội dung + timestamp + secret key); nếu Zalo đổi quy tắc ký, sửa trong `maoki_private.channel_inbound`.
**Email gửi đi**: SMTP (cổng 25/465/587/2525, máy chủ phải là địa chỉ công khai) hoặc Resend.
**Email nhận**: chuyển tiếp thư tới địa chỉ webhook bằng Postmark Inbound / Mailgun Routes (JSON hoặc form).
Thông tin xác thực nằm trong bảng riêng `maoki_private`, không có trong dữ liệu trả về cho trình duyệt; chủ/quản lý/nhân viên có quyền trả lời có thể lấy chúng khi gửi tin (giống khóa AI).

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
