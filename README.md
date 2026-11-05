<p align="center">
  <img src="build/icon.png" alt="MyStudioLive" width="120">
</p>

<h1 align="center">MyStudioLive</h1>

<p align="center">
  <a href="README.en.md">English</a> | <b>Tiếng Việt</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-45-47848f" alt="Electron 45">
</p>

App máy tính tạo **cảnh tương tác cho TikTok LIVE**: người xem bình luận, thả tim, tặng quà là cảnh trên live phản ứng ngay. Chạy hoàn toàn trên máy của bạn, không cần server ngoài.

MyStudioLive phát triển tiếp từ [StudioLive](https://github.com/tanthuan031/StudioLive) của Tanthuan031 (MIT), bổ sung hai game **Vua Tiếng Việt** và **Kéo Co Online**, giao diện sáng/tối và nhận diện mới.

> ⚠️ **Đọc [Tuyên bố miễn trừ trách nhiệm](DISCLAIMER.md) trước khi dùng.** Nghiêm cấm dùng app để lừa đảo, trục lợi, lợi dụng tín ngưỡng hay livestream vi phạm pháp luật. MyStudioLive không liên kết với TikTok / ByteDance.

![Bảng điều khiển](docs/screenshots/dashboard.png)

## Các cảnh

Mở tab nào ở menu trái thì cảnh đó chạy trên live. Mọi cảnh dùng chung **một kết nối TikTok** ở Bảng điều khiển.

| Cảnh | Người xem làm gì | Điểm nhấn |
|---|---|---|
| 👻 **Live Ma Online** | Gõ `hù` / `trốn` / `tìm` / `bùa` / `gọi hồn` / `tắt đèn`… | Mỗi người là một con ma; quà lớn gọi Bà Ma + jumpscare; vòng TRỐN TÌM định kỳ |
| 🪷 **Đi Chùa Online** | Gõ `adidaphat` để lên thắp hương | Chánh điện, giọng đọc cảm ơn và chúc; quà làm sen vàng nở; đủ tim thì mưa hoa sen |
| 🎬 **Rạp Phim Online** | Gõ `vỗ tay` / `haha` / `wow` / `bắp` | Chiếu playlist YouTube, link .mp4/.webm hoặc file trên máy; quà = ghế VIP; 4 kiểu phòng |
| 👑 **Vua Tiếng Việt** | Comment đáp án ô chữ bị xáo | Giảng đường 3D, cô giáo đọc lời dẫn; ai đúng đầu tiên là MVP; 550+ câu, import thêm được |
| 🪢 **Kéo Co Online** | Comment `ĐỎ` / `XANH` để vào đội, thả tim để kéo | Sân kéo co 3D, 5 người mỗi đội, bot bù chỗ; quà cộng điểm kéo và nạp mana |
| 🪩 **Live Bar** | Gõ `hey` để vào sàn, `dance` / `nhảy` / `đi vòng` / `đổi nv` | Sàn nhảy 3D với avatar TikTok thật; quà zoom camera, đèn rọi, danh hiệu, pháo hoa; TOP 3 lên bục DJ |
| 🧊 **Trà Đá Vỉa Hè** | Gõ `trà đá` / `cà phê` / `coca` / `bò húc` / `hướng dương` / `bánh mì` / `tính tiền` | Quán vỉa hè, mỗi người một nhân vật ngồi ghế nhựa; bà chủ bưng món ra tận bàn; quà lớn thành đại ca bao cả quán |
| 🍺 **Đi Nhậu Online** | Gõ `bia` / `dzô` / `lạc` / `mực` / `lẩu` / `tính tiền` | Quán nhậu đêm 6 bàn × 4 ghế; cả bàn cụng ly, uống nhiều thì đỏ mặt rồi gục; bảng vàng bợm nhậu; quà lớn bao cả quán |
| 🚦 **Đèn Xanh Đèn Đỏ** | Thả tim / comment để vào sân, thả tim hoặc `chạy` để tiến | Đèn đỏ mà cử động là bị loại (có ân hạn bù độ trễ TikTok); quà = khiên + lao lên; bot thử nghiệm |
| ⚔️ **Đánh Boss** | Thả tim = đánh, `đánh` = đòn mạnh, `né` khi boss gồng chiêu | Cả live cùng hạ Quái Vương Đá; không né mất tim, hết tim thì gục; quà = chí mạng / hồi sinh; BXH sát thương |
| 🔮 **Thả Bi** | Comment `thả` hoặc thả tim để thả bi | Bàn Plinko, bi nảy qua chốt vào ô ×½ đến ×50 (JACKPOT ở mép); quà = bi vàng nhân điểm; BXH điểm theo ván |
| 🏝️ **Đảo Sinh Tồn** | Comment để nhảy dù lên đảo, ra lệnh `trốn` / `xông` / `hồi`, thả tim hồi máu | Battle royale 3D: bão thu hẹp 4 vòng, người bị loại comment `bão 1/2/3` chọn tâm bão; quà = khiên, hòm tiếp tế, hồi sinh, mưa thiên thạch |
| 💍 **Cưới Liền Tay** | Comment để vào sảnh cưới, `cưới vợ @tên` / `cưới chồng @tên` để cầu hôn, `đồng ý` / `không` để trả lời | Tiệc cưới 3D, 2 MC dẫn bằng giọng đọc; tặng từ 30 xu = cướp dâu / cướp rể; `se duyên`, `đấm @tên`, `quẩy`, `zô`; 300 tim cả sảnh quẩy |

| 👻 Live Ma Online | 🪷 Đi Chùa Online | 🎬 Rạp Phim Online | 👑 Vua Tiếng Việt |
|---|---|---|---|
| ![Live Ma Online](docs/screenshots/live-ma-online.png) | ![Đi Chùa Online](docs/screenshots/di-chua-online.png) | ![Rạp Phim Online](docs/screenshots/rap-phim-online.png) | ![Vua Tiếng Việt](docs/screenshots/vua-tieng-viet.png) |

### 👑 Vua Tiếng Việt

- Bảng hiện các chữ cái bị xáo kèm gợi ý; người xem **comment nguyên đáp án**, không cần lệnh hay đăng ký. Đáp án không dấu cũng được tính (tắt được).
- Người đúng đầu tiên là **MVP** (mặc định +100 điểm); mỗi lần host mở thêm một chữ, điểm giảm 20 (tối thiểu 10).
- Người vào live được xếp ghế trong giảng đường (tối đa 50 chỗ); tên và câu trả lời hiện cạnh chỗ ngồi.
- Độ khó **Thường / Khó / Trộn**; import thêm câu hỏi bằng file JSON (có file mẫu trong bảng điều khiển).
- Có **chế độ chơi thử**: giả lập người vào, bình luận, tặng quà mà không cần lên live.
- Nhạc nền khi làm bài (link YouTube hoặc nhạc mặc định), tự giảm khi cô giáo nói.

### 🪩 Live Bar

- Người xem gõ từ khoá (mặc định `hey`) hoặc tặng quà để bước lên sàn nhảy; chế độ "mọi người tương tác" cho ai bình luận cũng vào sàn. Tối đa 400 người, im lặng 10 phút thì rời sàn; khách ảo giữ sàn không trống.
- Lệnh chat: `dance` nhảy, `nhảy` bật nhảy, `đi vòng` dạo quanh sàn, `đổi nv` đổi nhân vật.
- Quà theo tên: Hoa hồng zoom camera, TikTok đổi nhân vật, Finger Heart đi vòng, Portal hoá khổng lồ, Galaxy lên TOP DJ + pháo hoa. Quà khác theo kim cương: 20 camera, 50 danh hiệu VUA SÀN NHẢY, 100–200 VIP camera + đèn rọi, 500+ mưa pháo hoa.
- Tặng nhiều thì nhân vật tiến hoá (10 / 50 / 200 / 1000 💎); TOP 3 người tặng đứng trên bục trước bàn DJ, hạng nhất có vương miện.
- Thanh PARTY ENERGY đầy: cả sàn cùng quẩy, drop đèn laser, bắn pháo hoa. Có nền xanh lá để ghép trong OBS.
- **Master Rules**: tự đặt luật "quà / từ khoá chat → hành động" (zoom, VIP, danh hiệu, khổng lồ, pháo hoa…) ngay trong tab, xét trước bảng quà mặc định; bấm vào quà vừa nhận để tạo luật theo Gift ID.
- Màn LED sau bàn DJ phát ảnh hoặc video của bạn (mặc định là màn LED nhảy theo nhạc); nhạc nền chọn file trên máy.
- **Tài nguyên gốc đi kèm**: mặc định Live Bar dùng nguyên bộ 33 nhân vật GIF, model DJ 3D `Megan_DJ.fbx` (có điệu nhảy) và tiếng pháo hoa của tiktok-live-bar (`overlay/bar/assets`, xem README trong đó về nguồn gốc). Mỗi người xem nhận một nhân vật động, `đổi nv` để đổi.
- Trong tab Live Bar đổi được sang thư mục nhân vật / model `.fbx` `.glb` / file tiếng pháo hoa của bạn, hoặc bấm "Vẽ bằng code" / "Tự tổng hợp" để không dùng tài nguyên gốc. Bộ GIF (Weibo), model Mixamo và tiếng pháo hoa không có giấy phép rõ ràng — tự kiểm tra trước khi live thương mại.
- Chuyển thể luật chơi từ [tiktok-live-bar](https://github.com/cherry9001/tiktok-live-bar) (MIT); cảnh 3D viết lại bằng three.js, chạy như các cảnh khác (một link cho LIVE Studio / OBS).

### 🪢 Kéo Co Online

- Hai đội ĐỎ – XANH, mỗi đội 5 người trên sân; người đến sau xếp hàng chờ trên khán đài và được luân phiên lên sân.
- Mỗi tim = 1 điểm kéo (×2 trong 10 giây cuối hiệp chính); quà cộng thẳng điểm kéo theo số kim cương và nạp mana cho đội.
- Vòng mặc định: sắp đội 5s → đếm ngược 3s → kéo 45s → kết quả 10s; hòa thì có hiệp phụ. Chỉnh được trong bảng điều khiển.
- Người im lặng lâu trên sân tự xuống khán đài; comment hoặc thả tim là quay lại.

### 🧊 Trà Đá Vỉa Hè & 🍺 Đi Nhậu Online

- Người bình luận lần đầu được xếp một ghế (Trà Đá 20 chỗ, Đi Nhậu 24 chỗ) với nhân vật chibi cố định theo tài khoản; hết chỗ thì khách giả lập, rồi người im lặng lâu nhất nhường ghế.
- Gõ tên món là gọi: bà chủ / anh phục vụ bưng ra tận bàn, khách tự nhấp từng ngụm. Bình luận thường hiện thành bong bóng thoại trên đầu nhân vật. Gõ `tính tiền` để đứng dậy về.
- **Đi Nhậu**: `dzô` (hoặc `100%`, `cạn ly`…) làm cả bàn cụng ly, ai có bia thì uống cạn; mỗi cốc cạn +1 vào **Bảng vàng bợm nhậu**. Uống nhiều thì đỏ mặt, nấc, lắc lư, quá chén thì gục xuống bàn một lúc. Màn hình luôn có dòng nhắc *Đã uống rượu bia — không lái xe*.
- Quà nhỏ: món + đồ uống miễn phí; quà từ 10 💎: cả bàn được mời (bò húc + bánh mì / lẩu); quà từ ngưỡng **quà lớn**: người tặng thành đại ca (kính râm, dây chuyền vàng), cả quán được bao, máy quay áp sát người tặng.
- Đủ số tim: bà chủ khao cả quán trà đá + mưa đá lạnh / cả quán dzô 100%.
- Khi quán vắng có **khách quen giả lập** ngồi gọi món, chém gió cho đỡ trống; người xem thật vào là họ nhường chỗ (tắt được).
- Tiếng phố (xe máy, còi, chim sẻ) / tiếng quán (rì rầm, cụng ly xa) tự tạo bằng WebAudio, giọng đọc chào khách và cảm ơn quà.

### ⚔️ Đánh Boss

- Co-op: thả tim hoặc comment bất kỳ là vào trận (vào giữa trận cũng được). Mỗi tim = 1 sát thương, comment `đánh` = đòn mạnh (có hồi chiêu).
- Cứ 9–15 giây boss **gồng chiêu** (cảnh báo 3,5 giây): comment `né` để tránh, có ân hạn 1,5 giây bù độ trễ TikTok. Không né mất 1 tim, hết 3 tim là gục.
- Quà: đang gục thì **hồi sinh**, còn đứng thì **chí mạng** theo số kim cương. Boss còn 30% máu thì nổi điên, gồng chiêu nhanh hơn.
- Hạ boss trước khi hết giờ là thắng; bảng xếp hạng sát thương, MVP lên kết quả. Máu boss, nhịp gồng, số tim… chỉnh trong bảng điều khiển; có bot và giả lập.

### 🔮 Thả Bi

- Comment `thả` để thả 1 viên bi (chờ 2 giây giữa 2 lần), hoặc thả tim — đủ 15 tim tự thả 1 viên. Mỗi người tối đa 3 viên đang rơi.
- Server quyết định đường nảy ngay khi thả (mỗi hàng chốt trái/phải 50/50), overlay chỉ diễn hoạt — điểm cộng đúng lúc bi chạm ô. Hai ô mép là **JACKPOT ×50**.
- Quà = bi vàng ×3 điểm, thêm 1 viên mỗi 10 kim cương (tối đa 5), không bị giới hạn chờ.
- Hết giờ (mặc định 3 phút) ai nhiều điểm nhất thắng; bi còn đang rơi vẫn được tính.

### 🏝️ Đảo Sinh Tồn

- Comment bất kỳ (hoặc `vào`) là nhảy dù lên đảo; trong lúc chờ comment `chiến` / `cung` / `ninja` chọn lớp, `bắc` / `nam` / `đông` / `tây` chọn nơi đáp. Không dấu cũng được.
- Nhân vật tự đánh; người xem chỉ chọn chiến thuật: `trốn` (khó bị phát hiện), `xông` (+25% sát thương), `hồi` (hồi máu), mỗi lệnh có hồi chiêu.
- Vòng mặc định ~5 phút: chờ 30s → nhảy dù 8s → nhặt đồ 45s → 4 vòng bão (chờ 25s + ép 20s) → chung kết 30s → kết quả 15s.
- Bị loại vẫn chơi tiếp: comment `bão 1` / `bão 2` / `bão 3` để chọn tâm bão tiếp theo.
- Tim hồi máu (có giới hạn mỗi giây) và nạp thanh hype; đầy thanh là thả hòm tiếp tế cho cả đảo. Quà chia 5 tầng theo kim cương (hồi máu → khiên → hòm tiếp tế → hồi sinh → mưa thiên thạch), yếu dần theo vòng bão để người không tặng quà vẫn thắng được; "Sức mạnh quà" chỉnh trong bảng điều khiển.
- Phòng vắng thì đảo thả zombie để không trống; zombie không bao giờ thắng. Bảng xếp hạng mùa chỉ để vinh danh, không có giải thưởng.
- Có chế độ luyện tập tự sinh người xem ảo khi chưa live.

### 💍 Cưới Liền Tay

Chuyển từ dự án [cuoi-lien-tay](https://github.com/workaipvlinh-byte/cuoi-lien-tay) (MIT), chạy bằng kết nối TikTok chung của app.

- Comment bất kỳ là vào sảnh, hiện bong bóng chat trên đầu nhân vật mang tên + avatar TikTok.
- `cưới vợ @tên` (mình làm chú rể), `cưới chồng @tên` (mình làm cô dâu), `cưới @tên` (MC bốc vai). Người được hỏi có 60 giây gõ `đồng ý` / `không`; đang có đám thì xếp hàng (tối đa 5).
- Đang chờ trả lời hoặc đang đi thảm đỏ, ai tặng từ 30 xu là cướp dâu / cướp rể (lần nào cũng 30 xu, không đấu giá).
- `se duyên` lúc Nguyệt Lão xuất hiện, `đấm @tên` / `trêu @tên`, `quẩy` ra sàn nhảy, `zô` nâng ly. Lệnh có dấu hay không dấu đều được.
- Mốc tim 100 / 300 / 1000; quà 6 cấp; phòng vắng thì "dàn khách quen" tự cầu hôn nhau cho sảnh không trống.
- Bảng điều khiển trong tab: đọc ngay, tốc độ giọng, tên kênh, nhạc nền, nút thử khách / quà khi chưa live. Cảnh 3D khá nặng, máy yếu có thể giật.
- Giao diện viết bằng React + Vite: `npm start` / `npm run dist:*` tự build vào `cuoi/dist`; sửa cảnh xong chạy lại `npm run build:cuoi`.

## Tải & cài đặt

Tải bản cài mới nhất ở trang **[Releases](https://github.com/luhau983/MyStudioLive/releases)**. Chưa có bản phù hợp thì [tự đóng gói từ mã nguồn](#chạy-từ-mã-nguồn).

| Máy | File |
|---|---|
| Windows 10/11 64-bit | `MyStudioLive-Setup-<phiên bản>-win-x64.exe` |
| Mac chip Apple (M1–M4) | `MyStudioLive-<phiên bản>-mac-arm64.dmg` |
| Mac chip Intel | `MyStudioLive-<phiên bản>-mac-x64.dmg` |

<details>
<summary><b>Windows</b></summary>

1. Chạy file `.exe` → chọn thư mục → **Install**.
2. Hiện **“Windows đã bảo vệ PC của bạn”** (SmartScreen, do app chưa ký số): bấm **More info → Run anyway**.
3. Mở **MyStudioLive** từ Desktop hoặc menu Start.

</details>

<details>
<summary><b>macOS 12 trở lên</b></summary>

1. Mở file `.dmg`, kéo **MyStudioLive** vào **Applications**.
2. Lần đầu: **chuột phải vào app → Mở → Mở** (app chưa ký số Apple).
3. Vẫn bị chặn: **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Vẫn mở**.
4. Báo “app bị hỏng và không thể mở”: chạy lệnh sau trong Terminal rồi mở lại.

   ```bash
   xattr -cr /Applications/MyStudioLive.app
   ```

</details>

## Lên live

1. **Chọn cảnh** ở menu trái (hoặc tab **Đưa lên live → Phát …**).
2. **Đưa cảnh vào phần mềm live**, khung **dọc 1080 × 1920**:
   - **TikTok LIVE Studio**: thêm nguồn **Link** `http://lvh.me:3000` (LIVE Studio không nhận `localhost`; `lvh.me` luôn trỏ về chính máy bạn). Dự phòng: bấm **Mở màn hình phát** rồi dùng **Chụp cửa sổ**.
   - **OBS**: thêm **Browser Source** `http://localhost:3000`.
3. Bấm **Go LIVE** trên TikTok.
4. Ở **Bảng điều khiển**, nhập username TikTok (không cần @) → **Kết nối**.

Đổi cảnh giữa chừng không cần sửa link: mọi màn hình đang trỏ tới `localhost:3000` / `lvh.me:3000` tự chuyển sang cảnh mới. Chưa live vẫn thử được bằng các nút **Gửi thử** / **Chơi thử** trong từng tab.

Hướng dẫn chi tiết (chất lượng hình, âm thanh, xử lý lỗi): **[docs/HUONG-DAN-CAI-DAT.md](docs/HUONG-DAN-CAI-DAT.md)**.

## Dữ liệu của bạn

| Nội dung | Windows | macOS |
|---|---|---|
| Cài đặt app | `%APPDATA%\StudioLive\settings.json` | `~/Library/Application Support/StudioLive/settings.json` |
| Vua Tiếng Việt (câu hỏi, điểm, cấu hình) | `%APPDATA%\StudioLive\vua\` | `~/Library/Application Support/StudioLive/vua/` |
| Kéo Co (cấu hình, thống kê, lịch sử trận) | `%APPDATA%\StudioLive\keoco\` | `~/Library/Application Support/StudioLive/keoco/` |
| Đảo Sinh Tồn (cấu hình, bảng xếp hạng mùa) | `%APPDATA%\StudioLive\dao\` | `~/Library/Application Support/StudioLive/dao/` |
| Cưới Liền Tay (tên kênh) | `%APPDATA%\StudioLive\cuoi\` | `~/Library/Application Support/StudioLive/cuoi/` |

Thư mục dữ liệu vẫn tên `StudioLive` để giữ cài đặt cũ sau khi đổi tên app. Nếu máy đã từng cài app **Vua Tiếng Việt** riêng, lần đầu mở MyStudioLive sẽ tự chép câu hỏi đã import, điểm và cấu hình sang.

## Chạy từ mã nguồn

Cần **Node.js 20+** và **git**.

```bash
git clone https://github.com/luhau983/MyStudioLive.git
cd MyStudioLive
npm install
npm start
```

Đóng gói bản cài (không ký số), xem thêm [docs/BUILD.md](docs/BUILD.md):

```bash
npm run dist:win   # bộ cài NSIS x64
npm run dist:mac   # .dmg + .zip cho arm64 và x64
```

Chạy test của hai game:

```bash
cd vua && node --test
cd keoco && node --test
npm test             # Live Bar (luật chơi + proxy avatar)
cd denxanh && node --test
cd danhboss && node --test
cd thabi && node --test
cd dao && node --test
cd cuoi && node --test
```

### Kiến trúc

```
src/main.js        Tiến trình chính: cửa sổ, IPC, khởi động server overlay + server của từng game
src/live.js        Kết nối TikTok, chuẩn hoá sự kiện, tự kết nối lại (một kết nối dùng chung)
src/direct.js      Đọc sự kiện qua trình duyệt ẩn + giải mã protobuf
src/server.js      Server overlay Express + Socket.IO (chỉ 127.0.0.1), giọng đọc /api/tts,
                   chuyển hướng sang server game khi cảnh đó đang phát
src/tts.js         Giọng đọc tiếng Việt (Microsoft Edge, dự phòng Google)
src/settings.js    Lưu cài đặt trong thư mục userData
renderer/          Giao diện điều khiển (sáng / tối / theo hệ thống)
overlay/           Cảnh Nhà Ma, Đi Chùa, Rạp Phim; overlay/bar/ là Live Bar (three.js); quan.js = engine chung cho Trà Đá Vỉa Hè & Đi Nhậu
vua/               Game Vua Tiếng Việt: server riêng, overlay 3D (Three.js), bảng điều khiển, ngân hàng câu hỏi
keoco/             Game Kéo Co: server riêng, sân 3D (Three.js), bảng điều khiển
denxanh/           Game Đèn Xanh Đèn Đỏ: server riêng, sân canvas 2D, bảng điều khiển
danhboss/          Game Đánh Boss: server riêng, đấu trường canvas 2D, bảng điều khiển
thabi/             Game Thả Bi (Plinko): server riêng, bàn canvas 2D, bảng điều khiển
dao/               Game Đảo Sinh Tồn: server riêng, mô phỏng battle royale, đảo 3D (Three.js), bảng điều khiển
cuoi/              Game Cưới Liền Tay: server riêng (SSE + giọng 2 MC), client React + Three.js build vào cuoi/dist
```

Hai game `vua/` và `keoco/` chạy server riêng ngay trong tiến trình chính và nhận sự kiện qua cầu nối từ `src/live.js`, nên chỉ có một kết nối TikTok cho cả app. Bảng điều khiển của từng game được nhúng vào tab tương ứng; bảng của Vua Tiếng Việt đổi theo giao diện sáng/tối của MyStudioLive (`vua/studio-theme.css`).

> Lưu ý: giữ `tiktok-live-connector` ở **2.0.0** (MIT). Các bản mới hơn dùng giấy phép AGPL-3.0.

### Đóng góp

Fork repo → tạo nhánh → commit → mở Pull Request. Báo lỗi hoặc đề xuất tính năng tại [Issues](https://github.com/luhau983/MyStudioLive/issues).

## Giấy phép & ghi công

- Mã nguồn phát hành theo giấy phép **[MIT](LICENSE)**.
- Dựa trên [StudioLive](https://github.com/tanthuan031/StudioLive) © 2026 [Tanthuan031](https://github.com/tanthuan031) (MIT).
- Thư viện & tài nguyên bên thứ ba giữ giấy phép riêng: [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md).
- **[DISCLAIMER.md](DISCLAIMER.md)**: phần mềm chỉ phục vụ giải trí, học tập. Người dùng tự chịu hoàn toàn trách nhiệm về nội dung livestream của mình.

## Tác giả

- Phát triển & duy trì MyStudioLive: [@luhau983](https://github.com/luhau983)
- Tác giả StudioLive gốc: **Tanthuan031** · [GitHub](https://github.com/tanthuan031) · [Website](https://thuantech.com) · [Facebook](https://www.facebook.com/thuanht31) · [TikTok](https://www.tiktok.com/@rv.dev)
