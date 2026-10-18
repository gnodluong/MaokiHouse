# Đối chiếu GoHost / Hostfully / Subiz và tài liệu opensource

Ngày kiểm tra: 18/10/2026 (giờ Bangkok). MaokiHouse hiện là bản MVP hợp nhất các luồng lưu trú và CSKH, có thiết kế riêng theo thương hiệu MaokiHouse. Chưa có bằng chứng để khẳng định tương đương đầy đủ chức năng hoặc giao diện của ba dịch vụ thương mại.

## Mức độ hiện có

| Nhóm nghiệp vụ | MaokiHouse đã có | Phần còn thiếu để vận hành ở mức sản phẩm thương mại |
| --- | --- | --- |
| Phòng, lịch, đặt phòng | Đơn vị phòng riêng, lịch 7/14 ngày, kiểm tra trùng lịch tại database | Kho phòng theo loại/số lượng, đoàn, quy trình nhận/trả phòng chi tiết, đổi phòng nâng cao |
| Giá và bán phòng | Giá theo ngày, đóng bán, số đêm tối thiểu, booking trực tiếp | Khuyến mãi phức tạp, thuế/phí, thanh toán/cọc/hoàn tiền, chính sách hủy |
| Phân phối OTA | Ghi nhận nguồn Airbnb/Booking/Agoda, hiển thị trạng thái chưa kết nối | Connector/API được cấp quyền, đồng bộ giá/tồn/booking hai chiều, chống lặp và retry webhook |
| Vận hành | Công việc, phân công, guidebook khách, chủ sở hữu, sổ thu/chi và đối soát ước tính | Tự động đối soát thanh toán, kế toán/hóa đơn, vận hành nhiều cơ sở nâng cao |
| Hộp thư và CRM | Hồ sơ/thẻ, gán người phụ trách, trạng thái, mẫu trả lời, lịch sử lưu trú | Phân tuyến/round-robin, SLA, tìm kiếm đầy đủ tin nhắn, tệp đính kèm, ghi chú riêng theo từng tin nhắn |
| Chat website | Hai chiều, phiên khách riêng, nhúng iframe, tự làm mới/Re­altime | Push notification, tải file, chống spam/captcha nâng cao, tìm kiếm lịch sử dài |
| Facebook/Instagram/Zalo/email | Có khung dữ liệu và bộ lọc theo kênh; phản hồi nội bộ được ghi rõ | Kết nối và xác nhận gửi/nhận qua API chính thức, kiểm duyệt app, xử lý hạn mức |
| Tự động hóa/chiến dịch | Quy tắc cho hội thoại/booking, tạo việc/gắn thẻ/lưu phản hồi; bản nháp/lịch chiến dịch | Bộ gửi chiến dịch, hàng đợi, lịch chạy thực, thống kê gửi/nhận và đồng ý nhận tin |
| AI | Trợ lý Gemini, soạn phản hồi/nội dung social, số liệu vận hành tùy chọn | Cần key máy chủ và xác minh trên deployment thật; chưa tự gửi tin hoặc sửa dữ liệu |
| Dữ liệu và quyền | Supabase Auth, workspace riêng, RLS, owner/manager/agent/viewer, mời/thu hồi | Hosted Supabase chưa áp dụng trong phiên vì máy cloud bị proxy chặn; backup/giám sát production cần cấu hình thực tế |

Các trang GoHost, Hostfully và Subiz vẫn trả CONNECT 403 qua mạng của môi trường. Những tên sản phẩm trên là nhóm tham chiếu do người dùng nêu, không phải kết quả kiểm thử tài khoản thật hay xác minh giao diện trực tiếp. Không đưa ra tỷ lệ phần trăm “giống” khi chưa có tiêu chí và phép đo.

## Nguồn opensource đã đối chiếu thực sự

- **QloApps** tại commit [`e0e4fdef0e3a724b8972e7d083b125fa71383b1f`](https://github.com/Qloapps/QloApps/tree/e0e4fdef0e3a724b8972e7d083b125fa71383b1f): đã đọc README, `LICENSE.md` và [`HotelBookingDetail.php`](https://github.com/Qloapps/QloApps/blob/e0e4fdef0e3a724b8972e7d083b125fa71383b1f/modules/hotelreservationsystem/classes/HotelBookingDetail.php). Mô hình có room type, khoảng ngày đặt, check-in/check-out thực và thông tin phân phòng; cho thấy các phần cần bổ sung ngoài lịch theo đơn vị phòng hiện tại. Giấy phép được kiểm tra là OSL-3.0.
- **Chatwoot** tại commit [`7ab47e2ca1be171cd906ba02d7c618e44a805ac8`](https://github.com/chatwoot/chatwoot/tree/7ab47e2ca1be171cd906ba02d7c618e44a805ac8): đã đọc README, LICENSE và [`app/models/message.rb`](https://github.com/chatwoot/chatwoot/blob/7ab47e2ca1be171cd906ba02d7c618e44a805ac8/app/models/message.rb). Model phân biệt incoming/outgoing/activity/template và cờ `private`, loại ghi chú riêng khỏi luồng chat/đo thời gian phản hồi. Community ngoài vùng có điều khoản riêng dùng MIT; thư mục enterprise có giấy phép khác.
- **HotelDruid, FreeScout, Zammad và zca-bridge:** đã đọc mô tả trong file người dùng gửi, chưa kiểm tra source/edition/tính năng hiện hành. Không coi các mô tả trong file là bằng chứng tích hợp đang hoạt động.

QloApps cần PHP/MySQL; Chatwoot cần nền Rails cùng database/dịch vụ riêng. Đưa cả hai vào làm backend sẽ tạo thêm các nguồn dữ liệu và quy trình đồng bộ. Theo quyết định của người dùng, MaokiHouse giữ Supabase làm nguồn chính; các dự án trên được dùng để tham khảo nghiệp vụ. Chưa cài, fork hay chép code QloApps/Chatwoot vào ứng dụng này.

## Phần ưu tiên tiếp theo

1. Kích hoạt schema, Auth redirect và kiểm tra luồng hai tài khoản trên dự án Supabase thật.
2. Kết nối một kênh social thật, ưu tiên Website hiện có rồi Meta hoặc Zalo OA theo quyền API được cấp.
3. Thiết kế connector OTA có đối tác/API, hàng đợi, idempotency, retry và nhật ký lỗi.
4. Bổ sung trạng thái check-in/check-out, thanh toán, ghi chú nội bộ và SLA theo nhu cầu vận hành cụ thể.

Tài liệu gốc người dùng gửi được lưu tại [opensource-reference-provided.md](opensource-reference-provided.md). Các khuyến nghị trong đó là tài liệu tham khảo; không tự động thay đổi lựa chọn Supabase hay yêu cầu cài toàn bộ năm hệ thống.
