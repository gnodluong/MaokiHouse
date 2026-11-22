# Zalo OA và Email

1. Supabase → SQL Editor: chạy `supabase/migrations/20261123090000_maoki_messaging_channels.sql`.
2. Triển khai bản mới lên Vercel (thêm `/api/messaging` và `/api/inbound`).
3. App desktop → **Giao diện & ngôn ngữ → Máy chủ API**: nhập địa chỉ website Vercel.
4. App desktop → **Thiết lập → Zalo OA & Email**: nhập thông tin từng kênh, bấm Lưu, sao chép địa chỉ webhook.

**Zalo OA**: Zalo Developers → Webhook → dán địa chỉ, bật “người dùng gửi tin nhắn văn bản”. Chữ ký `X-ZEvent-Signature` được kiểm tra bằng sha256(app_id + nội dung + timestamp + secret key); nếu Zalo đổi quy tắc ký, sửa trong `maoki_private.channel_inbound`.
**Email gửi đi**: SMTP (cổng 25/465/587/2525, máy chủ phải là địa chỉ công khai) hoặc Resend.
**Email nhận**: chuyển tiếp thư tới địa chỉ webhook bằng Postmark Inbound / Mailgun Routes (JSON hoặc form).
Thông tin xác thực nằm trong bảng riêng `maoki_private`, không có trong dữ liệu trả về cho trình duyệt; chủ/quản lý/nhân viên có quyền trả lời có thể lấy chúng khi gửi tin (giống khóa AI).
