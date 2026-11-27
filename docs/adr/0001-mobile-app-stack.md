# ADR-0001: Công nghệ cho app di động Maoki Admin (Android trước, iOS sau)

**Trạng thái:** Đề xuất (chờ chủ sản phẩm xác nhận)
**Ngày:** 2026-11-27
**Người quyết định:** Chủ sản phẩm; người phụ trách kỹ thuật

## Bối cảnh
- Đã có: giao diện quản trị React 18 + TypeScript + Vite dùng chung `src/workspace`, dữ liệu qua Supabase (RPC `maoki_*`, RLS), app desktop Electron, API phụ trợ trên Vercel.
- Cần: bản Android cài bằng APK ngay, iOS sau; giao diện chuyên nghiệp, tiết chế; đội nhỏ, một người giữ cả web lẫn app.
- Ràng buộc: không có máy Mac/Xcode trong môi trường phát triển hiện tại; APK phải build được trên CI; nghiệp vụ (đặt phòng, hộp thư, kênh nhắn tin) đã nằm ở phía Supabase/Vercel nên app khách chỉ là một giao diện.

## Quyết định
Dùng **Capacitor** bọc giao diện React hiện có (một codebase TypeScript cho Android và iOS), với vỏ điều hướng riêng cho điện thoại (thanh tab dưới, ngăn kéo), tái dùng các trang `src/workspace`. Phần gốc (native) chỉ giữ ở mức plugin: thông báo đẩy, vân tay, chia sẻ, thanh trạng thái.

## Các phương án
### A. Capacitor (chọn)
| | |
|---|---|
| Độ phức tạp | Thấp |
| Chi phí | Thấp: tái dùng ~90% mã; CI Android miễn phí |
| Hiệu năng | Đủ cho ứng dụng danh sách/biểu mẫu/lịch; không phù hợp đồ họa nặng |
| Quen thuộc | Cao (React/TS đang dùng) |
**Ưu:** một codebase cho Android + iOS + (đã có) desktop; sửa lỗi một chỗ; plugin cho thông báo đẩy, sinh trắc học. **Nhược:** trải nghiệm không "native 100%"; cuộn và cử chỉ phải tinh chỉnh; WebView khác nhau giữa máy Android cũ.

### B. React Native (Expo)
Giao diện native thật, nhưng phải **viết lại toàn bộ giao diện** (không dùng được DOM/CSS, bảng, `react-icons`, các trang `src/workspace`). Chia sẻ được logic/Supabase client, không chia sẻ được màn hình. Chi phí gấp nhiều lần; lợi ích trải nghiệm chưa cần cho giai đoạn này.

### C. Flutter
Giao diện đẹp, hiệu năng tốt, nhưng **ngôn ngữ Dart, viết lại 100%**, không dùng lại được mã nào; thêm một chuỗi công cụ để duy trì. Không phù hợp đội một người.

### D. Native Kotlin + Swift
Trải nghiệm tốt nhất, nhưng hai codebase, hai ngôn ngữ, phải có Mac cho iOS. Quá nặng.

## Phân tích đánh đổi
Giá trị của app nằm ở **tốc độ ra thị trường và nhất quán với bản desktop/web**, không ở hiệu ứng native. Capacitor cho phép giao APK trong vài ngày và dùng lại mọi sửa đổi nghiệp vụ. Rủi ro lớn nhất (hiệu năng WebView, thông báo nền) có thể kiểm chứng sớm bằng một APK thật trên 2–3 máy Android phổ biến. Nếu sau này cần hiệu năng native cho một màn hình riêng (ví dụ lịch nhiều căn), Capacitor cho phép thay riêng màn hình đó bằng plugin native mà không bỏ phần còn lại.

## Hệ quả
- Dễ hơn: ra iOS (thêm `@capacitor/ios`, build trên máy Mac hoặc CI macOS); đồng bộ tính năng giữa web/desktop/mobile.
- Khó hơn: trải nghiệm cử chỉ/animation phải tự chăm; thông báo khi app đóng cần FCM (Android) và APNs (iOS) cấu hình riêng.
- Cần xem lại: nếu số liệu khởi động/độ mượt kém trên máy tầm thấp, cân nhắc màn hình native riêng.

## Việc cần làm
1. [x] Vỏ điều hướng di động + CSS dùng chung (thanh tab dưới, ngăn kéo "Thêm").
2. [x] Dự án Capacitor Android + workflow CI dựng APK.
3. [ ] Chạy APK trên máy thật; đo thời gian khởi động và độ mượt cuộn.
4. [ ] Thông báo đẩy (FCM) khi có tin nhắn/đơn mới: cần Cloud Function/worker gửi.
5. [ ] iOS: thêm `@capacitor/ios`, tài khoản Apple Developer, build trên macOS.
6. [ ] Ký APK bằng keystore riêng khi phát hành (hiện là bản debug).
