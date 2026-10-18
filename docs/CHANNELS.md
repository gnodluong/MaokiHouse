# Kết nối từng kênh trên MaokiHouse

Airbnb và Booking.com dùng iCal để trao đổi **ngày bận/trống**, theo từng đơn vị phòng. Không cần API key đối tác hoặc nhập mật khẩu OTA. Facebook/Instagram/Zalo mới có thẻ hướng dẫn yêu cầu tích hợp; OAuth, webhook và gửi/nhận tin nhắn của các mạng xã hội này chưa được triển khai.

## Thiết lập dữ liệu một lần

Sau khi Vercel triển khai bản main mới, mở `/setup?mode=channels`, chọn **Cập nhật iCal → Sao chép SQL → Mở SQL Editor → New query → dán → Run**. SQL chỉ bổ sung cấu trúc kênh và kiểm tra ngày bận, giữ phòng/đặt phòng hiện có. Bản initial migration không bị sửa. Lệnh `npm run supabase:apply` cũng áp dụng migration mới khi có quyền Management API hợp lệ; hiện kiểm tra quản trị trong cloud trả HTTP 401 nên chưa xác minh được migration mới trên dự án thật.

Dự án mới có thể chọn **Lần đầu thiết lập**: SQL gồm cấu trúc cơ bản và cập nhật iCal. Dự án đã có dữ liệu dùng **Cập nhật iCal**, tránh chạy lại initial migration. Upgrade lưu đúng version/source vào CLI history, chạy lại chỉ bỏ qua khi history khớp; không tự ghi đè schema/history khác.

## Kết nối Airbnb

1. Mở lịch của căn tương ứng trên Airbnb, tìm phần kết nối/đồng bộ lịch và lấy liên kết **xuất lịch** iCal.
2. Trong MaokiHouse, mở **Kết nối → Kết nối Airbnb**, chọn đúng phòng/căn hộ và dán liên kết. Nhấn **Kết nối và đồng bộ**.
3. Sau khi nhập thành công, ngày bận hiện trên **Lịch phòng** dưới nhãn **iCal**. Cả giao diện và database chặn tạo đặt phòng mới trùng khoảng này.
4. Sao chép **lịch MaokiHouse** từ kết nối vừa tạo, thêm vào mục **nhập lịch** trên Airbnb để Airbnb lấy lịch từ MaokiHouse.

## Kết nối Booking.com

1. Trong Extranet của đúng chỗ nghỉ, tìm phần đồng bộ lịch và lấy liên kết xuất lịch. Tùy loại chỗ nghỉ/cấu hình, Booking.com có thể không cung cấp tính năng này.
2. Trong MaokiHouse, chọn **Kết nối Booking.com**, chọn phòng tương ứng và dán liên kết xuất lịch.
3. Lấy liên kết lịch MaokiHouse của kết nối đó, thêm vào mục nhập lịch của Booking.com nếu được hỗ trợ.

Một phòng có thể có một kết nối Airbnb và một kết nối Booking.com. Lặp lại cho từng phòng độc lập; không gắn một lịch vào kho nhiều phòng cùng loại. Kênh API hoặc channel manager được cấp quyền vẫn cần thiết cho mô hình tồn kho theo số lượng, giá và đặt phòng đầy đủ.

## Đồng bộ thực hiện những gì

- **Nhập:** bấm Đồng bộ để đọc lại file lịch. Kết nối mới cũng thử nhập ngay. Chưa có tác vụ đồng bộ nền liên tục. Các kênh lấy lịch xuất theo chu kỳ của họ; không coi iCal là cập nhật tức thời hay bảo đảm tuyệt đối tránh đặt trùng.
- **Dữ liệu:** chỉ nhập UID và ngày bắt đầu/kết thúc. Ngày trả phòng là mốc không bao gồm. Không lấy tên khách, email, nội dung sự kiện hay giá; các khoảng này không trở thành booking, doanh thu hoặc công suất lưu trú trong báo cáo.
- **Thay đổi/hủy:** cập nhật theo UID. Khoảng ngày biến mất khỏi một bản lịch hợp lệ được gỡ ở đúng kết nối đó. Lỗi tải, lịch bị hỏng hoặc định dạng không hỗ trợ giữ nguyên các ngày bận cũ.
- **Xung đột:** vẫn giữ dữ liệu thực tế từ kênh và báo số khoảng trùng; không tự xóa booking đang có. Chủ nhà đối chiếu trực tiếp các kênh để xử lý.
- **Xuất:** lịch chứa đặt phòng chưa hủy (kể cả chờ xác nhận), ngày bận từ kênh khác, và ngày đóng bán hiệu lực trong 730 ngày tới. Không xuất lại dữ liệu của chính kênh đích. Sự kiện mang UID Maoki được bỏ qua khi nhập để hạn chế vòng lặp. Không nhập ngược liên kết Maoki vào Maoki.
- **Giới hạn:** chỉ lịch lưu trú cả ngày có DTSTART/DTEND. Lịch hẹn theo giờ và sự kiện lặp bị từ chối. Tối đa 2 MB/2.000 sự kiện nhập; tối đa 5.000 sự kiện xuất. Có giới hạn 10 lượt nhập/phút/không gian; lease/nonce ngăn hai lần đồng bộ ghi đè kết quả của nhau.

## Quyền và bảo mật

Chỉ chủ không gian/quản lý được thêm, xem liên kết xuất, đồng bộ hoặc gỡ kết nối. Nhân viên/chỉ xem được xem ngày bận nhưng không đọc URL nguồn hoặc token xuất. URL nguồn và token nằm trong bảng private có RLS; frontend không ghi credentials vào `maoki_records` hay localStorage.

URL xuất lịch có token riêng: bất kỳ ai có URL đều xem được ngày bận của phòng, không có thông tin khách hoặc giá. Giữ URL riêng tư. Gỡ kết nối vô hiệu hóa token và xóa các ngày bận nhập từ kết nối đó; booking thật được giữ. Gỡ lịch Maoki tương ứng ở phía OTA để kênh ngừng giữ bản lịch cũ.

Máy chủ chỉ tải HTTPS từ các hostname/path lịch chính thức đã cho phép của đúng nền tảng. Mỗi redirect được kiểm tra lại và chỉ được sang hostname được phép của cùng nền tảng; không đi theo redirect tới IP nội bộ hoặc host tùy ý. Giới hạn thời gian, kích thước và số redirect được áp dụng. API không trả URL nguồn hoặc chi tiết lỗi mạng chứa credentials.

## Kiểm tra và giới hạn xác minh

`npm run test:calendars` chạy handler/parser thật với nguồn HTTP giả lập và SQL thật trên PGlite, kiểm tra phân quyền, cô lập workspace, nhập/hủy, giữ lịch khi lỗi, chặn booking và xuất dữ liệu an toàn. `test:ai:deployment` còn đóng gói/nạp/call function kênh bằng chính builder Vercel. Kiểm thử trình duyệt dùng SDK/SQL thật với Auth và HTTP provider giả lập. Chưa có lịch OTA thật do người dùng cung cấp để kiểm tra tài khoản thực tế.

Tham khảo giao diện/tính năng ở nhà cung cấp: [Airbnb — đồng bộ lịch](https://www.airbnb.com/help/article/99), [Booking.com Connectivity](https://developers.booking.com/connectivity/docs). Các trang này bị mạng cloud chặn trong phiên xây dựng; tên/vị trí menu có thể thay đổi. Parser được đối chiếu với [ical.js](https://github.com/kewisch/ical.js), thư viện RFC 5545, version 2.2.1.
