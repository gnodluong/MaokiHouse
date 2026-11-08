/**
 * Short, task-oriented help shown above each admin page. Keyed by the route
 * segment after /admin/dashboard ('' is the overview).
 */
export interface PageGuide { steps: string[]; tip?: string }

export const pageGuides: Record<string, PageGuide> = {
  '': {
    steps: [
      'Làm theo danh sách “Bắt đầu” bên dưới cho tới khi tất cả được đánh dấu xong.',
      'Mỗi sáng xem “Nhịp đón khách” để biết ai nhận phòng, trả phòng hôm nay.',
      'Việc cần làm chưa xong nằm ở cột “Cần bạn một chút”; tích vào ô để hoàn tất.',
    ],
  },
  calendar: {
    steps: [
      'Mỗi hàng là một phòng, mỗi cột là một ngày. Ô có màu là đã có khách hoặc đã bận.',
      'Bấm vào ô trống để tạo đặt phòng cho đúng phòng và ngày đó.',
      'Ô ghi “iCal” là ngày bận lấy từ Airbnb, Booking.com hoặc kênh khác; muốn thay đổi thì sửa ở kênh đó rồi đồng bộ lại.',
    ],
    tip: 'Lịch các kênh tự đồng bộ khi bạn mở trang quản trị (nếu lần gần nhất đã quá 1 giờ). Có thể bấm “Đồng bộ tất cả” trong Kết nối kênh.',
  },
  bookings: {
    steps: [
      'Bấm “Thêm đặt phòng”, chọn phòng, nhập tên khách và ngày ở.',
      'Đặt phòng từ website khách gửi về ở trạng thái “Chờ xử lý”: xác nhận hoặc hủy để giữ/giải phóng lịch.',
      'Hệ thống tự chặn trùng lịch với đặt phòng khác và với ngày bận của các kênh.',
    ],
  },
  properties: {
    steps: [
      'Thêm từng phòng/căn hộ với giá cơ bản, sức chứa và ảnh (đường dẫn HTTPS).',
      'Bật “Mở trang đặt phòng trực tiếp” để phòng hiện trên website khách và nhận yêu cầu đặt phòng.',
      'Sau khi có phòng, vào Kết nối kênh để gắn lịch Airbnb, Booking.com… cho từng phòng.',
    ],
  },
  rates: {
    steps: [
      'Tạo quy tắc giá cho một khoảng ngày (mùa cao điểm, lễ Tết…).',
      'Đặt số đêm tối thiểu, hoặc chọn “Ngừng nhận khách trong khoảng ngày này” để khóa ngày.',
      'Khi nhiều quy tắc trùng ngày, quy tắc cập nhật gần nhất được áp dụng.',
    ],
  },
  tasks: {
    steps: [
      'Tạo việc dọn phòng, bảo trì hoặc đón khách, gắn phòng và hạn chót.',
      'Giao cho một thành viên trong Đội ngũ để họ biết việc của mình.',
      'Đánh dấu Hoàn tất khi xong; việc trễ hạn hiện ở Tổng quan.',
    ],
  },
  guidebooks: {
    steps: [
      'Viết lời chào, hướng dẫn nhận phòng, Wi-Fi, nội quy và gợi ý quanh khu.',
      'Bật “Xuất bản qua liên kết riêng” rồi gửi liên kết cho khách trước ngày đến.',
    ],
    tip: 'Liên kết sổ tay là bí mật: ai có liên kết đều xem được, kể cả mật khẩu Wi-Fi.',
  },
  messages: {
    steps: [
      'Chọn một hội thoại bên trái để đọc và trả lời.',
      'Giao người phụ trách và đổi trạng thái (Mở / Chờ / Đóng) để cả đội cùng theo dõi.',
      'Dùng “Nhờ AI soạn phản hồi” để có bản nháp; bạn luôn là người bấm gửi.',
    ],
    tip: 'Hiện chỉ chat website gửi/nhận thật. Facebook, Instagram, Zalo cần kết nối API riêng.',
  },
  contacts: {
    steps: [
      'Lưu khách với nguồn (Airbnb, Booking…), giai đoạn và thẻ để lọc nhanh.',
      'Xuất CSV khi cần gửi danh sách cho bộ phận khác.',
    ],
  },
  automations: {
    steps: [
      'Chọn sự kiện “Khi xảy ra” (hội thoại mới, đặt phòng xác nhận…).',
      'Chọn việc cần làm: tạo công việc, gắn thẻ hoặc lưu phản hồi mẫu.',
      'Bật/tắt từng quy tắc bất cứ lúc nào.',
    ],
  },
  campaigns: {
    steps: ['Soạn nội dung, chọn nhóm khách theo thẻ và thời điểm dự kiến.'],
    tip: 'Chiến dịch hiện được lưu dưới dạng bản nháp/lịch dự kiến; chưa tự gửi email hay tin nhắn.',
  },
  replies: {
    steps: ['Lưu các câu trả lời hay dùng; dùng {{guest}} để tự chèn tên khách khi đưa vào hộp thư.'],
  },
  ai: {
    steps: [
      'Lần đầu: chủ không gian hoặc quản lý mở “Cài đặt AI”, dán API key OpenRouter và bấm “Lưu và kiểm tra”.',
      'Đặt câu hỏi hoặc chọn một gợi ý. Bật “Dùng số liệu vận hành” khi muốn AI tóm tắt tình hình.',
      'Kiểm tra lại câu trả lời trước khi gửi cho khách: AI chỉ soạn nháp, không tự gửi hay sửa dữ liệu.',
    ],
  },
  revenue: {
    steps: ['Ghi các khoản thu từ đặt phòng, chi phí vận hành và điều chỉnh.', 'Báo cáo và đối soát chủ sở hữu lấy số liệu từ đây.'],
  },
  reports: {
    steps: ['Xem dòng tiền, công suất phòng và hội thoại theo kênh trong khoảng thời gian bạn chọn.'],
  },
  owners: {
    steps: ['Thêm chủ sở hữu, gắn phòng họ sở hữu và phí quản lý (%) để xem số tiền đối soát ước tính.'],
  },
  hr: {
    steps: [
      'Danh bạ nhân viên vận hành để giao việc (không cấp quyền đăng nhập).',
      'Muốn ai đó đăng nhập trang quản trị: vào Cài đặt, kéo xuống phần thành viên và gửi lời mời theo email.',
    ],
  },
  channels: {
    steps: [
      'Chọn kênh (Airbnb, Booking.com, Agoda, Google Calendar…) và phòng cần kết nối.',
      'Trên kênh đó, sao chép “liên kết xuất lịch (iCal / .ics)” rồi dán vào MaokiHouse.',
      'Sao chép “liên kết lịch MaokiHouse” và dán vào phần nhập lịch của kênh để kênh thấy ngày bạn đã bán ở nơi khác.',
    ],
    tip: 'iCal chỉ trao đổi ngày bận/trống. Giá, tin nhắn và thông tin khách vẫn quản lý trên từng kênh.',
  },
  settings: {
    steps: [
      'Cập nhật tên, liên hệ, giờ nhận/trả phòng và tiền tệ của cơ sở.',
      'Bật chat website và sao chép mã nhúng nếu dùng website riêng.',
      'Mời thành viên và chọn vai trò: Quản lý, Nhân viên hoặc Chỉ xem.',
    ],
  },
};
