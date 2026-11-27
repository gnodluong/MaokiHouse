/** Stay messaging: alerts, inbox stay context, sender deletion. */
export const phrases8: Record<string, string> = {
  'Cảnh báo': 'Alerts', 'Kiểm tra lại': 'Check again', 'Không có gì cần xử lý': 'Nothing needs attention', 'Không có đơn trùng, đơn mồ côi hay kênh lỗi vào lúc này.': 'No double bookings, orphaned orders or broken channels right now.',
  'Những việc cần quyết định hôm nay: đơn trùng lịch, đơn chưa gắn phòng, khách sắp đến mà chưa thanh toán, kênh lỗi hoặc lâu chưa đồng bộ.': 'What needs a decision today: double bookings, orders with no room, arriving guests who have not paid, broken or stale channels.',
  'Mở đơn': 'Open booking', 'Mở kênh': 'Open channel', 'Cập nhật tự động khi dữ liệu thay đổi.': 'Updates automatically as data changes.',
  'Chưa kiểm tra được kênh và hàng đợi tin nhắn. Các cảnh báo đơn phòng bên dưới vẫn chính xác.': 'Could not check channels and the message queue. Booking alerts below are still accurate.',
  'Mọi khách': 'All guests', 'Nhận phòng hôm nay': 'Arriving today', 'Đang ở': 'Staying', 'Trả phòng hôm nay hoặc mai': 'Leaving today or tomorrow', 'Lọc theo ngày ở': 'Filter by stay',
  'Đơn đang gắn với khách': 'Booking linked to this guest', 'Chưa có đơn gắn hồ sơ khách này.': 'No booking linked to this guest yet.', 'Đã thanh toán': 'Paid', 'Chưa thanh toán': 'Unpaid', 'Thanh toán': 'Payment', 'Số khách': 'Guests',
  'Xóa dữ liệu của khách': 'Delete guest data', 'Xóa dữ liệu khách': 'Delete guest data', 'Xóa dữ liệu của khách…': 'Delete guest data…', 'Gõ tên khách để xác nhận': 'Type the guest’s name to confirm',
  'Toàn bộ hội thoại, liên kết kênh (Zalo, Messenger, WhatsApp, email…) và tin nhắn đang chờ gửi của': 'All conversations, channel links (Zalo, Messenger, WhatsApp, email…) and queued messages of',
  'sẽ bị xóa, rồi hồ sơ khách bị xóa. Các đặt phòng được giữ lại cho sổ sách nhưng bỏ tên, email và số điện thoại. Không thể hoàn tác.': 'will be deleted, then the guest profile is removed. Bookings are kept for the books but lose name, email and phone. This cannot be undone.',
};
export const patterns8: [RegExp, string][] = [
  [/^Đã xóa (\d+) hội thoại, (\d+) liên kết kênh; (\d+) đặt phòng được ẩn danh$/, 'Deleted $1 conversations and $2 channel links; $3 bookings anonymised'],
  [/^(\d+) tin nhắn gửi thất bại$/, '$1 messages failed to send'],
  [/^Trùng lịch ở (.+)$/, 'Double booking at $1'],
];
