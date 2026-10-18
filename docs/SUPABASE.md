# Kích hoạt Supabase

Website production được người dùng xác nhận: `https://maokihousemvc.vercel.app/`.

SDK, hai biến môi trường và official agent skills đã được cài. Migration đã kiểm tra với PostgreSQL nhúng; chưa được áp dụng lên dự án đang host. Publishable key chỉ cấp quyền dùng Data API theo RLS, không cấp quyền tạo bảng. Phiên cloud hiện bị proxy chặn CONNECT 403 tới dự án Supabase; chưa kiểm tra được Auth hoặc database của dự án từ đây.

## Cách dễ nhất: làm trên website

Sau khi bản cập nhật được Vercel triển khai, mở [trang thiết lập](https://maokihousemvc.vercel.app/setup):

1. Chọn **Sao chép SQL** → **Mở SQL Editor** → **New query** → dán SQL → **Run**. Chỉ chạy một lần, chờ báo thành công. Có thể tải file SQL hoặc chọn toàn bộ nội dung trong “Xem SQL” nếu clipboard bị chặn.
2. Quay lại trang và nhấn **Kiểm tra dữ liệu**. Nút này kiểm tra hàm public bằng publishable key, không tạo/sửa dữ liệu. Thành công xác nhận kết nối hàm public, chưa chứng minh toàn bộ Auth/RLS hay migration history trên dự án.
3. Cấu hình Site URL/Redirect URLs theo bước 2 trên trang.
4. Tạo tài khoản ở Authentication → Users cho `maokihouse.sg@gmail.com`, bật Auto Confirm User, rồi đăng nhập. Không lưu mật khẩu vào SQL hoặc repository. Tài khoản mới sẽ có không gian riêng với quyền Chủ không gian khi mở dashboard; tài khoản là thành viên không gian có sẵn không tự được nâng quyền.
5. Bật Gemini theo bước 4 trên trang nếu muốn dùng AI: thêm `GEMINI_API_KEY` ở Vercel rồi Redeploy. Không cần API key quản trị Supabase cho AI.

SQL trên trang và lệnh `supabase:apply` dùng chung hàm `shared/supabase-bootstrap.mjs`: có khóa chống chạy đồng thời, từ chối ghi đè schema đang có và ghi đúng migration history trong cùng giao dịch. Nếu báo đã áp dụng/đã có đối tượng, dừng và kiểm tra trạng thái; không drop dữ liệu để chạy lại.

## Thao tác còn cần trên dự án

1. Mở SQL Editor của đúng dự án `msucrkkxuplgijxanzxu` bằng tài khoản quản trị. Xem và chạy một lần toàn bộ [migration](../supabase/migrations/20261017131312_maoki_workspace.sql). Nó tạo các bảng có tiền tố `maoki_` và schema `maoki_private`, không sửa bảng Firebase hay bảng hiện có khác. Nếu đã có các tên này, kiểm tra xung đột trước khi chạy; không chạy lại mù quáng. Có thể dùng quy trình migration CLI đã xác thực của dự án thay SQL Editor; không dùng service-role key trong trình duyệt.
2. Trong Authentication → URL Configuration, đặt Site URL và thêm URL `/admin` của website vào danh sách redirect. Bật Email provider theo nhu cầu. Đăng ký qua giao diện sẽ nhắc xác nhận email khi dự án yêu cầu; lời mời đội ngũ luôn yêu cầu email đúng và đã xác minh.
3. Kiểm tra `public` nằm trong các schema Data API được expose; giữ `maoki_private` ngoài danh sách expose. Migration tự cấp quyền hàm/SELECT phù hợp. Nếu bật Realtime và publication đã có, migration thêm `maoki_records`; ứng dụng cũng tự làm mới định kỳ khi Realtime không có.
4. Khởi động lại Vite sau khi thay `.env`. Đăng ký/đăng nhập, tạo phòng rồi bật xuất bản. Mở liên kết đặt phòng ở trình duyệt riêng; tạo yêu cầu, xác nhận nó xuất hiện trong lịch. Bật chat Website trong Cài đặt; gửi tin nhắn ở phiên khách và trả lời từ hộp thư.
5. Mời một email thứ hai ở chế độ Chỉ xem, xác nhận xem được nhưng không sửa được dữ liệu. Tài khoản độc lập không nhận lời mời phải có không gian trống riêng.

Nếu cần để agent áp dụng migration sau này, cung cấp quyền quản trị qua cơ chế kết nối/bí mật an toàn của môi trường; không gửi database password, access token hoặc secret key trong chat. Binding token quản trị đã được lưu trong cấu hình cloud; máy chạy hiện tại vẫn bị proxy từ chối CONNECT 403, nên chưa dùng được quyền đó. Không cần khai báo thêm token trùng tên.

## Mô hình dữ liệu và quyền

`maoki_workspaces` giữ cài đặt; `maoki_members` giữ quyền hiện tại; `maoki_records` giữ bản ghi có loại và JSON được kiểm tra phía database; `maoki_activity` giữ lịch sử. RLS bật cho mọi bảng. Người dùng chỉ SELECT workspace mình là thành viên; không có quyền INSERT/UPDATE/DELETE trực tiếp. Các hàm ghi kiểm tra thành viên/vai trò, trường được phép, dữ liệu liên quan cùng workspace và chồng lịch trước khi ghi. Khóa giao dịch theo workspace bảo vệ kiểm tra đặt phòng đồng thời.

Hai hàm public là SECURITY INVOKER, gọi các hàm SECURITY DEFINER trong schema riêng có search_path rỗng và kiểm tra quyền rõ ràng. Cách này giữ quy tắc ghi nhất quán cho nhân viên và khách công khai. Không dùng `user_metadata` để phân quyền. Không có bucket storage được tạo hay công khai.

| Vai trò | Đọc | Sửa | Quản lý thành viên |
| --- | --- | --- | --- |
| Chủ không gian | Dữ liệu workspace | Toàn bộ | Có |
| Quản lý | Dữ liệu workspace | Toàn bộ dữ liệu kinh doanh/cài đặt | Không |
| Nhân viên | Dữ liệu workspace, gồm dữ liệu kinh doanh | Đặt phòng, khách, hội thoại, công việc | Không |
| Chỉ xem | Dữ liệu workspace | Không | Không |

Danh sách công khai chỉ chứa các phòng `active` và `published`; xuất bản phòng cũng đưa phòng lên website. Sổ tay chỉ mở khi được xuất bản qua token riêng. Widget cần bật và mỗi khách giữ secret phiên riêng, được lưu dạng hash với hạn 7 ngày. Giới hạn tần suất áp dụng cho chat/đặt phòng công khai theo workspace. Sau 200 tin nhắn, Supabase giữ 200 tin nhắn gần nhất; demo yêu cầu mở cuộc trò chuyện mới tại giới hạn này.

## Registry Supabase được yêu cầu

Lệnh `npx shadcn@latest add @supabase/supabase-client-react-router --yes` đã thử nhưng dừng trước khi thêm file vì không truy cập được `ui.shadcn.com/r/registries.json`. Không ghi nhận lệnh CLI này thành công.

Đã lấy block đúng từ repository chính thức, lưu JSON và hai helper nguyên bản vào:

- `supabase/registry/supabase-client-react-router.json`
- `src/lib/supabase/router-client.ts`
- `src/lib/supabase/server.ts`

Nguồn: [Supabase registry tại commit đã kiểm tra](https://github.com/supabase/supabase/blob/7425d4930528931400fb3e656e860b1094cb224e/apps/ui-library/public/r/supabase-client-react-router.json). Dependencies đã cài/pin: `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7. Hai official agent skills nằm trong `.agents/skills`.

Block React Router gồm cookie helper cho server loaders/actions. MaokiHouse là BrowserRouter SPA nên dùng singleton `src/lib/supabase/client.ts` theo mẫu React SPA chính thức để giữ session phía trình duyệt. Helper server được giữ để tham khảo và không được import vào bundle trình duyệt.

Các miền Supabase/registry đã được thêm vào bản nháp cấu hình cloud, nhưng lưu bản nháp chưa áp dụng mạng cho máy đang chạy. Cần Review/Save rồi Publish môi trường; sau khi chính sách thực sự áp dụng, kiểm tra lại kết nối dự án và registry. Tài liệu/changelog trực tiếp cũng bị chặn; hướng dẫn auth/RLS được đối chiếu bằng tài liệu trong repository Supabase chính thức, chưa kiểm tra được changelog đang xuất bản.

## Agent kết nối và áp dụng tự động

Yêu cầu quyền hiện đã được khai báo an toàn trong cài đặt môi trường: `SUPABASE_ACCESS_TOKEN`, chỉ gửi đến `api.supabase.com`. Tạo **scoped personal access token** giới hạn dự án `msucrkkxuplgijxanzxu`, cấp **Database Read/Write**, **Project Settings Read/Write** và **Auth Read/Write** cho việc áp dụng schema và cấu hình Auth. Nhập ở cài đặt bảo mật; không gửi token vào chat, Git hay biến `VITE_*`.

```bash
npm run supabase:plan    # Không cần token; hiện ref, phiên bản và SHA-256 SQL được áp dụng
npm run supabase:status  # Chỉ đọc trạng thái project/schema/history, không đọc dữ liệu khách
npm run supabase:apply   # Áp dụng schema + history nguyên tử, rồi cấu hình/kiểm tra Auth và advisor
```

Script dùng Management API chính thức qua HTTPS với proxy của môi trường (Node 24 `--use-env-proxy`), đối chiếu project ref, từ chối schema đã tồn tại mà không có history khớp, và lưu đúng phiên bản/source vào `supabase_migrations.schema_migrations` trong cùng giao dịch. Chạy lại chỉ bỏ qua SQL khi history khớp chính xác. Không drop/ghi đè dữ liệu đang có; schema collision cần xem xét thủ công. Bộ `npm run test:deployment` kiểm tra tính nguyên tử, history, chống áp dụng lặp và bảo toàn bảng đang tồn tại bằng PostgreSQL cục bộ.

Cấu hình Auth được chuẩn bị cho Site URL `https://maokihousemvc.vercel.app`, các redirect `/admin` và `/admin?invite=*`; giữ những redirect đã có. Script xác minh lại giá trị sau khi lưu. Nếu schema đã áp dụng nhưng quyền Auth còn thiếu, bổ sung scope rồi chạy lại để hoàn tất phần Auth.

Management API `database/query` đang được Supabase đánh dấu beta/experimental trong OpenAPI đã đọc; script dừng rõ ràng khi HTTP lỗi, không ghi token/response body vào log và không retry SQL write mù quáng. Nguồn API: [OpenAPI chính thức](https://github.com/supabase/supabase/blob/master/apps/docs/spec/api_v1_openapi.json), [scoped tokens](https://supabase.com/docs/guides/platform/personal-access-tokens).

Bản build frontend có cấu hình publishable công khai đúng dự án tại `src/config/supabase.public.ts`; env Vite vẫn có thể ghi đè. Cấu hình công khai này chỉ khởi tạo browser SDK, không cấp quyền chạy migration. Chưa có Vercel admin token trong môi trường; push lên main không tự chứng minh một deployment Vercel đã thành công.
