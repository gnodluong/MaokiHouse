# Gói dịch vụ và phạm vi bản Android cơ bản

Tham khảo: belldor.com (trang chủ, Kênh bán, Hộp thư, App, Bảng giá — đọc ngày 2026-11-27). Câu mô tả bạn đưa gần như trùng với cách Belldor mô tả gói **Vận hành** và **Chuyên nghiệp**.

## 1. Ta đang giải bài toán gì
**Việc của chủ nhà/quản lý** (JTBD): "Khi có đơn mới hoặc khách nhắn từ bất kỳ kênh nào, tôi muốn biết ngay và không bao giờ bán trùng đêm, để khỏi mở 5 app và khỏi mất khách vì trả lời chậm."
Đối thủ thực tế mà họ đang "sa thải": Excel + nhóm Zalo + app riêng của từng sàn. Belldor thắng ở chỗ **họ nối kênh hộ khách** (đội Belldor làm, miễn phí cài đặt) chứ không chỉ ở tính năng.

## 2. Việc gì làm được thật, việc gì cần xin quyền
| Năng lực | Với kỹ thuật hiện có | Điều kiện |
|---|---|---|
| Lịch hai chiều với Airbnb, Booking.com, Agoda, Trip.com, Vrbo, Google… | **Có, qua iCal** (đã làm): nhập ngày bận + xuất lịch Maoki cho từng căn | Chỉ ngày bận/trống, trễ 1–3 giờ do sàn quyết định. **Không có giá, không có chi tiết đơn.** |
| Giá và số đêm tối thiểu đẩy lên sàn | **Chưa** | API giá/đơn của Airbnb, Booking.com, Agoda, Trip.com chỉ mở cho **đối tác kết nối (Connectivity Partner) đã được chứng nhận** — vài tháng, có tiêu chí kỹ thuật. Hoặc đi qua channel manager có sẵn chứng nhận. |
| Đơn về từ sàn (tên khách, tổng tiền, trạng thái) | **Chưa** (chỉ biết ngày bận) | Như trên |
| Tin nhắn Zalo OA, Messenger, Instagram, WhatsApp vào hộp thư chung | **Có** (đã làm, gửi/nhận) | Phải qua duyệt của Zalo và Meta (xem PDF hướng dẫn) |
| Tin nhắn Airbnb, Booking.com, Agoda | **Chưa** | Chỉ qua API đối tác như trên |
| Tin nhắn Trip.com | Không làm | Trả lời trong app Trip.com (đúng như mô tả của bạn); app chỉ nên báo "có đơn mới/ngày bận" qua iCal |

**Hệ quả với lời hứa trên trang bán hàng:** không được viết "đồng bộ lịch, giá và đơn với Airbnb, Booking.com, Agoda, Trip.com" cho tới khi có đường đi chứng nhận hoặc đối tác channel manager. Cách viết trung thực ngay hôm nay:
> "Đồng bộ lịch hai chiều với Airbnb, Booking.com, Agoda, Trip.com và hơn 20 kênh khác qua iCal — không bao giờ bán trùng đêm. Giá và đơn: đang triển khai."

## 3. Ba cách đi cho giá/đơn/tin nhắn OTA (chọn một, có thể song song)
1. **Tự xin chứng nhận Connectivity Partner** của từng sàn. Chi phí cao, 3–12 tháng mỗi sàn, cần đội kỹ thuật bảo trì; đổi lại sở hữu hoàn toàn. Chỉ hợp lý khi đã có khách trả tiền.
2. **Tích hợp qua nhà cung cấp API channel manager** (đã được các sàn chứng nhận, bán API cho PMS). Nhanh (vài tuần), mất phí theo phòng, phụ thuộc bên thứ ba.
3. **Chỉ iCal + nhập tay** (hiện tại) và bán vào chất lượng hộp thư Zalo/Messenger/WhatsApp, nơi khách Việt thực sự nhắn.
**Khuyến nghị:** 3 ngay bây giờ, thử nghiệm 2 với 5 khách đầu, giữ 1 cho khi có doanh thu. Rủi ro lớn nhất nằm ở đây, và cách kiểm chứng rẻ nhất là hỏi 10 chủ nhà "nếu chỉ có lịch iCal + hộp thư Zalo/Messenger thì bạn có trả tiền không?" trước khi tốn tháng chạy chứng nhận.

