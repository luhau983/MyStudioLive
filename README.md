# StudioLive

[English](README.en.md) | **Tiếng Việt**

[![Release](https://img.shields.io/github/v/release/tanthuan031/StudioLive)](https://github.com/tanthuan031/StudioLive/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)

App máy tính tạo **cảnh tương tác cho TikTok LIVE**, chạy hoàn toàn trên máy của bạn. Mã nguồn mở, miễn phí — ai cũng có thể tải về dùng hoặc phát triển thêm.

> ⚠️ **Đọc [Tuyên bố miễn trừ trách nhiệm](DISCLAIMER.md) trước khi dùng.** Nghiêm cấm dùng StudioLive để lừa đảo, trục lợi, lợi dụng tín ngưỡng hay livestream vi phạm pháp luật.

![Bảng điều khiển](docs/screenshots/dashboard.png)

## Tính năng

- **👻 Live Ma Online** — người xem hoá ma, gõ `hù` / `trốn` / `tìm` / `bùa` / `gọi hồn` / `tắt đèn`… để chơi với nhau; quà lớn gọi Bà Ma + jumpscare; vòng TRỐN TÌM định kỳ.
- **🪷 Đi Chùa Online** — chánh điện; người xem ngồi bồ đoàn, gõ `adidaphat` lên thắp hương; quà làm sen vàng nở, giọng đọc cảm ơn và chúc; thả tim đủ mục tiêu thì mưa hoa sen.
- **🎬 Rạp Phim Online** — phòng chiếu phim; người xem được chào, vào ghế ngồi; chiếu danh sách phim (link YouTube, .mp4/.webm hoặc file trên máy); lệnh `vỗ tay` / `haha` / `wow` / `bắp`; quà = ghế VIP; đủ tim = mưa bắp rang. 4 kiểu phòng: Cổ điển, VIP Gold, IMAX, Gia đình.

Mở tab nào thì cảnh đó chạy trên live.

| 👻 Live Ma Online | 🪷 Đi Chùa Online | 🎬 Rạp Phim Online |
|---|---|---|
| ![Live Ma Online](docs/screenshots/live-ma-online.png) | ![Đi Chùa Online](docs/screenshots/di-chua-online.png) | ![Rạp Phim Online](docs/screenshots/rap-phim-online.png) |

## Tải & cài đặt (người dùng)

Tải bản cài sẵn tại **[Releases v1.0.0](https://github.com/tanthuan031/StudioLive/releases/tag/v1.0.0)**:

| Máy | File tải |
|---|---|
| Mac chip Apple (M1, M2, M3, M4…) | [`StudioLive-1.0.0-mac-arm64.dmg`](https://github.com/tanthuan031/StudioLive/releases/download/v1.0.0/StudioLive-1.0.0-mac-arm64.dmg) |
| Mac chip Intel | [`StudioLive-1.0.0-mac-x64.dmg`](https://github.com/tanthuan031/StudioLive/releases/download/v1.0.0/StudioLive-1.0.0-mac-x64.dmg) |
| Windows 10/11 64-bit | [`StudioLive-Setup-1.0.0-win-x64.exe`](https://github.com/tanthuan031/StudioLive/releases/download/v1.0.0/StudioLive-Setup-1.0.0-win-x64.exe) |

Không biết Mac chip gì: bấm  → **Giới thiệu về máy Mac** — “Chip: Apple M…” là chip Apple, “Bộ xử lý: Intel…” là chip Intel.

### macOS (12 trở lên)

1. Mở file `.dmg`, **kéo StudioLive vào thư mục Applications**.
2. Vào **Applications**, **chuột phải (Control + bấm) vào StudioLive → Mở → Mở**. App chưa ký số Apple nên lần đầu macOS hỏi lại, chỉ cần làm một lần.
3. Vẫn bị chặn: **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Vẫn mở (Open Anyway)**.
4. Báo **“StudioLive bị hỏng và không thể mở”**: mở **Terminal**, chạy lệnh rồi mở lại app:

   ```bash
   xattr -cr /Applications/StudioLive.app
   ```

### Windows

1. Chạy `StudioLive-Setup-1.0.0-win-x64.exe` → chọn thư mục → **Install**.
2. Nếu hiện **“Windows đã bảo vệ PC của bạn”** (SmartScreen, do app chưa ký số): bấm **More info → Run anyway**.
3. Mở **StudioLive** từ Desktop hoặc menu Start.

### Lên live lần đầu

1. **Chọn cảnh**: bấm tab 👻 Ma / 🪷 Chùa / 🎬 Rạp ở menu trái.
2. **Thêm vào TikTok LIVE Studio**: khung **dọc**, thêm nguồn **Link** `http://lvh.me:3000`, kích thước **1080 × 1920**, kéo phủ kín khung. (LIVE Studio không nhận `localhost`; `lvh.me` luôn trỏ về chính máy bạn.)
3. Bấm **Go LIVE** trên TikTok LIVE Studio.
4. **Kết nối**: ở Bảng điều khiển nhập username TikTok (không cần @) → **Kết nối**.

Chưa live vẫn thử được bằng các nút **Gửi thử** trong từng tab. Hướng dẫn đầy đủ (chất lượng hình, OBS, mẹo khi live, xử lý lỗi): **[docs/HUONG-DAN-CAI-DAT.md](docs/HUONG-DAN-CAI-DAT.md)**.

## Chạy từ mã nguồn (nhà phát triển)

Cần **Node.js 18+** và **git**.

```bash
git clone https://github.com/tanthuan031/StudioLive.git
cd StudioLive
npm install
npm start
```

Đóng gói bản cài (không ký số):

```bash
npm run dist:mac   # .dmg + .zip cho arm64 và x64
npm run dist:win   # bộ cài NSIS x64
```

Chi tiết: [docs/BUILD.md](docs/BUILD.md).

### Cấu trúc

```
src/main.js       Tiến trình chính: cửa sổ, IPC, dữ liệu thử, tự kiểm tra (STUDIO_SELFTEST)
src/live.js       Quản lý kết nối TikTok, chuẩn hoá sự kiện, tự kết nối lại
src/direct.js     Đọc sự kiện qua trình duyệt ẩn + giải mã protobuf (tiktok-live-connector 2.0.0, MIT)
src/server.js     Server overlay Express + Socket.IO (chỉ 127.0.0.1) + giọng đọc /api/tts
src/tts.js        Giọng đọc tiếng Việt (Microsoft Edge, dự phòng Google)
src/settings.js   Lưu cài đặt trong thư mục userData
renderer/         Giao diện điều khiển
overlay/          Trang hiển thị trên live: game.js (Nhà Ma), temple.js (Đi Chùa), rap.js (Rạp Phim), faces.js, audio.js
overlay/chua-assets/  Ảnh, nhân vật, hiệu ứng, nhạc của cảnh Đi Chùa
build/icon.png    Icon app
```

Cài đặt người dùng lưu tại `~/Library/Application Support/StudioLive/settings.json` (macOS), `%APPDATA%\StudioLive\settings.json` (Windows).

> Lưu ý: giữ `tiktok-live-connector` ở **2.0.0** (MIT). Các bản mới hơn dùng giấy phép AGPL-3.0.

### Đóng góp

Chào mừng mọi đóng góp: fork repo → tạo nhánh → commit → mở Pull Request. Báo lỗi hoặc đề xuất tính năng tại [Issues](https://github.com/tanthuan031/StudioLive/issues).

## Giấy phép & miễn trừ trách nhiệm

- Mã nguồn phát hành theo giấy phép **[MIT](LICENSE)** — © 2026 [Tanthuan031](https://github.com/tanthuan031).
- Thư viện & tài nguyên bên thứ ba giữ giấy phép riêng: [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md).
- **[DISCLAIMER.md](DISCLAIMER.md)** — phần mềm chỉ phục vụ giải trí, học tập. Người dùng tự chịu hoàn toàn trách nhiệm về nội dung livestream; tác giả không chịu trách nhiệm cho mọi hành vi lừa đảo, trục lợi, lợi dụng tín ngưỡng, vi phạm bản quyền hay vi phạm pháp luật của người sử dụng. StudioLive không liên kết với TikTok / ByteDance.

## Tác giả

** Tanthuan031 **
### GitHub: [@tanthuan031](https://github.com/tanthuan031)
### Website: https://thuantech.com
### Facebook: https://www.facebook.com/thuanht31
### Tiktok: https://www.tiktok.com/@rv.dev
