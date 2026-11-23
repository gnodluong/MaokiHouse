# Tự động hóa chạy nền — thiết kế

## Mục tiêu
Các tính năng hiện chỉ *lưu cấu hình* (bot, quy tắc chia chat, chu trình, giờ làm việc) hoặc cần người bấm (đồng bộ đánh giá) sẽ thực sự chạy.

## Cách tiếp cận (đã chọn)
Ba phương án đã cân nhắc:
1. **Máy chủ chạy nền riêng (VM/worker)** — linh hoạt nhưng thêm hạ tầng phải vận hành. Loại.
2. **Supabase pg_cron + pg_net** — gọn nhưng phụ thuộc extension/gói dịch vụ. Chỉ dùng như tùy chọn.
3. **Logic trong SQL + một endpoint `/api/worker` được gọi định kỳ** — **chọn**. Quy tắc/bot/chu trình chạy trong cơ sở dữ liệu (nhanh, nguyên tử, không cần máy chủ); việc cần gọi API ngoài (gửi tin, IMAP, đăng phản hồi) do `/api/worker` làm. Lịch gọi: GitHub Actions mỗi 5 phút (miễn phí mọi gói), hoặc pg_cron.

## Thành phần
- **Lúc tin đến** (`channel_ingest`, SQL): chia người phụ trách theo `rules` + `hours`; trả lời tự động theo `bots` (hội thoại mới / ngoài giờ / từ khóa); tin trả lời của quy tắc tự động hóa cũng được đưa vào hàng đợi gửi.
- **Hàng đợi gửi** (`outbound_queue`): mọi tin do hệ thống tự tạo đi qua đây; worker gửi bằng đúng kênh, thử lại tối đa 3 lần.
- **Chu trình** (`journey_tick`, SQL): đọc `journeys`, tính mốc theo đặt phòng/khách/hội thoại, tạo tin đến hạn đúng một lần (`journey_runs`).
- **Worker** (`/api/worker`, bảo vệ bằng `WORKER_SECRET`, gọi Supabase bằng `SUPABASE_SERVICE_ROLE_KEY` đặt trên Vercel): tick chu trình → gửi hàng đợi → đọc IMAP → tự trả lời đánh giá Google (tùy chọn, mặc định tắt).
- **WhatsApp**: nếu quá 24 giờ và đã cấu hình `templateName`, gửi mẫu tin thay vì báo lỗi.

## Rủi ro đã tính
- Vòng lặp trả lời: bot chỉ trả lời một lần cho hội thoại mới, ngoài giờ có thời gian chờ 6 giờ, thư gửi từ chính địa chỉ của mình bị bỏ qua.
- Đăng công khai: tự trả lời đánh giá mặc định tắt, chỉ chạy khi người quản lý nhập ngưỡng sao và nội dung.
- Khóa service role chỉ ở biến môi trường Vercel; RPC của worker chỉ cấp quyền cho `service_role`.
- Webchat không qua `channel_ingest` nên chưa có bot/chia chat tự động.
