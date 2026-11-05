# Cưới Liền Tay: ghi chú thiết kế

> Ghi chú gốc của dự án [cuoi-lien-tay](https://github.com/workaipvlinh-byte/cuoi-lien-tay), chép kèm khi đưa game vào MyStudioLive (`cuoi/`).
> Trong app không còn `server.ts` / `BAT-LIVE.bat`: server là `cuoi/server.mjs` dùng chung kết nối TikTok, client build bằng `npm run build:cuoi`. Đường dẫn `src/...` bên dưới nằm trong `cuoi/src/`.
> Khi chủ kênh chốt một quyết định (câu đọc, màu, luật chơi), ghi vào mục "Quyết định của chủ kênh".

## Ý tưởng

Tiệc cưới 3D (Three.js) cho TikTok LIVE. Người xem comment là vào sảnh, ngồi bàn tròn trắng 10 ghế. Ai cũng có thể cầu hôn người khác trong phòng; người kia đồng ý thì cặp đôi đổi đồ cưới và đi thảm đỏ lên sân khấu làm lễ. Người ngoài tặng quà để cướp dâu, cướp rể. Hai MC (nam + nữ) dẫn chương trình kiểu hài.

Phần live (TikTok, giọng đọc, đọc tên, cảm ơn quà, gỡ kẹt giọng) chép từ Đám Cưới Online.

## Luật chơi

- `cưới vợ @tên`: mình làm chú rể. `cưới chồng @tên`: mình làm cô dâu. `cưới @tên`: MC bốc vai (cố định theo username).
- Người được @ có 60 giây gõ `đồng ý` (hoặc `không`). Chưa vào tiệc thì comment một câu là ra cổng hoa. Người được hỏi tặng quà thì tính là đồng ý.
- Đang có đám thì đám mới xếp hàng (tối đa 5).
- Cướp: lúc chờ trả lời hoặc lúc đi thảm đỏ, ai tặng từ 30 xu là thế chỗ người cầu hôn (vai bị cướp = vai người gõ cưới). Cướp lúc đang chờ thì lên lễ đường luôn ("tiền trao cháo múc").
- Lên sân khấu: mở lễ, hứa hẹn, trao nhẫn, ôm, cả sảnh nâng ly, chúc. Xong thì cặp đôi đứng vẫy tới khi có đám mới; bảng tên có "💍 Đã cưới ...".
- `zô`: nâng ly. 5 người zô trong 10 giây thì MC hô cụng ly. 300 tim: cả sảnh quẩy.

## File

- `src/game/config.ts`: số liệu + mọi câu 2 MC (`M:` nam, `F:` nữ).
- `src/game/rules.ts`: đọc lệnh, khớp tên @. Test: `npx tsx src/game/rules.check.ts`.
- `src/game/useGame.ts`: trạng thái đám cưới (proposal → walk → vows → after), quà, cướp.
- `src/game/world/`: `hall.ts` sảnh (đồ tĩnh gộp khối), `chibi3d.ts` nhân vật + 6 bộ đồ cưới, `world.ts` khách đi lại, camera lia, hiệu ứng hạt, bảng tên vẽ ở lớp 2D phủ trên, `tags.ts` vẽ bảng tên/bong bóng.
- `src/game/music.ts`: nhạc nền tự sáng tác bằng code (giai điệu đám cưới 16 ô nhịp, 72 BPM), dựng sẵn thành WAV bằng OfflineAudioContext rồi phát bằng <audio> như giọng MC. Phát thẳng Web Audio bị LIVE Studio chặn nên chủ kênh không nghe nhạc (2026-11-03).
- `server.ts`: `/api/tts?v=f` là giọng nữ HoaiMy, mặc định NamMinh.
- Sửa code trong `src/` lúc trang stage đang mở sẽ làm thế giới 3D tải lại giữa chừng (mất khách). Đừng sửa khi đang live.

## Quyết định của chủ kênh

- Game mới riêng, không thay Đám Cưới Online.
- Cướp dâu/rể: 30 xu. KHÔNG đấu giá: lần nào cũng 30 xu, không cần hơn người trước.
- 6 bộ đồ cưới: Cổ điển, Áo dài truyền thống, Sang chảnh, Thanh lịch, Dễ thương, Bựa (quần đùi dép tổ ong + váy cưới giày bata, ra hiếm ~12%).
- 2 MC nam nữ đối đáp, giọng hài, nhiều cảm thán, câu ngắn dồn dập. Tốc độ đọc mặc định 1.35 (chỉnh ở trang điều khiển), MC im 1,5 giây là nói tiếp.
- Ghế không có nơ hồng (chấm hồng nhấp nháy khi nhìn xa).
- Camera: toàn cảnh khi rảnh; cầu hôn quay từ phía sân khấu ra cổng hoa (thấy mặt 2 người); đi thảm đỏ quay trước mặt cặp đôi; làm lễ quay sân khấu; MC gọi tên/cảm ơn quà thì lia tới người đó vài giây.
- Bảng màu (cũ, đã thay bằng hoàng hôn bên dưới): tường xanh navy đêm, ghế/đĩa lót/viền bàn/cổng hoa/viền sân khấu màu bạc, lá xanh trong hoa; hồng chỉ ở hoa và chữ tiêu đề (trắng viền hồng). Đã thử vàng gold + đỏ vang: chủ kênh chê ra màu cam, bỏ. Có đèn rọi quét, kim tuyến bạc rơi liên tục, pháo giấy bắn từ 2 góc sân khấu mỗi 40 giây + lúc đồng ý / cướp / nâng ly.
- Bảng tên luôn có ô avatar (chưa có ảnh thì chữ cái đầu trên nền màu).
- Mai mối: mỗi ~50-70 giây lúc không có đám, camera zoom vào 1 bàn có 2 khách thật, MC gọi tên 2 bạn ép lên cưới (`GAME.pair`, cổ vũ thật mạnh, hài), 15 giây chưa ai gõ thì ép tiếp (`GAME.pairPush`).
- Chống 2 giọng: server giữ danh sách trang stage đang mở, chỉ trang mở sau cùng phát tiếng (giọng + nhạc), các trang khác tự im; trang điều khiển báo khi có >1 trang stage. Chủ kênh từng nghe 2 giọng đọc lệch nhau khi live thử (2026-11-03).
- Không gian hoàng hôn cho dịu mắt (2026-11-03): tường tím mận, cửa kính lớn sau sân khấu và 2 bên nhìn ra trời tím hồng đào có mặt trời lặn, nắng chiều ấm. Viền bạc giữ nguyên.
- Hiệu ứng nhiều nhưng không giật: `world.quality` tự hạ khi dưới ~40 khung/giây (bớt kim tuyến, khói, giảm độ nét), mượt lại thì tăng.
- Người lướt vào live: được mời vào ngồi ăn cỗ luôn (có tên, avatar), MC gọi tên trêu. Người comment ưu tiên: hết chỗ thì người comment thế chỗ người lướt qua lâu nhất.
- Phòng vắng 40 giây: "dàn khách quen" (10 nhân vật tên vui như Chú Tư Xe Ôm, Bà Tám Hàng Xóm, `GAME.cast`) tự cầu hôn nhau, 70% đồng ý, 30% từ chối. Cố ý dùng nhân vật của chương trình, không gán hành động cho người xem thật.
- Nhân viên bưng mâm chỉ phục vụ bàn cùng phía cửa bếp (không băng qua thảm đỏ che cặp đôi).
- 4 vũ công nữ váy ngắn kim sa nhảy trên sân khấu phía sau cô dâu chú rể (lúc cặp đôi đứng sân khấu hoặc cả sảnh quẩy).
- Giữ chân người xem (chủ kênh chọn 2026-11-03): (1) mở trang ~12 giây là dàn khách quen đã cầu hôn dở + MC hỏi treo "đồng ý hay từ chối, ở lại xem"; (3) mốc tim theo vòng 100 pháo giấy / 300 cả sảnh quẩy / 1000 xe hoa chạy quanh sảnh, thanh tim ghi "❤️ x/mốc"; (4) sau mỗi đám bình chọn 20 giây "gõ 1 hợp, 2 không hợp", MC đọc % kèm câu bựa; (5) sự kiện bất ngờ mỗi 3–5 phút: mất điện (đèn sáng lại thì cô dâu bị tráo), mẹ chồng lên kéo cô dâu đi rửa bát, người yêu cũ phá đám, sui gia tung phong bì.
- Nhân vật chất Việt, vẫn 3D (không đổi sang ảnh 2D như clip mẫu chủ kênh gửi): nam tóc ngắn / rẽ ngôi / đầu đinh, nữ tóc dài / đuôi ngựa / búi / bob; đa số áo thun màu cơ bản + quần jean; mặt có lông mày, mũi; đầu nhỏ hơn. Cô dâu búi tóc, chú rể rẽ ngôi. Dàn khách quen giới tính theo cách gọi (Cô/Chị/Bà/Con là nữ).
- Hiệu ứng thêm: cánh hoa hồng rơi nhẹ liên tục + mưa hoa hồng khi quà/đồng ý, bóng bay bay lên.
- Quẩy DJ (26 giây): khách thật + dàn khách quen + bớt khách đệm lên sân khấu và sàn trước sân khấu nhảy, nhạc DJ 128 BPM tự tạo thay nhạc đám cưới, laser từ bàn DJ, quả cầu disco, MC hô liên tục. Bật khi: 300 tim, quà từ 299 xu, 5 người gõ quẩy trong 30 giây, mỗi ~6 phút lúc rảnh, hoặc nút "Quẩy DJ cả sảnh".
- Nhân viên, đội nhảy, vũ công, DJ, đội pháo đều có tên + danh hiệu trên đầu (tên vui cố định, vd. "Anh Tèo Phục Vụ", "Bà Nội Quẩy", "DJ Tèo Teo").
- Mỗi ~100 giây chọn ngẫu nhiên 1 người xem thật (không phải dàn khách quen) đóng vai nhân viên bưng mâm hoặc vũ công trên sân khấu trong 90 giây: đổi đồng phục, danh hiệu "🍽 Nhân viên bưng mâm" / "💃 Vũ công", MC thông báo tuyển dụng. Hết giờ trả lại đồ cũ, về chỗ.
- Kiểm tra 2026-11-03: chào người lướt vào được ưu tiên (chỉ sau câu cảm ơn quà); câu dính tới lúc đang cầu hôn (câu treo, nhắc giờ, gợi ý cướp) tự bỏ nếu tới lượt đọc mà đám đã đổi; tên user123456 đọc "bạn"; khung 3D luôn phủ kín 1080x1920 khi tự giảm độ nét (trước đó để lộ khoảng trắng).
