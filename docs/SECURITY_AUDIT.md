# Kiểm tra bảo mật (8/11/2026)

**Phạm vi và cách làm**
- Công cụ: skill [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill), quy trình đầy đủ, profile **quick**: 1 đợt hunter, 1 critic, mỗi phát hiện có 1 verifier độc lập.
- Phạm vi: `api/`, `shared/`, `supabase/migrations/`, `src/workspace/`, `vercel.json`.
- Chỉ đọc mã nguồn. Máy kiểm tra không có sandbox cô lập nên không chạy code của dự án, và không gửi yêu cầu nào tới bản đang chạy.
- Đây là lượt kiểm tra một phần, không phải bao phủ toàn bộ.

**Kết quả**
- 0 lỗi `confirmed`, vì không có sandbox để chứng minh lúc chạy.
- 3 lỗi `needs_validation`: đường đi trong mã đã được xác minh độc lập, chỉ còn phụ thuộc cấu hình triển khai. Cả 3 đã được sửa và có test hồi quy:

| Vấn đề | Sửa |
|---|---|
| `/api/channels` tải lịch bằng `fetch` toàn cục, nên lớp chặn địa chỉ nội bộ (DNS guard) không được dùng | Tải lịch luôn qua `publicFetch` có chặn IP nội bộ/metadata ở tầng socket; test kiểm tra đường mặc định |
| Không gian tự tạo chọn được model đắt tiền, tính phí vào `OPENROUTER_API_KEY` của máy chủ, chỉ bị giới hạn trong bộ nhớ của từng instance | Key máy chủ chỉ dùng model của máy chủ; mọi lượt gọi trả phí đều qua `maoki_ai_settings` `use` (kiểm tra vai trò, quyền nhân viên, ngân sách lưu trong database) |
| API Firebase cũ: kết nối kênh dùng chung một tài liệu cho mỗi nền tảng giữa các host | Mỗi host có tài liệu riêng; `upsert` kiểm tra chủ sở hữu |

**Đã thêm:** header bảo mật trên Vercel (`nosniff`, `Referrer-Policy`, `Permissions-Policy`). Chặn nhúng iframe (`frame-ancestors 'self'`) ở mọi trang trừ widget `/chat/*`.

**Khuyến nghị còn mở**
- Gỡ hoặc khóa API Express/Firebase cũ, hiện vẫn được định tuyến dưới `/api/*`.
- Giới hạn việc yêu cầu đặt phòng ẩn danh giữ ngày trống và đẩy sang lịch OTA.
- Cho phép đổi mã của liên kết sổ tay, widget và lịch xuất.
- Xóa lời mời còn treo khi thu hồi thành viên.
- Thêm SRI cho stylesheet tải từ CDN.
- Giới hạn tên miền được dùng cho ảnh phòng.
- Chạy lại với profile `standard` trong sandbox để kiểm tra hai khu vực đã hoãn.