## 4. Giả định cần kiểm chứng (xếp theo độ nguy hiểm)
1. *Chủ nhà trả tiền cho hộp thư Zalo/Messenger/WhatsApp dù chưa có tin nhắn Airbnb/Booking.* — chưa có bằng chứng. Test: 10 cuộc phỏng vấn + bản thử 14 ngày.
2. *Duyệt quyền Meta/Zalo qua được.* — phụ thuộc hồ sơ pháp lý (xem PDF). Test: nộp hồ sơ sớm vì thời gian duyệt khó đoán.
3. *iCal đủ cho lịch.* — trễ 1–3 giờ có thể gây trùng đêm. Giảm thiểu: đồng bộ mỗi 5 phút phía Maoki (worker) và đóng đêm ngay khi có đơn.
4. *WebView (Capacitor) đủ mượt trên máy Android tầm thấp.* — đo bằng APK thật.

## 5. Gói dịch vụ đề xuất (khớp mô tả của bạn)
| | **Cơ bản** | **Vận hành** | **Chuyên nghiệp** |
|---|---|---|---|
| Lịch phòng, đơn tay, khách, công việc, sổ thu chi, báo cáo | ✔ | ✔ | ✔ |
| App điện thoại (Android, iOS sau) + desktop | ✔ | ✔ | ✔ |
| Nối kênh | **Không** (tự đóng phòng trên sàn) | Đồng bộ lịch iCal với 20+ kênh | ✔ |
| Giá/đơn OTA | — | Đang triển khai | Đang triển khai |
| Hộp thư chung Zalo OA, Messenger, Instagram, WhatsApp, email | — | — | ✔ |
| Tin Airbnb/Booking/Agoda trong hộp thư | — | — | Khi có quyền đối tác |
| Trip.com | trả lời trong app Trip.com | idem | idem |
| Bot, chu trình, tự trả lời, AI | — | — | ✔ |
Triển khai kỹ thuật: cột `plan` trên không gian làm việc; máy chủ chặn lưu kênh nhắn tin khi chưa ở gói Chuyên nghiệp; giao diện hiện khóa kèm lời mời nâng cấp. **Trong giai đoạn thử, mọi không gian đang ở "Chuyên nghiệp"**; đổi gói bằng SQL cho tới khi có thanh toán.

## 6. Phạm vi bản Android "cơ bản" (APK đầu tiên)
**Có:** đăng nhập; **Hôm nay** (nhận/trả phòng, việc cần làm, tin chưa đọc); **Lịch**; **Hộp thư** (trả lời được); **Đặt phòng**; **Thêm** (công việc, khách, sổ thu chi, báo cáo, cài đặt); sáng/tối/theo hệ thống; Việt/Anh; khóa gói (kênh nhắn tin).
**Chưa:** thông báo đẩy khi app đóng (cần FCM + máy chủ gửi), ký phát hành, ảnh đính kèm tin nhắn, sửa giá theo kênh (chưa có API).
**Số đo thành công của APK:** khởi động < 3 giây trên máy tầm trung; trả lời một tin trong ≤ 4 chạm; không có màn hình nào bắt cuộn ngang.

## 7. Lựa chọn cho iOS
Giữ **TypeScript/React + Capacitor** (xem ADR-0001): iOS chỉ là thêm `@capacitor/ios` và một lượt build trên macOS (GitHub Actions có runner macOS). Không chọn Swift/Kotlin riêng vì sẽ nhân đôi công sức cho một đội nhỏ.
