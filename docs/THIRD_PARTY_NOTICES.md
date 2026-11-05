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
| three (Kéo Co Online, Live Bar) | MIT | Copyright (c) 2010-2023 three.js authors |
| ws (Kéo Co Online) | MIT | Copyright (c) 2011 Einar Otto Stangvik and contributors |
| react, react-dom (Cưới Liền Tay, đóng gói vào `cuoi/dist`) | MIT | Copyright (c) Meta Platforms, Inc. and affiliates |

Lưu ý: các phiên bản `tiktok-live-connector` **mới hơn 2.0.0** và `tiktok-live-proto` dùng giấy phép **AGPL-3.0**. Không nâng cấp lên các bản đó để StudioLive giữ được giấy phép MIT.

## Tài nguyên & mã tham khảo

### Kéo Co Online — âm thanh sân đấu (`keoco/assets/`)

Nguồn và giấy phép từng file ghi trong `keoco/assets/match-audio-SOURCES.md` và `keoco/assets/crowd-cheer-SOURCE.md` (CC0 và Mixkit Sound Effects Free License — tiếng còi chỉ dùng trong game, không phân phối lại thành gói âm thanh riêng). Kéo Co trong StudioLive dùng chung kết nối TikTok của app (`tiktok-live-connector` 2.0.0), không kèm bản 2.5.0 (AGPL) mà game bản độc lập dùng.

### Live Bar — luật chơi & cấu hình quà (`overlay/bar/`)

Luật chơi (từ khoá vào sàn, lệnh chat, bảng quà theo tên / theo kim cương, cấp tiến hoá, PARTY ENERGY, combo, bục TOP 3, bố trí đám đông) được chuyển thể từ [tiktok-live-bar](https://github.com/cherry9001/tiktok-live-bar), giấy phép MIT:

> Copyright (c) 2025 ÔNG CHÚ MMO — https://ongchummo.com
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

Cảnh 3D được viết lại bằng three.js. MyStudioLive **có đi kèm** tài nguyên gốc của dự án trong `overlay/bar/assets` (bộ 33 GIF nhân vật, model DJ `Megan_DJ.fbx`, tiếng pháo hoa) cùng bản giấy phép MIT gốc (`UPSTREAM_LICENSE`) và ghi chú nguồn gốc (`README.md`). Lưu ý: giấy phép MIT của repo gốc không chắc bao trùm các file này — bộ GIF lấy từ Weibo, file tiếng pháo hoa không ghi nguồn, model DJ là nhân vật Mixamo (Adobe cho dùng trong dự án nhưng không cho phân phối lại file gốc riêng lẻ). Người dùng có thể tắt từng loại (nhân vật / DJ vẽ bằng code, tiếng tự tổng hợp) hoặc xoá thư mục `overlay/bar/assets`, và tự chịu trách nhiệm về quyền sử dụng khi phát live.

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

### Trà Đá Vỉa Hè & Đi Nhậu Online — ảnh nền đường phố (`overlay/trada-assets/`, `overlay/nhau-assets/`)

Ảnh lấy từ Wikimedia Commons, bản thu nhỏ 1280px, nội dung file không chỉnh sửa. Khi hiển thị, cảnh cắt khung, làm mờ (Đi Nhậu làm mờ mạnh + tối màu) và vẽ bàn ghế, nhân vật lên trên.

| File | Ảnh gốc | Tác giả | Giấy phép |
|---|---|---|---|
| `overlay/trada-assets/street.jpg` | [Quán trà đá, Giang Văn Minh, Hà Nội 001.JPG](https://commons.wikimedia.org/wiki/File:Qu%C3%A1n_tr%C3%A0_%C4%91%C3%A1,_Giang_V%C4%83n_Minh,_H%C3%A0_N%E1%BB%99i_001.JPG) | Phan Minh Tuấn | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `overlay/nhau-assets/street.jpg` | [Bia hoi outlet in Hanoi.jpg](https://commons.wikimedia.org/wiki/File:Bia_hoi_outlet_in_Hanoi.jpg) | ben klocek | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |

Hai file ảnh này giữ giấy phép gốc ở trên (không thuộc giấy phép MIT của mã nguồn). Nhân vật, bàn ghế, đồ uống, hiệu ứng và âm thanh của hai cảnh được vẽ / tổng hợp bằng code trong `overlay/quan.js` và `overlay/audio.js`.

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

### Cưới Liền Tay (`cuoi/`)

Mã nguồn cảnh lấy từ [workaipvlinh-byte/cuoi-lien-tay](https://github.com/workaipvlinh-byte/cuoi-lien-tay), giấy phép MIT, Copyright (c) 2026 PVLinh-workingAI; bản giấy phép gốc đi kèm ở `cuoi/LICENSE`. MyStudioLive thay server riêng bằng `cuoi/server.mjs` dùng chung kết nối TikTok của app. Sảnh, nhân vật, chó mèo và nhạc nền đều dựng bằng code, không có file ảnh / âm thanh.

## Dịch vụ trực tuyến

- Giọng đọc (chế độ Đi Chùa): dịch vụ Read Aloud của Microsoft Edge qua `msedge-tts`, dự phòng Google Translate TTS. Đây không phải API chính thức cho mục đích này và có thể bị giới hạn.
- Đọc sự kiện TikTok: trang web công khai của TikTok, đọc ngay trên máy người dùng.

## Giao diện

- **TailAdmin Free Tailwind Dashboard Template** — MIT, Copyright (c) 2023 TailAdmin. Theme và utilities nhúng tại `renderer/tailadmin/tailadmin.css`; class của các component (button, input, card, badge, alert, toggle, tab, menu) chép từ các partial của TailAdmin vào `renderer/tailadmin/app.css`. `vua/studio-theme.css` dùng cùng bảng màu.
- **Tailwind CSS** v4, **@tailwindcss/forms**, **tw-animate-css** — MIT. Chỉ dùng lúc build (`npm run build:css` → `renderer/app.css`).
- Font **Plus Jakarta Sans** (`renderer/fonts/`, `vua/fonts/`) — SIL Open Font License 1.1, Copyright 2020 The Plus Jakarta Sans Project Authors. Toàn văn giấy phép: `renderer/fonts/OFL.txt`.
