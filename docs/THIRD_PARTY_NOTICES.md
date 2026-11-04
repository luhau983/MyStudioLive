# Thông báo bên thứ ba

StudioLive sử dụng các thư viện và tài nguyên sau. Mọi thư viện đi kèm bản phát hành đều dùng giấy phép cho phép sử dụng thương mại (MIT, ISC, BSD, Apache-2.0, BlueOak-1.0.0, 0BSD). Không có thư viện GPL/AGPL.

## Thư viện chính

| Thư viện | Giấy phép | Bản quyền |
|---|---|---|
| Electron | MIT | Copyright (c) Electron contributors |
| express | MIT | Copyright (c) 2009-2014 TJ Holowaychuk |
| socket.io | MIT | Copyright (c) 2014-present Guillermo Rauch and Socket.IO contributors |
| msedge-tts | MIT | Copyright (c) 2023 Migushthe2nd |
| tiktok-live-connector **2.0.0** | MIT | Copyright (c) 2022 zerodytrash |
| protobufjs | BSD-3-Clause | Copyright (c) 2016, Daniel Wirtz |
| axios | MIT | Copyright (c) 2014-present Matt Zabriskie & Collaborators |
| three (Kéo Co Online) | MIT | Copyright (c) 2010-2023 three.js authors |
| ws (Kéo Co Online) | MIT | Copyright (c) 2011 Einar Otto Stangvik and contributors |

Lưu ý: các phiên bản `tiktok-live-connector` **mới hơn 2.0.0** và `tiktok-live-proto` dùng giấy phép **AGPL-3.0**. Không nâng cấp lên các bản đó để StudioLive giữ được giấy phép MIT.

## Tài nguyên & mã tham khảo

### Kéo Co Online — âm thanh sân đấu (`keoco/assets/`)

Nguồn và giấy phép từng file ghi trong `keoco/assets/match-audio-SOURCES.md` và `keoco/assets/crowd-cheer-SOURCE.md` (CC0 và Mixkit Sound Effects Free License — tiếng còi chỉ dùng trong game, không phân phối lại thành gói âm thanh riêng). Kéo Co trong StudioLive dùng chung kết nối TikTok của app (`tiktok-live-connector` 2.0.0), không kèm bản 2.5.0 (AGPL) mà game bản độc lập dùng.

### Chánh Điện Online — hình ảnh, nhân vật, hiệu ứng, nhạc nền (`overlay/chua-assets/`)

Theo README của dự án: hình ảnh được tạo bằng Google Flow, nhạc nền tạo bằng Gemini. Hãy kiểm tra điều khoản của các dịch vụ đó trước khi dùng thương mại, hoặc thay bằng tài nguyên của bạn (giữ nguyên tên file).

```
MIT License

Copyright (c) 2026 Kent Juno

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Đi Chùa Online — ý tưởng tính năng và phần giọng đọc (`src/tts.js`)

```
MIT License

Copyright (c) 2026 PVLinh-workingAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Icon giao diện — Lucide (`renderer/index.html`, sprite SVG nhúng)

Nguồn: https://lucide.dev (lucide-static 1.68.0). Giấy phép ISC.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Dịch vụ trực tuyến

- Giọng đọc (chế độ Đi Chùa): dịch vụ Read Aloud của Microsoft Edge qua `msedge-tts`, dự phòng Google Translate TTS. Đây không phải API chính thức cho mục đích này và có thể bị giới hạn.
- Đọc sự kiện TikTok: trang web công khai của TikTok, đọc ngay trên máy người dùng.

## Giao diện

- **TailAdmin Free Tailwind Dashboard Template** — MIT, Copyright (c) 2023 TailAdmin. Theme và utilities nhúng tại `renderer/tailadmin/tailadmin.css`; class của các component (button, input, card, badge, alert, toggle, tab, menu) chép từ các partial của TailAdmin vào `renderer/tailadmin/app.css`. `vua/studio-theme.css` dùng cùng bảng màu.
- **Tailwind CSS** v4, **@tailwindcss/forms**, **tw-animate-css** — MIT. Chỉ dùng lúc build (`npm run build:css` → `renderer/app.css`).
- Font **Plus Jakarta Sans** (`renderer/fonts/`, `vua/fonts/`) — SIL Open Font License 1.1, Copyright 2020 The Plus Jakarta Sans Project Authors. Toàn văn giấy phép: `renderer/fonts/OFL.txt`.
