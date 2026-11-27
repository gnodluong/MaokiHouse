# Maoki Admin (desktop)

Ứng dụng Electron độc lập cho bảng quản trị. Dùng lại các trang trong `src/workspace`; vỏ giao diện, đăng nhập,
chủ đề và ngôn ngữ nằm trong `desktop/renderer`. Dữ liệu đi thẳng tới Supabase (cùng dự án với website).

```bash
npm run desktop:dev     # chạy thử có hot reload
npm run desktop:start   # build giao diện rồi mở app
npm run desktop:dist    # đóng gói bộ cài vào release/ (build trên đúng hệ điều hành đích)
```

- **Giao diện**: Sáng / Tối / Theo hệ thống (mặc định) và 7 tông màu nhấn, chọn tại *Giao diện & ngôn ngữ*.
- **Ngôn ngữ**: Tiếng Việt / English, đổi tức thì (nút VI·EN trên thanh trên).
  Vỏ ứng dụng dùng `i18n/ui.ts`; các trang dùng chung được dịch lúc chạy từ `i18n/phrases.ts` — chuỗi chưa có trong bảng giữ nguyên tiếng Việt.
- **Máy chủ API**: Kết nối kênh, tin nhắn và đồng bộ đánh giá gọi `/api/*` của bản website đã triển khai; nhập địa chỉ đó trong *Giao diện & ngôn ngữ*.
