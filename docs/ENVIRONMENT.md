# Môi trường phát triển và REA

Dùng checkout hiện có `/workspace/MaokiHouse`; task cloud đã được cô lập nên không cần tạo worktree. Các thay đổi ứng dụng ở task này được người dùng duyệt riêng sau khi hoàn tất onboarding ban đầu.

## Cài đặt và khởi động lại

Node 24.19.0, npm 11.9.0, Java 21 và Chromium hệ thống đã có trong máy được kiểm tra. Dependency ứng dụng được khóa bằng `package-lock.json`; Firebase tools 15.34.0 có lockfile riêng trong `/workspace/.maokihouse/tools`.

```bash
bash /workspace/.maokihouse/install.sh
bash /workspace/.maokihouse/start.sh
```

Lệnh cài chạy npm ci, dùng lại cache emulator khi SHA-256 khớp metadata chính thức (chỉ tải khi thiếu/sai), đăng ký/kiểm tra REA phiên bản cố định, build, lint và kiểm tra database. Lệnh start giữ phiên chạy lâu dài cho Auth/RTDB/Firestore Emulator, Express và Vite, kiểm tra readiness thật rồi báo sẵn sàng. Log ở `/workspace/.maokihouse/logs`. Chỉ dừng các process do script này tạo; không giết dịch vụ có sẵn để giải quyết xung đột cổng.

Supabase là chế độ mặc định của ứng dụng, dùng hai biến Vite trong `.env` hoặc môi trường. Nút “Mở không gian demo” chọn Auth/Firestore Emulator với project `demo-maokihouse`. Demo và Supabase không tự sao chép dữ liệu hay tự chuyển qua nhau khi kết nối lỗi. Liên kết công khai của demo có `?demo=1` và chỉ được chấp nhận trong bản phát triển.

Nếu chỉ làm việc với Supabase, chạy `npm run dev`; Express và Firebase Emulator không cần thiết. Phải áp dụng migration lên dự án theo [SUPABASE.md](SUPABASE.md) để thử backend đang host.

Script demo bỏ proxy chỉ cho tiến trình Firebase CLI/API vì chúng bỏ qua NO_PROXY cho loopback, đồng thời bỏ credential Google kế thừa khỏi tiến trình demo. Cài đặt vẫn giữ proxy, TLS và checksum. Các file/dependency có thể được lưu trong snapshot; process luôn cần khởi động lại. Không tạo link preview localhost trong giao diện cloud onboarding.

## REA đã kiểm tra

- Cài bằng `npx rea-agents@latest setup --client codex --yes --json`, giải ra 6.5.0 sau khi người dùng duyệt kế hoạch.
- Codex registration thực tế tại `$CODEX_HOME/config.toml`; không đổi CODEX_HOME sang thư mục giả. Skill tại `/home/agent/.agents/skills/reverse-engineer-anything`.
- Scoped doctor trả `healthy: true`; các provider native tùy chọn không có và không cần cho JavaScript.
- Kiểm tra stdio MCP thành công: protocol 2025-06-18, server REA 6.5.0, 207 tools, có JavaScript analysis và lời gọi session thành công.
- Static analysis đã chạy trên JavaScript build MaokiHouse. Đây là kiểm tra khả năng phân tích artifact, không chứng minh backend của website tham chiếu đã được sao chép.
- Phiên chat hiện tại chưa nạp REA vào danh sách tool gốc. Kết nối lại/restart coding agent để nạp MCP server, rồi xác nhận tool discovery. CLI dùng được trong phiên hiện tại.

Lệnh kiểm tra lại:

```bash
npm_config_cache=/workspace/.cache/npm npx --yes rea-agents@6.5.0 doctor --client codex --skill --json
```

REA setup cần ghi cấu hình agent và skill ngoài checkout; trong sandbox hạn chế, dùng cơ chế escalation được hỗ trợ. Không tự đổi HOME/CODEX_HOME để né quyền ghi. Script cài lại sẽ giữ các phần cấu hình khác của agent qua cơ chế setup của REA.

## Trạng thái xác minh

Build đầy đủ frontend/backend TypeScript và lint đều đã qua; lỗi cấu hình lint/type của repository cũ đã được sửa trong phạm vi coding được duyệt. Database có 39 kiểm tra, luồng demo có 14 kiểm tra Chromium, adapter Supabase/khả năng truy cập có 14 kiểm tra với Auth giả lập và PostgreSQL cục bộ. Chưa kiểm tra tài khoản thật, database thật, triển khai production hay API bên ngoài.

Các miền phục vụ website tham chiếu và Supabase/registry đã được lưu cộng thêm vào allowlist có sẵn. Bản nháp lưu thành công không thay đổi mạng máy hiện tại và không Publish tự động. Review/Save và Publish trong cài đặt môi trường để lưu snapshot/cấu hình. Chưa xác minh một task mới khôi phục lại snapshot.

## Cập nhật 18/10/2026

Đã đối chiếu QloApps/Chatwoot và lưu `docs/PRODUCT_COMPARISON.md`. Bản build production không có `.env` được kiểm tra bằng SDK + PostgreSQL cục bộ và 14 kiểm tra giao diện/khả năng truy cập; Auth được giả lập trong bài kiểm tra này. `npm test` hiện gồm 39 kiểm tra nghiệp vụ/RLS và 3 kiểm tra triển khai nguyên tử/history/chống ghi đè. Website thật được người dùng xác nhận là `https://maokihousemvc.vercel.app/`.

Có các lệnh `supabase:plan`, `supabase:status`, `supabase:apply` để áp dụng và xác minh với token quản trị giới hạn dự án. Chưa có token này trong phiên; quyền quản trị được khai báo an toàn trong draft, không có giá trị bí mật trong repository. Xem phạm vi quyền trong `docs/SUPABASE.md`.
