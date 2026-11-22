import { phrases2, patterns2 } from './phrases2';
import { phrases3, patterns3 } from './phrases3';
import { phrases4, patterns4 } from './phrases4';
import { phrases5, patterns5 } from './phrases5';
import { phrases6, patterns6 } from './phrases6';

/**
 * Vietnamese → English for text rendered by the shared admin pages (src/workspace).
 * The desktop shell translates the DOM at runtime from this table, so the shared pages stay single-language.
 * Text that is not listed is left as written (Vietnamese).
 */
const base: Record<string, string> = {
  // statuses & enums
  'Đang hoạt động': 'Active', 'Ngừng hoạt động': 'Inactive', 'Đã xác nhận': 'Confirmed', 'Chờ xử lý': 'Pending', 'Đã hủy': 'Cancelled', 'Tiềm năng': 'Lead', 'Đang lưu trú': 'Staying', 'Quay lại': 'Returning',
  'Cần làm': 'To do', 'Đang làm': 'In progress', 'Hoàn tất': 'Done', 'Thông thường': 'Normal', 'Ưu tiên cao': 'High priority', 'Buồng phòng': 'Housekeeping', 'Bảo trì': 'Maintenance', 'Đón khách': 'Guest welcome',
  'Đang mở': 'Open', 'Đã hoàn tất': 'Completed', 'Có hội thoại mới': 'New conversation', 'Xác nhận đặt phòng': 'Booking confirmed', 'Trước nhận phòng · chạy thủ công': 'Before check-in · run manually',
  'Lưu phản hồi': 'Save reply', 'Tạo công việc': 'Create task', 'Gắn nhãn hội thoại': 'Tag conversation', 'Bản nháp': 'Draft', 'Đã lên lịch · chờ kết nối': 'Scheduled · awaiting connection', 'Mô phỏng': 'Simulated', 'Chưa kết nối': 'Not connected',
  'Thu từ đặt phòng': 'Booking income', 'Chi phí': 'Expense', 'Điều chỉnh': 'Adjustment', 'Trực tiếp': 'Direct', 'Chờ xác nhận': 'Awaiting confirmation', 'Chờ phản hồi': 'Awaiting reply', 'Đang xử lý': 'In progress',
  // field & column labels
  'Phòng / căn hộ': 'Room / apartment', 'Họ và tên': 'Full name', 'Số điện thoại': 'Phone number', 'Ghi chú': 'Notes', 'Tên': 'Name', 'Địa chỉ': 'Address', 'Giá cơ bản': 'Base price', 'Trạng thái': 'Status',
  'Khách lưu trú': 'Guest', 'Nguồn': 'Source', 'Nhận phòng': 'Check-in', 'Trả phòng': 'Check-out', 'Tổng tiền': 'Total', 'Điện thoại': 'Phone', 'Giai đoạn': 'Stage', 'Nhãn': 'Tags', 'Phụ trách': 'Assignee',
  'Hạn hoàn thành': 'Due date', 'Ưu tiên': 'Priority', 'Loại': 'Type', 'Giá mỗi đêm': 'Nightly rate', 'Số đêm tối thiểu': 'Minimum nights', 'Từ ngày': 'From', 'Đến ngày': 'To', 'Ngừng nhận khách': 'Closed',
  'Phòng quản lý': 'Managed rooms', 'Phí quản lý': 'Management fee', 'Khi xảy ra': 'Trigger', 'Thực hiện': 'Action', 'Đang bật': 'Enabled', 'Lượt chạy': 'Runs', 'Kênh': 'Channel', 'Nhóm khách': 'Audience',
  'Tiêu đề': 'Title', 'Lịch dự kiến': 'Scheduled for', 'Nội dung': 'Content', 'Vai trò': 'Role', 'Diễn giải': 'Description', 'Ngày': 'Date', 'Số tiền': 'Amount', 'Nền tảng': 'Platform', 'Đã xuất bản': 'Published',
  'Tên phòng / căn hộ': 'Room / apartment name', 'Giới thiệu': 'Description', 'Giá cơ bản mỗi đêm': 'Base price per night', 'Số phòng ngủ': 'Bedrooms', 'Số khách tối đa': 'Maximum guests',
  'Mỗi dòng một URL ảnh HTTPS hoặc đường dẫn /rooms/…': 'One HTTPS image URL or /rooms/… path per line', 'Mở trang đặt phòng trực tiếp': 'Open the direct booking page',
  'Tên khách': 'Guest name', 'Hồ sơ khách hàng': 'Guest profile', 'Email của khách': 'Guest email', 'Điện thoại của khách': 'Guest phone', 'Ngày nhận phòng': 'Check-in date', 'Ngày trả phòng': 'Check-out date',
  'Nguồn đặt phòng': 'Booking source', 'Tổng tiền kỳ nghỉ': 'Stay total', 'Nguồn khách': 'Guest source', 'Nhãn khách hàng': 'Guest tags', 'Ngăn cách các nhãn bằng dấu phẩy': 'Separate tags with commas',
  'Người phụ trách': 'Assigned to', 'Tin nhắn đầu tiên (khi tạo mới)': 'First message (when creating)', 'Tên công việc': 'Task name', 'Loại công việc': 'Task type', 'Tên quy tắc': 'Rule name',
  'Đến ngày (bao gồm)': 'To (inclusive)', 'Ngừng nhận khách trong khoảng ngày này': 'Close these dates to bookings', 'Tên sổ tay': 'Guidebook name', 'Lời chào': 'Welcome message',
  'Hướng dẫn nhận phòng': 'Check-in instructions', 'Tên Wi-Fi': 'Wi-Fi name', 'Mật khẩu Wi-Fi': 'Wi-Fi password', 'Nội quy': 'House rules', 'Khám phá địa phương': 'Local guide', 'Xuất bản qua liên kết riêng': 'Publish via private link',
  'Phí quản lý (%)': 'Management fee (%)', 'Lưu phản hồi trong hộp thư': 'Save reply in the inbox', 'Tạo công việc đón khách': 'Create welcome task', 'Nội dung / tên công việc / nhãn': 'Content / task name / tag',
  'Bật quy tắc': 'Enable rule', 'Tên chiến dịch': 'Campaign name', 'Kênh gửi': 'Sending channel', 'Để trống để chọn toàn bộ khách hàng': 'Leave empty to select all guests', 'Lên lịch · chờ kết nối': 'Scheduled · awaiting connection',
  'Thời điểm dự kiến': 'Planned time', 'Tên mẫu': 'Template name', 'Dùng {{guest}} để cá nhân hóa khi đưa vào hộp thư.': 'Use {{guest}} to personalize when inserted in the inbox.', 'Tên kết nối': 'Connection name',
  'Vai trò vận hành': 'Operational role', 'Ngày giao dịch': 'Transaction date', 'Loại giao dịch': 'Transaction type',
  // pages: titles & descriptions
  'Phòng & căn hộ': 'Rooms & apartments', 'Đặt phòng': 'Bookings', 'Khách hàng': 'Guests', 'Hộp thư': 'Inbox', 'Công việc': 'Tasks', 'Giá & tình trạng phòng': 'Rates & availability', 'Sổ tay lưu trú': 'Guest guidebooks',
  'Chủ sở hữu': 'Owners', 'Tự động hóa': 'Automations', 'Chiến dịch': 'Campaigns', 'Mẫu trả lời': 'Reply templates', 'Kết nối': 'Connections', 'Đội ngũ': 'Team', 'Thu & chi': 'Income & expenses', 'Báo cáo': 'Reports', 'Lịch phòng': 'Room calendar',
  'Hồ sơ khách: liên hệ, nguồn, giai đoạn và thẻ để lọc, chăm sóc lại.': 'Guest profiles: contact, source, stage and tags for filtering and follow-up.', 'Tin nhắn của khách từ các kênh.': 'Guest messages from every channel.',
  'Việc dọn phòng, bảo trì và đón khách: người phụ trách, hạn chót, trạng thái.': 'Cleaning, maintenance and guest welcome: assignee, deadline and status.',
  'Giá theo khoảng ngày, số đêm tối thiểu và ngày đóng bán của từng phòng.': 'Per-room pricing by date range, minimum nights and closed dates.',
  'Hướng dẫn nhận phòng, Wi-Fi và nội quy gửi khách qua liên kết riêng.': 'Check-in steps, Wi-Fi and house rules sent to guests through a private link.',
  'Chủ sở hữu, phòng họ sở hữu và phí quản lý để đối soát.': 'Owners, the rooms they own and management fees for reconciliation.',
  'Quy tắc tự động: khi có sự kiện thì tạo việc, gắn thẻ hoặc lưu phản hồi.': 'Automatic rules: when an event happens, create a task, add a tag or save a reply.',
  'Bản nháp nội dung gửi theo nhóm khách và thời điểm dự kiến.': 'Message drafts by audience and planned send time.', 'Câu trả lời mẫu dùng nhanh trong Hộp thư.': 'Quick reply templates for the Inbox.',
  'Các kênh khách tìm thấy và nhắn tin cho bạn.': 'The channels guests use to find and message you.', 'Danh bạ nhân viên vận hành để giao việc (không phải tài khoản đăng nhập).': 'Operations staff directory for assigning tasks (not sign-in accounts).',
  'Sổ thu chi: tiền phòng, chi phí và điều chỉnh, dùng cho báo cáo và đối soát.': 'Ledger of room income, expenses and adjustments, used for reports and reconciliation.',
  'Danh sách phòng/căn hộ: giá cơ bản, sức chứa, ảnh và trạng thái mở bán trên website.': 'Rooms and apartments: base price, capacity, photos and website availability.',
  'Tất cả đặt phòng từ mọi nguồn. Hệ thống tự chặn trùng lịch giữa các phòng và kênh.': 'All bookings from every source. The system blocks overlapping dates across rooms and channels.',
  'phòng': 'room', 'đặt phòng': 'booking', 'khách hàng': 'guest', 'hội thoại': 'conversation', 'công việc': 'task', 'quy tắc giá': 'rate rule', 'sổ tay': 'guidebook', 'chủ sở hữu': 'owner', 'quy tắc': 'rule', 'chiến dịch': 'campaign', 'mẫu trả lời': 'reply template', 'kênh': 'channel', 'thành viên': 'member', 'giao dịch': 'transaction',
  // overview
  'Bắt đầu với MaokiHouse': 'Get started with MaokiHouse', 'Tiến độ thiết lập': 'Setup progress', 'Đã xong': 'Done', 'Chưa xong': 'Not done', 'Thêm phòng đầu tiên': 'Add your first room',
  'Tên, giá cơ bản, sức chứa và ảnh của từng phòng/căn hộ.': 'Name, base price, capacity and photos of each room or apartment.', 'Thêm phòng': 'Add room',
  'Mở đặt phòng trực tiếp trên website': 'Open direct booking on the website', 'Bật “Mở trang đặt phòng trực tiếp” cho phòng muốn bán.': 'Turn on “Open the direct booking page” for the rooms you want to sell.', 'Mở phòng': 'Open rooms',
  'Kết nối lịch Airbnb, Booking.com…': 'Connect Airbnb, Booking.com… calendars', 'Nhập ngày bận từ các kênh để không bị trùng phòng.': 'Import busy dates from channels to avoid double bookings.', 'Kết nối lịch': 'Connect calendars',
  'Bật chat trên website': 'Turn on website chat', 'Khách nhắn từ website, đội ngũ trả lời trong Hộp thư.': 'Guests message from the website; the team replies in the Inbox.', 'Bật chat': 'Turn on chat',
  'Kết nối trợ lý AI': 'Connect the AI assistant', 'Dán API key OpenRouter để soạn tin và nội dung nhanh hơn.': 'Paste an OpenRouter API key to draft replies and content faster.', 'Cài đặt AI': 'AI settings',
  'Viết sổ tay lưu trú': 'Write a guest guidebook', 'Wi-Fi, cách nhận phòng và nội quy gửi khách trước ngày đến.': 'Wi-Fi, check-in steps and house rules to send guests before arrival.', 'Viết sổ tay': 'Write guidebook',
  'Xem lịch phòng': 'View room calendar', 'Tạo đặt phòng': 'New booking', 'Công suất hôm nay': 'Occupancy today', 'Đặt phòng sắp tới': 'Upcoming bookings', 'Nhận phòng trong 7 ngày tới': 'Check-ins in the next 7 days',
  'Doanh thu tháng này': 'Revenue this month', 'Dòng tiền thực thu trừ chi phí đã ghi': 'Cash received minus recorded expenses', 'Hội thoại chưa đọc': 'Unread conversations', 'Nhịp đón khách': 'Arrivals & departures',
  'Hôm nay': 'Today', '7 ngày tới': 'Next 7 days', 'Lịch đón khách đang thảnh thơi': 'No arrivals scheduled', 'Các lượt nhận và trả phòng sẽ xuất hiện ở đây khi có đặt phòng.': 'Check-ins and check-outs will appear here once bookings exist.',
  'Xem tất cả đặt phòng': 'View all bookings', 'Cần bạn một chút': 'Needs your attention', 'Tất cả': 'All', 'Đã hoàn tất công việc': 'Task completed', 'Chưa phân công': 'Unassigned', 'Mọi việc đã đâu vào đấy': 'Everything is on track',
  'Thêm công việc để cả đội cùng theo dõi.': 'Add tasks so the whole team can follow along.', 'Thêm công việc': 'Add task', 'Nhịp lưu trú trong tuần': 'Occupancy this week', 'Công suất 7 ngày gần nhất': 'Occupancy, last 7 days',
  'Dựa trên các đêm đã giữ phòng': 'Based on nights reserved', 'Công suất phòng trong 7 ngày gần nhất': 'Room occupancy over the last 7 days', 'Chuyện trong không gian': 'Workspace activity', 'Gần đây': 'Recent',
  'Đã tạo': 'Created', 'Đã xóa': 'Deleted', 'Đã chạy quy tắc': 'Rule ran', 'Đã cập nhật': 'Updated', 'Những thay đổi của bạn và đội ngũ sẽ được ghi lại tại đây.': 'Changes made by you and your team are recorded here.',
  'Chưa gắn phòng': 'No room assigned', 'Chưa lên lịch': 'Not scheduled', 'Có': 'Yes', 'Chưa': 'No', 'Đã sao chép liên kết': 'Link copied', 'Không sao chép được. Bạn có thể mở và sao chép địa chỉ trang.': 'Could not copy. Open the page and copy its address.',
  // resource page / editor
  'Xuất CSV': 'Export CSV', 'Mở kênh chat Website': 'Open website chat channel', 'Lọc trạng thái': 'Filter by status', 'Tất cả trạng thái': 'All statuses', 'Đã bật / xuất bản': 'Enabled / published', 'Chưa bật / xuất bản': 'Not enabled / published',
  'Chưa tìm thấy kết quả': 'No results found', 'Thử từ khóa hoặc bộ lọc khác.': 'Try another keyword or filter.', 'Thêm bản ghi đầu tiên để bắt đầu quản lý tại đây.': 'Add the first record to start managing here.', 'Chưa có địa chỉ': 'No address',
  '/ đêm': '/ night', 'Chi tiết phòng': 'Room details', 'Thao tác': 'Actions', 'Đã bật': 'On', 'Chưa bật': 'Off', 'Xem hội thoại của khách': 'View guest conversation', 'Hoàn tất công việc': 'Complete task', 'Công việc đã hoàn tất': 'Task completed',
  'Chạy quy tắc': 'Run rule', 'Xem trang đã xuất bản': 'View published page', 'Sao chép liên kết': 'Copy link', 'Thao tác sẽ thực hiện trên bản ghi được chọn và lưu vào lịch sử.': 'The action applies to the selected record and is saved to history.',
  'Hội thoại': 'Conversation', 'Chọn bản ghi': 'Select record', 'Hủy': 'Cancel', 'Quy tắc đã thực hiện': 'Rule executed', 'Hướng dẫn nhanh': 'Quick guide', 'Một khởi đầu mới': 'A fresh start', 'Đóng cửa sổ': 'Close dialog',
  'Vai trò của bạn chỉ được xem dữ liệu này': 'Your role can only view this data', 'Bạn không có quyền xóa dữ liệu này': 'You do not have permission to delete this', 'Bản ghi': 'Record', 'sẽ bị xóa. Thao tác này không thể hoàn tác.': 'will be deleted. This cannot be undone.',
  'Giữ lại': 'Keep', 'Đã xóa bản ghi': 'Record deleted', 'Xóa bản ghi': 'Delete record', 'Đã lưu thay đổi': 'Changes saved', 'bắt buộc': 'required', 'Chưa chọn': 'Not selected', 'Lưu thay đổi': 'Save changes', 'Tạo': 'Create',
  'Xóa': 'Delete', 'Sửa': 'Edit', 'Lưu': 'Save', 'Thêm': 'Add', 'Đóng': 'Close', 'Tìm kiếm': 'Search', 'Chỉnh sửa': 'Edit',
  // calendar
  'Lịch kênh': 'Channel calendars', 'Khoảng trước': 'Previous range', 'Khoảng tiếp theo': 'Next range', 'Lọc theo nguồn đặt phòng': 'Filter by booking source', 'Tất cả nguồn': 'All sources', '7 ngày': '7 days', '14 ngày': '14 days',
  'Thêm không gian đầu tiên của bạn': 'Add your first space', 'PHÒNG / CĂN HỘ': 'ROOM / APARTMENT', 'Khóa từ kênh': 'Blocked by channel', 'Kết nối kênh': 'Channel connections', 'Sọc: khóa từ kênh (Airbnb, Booking.com…)': 'Striped: blocked by a channel (Airbnb, Booking.com…)',
  'Viền đứt: chờ xác nhận': 'Dashed border: awaiting confirmation', 'Chọn ô trống để thêm kỳ nghỉ': 'Select an empty cell to add a stay',
  // inbox
  'Tạo hội thoại': 'New conversation', 'Tất cả kênh': 'All channels', 'Đang xem hội thoại của một khách hàng.': 'Viewing one guest’s conversations.', 'Xem tất cả': 'View all', 'Danh sách hội thoại': 'Conversation list',
  'Tìm khách hàng…': 'Search guests…', 'Tìm hội thoại': 'Search conversations', 'Lọc hội thoại': 'Filter conversations', 'Tất cả hội thoại': 'All conversations', 'Hộp thư đang yên': 'Inbox is quiet', 'Hội thoại mới sẽ xuất hiện tại đây.': 'New conversations will appear here.',
  'Chưa có tin nhắn': 'No messages yet', 'Quay lại hộp thư': 'Back to inbox', 'Chưa kết nối API': 'API not connected', 'Mở lại hội thoại': 'Reopen conversation', 'Hoàn tất hội thoại': 'Resolve conversation', 'Chỉnh sửa hội thoại': 'Edit conversation',
  'Nhờ AI soạn phản hồi': 'Draft reply with AI', 'Phản hồi được chuyển đến khách trong cửa sổ chat Website.': 'Replies are delivered to the guest in the website chat window.', 'Tin nhắn': 'Messages', 'Đã trả lời': 'Replied', 'Đã lưu': 'Saved',
  'Nội dung phản hồi': 'Reply', 'Chèn mẫu trả lời': 'Insert reply template', 'Gửi phản hồi': 'Send reply', 'PHỤ TRÁCH HỘI THOẠI': 'ASSIGNED TO', 'Thông tin khách hàng': 'Guest information', 'Chưa có email': 'No email', 'Chưa có điện thoại': 'No phone',
  'Mở hồ sơ khách': 'Open guest profile', 'Tạo hồ sơ khách': 'Create guest profile', 'Nhãn hội thoại': 'Conversation tags', 'Chưa gắn nhãn': 'No tags', 'Chỉnh sửa nhãn': 'Edit tags', 'Ghi chú của đội ngũ': 'Team notes',
  'Lịch sử lưu trú': 'Stay history', 'Phòng': 'Room', 'Chưa có đặt phòng gắn hồ sơ.': 'No bookings linked to this profile.', 'Chọn một hội thoại để trò chuyện cùng khách.': 'Select a conversation to chat with the guest.',
  // reports
  'Báo cáo & hiệu quả': 'Reports & performance', 'Đêm có khách': 'Occupied nights', 'Công suất (%)': 'Occupancy (%)', 'Thu ghi nhận': 'Recorded income', 'Dòng tiền ròng': 'Net cash flow', 'Xuất báo cáo': 'Export report', 'Tháng báo cáo': 'Report month',
  'Không gian': 'Space', 'Tất cả phòng': 'All rooms', 'Thu đã ghi nhận': 'Income recorded', 'Bao gồm điều chỉnh thu nhập': 'Includes income adjustments', 'Chi phí vận hành': 'Operating expenses', 'Giao dịch chi trong kỳ': 'Expense transactions in the period',
  'Thu trừ chi đã ghi nhận': 'Recorded income minus expenses', 'Dòng thu theo ngày': 'Income by day', 'Hiệu quả từng không gian': 'Performance by space', 'Công suất': 'Occupancy', 'Chưa có dữ liệu báo cáo': 'No report data yet',
  'Thêm phòng và ghi nhận thu chi để theo dõi hiệu quả vận hành.': 'Add rooms and record income and expenses to track performance.', 'Đối soát chủ sở hữu': 'Owner reconciliation', 'Ước tính từ sổ thu chi, chưa xác nhận thanh toán': 'Estimated from the ledger; payments not confirmed',
  'Phần còn lại': 'Remainder', 'Thêm chủ sở hữu và gắn phòng quản lý để tạo bản đối soát.': 'Add owners and assign managed rooms to create a reconciliation.', 'Hội thoại & chăm sóc khách': 'Conversations & guest care',
  'Theo tháng tạo hội thoại': 'By month created', 'Chưa đọc': 'Unread', 'Phản hồi đầu tiên trung bình': 'Average first reply', 'Chưa có phản hồi': 'No replies yet', 'phút': 'min', 'Chưa có hội thoại trong kỳ': 'No conversations in this period',
  'Dữ liệu chăm sóc khách sẽ xuất hiện khi có hội thoại mới.': 'Guest care data will appear once new conversations arrive.',
  // misc
  'Đang tải…': 'Loading…', 'Đang kiểm tra phiên đăng nhập…': 'Checking your session…', 'Không tìm thấy trang': 'Page not found', 'Liên kết có thể đã thay đổi.': 'The link may have changed.',
};

/** Dynamic text: [pattern, replacement]. Applied after exact matches fail. */
const basePatterns: [RegExp, string][] = [
  [/^(\d+) chưa đọc$/, '$1 unread'], [/^(\d+) đêm$/, '$1 nights'], [/^(\d+) khách$/, '$1 guests'], [/^(\d+) phòng ngủ$/, '$1 bedrooms'], [/^(\d+) phòng$/, '$1 rooms'],
];

export const phrases: Record<string, string> = { ...base, ...phrases2, ...phrases3, ...phrases4, ...phrases5, ...phrases6 };
export const patterns: [RegExp, string][] = [...basePatterns, ...patterns2, ...patterns3, ...patterns4, ...patterns5, ...patterns6];
