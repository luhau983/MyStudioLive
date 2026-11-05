// =====================================================
//  CẤU HÌNH "CƯỚI LIỀN TAY": số liệu + mọi câu của 2 MC
//  Câu đọc: "M:" anh MC (giọng nam), "F:" chị MC (giọng nữ), giữ giọng tới khi đổi.
//  "|" tách đoạn, "^" hô to hơn. Tên đưa vào đã làm sạch. Không bao giờ đọc nguyên văn comment.
//  Giọng (chủ kênh chốt): 1 MC nam, nói ấm và tự nhiên, xoay quanh tình yêu và cô dâu chú rể.
//  Ít hô to (^ tối đa 1 lần mỗi câu), không đánh nhau, mỗi chỗ hay nói có nhiều bản để đỡ lặp.
// =====================================================

const CHANT = 'Một, hai, ba, dô! Hai, ba, dô! Hai, ba, dô! Hai, ba, uống! Uống cạn ly!';

type N = string;
const roleWord = (r: 'groom' | 'bride') => (r === 'groom' ? 'chú rể' : 'cô dâu');
const stealWord = (r: 'groom' | 'bride') => (r === 'groom' ? 'cướp rể' : 'cướp dâu');

export const GAME = {
  title: 'Cưới Liền Tay',
  defaultChannelName: 'nhà mình',

  // ---------- Luật ----------
  stealMin: 30, // tặng từ 30 xu là cướp được (lần nào cũng 30, không đấu giá)
  answerMs: 60_000, // người được hỏi có 60 giây gõ ĐỒNG Ý
  maxQueue: 5, // đám chờ cưới tối đa
  likesPerBoost: 300,
  giftBig: 99,
  giftThanksCooldownMs: 30_000,
  greetEveryMs: 6000,
  namesPerGreeting: 3,
  chatterQuietMs: 1500, // MC im 1,5 giây là nói tiếp (chủ kênh muốn MC nói nhiều)
  shareReminderEveryMs: 4 * 60_000,

  // ---------- Người lướt vào live ----------
  greetings: [
    (n: N) => `M: Chào ${n} nha. | Mời bạn vào ngồi, hôm nay sảnh mình có cưới đó.`,
    (n: N) => `M: ${n} vừa tới rồi. | Ở đây ai cũng có thể làm cô dâu chú rể, chỉ cần gõ cưới, a còng, tên người ấy.`,
    (n: N) => `M: Cảm ơn ${n} đã ghé đám cưới nhà mình. | Cứ tự nhiên như ở nhà nha.`,
    (n: N) => `M: Chào ${n}. | Biết đâu hôm nay duyên của bạn cũng đang ngồi trong sảnh này.`,
    (n: N) => `M: ${n} ơi, vào đúng lúc lắm. | Ngồi xuống chung vui với hai họ nha.`,
    (n: N) => `M: Sảnh mình đón thêm ${n}. | Chúc bạn một buổi tối thật vui.`,
  ],

  // ---------- Cầu hôn ----------
  // a = người gõ, b = người được hỏi, role = vai của người gõ
  proposal: {
    groom: [
      (a: N, b: N) => `M: Bà con ơi, ${a} vừa quỳ xuống trước cổng hoa. | Lời cầu hôn này là dành cho ${b}. | ${b} ơi, gõ đồng ý là mình lên lễ đường nha.`,
      (a: N, b: N) => `M: Có một người đang cầm nhẫn chờ kìa. | ${a} muốn cưới ${b}. | Cả sảnh cùng chờ câu trả lời nào.`,
      (a: N, b: N) => `M: ${a} đã lấy hết can đảm rồi đó. | ${b} ơi, nếu cũng thương thì gõ đồng ý nha.`,
      (a: N, b: N) => `M: Giây phút này chắc tim ${a} đập nhanh lắm. | Người ${a} chọn là ${b}. | Mình cùng chờ ${b} trả lời.`,
      (a: N, b: N) => `M: Cổng hoa hôm nay có người quỳ rồi bà con. | ${a} hỏi cưới ${b}. | Chỉ cần một chữ đồng ý thôi.`,
    ],
    bride: [
      (a: N, b: N) => `M: Ơ, lần này là cô gái chủ động nè bà con. | ${a} hỏi cưới ${b}. | ${b} ơi, đừng để người ta chờ lâu nha.`,
      (a: N, b: N) => `M: ${a} cầm nhẫn ra cổng hoa rồi. | Con gái mà dám ngỏ lời là đáng quý lắm. | ${b}, gõ đồng ý đi nào.`,
      (a: N, b: N) => `M: Thương thì nói, ${a} nghĩ vậy. | Và người ${a} muốn cưới là ${b}.`,
      (a: N, b: N) => `M: Cả sảnh đang nhìn về cổng hoa. | ${a} đang chờ ${b} gật đầu.`,
      (a: N, b: N) => `M: Một lời cầu hôn rất can đảm từ ${a}. | ${b} ơi, câu trả lời là gì đây?`,
    ],
    picked: (a: N, role: 'groom' | 'bride') => `M: ${a} gõ cưới mà chưa nói làm cô dâu hay chú rể. | Vậy MC chọn giùm nha: ${a} làm ${roleWord(role)}.`,
    stealHint: (_price: number, _role: 'groom' | 'bride') => `M: À, ai không chịu thì comment tranh duyên để mở PK tranh duyên nha. | Phe giữ thì comment không.`,
  },
  self: (a: N) => `M: ${a} ơi, tự cưới mình thì MC chịu thua rồi. | Chọn thêm một người nữa nha.`,
  queued: (a: N, n: number) => `M: ${a} ơi, MC nghe rồi. | Đang có đám trên lễ đường, bạn xếp thứ ${n}, chờ chút nha.`,
  // người được hỏi im lặng / vắng: ai gõ đồng ý trước là được cưới
  openCall: (a: N, b: N) => `M: ${b} chưa trả lời nè bà con. | Vậy MC mở cửa luôn: ai muốn cưới ${a} thì gõ đồng ý! | Ai gõ trước, người đó lên xe hoa.`,
  openTaken: (n: N, a: N) => `M: Ơ kìa! ${n} vừa gõ đồng ý trước! | Vậy ${n} chính thức được cưới ${a}. | Duyên tới bất ngờ vậy đó bà con!`,
  queuedShow: (a: N, n: number) => `M: ${a} ơi, MC nghe rồi! | Đợi tiết mục này xong là cưới liền, ^bạn xếp thứ ${n}!`,
  queueFull: `M: Hàng chờ cưới đã đủ năm đám rồi bà con. | Chờ vài đám xong rồi mình gõ lại nha.`,
  targetMissing: (b: N) => `M: Mà ${b} có đang ở trong sảnh không ta? | ${b} ơi, comment một câu rồi gõ đồng ý nha.`,
  targetArrived: (b: N) => `M: ${b} tới rồi kìa bà con. | Cả sảnh cùng chờ câu trả lời nha.`,
  nudge: [
    (b: N, s: number) => `M: Còn ${s} giây nữa thôi ${b} ơi. | Nếu thương thì gõ đồng ý nha.`,
    (b: N, s: number) => `M: ${b} vẫn đang suy nghĩ. | Còn ${s} giây, người ta vẫn quỳ chờ đó.`,
    (b: N, s: number) => `M: ${s} giây nữa thôi. | ${b} ơi, một chữ đồng ý là thành đôi.`,
    (b: N, s: number) => `M: Cả sảnh đang chờ ${b} đó. | Còn ${s} giây.`,
    (b: N, s: number) => `M: Không sao, cứ từ từ suy nghĩ ${b} nha. | Mình còn ${s} giây.`,
  ],
  // Mỗi bước lễ cưới có 5 bản, bốc xáo trộn: 4–5 đám mới nghe lại 1 câu
  accepted: [
    (a: N, b: N) => `M: Đồng ý rồi bà con ơi! | ${b} đã gật đầu với ${a}. | ^Xin chúc mừng hai bạn!`,
    (a: N, b: N) => `M: Kính thưa quan viên hai họ, người ấy đã gật đầu rồi. | Từ một lời hỏi trên sóng live, hôm nay ${a} và ${b} quyết định nắm tay nhau đi tiếp.`,
    (a: N, b: N) => `M: Thành đôi rồi! | Một tràng pháo tay cho ${a} và ${b} nha bà con.`,
    (a: N, b: N) => `M: ${b} nói có rồi. | ${a} đứng dậy đi, quỳ nãy giờ chắc mỏi chân lắm. | ^Chúc mừng!`,
    (a: N, b: N) => `M: Một lời hỏi, một cái gật đầu, vậy là thành đôi. | Chúc mừng ${a} và ${b}, hôm nay hai họ có thêm một niềm vui lớn.`,
  ],
  outfit: [
    (setName: string) => `M: Xin phép bà con, cô dâu chú rể khoác lên mình bộ lễ phục đẹp nhất. | Hôm nay hai bạn chọn bộ ${setName}.`,
    (setName: string) => `M: Thay đồ cưới rồi bà con ơi. | Bộ ${setName}, nhìn đẹp đôi quá.`,
    (setName: string) => `M: Cô dâu chú rể vừa thay bộ ${setName}. | Đứng cạnh nhau là thấy trời sinh một cặp.`,
    (setName: string) => `M: Lễ phục đã sẵn sàng. | Hôm nay đôi uyên ương diện bộ ${setName}.`,
    (setName: string) => `M: Một chút phép màu của ông tơ bà nguyệt. | Cô dâu chú rể đã khoác lên bộ ${setName}, lung linh cả cổng hoa.`,
  ],
  outfitFunny: `M: Ơ khoan đã bà con. | Chú rể mặc quần đùi, đi dép tổ ong, cô dâu thì váy cưới với giày bata. | Thôi thì miễn thương nhau là được!`,
  rejected: [
    (a: N, b: N) => `M: ${b} đã từ chối rồi. | Không sao đâu ${a}, duyên chưa tới thì mình chờ thêm chút nha.`,
    (a: N, b: N) => `M: Lần này ${b} chưa đồng ý. | ${a} đứng dậy về bàn nghỉ chút, sảnh mình còn nhiều người lắm.`,
    (a: N, b: N) => `M: Tình cảm không ép được bà con ạ. | Cảm ơn ${a} đã dũng cảm nói ra.`,
    (a: N, b: N) => `M: ${b} lắc đầu rồi. | ${a} ơi, người đúng sẽ tới vào đúng lúc thôi.`,
    (a: N, b: N) => `M: Hơi buồn một chút, nhưng mà không sao. | Một tràng pháo tay động viên ${a} nha bà con.`,
  ],
  timeout: [
    (a: N, b: N) => `M: Hết giờ rồi, ${b} chưa trả lời. | ${a} về bàn nghỉ chút nha, lát mình thử lại.`,
    (a: N, b: N) => `M: Sáu mươi giây trôi qua mà chưa có câu trả lời. | Chắc ${b} còn ngại, ${a} đừng buồn nha.`,
    (a: N, b: N) => `M: ${b} chưa kịp gõ đồng ý. | Lời cầu hôn của ${a} tạm khép lại ở đây.`,
  ],

  // ---------- Lên lễ đường + cướp ----------
  walk: [
    (g: N, b: N) => `M: Giờ phút được mong chờ nhất đã tới. | Xin cả sảnh hướng mắt về thảm đỏ. | Xin trân trọng giới thiệu chú rể ${g}, và cô dâu ${b}!`,
    (g: N, b: N) => `M: Và giờ đây, xin mời cô dâu ${b} và chú rể ${g} tiến vào lễ đường. | Một tràng pháo tay thật lớn nào.`,
    (g: N, b: N) => `M: Kính thưa quan viên hai họ, ${g} và ${b} đang bước trên thảm đỏ. | Mỗi bước chân hôm nay là bước đầu của một mái nhà chung.`,
    (g: N, b: N) => `M: Tay trong tay, ${g} dắt ${b} đi qua cổng hoa. | Đi chậm thôi nha, đoạn đường này đẹp lắm.`,
    (g: N, b: N) => `M: Nhạc lên, đèn lên. | Đôi uyên ương ${g} và ${b} tiến vào lễ đường.`,
  ],
  walkSteal: (price: number) => `M: À, trên thảm đỏ vẫn còn cơ hội cướp đó nha. | Tặng ${price} xu là đổi người liền tay.`,
  stolen: [
    (n: N, o: N, role: 'groom' | 'bride') => `M: Ơ kìa, ${n} vừa ${stealWord(role)}! | ${o} ơi, duyên lần này có người giành mất rồi.`,
    (n: N, o: N, role: 'groom' | 'bride') => `M: Bất ngờ chưa bà con! | ${n} bước ra thế chỗ ${o}, ${roleWord(role)} giờ đã có người mới.`,
    (n: N, o: N, role: 'groom' | 'bride') => `M: ${n} đã ${stealWord(role)} thành công. | ${o} đừng buồn nha, lát mình tìm duyên khác.`,
    (n: N, o: N) => `M: Tình yêu đôi khi cũng cần nhanh tay. | ${n} vừa giành lấy chỗ của ${o}.`,
  ],
  stealLow: (n: N, need: number) => `M: Cảm ơn ${n} nha. | Muốn cướp thì cần ${need} xu, quà này MC xin gửi mừng cô dâu chú rể.`,
  stealAccept: `M: Thắng PK rồi thì khỏi chờ trả lời nữa. | Mời hai bạn lên lễ đường luôn.`,

  // ---------- PK tranh duyên: comment "tranh duyên" = phe tranh duyên, comment "không" = phe giữ; 1 comment 1 điểm, 1 xu = 10 điểm ----------
  pk: {
    ms: 30_000,
    giftMul: 10,
    start: [
      (c: N, p: N) => `M: Ơ, ${c} không chịu rồi bà con! | Mở PK ba mươi giây: comment tranh duyên là phe ${c}, comment không là phe giữ ${p}. | Quà một xu bằng mười điểm.`,
      (c: N, p: N) => `M: Có người muốn giành chỗ của ${p}! | PK bắt đầu: phe tranh duyên comment tranh duyên, phe giữ comment không. | Ba mươi giây thôi nha.`,
      (c: N, p: N) => `M: ${c} vừa lên tiếng tranh duyên. | Bà con chọn phe đi: comment tranh duyên hay comment không, quà tính gấp mười điểm.`,
    ],
    mid: (a: number, d: number) => `M: Phe tranh duyên ${a} điểm, phe giữ ${d} điểm. | Còn mười lăm giây.`,
    atkWin: (n: N, o: N, a: number, d: number) => `M: Hết giờ! Phe tranh duyên thắng, ${a} so với ${d}. | ${n} thế chỗ ${o}. | ${o} đừng buồn nha, duyên khác sẽ tới.`,
    defWin: (o: N, a: number, d: number) => `M: Hết giờ! Phe giữ thắng, ${d} so với ${a}. | ${o} giữ được người thương rồi. | Một tràng pháo tay nào bà con.`,
  },
  parentsTake: (n: N, label: string) => `M: Cảm ơn ${n} đã tặng quà chúc phúc. | Đám này ${n} được lên làm ${label} nha.`,
  // Lên sân khấu: tuyên bố lý do
  ceremonyOpen: [
    (g: N, b: N) => `M: Trước sự chứng kiến của hai họ và bà con đang xem live, | ${g} và ${b} chính thức bước vào hành trình hôn nhân. | Thay mặt hai gia đình, MC xin cảm ơn bà con đã đến chung vui!`,
    (g: N, b: N) => `M: Kính thưa các cụ, các bác, các cô chú anh chị và bà con cô bác! | Hôm nay ngày lành tháng tốt, | chúng ta cùng chung vui trong lễ thành hôn của ${g} và ${b}!`,
    (g: N, b: N) => `M: Kính thưa quan viên hai họ! | Có những cuộc gặp tưởng rất bình thường, lại thành khởi đầu của cả một đời. | Hôm nay là ngày của ${g} và ${b}!`,
    (g: N, b: N) => `M: Ông tơ bà nguyệt đã se duyên! | ${g} và ${b} đứng đây, trước hai họ, trước bà con. | ^Lễ thành hôn xin được bắt đầu!`,
    (g: N, b: N) => `M: Thưa bà con, tìm được người hợp nhau đã khó, | dám cùng nhau bước vào hôn nhân càng đáng quý. | Xin chúc mừng ${g} và ${b}, ^lễ cưới bắt đầu!`,
  ],
  // Lễ bái đường: MC xướng, hô "Bái!" (cặp đôi cúi đúng lúc đó), rồi nói tiếp. Mỗi bước 5 bản.
  bai: [
    {
      kind: 'heaven' as const,
      call: [
        `M: ^Nhất bái thiên địa! | Cô dâu chú rể quay ra, chắp tay hướng về trời đất.`,
        `M: Nghi thức đầu tiên. ^Nhất bái thiên địa! | Mời hai bạn quay ra, chắp tay.`,
        `M: Trời đất chứng giám cho đôi uyên ương. | ^Nhất bái thiên địa!`,
        `M: Mời cô dâu chú rể hướng về trời đất. | ^Nhất bái thiên địa!`,
        `M: ^Nhất bái thiên địa! | Hai bạn quay ra phía cổng hoa, chắp tay thật ngay ngắn.`,
      ],
      after: [
        `M: Cảm tạ trời đất đã se duyên cho hai người!`,
        `M: Cảm tạ trời đất đã cho hai người gặp nhau giữa biển người.`,
        `M: Trời cao đất dày chứng giám, từ nay hai bạn là của nhau.`,
        `M: Mưa thuận gió hòa, chúc hai bạn ^thuận buồm xuôi gió!`,
        `M: Trời đất đã chứng giám rồi, ^không rút lại được đâu nha!`,
      ],
    },
    {
      kind: 'parents' as const,
      call: [
        `M: ^Nhị bái cao đường! | Xin mời ba mẹ hai bên! | Cô dâu chú rể quay vào, chắp tay trước ba mẹ.`,
        `M: Để có ngày hôm nay là bao năm ba mẹ chăm lo, dõi theo từng bước con lớn. | Xin trân trọng kính mời đại diện nhà trai và nhà gái! | ^Nhị bái cao đường!`,
        `M: Xin mời ba mẹ hai bên lên sân khấu. | Cha mẹ là người thương ta trước cả khi ta biết thương ai. | ^Nhị bái cao đường!`,
        `M: Nghi thức thứ hai, tri ân đấng sinh thành. | Mời cô dâu chú rể quay vào ba mẹ. | ^Nhị bái cao đường!`,
        `M: Kính mời ông bà thông gia hai bên! | Hai con xin cúi lạy tạ ơn. | ^Nhị bái cao đường!`,
      ],
      after: [
        `M: Tạ ơn công sinh thành dưỡng dục của ba mẹ hai bên!`,
        `M: Kính chúc ông bà thông gia mạnh khỏe, ^sớm được bế cháu!`,
        `M: Từ hôm nay ba mẹ có thêm một người con. ^Hai nhà thành một nhà!`,
        `M: Ba mẹ cười tươi quá kìa bà con! ^Mát lòng mát dạ hai bên!`,
        `M: Công cha như núi, nghĩa mẹ như nước. ^Hai con xin ghi nhớ suốt đời!`,
      ],
    },
    {
      kind: 'each' as const,
      call: [
        `M: ^Phu thê giao bái! | Vợ chồng quay mặt vào nhau.`,
        `M: Nghi thức cuối cùng. | Mời hai vợ chồng quay mặt vào nhau. | ^Phu thê giao bái!`,
        `M: Từ giây phút này hai bạn là vợ chồng. | ^Phu thê giao bái!`,
        `M: Nhìn vào mắt nhau đi hai bạn. | ^Phu thê giao bái!`,
        `M: ^Phu thê giao bái! | Kính trọng nhau từ cái cúi đầu đầu tiên.`,
      ],
      after: [
        `M: Từ nay thuận vợ thuận chồng, ^tát biển Đông cũng cạn!`,
        `M: Từ giây phút này, vui có người chia, buồn có người nghe, | còn chuyện tối nay ăn gì thì ^đã có người cùng cãi!`,
        `M: Chúc hai bạn luôn thương nhau, hiểu nhau, ^nhường nhau một bước!`,
        `M: Hai cái đầu cúi xuống, ^một mái nhà dựng lên!`,
        `M: Cúi chào nhau lần này, ^về nhà nhớ cúi chào nhau mỗi ngày nha!`,
      ],
    },
  ],
  baiCue: `M: ^Bái!`,
  dongPhong: [
    (g: N, b: N) => `M: ^Lễ thành! | Kính chúc hai bạn luôn thương nhau, cùng xây một tổ ấm bình yên. | Xe hoa đã tới! ^Mời ${g} và ${b} về động phòng!`,
    (g: N, b: N) => `M: ^Lễ thành! Đưa vào động phòng! | Xe hoa đã tới thảm đỏ rồi bà con ơi! | Mời ${g} và ${b} lên xe!`,
    (g: N, b: N) => `M: Các nghi thức thiêng liêng đã xong! | Xe hoa vào tận thảm đỏ đón đôi uyên ương. | ^${g} và ${b}, lên xe thôi!`,
    (g: N, b: N) => `M: Nghe tiếng còi xe hoa chưa bà con? | Xe tới đón cô dâu ${b} và chú rể ${g} rồi! | ^Đưa vào động phòng!`,
    (g: N, b: N) => `M: ^Trăm năm hạnh phúc! | Bà con tránh đường cho xe hoa nha! | Mời ${g} và ${b} lên xe về nhà chung!`,
  ],
  closing: [
    (g: N, b: N) => `M: Chúc ${g} và ${b} trăm năm hạnh phúc, đầu bạc răng long! | Ai muốn là cặp tiếp theo thì gõ cưới, a còng, tên người ta nha!`,
    (g: N, b: N) => `M: Chúc ${g} và ${b} sớm có tin vui, ^sinh đôi luôn! | Cặp tiếp theo là ai đây? Gõ cưới, a còng, tên người ấy!`,
    (g: N, b: N) => `M: Thay mặt hai họ, MC cảm ơn bà con đã chứng kiến và chúc phúc cho ${g} và ${b}. | Tiệc vẫn tiếp tục nha! | Ai muốn là cặp tiếp theo thì gõ cưới, a còng, tên người ấy!`,
    (g: N, b: N) => `M: Xe hoa đã đưa ${g} và ${b} về nhà chung! | Nhớ mời MC đi đầy tháng nha! | ^Đám tiếp theo đâu rồi bà con?`,
    (g: N, b: N) => `M: Một đám cưới đẹp vừa khép lại. | Chúc ${g} và ${b} mãi thương nhau như hôm nay. | Gõ cưới, a còng, tên người ấy, ^đám sau là của bạn!`,
  ],

  // ---------- Danh hiệu trên bảng tên ----------
  titles: {
    married: (partner: N) => `💍 Đã cưới ${partner}`,
    stealer: (role: 'groom' | 'bride') => (role === 'groom' ? '🦹 Siêu trộm rể' : '🦹 Siêu trộm dâu'),
    robbed: '💔 Bị cướp người yêu',
    kept: '🛡️ Giữ được người thương',
    rejected: '💔 Bị từ chối',
  },

  // ---------- Quà theo cấp (xu 1 lần tặng) ----------
  // fx: hearts, confetti, petals, fireworks, gold, party
  giftTiers: [
    {
      min: 999,
      fx: ['fireworks', 'gold', 'hearts', 'party', 'petals'],
      lines: [
        (n: N) => `M: Cảm ơn ${n} rất nhiều! | Món quà này cô dâu chú rể sẽ nhớ mãi. | ^Một tràng pháo tay cho ${n}!`,
        (n: N) => `M: Trời ơi, ${n} thương đám cưới nhà mình quá. | Thay mặt hai họ, MC cúi đầu cảm ơn ${n}.`,
        (n: N) => `M: ${n} vừa gửi một món quà rất lớn. | Chúc ${n} sức khỏe, bình an, và sớm có tin vui.`,
      ],
    },
    {
      min: 299,
      fx: ['gold', 'party', 'confetti'],
      lines: [
        (n: N) => `M: Cảm ơn ${n}, quà to quá! | Cả sảnh mưa vàng mừng cô dâu chú rể luôn.`,
        (n: N) => `M: ${n} chơi lớn rồi bà con. | MC thay mặt hai họ cảm ơn ${n} nha.`,
        (n: N) => `M: Cảm ơn ${n} đã thương đám cưới nhà mình. | Chúc ${n} làm ăn phát đạt.`,
      ],
    },
    {
      min: 99,
      fx: ['fireworks', 'confetti'],
      lines: [
        (n: N) => `M: Cảm ơn ${n} đã bắn pháo hoa mừng cưới. | Đẹp quá bà con ơi.`,
        (n: N) => `M: Pháo hoa của ${n} sáng cả sảnh rồi. | Cảm ơn ${n} nhiều nha.`,
        (n: N) => `M: ${n} gửi pháo hoa mừng đôi uyên ương. | Chúc ${n} một tối thật vui.`,
      ],
    },
    {
      min: 30,
      fx: ['confetti', 'hearts'],
      lines: [
        (n: N) => `M: Cảm ơn ${n} đã gửi quà mừng. | Pháo giấy bay rồi kìa.`,
        (n: N) => `M: ${n} gửi phong bì mừng cưới nè bà con. | Cảm ơn ${n} nha.`,
        (n: N) => `M: Quà của ${n} tới rồi. | Cô dâu chú rể cảm ơn ${n} nhiều.`,
      ],
    },
    {
      min: 10,
      fx: ['hearts', 'petals'],
      lines: [
        (n: N) => `M: Cảm ơn ${n}. | Hoa rơi rồi kìa, lãng mạn ghê.`,
        (n: N) => `M: ${n} gửi quà mừng cưới. | Quà nhỏ mà tình to, cảm ơn ${n} nha.`,
        (n: N) => `M: Cảm ơn tấm lòng của ${n}.`,
      ],
    },
    {
      min: 1,
      fx: ['hearts'],
      lines: [
        (n: N) => `M: Cảm ơn ${n} nha.`,
        (n: N) => `M: ${n} gửi quà rồi, cảm ơn bạn.`,
        (n: N) => `M: Cảm ơn ${n}, cô dâu chú rể nhận hết.`,
      ],
    },
  ],

  boostLine: `M: Ba trăm tim rồi bà con ơi! | Cảm ơn cả sảnh, mình cùng nâng ly nào. | ${CHANT}`,
  zoLine: `M: Bàn nào cũng cụng ly rồi kìa. | ${CHANT}`,
  thankFollow: (n: N) => `M: Cảm ơn ${n} đã theo dõi kênh. | Từ nay là người nhà rồi nha.`,
  shareLines: [
    `M: Bà con ơi, chia sẻ live cho bạn bè vào ăn cưới với nha. | Đông vui mới có nhiều duyên.`,
    `M: Ai có đứa bạn còn độc thân thì chia sẻ live cho bạn ấy. | Biết đâu hôm nay bạn ấy gặp được người thương.`,
    `M: Nếu thấy đám cưới nhà mình vui, bà con chia sẻ giúp MC nha. | Cảm ơn bà con nhiều.`,
  ],
  shareWithNames: (names: string) => `M: ${names} ơi, chia sẻ live cho bạn bè vào ăn cưới nha. | Đông vui mới có nhiều duyên.`,
  // ---------- Mai mối: MC gọi tên 2 bạn cùng bàn, gợi ý nhẹ nhàng ----------
  pairEveryMs: 70_000,
  pair: [
    (a: N, b: N) => `M: MC để ý thấy ${a} với ${b} ngồi gần nhau nãy giờ. | Bà con thấy có đẹp đôi không?`,
    (a: N, b: N) => `M: ${a} và ${b} ơi, hai bạn nhìn hợp nhau ghê. | Nếu có cảm tình thì gõ cưới thử nha.`,
    (a: N, b: N) => `M: Ông tơ bà nguyệt chắc đang đứng sau lưng ${a} với ${b} rồi. | Chỉ chờ một người mở lời thôi.`,
    (a: N, b: N) => `M: Có những cuộc gặp tình cờ mà thành duyên. | Như ${a} với ${b} hôm nay chẳng hạn.`,
    (a: N, b: N) => `M: ${a} ơi, ${b} ngồi ngay đó kìa. | Ngại thì để MC nói giùm: hai bạn có muốn thử không?`,
    (a: N, b: N) => `M: Cả sảnh ơi, cho ${a} và ${b} một tràng pháo tay khích lệ nào. | Biết đâu đám tiếp theo là của hai bạn.`,
  ],  pairBubble: ['🙈 Ngại quá à', '😏 Cũng được...', '💓 Tim đập nhanh rồi', '🤭 MC ác ghê', '😳 Ai? Tui hả?'],
  pairPush: [
    (a: N, b: N) => `M: ${a} ơi, vẫn còn ngại hả? | Gõ cưới, a còng, tên của ${b} là được nha.`,
    (a: N, b: N) => `M: ${b} ơi, bạn hỏi trước cũng được đó. | Thời nay ai mở lời trước cũng đáng quý.`,
    (a: N, b: N) => `M: Không sao, ${a} với ${b} cứ từ từ. | Duyên tới thì mình nắm lấy thôi.`,
  ],
  // ---------- Nguyệt Lão se duyên: mời gõ SE DUYÊN, hết giờ bốc 2 người buộc tơ hồng ----------
  duyen: {
    everyMs: 4 * 60_000,
    windowMs: 30_000,
    intro: [
      `M: Bà con ơi, Nguyệt Lão vừa xuống sảnh rồi. | Ai đang tìm người thương thì gõ se duyên nha, mình có ba mươi giây.`,
      `M: Đèn dịu lại một chút, Nguyệt Lão đã tới. | Ai muốn được se tơ hồng thì gõ se duyên.`,
      `M: Tới giờ se duyên rồi bà con. | Gõ se duyên để Nguyệt Lão buộc cho mình một sợi chỉ hồng nha.`,
      `M: Nguyệt Lão hỏi trong sảnh mình ai còn độc thân. | Gõ se duyên cho ông biết nha.`,
      `M: Người xưa nói duyên do trời định. | Hôm nay trời cho mình ba mươi giây, ai muốn thì gõ se duyên.`,
    ],
    count: [
      (n: number) => `M: Đã có ${n} người xin duyên rồi.`,
      (n: number) => `M: ${n} người gõ se duyên rồi, Nguyệt Lão vui lắm.`,
      (n: number) => `M: ${n} người đang chờ tơ hồng. | Ai chưa gõ thì nhanh tay nha.`,
    ],
    before: [
      `M: Hết giờ rồi. Nguyệt Lão gửi lời nguyện cho bà con.`,
      `M: Mọi người lắng nghe một chút nha. Nguyệt Lão có đôi lời.`,
      `M: Nhạc nhỏ lại, Nguyệt Lão bắt đầu se duyên.`,
    ],
    pair: [
      (a: N, b: N) => `M: Nguyệt Lão đã chọn rồi. | Sợi tơ hồng nối ${a} với ${b}. | Nếu thấy hợp thì gõ cưới nha hai bạn.`,
      (a: N, b: N) => `M: Sợi chỉ đỏ bay qua sảnh, và dừng lại ở ${a} với ${b}. | Duyên trời định đó bà con.`,
      (a: N, b: N) => `M: Nguyệt Lão nói ${a} với ${b} có duyên từ kiếp trước. | Kiếp này gặp lại ở đây rồi.`,
      (a: N, b: N) => `M: Tơ hồng đã nối ${a} và ${b}. | Ai mở lời trước thì gõ cưới, a còng, tên người kia nha.`,
      (a: N, b: N) => `M: ${a} với ${b} vừa được buộc chung một sợi chỉ hồng. | Cả sảnh chúc mừng hai bạn nào.`,
    ],
    single: (a: N) => `M: Mới có ${a} xin duyên thôi. | Nguyệt Lão buộc một đầu chỉ cho ${a}, đầu kia còn chờ người nắm.`,
    none: [
      `M: Lần này chưa ai xin duyên. | Không sao, lát nữa Nguyệt Lão quay lại nha.`,
      `M: Chắc sảnh mình ai cũng có đôi rồi. | Nguyệt Lão hẹn bà con lần sau.`,
    ],    bubble: ['🙏 Xin duyên!', '🧧 Se cho con với', '💘 Con ế lâu rồi', '🙏 Nguyệt Lão ơi'],
  },
  titleThread: (partner: N) => `🧵 Tơ hồng với ${partner}`,
  // người tặng quà lúc se duyên: lên sân khấu làm Nguyệt Lão
  matchmaker: [
    (a: N) => `M: Cảm ơn ${a} đã tặng quà. | Hôm nay ${a} được lên sân khấu làm Nguyệt Lão se duyên cho cả sảnh.`,
    (a: N) => `M: ${a} vừa gửi quà, vậy Nguyệt Lão nhường ghế cho ${a} nha. | Ai được ${a} se duyên là có phúc.`,
    (a: N) => `M: Nguyệt Lão hôm nay là ${a}. | Một tràng pháo tay cho Nguyệt Lão mới nào.`,
  ],
  pairBy: [
    (m: N, a: N, b: N) => `M: Nguyệt Lão ${m} đã chọn ${a} và ${b}. | Chúc hai bạn có duyên thành đôi.`,
    (m: N, a: N, b: N) => `M: ${m} buộc sợi chỉ hồng cho ${a} với ${b}. | Nguyệt Lão mới mà chọn khéo ghê.`,
    (m: N, a: N, b: N) => `M: Nguyệt Lão ${m} suy nghĩ một lúc, rồi chọn ${a} và ${b}. | Hai bạn thấy hợp thì gõ cưới nha.`,
  ],
  danceJoin: [
    (a: N) => `M: ${a} ra sàn nhảy rồi kìa.`,
    (a: N) => `M: ${a} vừa nhập hội đội nhảy, vui ghê.`,
    (a: N) => `M: Nhìn ${a} nhảy là thấy vui lây.`,
  ],
  danceCrew: [
    `M: Đội nhảy ra sàn rồi bà con. | Có cả bà nội với em bé nữa kìa.`,
    `M: Nhạc lên rồi, đội nhảy bắt đầu. | Ai muốn nhảy cùng thì gõ quẩy nha.`,
    `M: Đội nhảy hôm nay đủ mọi lứa tuổi. | Vui là chính bà con ơi.`,
  ],

  // ---------- Người lướt vào live: cho ngồi ăn cỗ luôn, MC gọi tên trêu ----------
  passer: [
    (n: N) => `M: ${n} vừa ngồi xuống bàn rồi. | Ăn cỗ xong nhớ comment một câu cho MC biết nha.`,
    (n: N) => `M: Chào ${n}, ghế này MC giữ cho bạn đó. | Cứ tự nhiên nha.`,
    (n: N) => `M: ${n} ghé chơi rồi kìa. | Ở lại chung vui với hai họ nha.`,
    (n: N) => `M: ${n} vừa vào sảnh. | Biết đâu hôm nay có duyên ở đây.`,
    (n: N) => `M: Mời ${n} ngồi. | Đám cưới nhà mình ai cũng là khách quý.`,
  ],  passerEmoji: ['🍗', '😋', '🥢', '🥂', '👀', '🤭'],

  // ---------- Dàn khách quen (nhân vật của chương trình, không phải người xem) ----------
  // lúc phòng vắng tự diễn cầu hôn / đồng ý / từ chối cho màn hình luôn có chuyện
  // tên kiểu người dùng TikTok thật (chủ kênh chốt, không dùng tên vui kiểu "Bà Tám Hàng Xóm")
  cast: [
    { name: 'Tuấn Anh', fem: false },
    { name: 'Trang Nguyễn', fem: true },
    { name: 'Hoàng Nam 2k', fem: false },
    { name: 'Ngọc Hân', fem: true },
    { name: 'Đức Huy', fem: false },
    { name: 'Linh Chi', fem: true },
    { name: 'Quốc Bảo', fem: false },
    { name: 'Kim Ngân', fem: true },
    { name: 'Minh Khang', fem: false },
    { name: 'Thảo Vy', fem: true },
  ],
  autoAfterMs: 90_000, // phòng im bao lâu thì dàn khách quen tự diễn
  autoEveryMs: 5 * 60_000, // thưa ra (70 giây/lần làm cả kịch bản đám cưới lặp liên tục)

  // ---------- Màn mở đầu / đám tự diễn: câu hỏi treo cho người mới lướt vào ----------
  autoHook: [
    (a: N, b: N) => `M: Bà con mới vào đúng lúc nha. | ${a} đang chờ ${b} trả lời lời cầu hôn.`,
    (a: N, b: N) => `M: Ai mới vào thì ngồi xuống chung vui. | ${b} sắp trả lời ${a} rồi.`,
    (a: N, b: N) => `M: Mình cùng đoán xem ${b} có gật đầu với ${a} không nha.`,
  ],
  // ---------- Quẩy DJ: cả sảnh lên sân khấu ----------
  djEveryMs: 6 * 60_000,
  djMs: 60_000, // tiết mục nhảy 60 giây (chủ kênh chốt)
  djHypeEveryMs: 15_000,
  djIntro: [
    `M: DJ ơi, lên nhạc nào! | Mời cả sảnh cùng ra sàn nhảy một chút nha.`,
    `M: Đèn đổi màu rồi, nhạc lên rồi. | Bà con cùng nhảy mừng cô dâu chú rể nào.`,
    `M: Ăn cỗ cũng lâu rồi, mình đứng dậy nhảy một bài nha bà con.`,
  ],
  djHype: [
    `M: Giơ tay lên nào bà con.`,
    `M: Bà nội cũng ra nhảy rồi kìa, dễ thương ghê.`,
    `M: Ai muốn nhân vật của mình lên sàn thì gõ quẩy nha.`,
    `M: Nhạc vui quá, cả sảnh nhảy đều luôn.`,
    `M: Thả tim cho DJ đi bà con.`,
    `M: Mấy bé chó mèo cũng nhảy theo kìa.`,
    `M: Một, hai, ba, xoay nào.`,
  ],
  // xen giữa câu hô lúc nhảy: MC chúc cả sảnh sức khỏe, tình duyên
  djWish: [
    `M: Nhân ngày vui, MC chúc cả sảnh thật nhiều sức khỏe! | ^Nhảy khỏe, ăn ngon, ngủ ngon!`,
    `M: Chúc ai còn độc thân năm nay gặp được người thương! | ^Ai có đôi rồi thì thương nhau dài lâu!`,
    `M: Chúc ông bà cô bác mạnh khỏe, sống lâu trăm tuổi! | ^Năm sau còn đi ăn cưới tiếp!`,
    `M: Chúc bà con làm ăn phát đạt, tiền vô như nước! | ^Đi ăn cưới không phải lo phong bì!`,
    `M: Chúc các bạn trẻ tình duyên rộng mở! | Hôm nay đi ăn cưới, ^tháng sau đến lượt mình!`,
    `M: Chúc mọi nhà bình an, con cháu sum vầy! | ^Ngày nào cũng vui như hôm nay!`,
    `M: Ai đang thầm thương trộm nhớ ai thì chúc sớm được đáp lại! | ^Gõ cưới a còng, tên người ấy luôn đi!`,
    `M: Chúc cả sảnh ăn ngon, ngủ ngon, không ai đau ốm! | ^Sức khỏe là vàng bà con ơi!`,
    `M: Chúc các cặp đôi trong sảnh hôm nay mãi mặn nồng! | ^Cãi nhau một câu, làm lành hai câu!`,
    `M: Chúc bà con đang xem live một tối thật vui! | ^Thả tim là nhận lời chúc của MC rồi đó!`,
  ],
  djEnd: `M: Hết nhạc rồi bà con. | Mời mọi người về chỗ ăn cỗ tiếp nha.`,
  // ---------- Mốc tim: 100 pháo giấy, 300 cả sảnh quẩy, 1000 xe hoa rước dâu ----------
  likeMilestones: [100, 300, 1000],
  likes100: `M: Một trăm tim rồi, cảm ơn bà con nhiều. | Thả tiếp tới ba trăm là cả sảnh cùng nhảy nha.`,
  likes1000: `M: Một nghìn tim rồi bà con ơi. | Cảm ơn cả sảnh đã thương đám cưới nhà mình.`,
  // ---------- Bình chọn đẹp đôi sau mỗi đám ----------
  voteMs: 20_000,
  voteAsk: [
    (g: N, b: N) => `M: Bà con thấy ${g} với ${b} có hợp không? | Gõ một là hợp, gõ hai là chưa hợp nha.`,
    (g: N, b: N) => `M: Mình cùng chấm điểm đôi uyên ương nha. | Thấy ${g} và ${b} đẹp đôi thì gõ một, chưa hợp thì gõ hai.`,
  ],
  voteHigh: (p: number) => `M: ${p} phần trăm bà con nói hợp. | Đúng là trời sinh một cặp.`,
  voteMid: (p: number) => `M: ${p} phần trăm nói hợp. | Cưới rồi thì từ từ hiểu nhau thêm, không sao.`,
  voteLow: (p: number) => `M: Mới có ${p} phần trăm nói hợp thôi. | Không sao, hai bạn hợp nhau là được rồi.`,
  voteNone: `M: Chưa ai bình chọn hết. | Vậy MC chấm luôn: một trăm điểm cho đôi uyên ương.`,
  // ---------- Sự kiện bất ngờ mỗi 3–5 phút ----------
  eventEveryMs: [3 * 60_000, 5 * 60_000],
  ev: {
    blackoutStart: `M: Ơ, đèn tắt rồi bà con. | Mọi người bình tĩnh ngồi yên chút nha.`,
    blackoutSwap: (old: N, now: N) => `M: Đèn sáng lại rồi. | Ủa, cô dâu đâu phải ${old} nữa, giờ là ${now} đứng đó. | Duyên đổi nhanh quá bà con.`,
    blackoutNoCouple: (n: number) => `M: Đèn sáng lại rồi. | Mọi người vẫn ổn hết chứ? Mình tiếp tục nha.`,
    mom: (b: N) => `M: Mẹ chồng lên thăm cô dâu ${b} kìa bà con. | Mẹ dặn dò con dâu mới vài câu.`,
    ex: (g: N) => `M: Ơ, có người quen cũ của ${g} ghé ngang. | Thôi chuyện cũ để lại phía sau, hôm nay là ngày vui.`,
  // MC hát: lời tự viết (không dùng lời bài hát có bản quyền)
    songIntro: `M: Bà con ơi, cho MC xin một phút! | Tắt hết đèn giùm MC! | ^Đèn rọi đâu, chiếu vào MC nào!`,
    songs: [
      `M: Đêm nay sảnh cưới lung linh ánh đèn, | hai trái tim chung một nhịp yêu thương. | ^Trăm năm bên nhau, chẳng rời xa!`,
      `M: Tay trong tay mình bước lên thảm đỏ, | nụ cười em sáng cả một trời đêm. | ^Cưới liền tay, hạnh phúc liền tay!`,
      `M: Một ly rượu hồng chúc đôi uyên ương, | sớm chiều có nhau đi suốt con đường. | ^Hạnh phúc ơi, ở lại thật lâu!`,
      `M: Nâng ly lên cao, bà con ơi, | chúc cho đôi ta mãi mãi ngọt ngào. | ^Một, hai, ba, dô!`,
      `M: Ai đang cô đơn, đừng buồn nữa nhé, | tơ hồng đâu đó đang chờ phía trước. | ^Gõ cưới liền tay, có nhau liền tay!`,
    ],
    songOutro: `M: Cảm ơn bà con đã nghe MC hát. | Thả tim cho MC lấy tinh thần nha.`,
    envelope: `M: Sui gia gửi lộc cho cả sảnh nè bà con. | Chúc ai cũng may mắn, làm ăn phát đạt.`,
  },

  // ---------- Tuyển người xem làm nhân viên / vũ công (ngẫu nhiên) ----------
  hireEveryMs: 100_000,
  hireMs: 90_000,
  hireWaiter: [
    (n: N) => `M: ${n} được mời phụ bưng mâm cho tiệc cưới. | Cảm ơn ${n} nha.`,
    (n: N) => `M: Nhà hàng thiếu người, ${n} vào phụ một tay nha.`,
    (n: N) => `M: ${n} mặc đồng phục phục vụ rồi kìa, nhìn chuyên nghiệp ghê.`,
  ],
  hireDancer: [
    (n: N) => `M: ${n} được mời lên sân khấu làm vũ công.`,
    (n: N) => `M: Đội vũ công có thêm ${n} rồi. | Lát nhảy nhớ nhảy thật vui nha.`,
    (n: N) => `M: ${n} mặc đồ vũ công rồi kìa bà con.`,
  ],
  // ---------- MC rảnh thì nói ----------
  chatter: {
    howTo: [
      `M: Nhắc lại luật nha bà con. | Gõ cưới vợ hoặc cưới chồng, a còng, tên người ấy là cầu hôn. | Người được hỏi gõ đồng ý thì mới thành đôi.`,
      `M: Ai được cầu hôn thì có sáu mươi giây để gõ đồng ý. | Gõ đồng ý là lên lễ đường.`,
      `M: Ai đang thương thầm ai thì hôm nay là dịp tốt. | Gõ cưới, a còng, tên người ấy nha.`,
    ],
    crowd: [
      (n: number) => `M: Sảnh mình đang có ${n} khách. | Chắc chắn trong đây có một cặp trời sinh.`,
      (n: number) => `M: ${n} người đang ngồi ăn cỗ. | Ai sẽ là cặp đầu tiên hôm nay đây?`,
    ],
    married: [
      (k: number) => `M: Hôm nay sảnh mình đã có ${k} cặp về chung một nhà.`,
      (k: number) => `M: ${k} đám cưới rồi bà con. | MC dẫn hoài vẫn thấy vui.`,
      (k: number) => `M: ${k} cặp đã thành đôi trên sóng live hôm nay. | Cảm ơn bà con đã chứng kiến.`,
    ],
  // vài phút sau đám cưới: nhắc lại cặp vừa cưới (5 bản)
    recentCouple: [
      (g: N, b: N) => `M: Bà con còn nhớ ${g} với ${b} vừa cưới không? | Giờ chắc hai bạn đang ngồi tính chuyện tuần trăng mật rồi.`,
      (g: N, b: N) => `M: Nhìn ${g} với ${b} lúc cúi lạy ba mẹ, MC thấy thương ghê. | Chúc hai bạn giữ mãi cảm giác hôm nay.`,
      (g: N, b: N) => `M: Xe hoa chở ${g} với ${b} đi rồi mà MC vẫn còn vui lây. | Ai muốn là cặp tiếp theo thì gõ cưới nha.`,
      (g: N, b: N) => `M: ${g} với ${b} đã thành vợ chồng trên sóng live này. | Sau này kể cho con cháu nghe chắc vui lắm.`,
      (g: N, b: N) => `M: Một lời hỏi, một cái gật đầu, vậy là ${g} với ${b} thành đôi. | Duyên đơn giản vậy thôi bà con.`,
    ],
    questions: [
      `M: Bà con đang xem live ở đâu đó? | Comment tên tỉnh cho MC biết nha.`,
      `M: Ai còn nhớ lần đầu đi ăn cưới của bạn thân không? | Kể cho MC nghe với.`,
      `M: Bà con thích cô dâu mặc váy cưới hay áo dài? | Comment cho MC biết nha.`,
      `M: Ai đang có người thương thì thả một trái tim cho MC xem nào.`,
      `M: Theo bà con, yêu bao lâu thì nên cưới? | Comment cho MC tham khảo với.`,
      `M: Ai từng quen nhau qua mạng rồi thành đôi không? | Chuyện đó dễ thương lắm.`,
      `M: Bà con thích đám cưới ở quê hay ở nhà hàng hơn?`,
    ],    custom: [
      `M: Bà con biết không, đám cưới miền Bắc hay có mâm quả số lẻ. | Năm mâm, bảy mâm, chín mâm! | Số lẻ là mong vợ chồng sinh sôi nảy nở.`,
      `M: Trong đám hỏi lúc nào cũng có trầu cau. | Vì sự tích trầu cau nói về tình nghĩa vợ chồng anh em! | Nghĩa nặng tình sâu.`,
      `M: Đi đón dâu phải chọn giờ đẹp nha bà con! | Trễ giờ là nhà gái đứng chờ, nhà trai bị trách cả đời! | Nhớ đi sớm.`,
      `M: Miền Nam đám cưới hay có bàn thờ gia tiên. | Cô dâu chú rể thắp hương báo cáo ông bà. | Ông bà gật đầu là cưới.`,
      `M: Ném hoa cưới là phong tục từ phương Tây đó. | Ai bắt được bó hoa thì người ta nói sắp lấy chồng! | Ở đây không cần bắt hoa, gõ cưới là được.`,
      `M: Ngày xưa, nhà trai phải mang lễ sang nhà gái xin dạm ngõ. | Còn bây giờ chỉ cần gõ cưới vợ a còng, tên người ấy! | Tiện quá trời.`,
      `M: Trong đám cưới, phù dâu phù rể thường là bạn thân chưa cưới. | Đi phù dâu nhiều quá là ế đó nha! | Ai làm phù dâu rồi thì gõ cưới đi.`,
    ],
    // giữ chân: hứa trước điều sắp xảy ra
    hook: [
      `M: Bà con mới vào ở lại chơi nha. | Vài phút nữa Nguyệt Lão xuống se duyên ngẫu nhiên.`,
      `M: Ai mới vào thì comment một câu. | Comment là có nhân vật mang tên bạn vào dự tiệc.`,
      `M: Ở lại thêm chút nha bà con. | Lát nữa có tiết mục nhảy, cả sảnh cùng ra sàn.`,
      `M: Ai thấy vui thì thả tim giùm MC nha. | Đủ ba trăm tim là cả sảnh cùng nhảy.`,
    ],    praise: [
      `M: Kính thưa quan viên hai họ! | Hôm nay ngày lành tháng tốt, nhà trai đẹp người đẹp nết, nhà gái nết na đảm đang. | ^Đúng là môn đăng hộ đối!`,
      `M: Nhà trai hôm nay đến đông đủ, ai cũng chỉnh tề lịch sự. | Nhìn là biết gia đình nề nếp, gia giáo! | ^Xin một tràng pháo tay cho nhà trai!`,
      `M: Còn nhà gái thì khỏi phải bàn! | Cô nào cũng xinh, bác nào cũng hiền hậu, mâm cỗ thì tươm tất. | ^Nhà gái chu đáo quá bà con ơi!`,
      `M: Hôm nay cô dâu là cô dâu đẹp nhất sảnh này. | Chú rể là chú rể bảnh nhất sảnh này. | Chúc hai bạn luôn yêu thương và trân trọng nhau trên mỗi chặng đường sắp tới!`,
      `M: Nhìn hai bạn từ ngày mới quen đến hôm nay cùng bước lên lễ đường, MC thật sự xúc động. | ^Chúc hai bạn trăm năm hạnh phúc!`,
      `M: Hôm nay không chỉ là ngày vui của cô dâu chú rể. | Mà hai bên gia đình cũng có thêm một niềm hạnh phúc lớn. | ^Chúc hai bạn đầu bạc răng long!`,
      `M: Thay mặt hai họ, MC xin cảm ơn toàn thể quan khách đã bớt chút thời gian quý báu đến chung vui. | ^Sự có mặt của bà con là niềm vinh hạnh của gia đình!`,
      `M: Nhân ngày lành tháng tốt, nhìn các con trưởng thành, nên vợ nên chồng, ba mẹ hai bên vô cùng xúc động. | ^Xin chúc mừng hai gia đình!`,
      `M: Ba mẹ hai bên chỉ mong các con biết nhường nhịn, yêu thương nhau. | Cùng nhau vượt qua mọi khó khăn trong cuộc sống. | ^Thuận vợ thuận chồng, tát biển Đông cũng cạn!`,
      `M: Cô dâu chú rể xin gửi lời cảm ơn công sinh thành dưỡng dục của cha mẹ hai bên. | Có ngày hôm nay là nhờ tình thương vô bờ bến của ba mẹ!`,
      `M: Cảm ơn các cô chú, anh chị và các bạn đã đến chung vui. | Gia đình chúc bà con mạnh khỏe, làm ăn phát đạt, ^năm nay ai cũng có tin vui!`,
      `M: Ông bà ta có câu: trai khôn tìm vợ, gái ngoan tìm chồng. | Hôm nay nhà trai tìm được nàng dâu hiền, nhà gái tìm được chàng rể quý. | ^Mát lòng mát dạ hai bên!`,
      `M: Mẹ chú rể hôm nay cười tươi nhất sảnh! | Bởi vì có thêm một cô con gái vừa xinh vừa giỏi. | ^Mẹ chồng nàng dâu thương nhau như ruột thịt!`,
      `M: Còn ba cô dâu thì hơi rưng rưng. | Nuôi con gái hai mươi mấy năm, nay trao cho người ta. | Chú rể nhớ thương vợ cho đàng hoàng nha, ^ba vợ đang nhìn đó!`,
      `M: Mâm cỗ hôm nay do nhà gái lo, ngon hết chỗ chê! | Gà luộc vàng ươm, nem rán giòn rụm. | ^Bà con cứ ăn tự nhiên như ở nhà!`,
      `M: Họ hàng nhà trai hôm nay đi cả chục xe! | Ai cũng mang theo tấm lòng và lời chúc tốt đẹp nhất. | ^Quý hóa quá!`,
      `M: Kính chúc hai bên gia đình sum vầy, con cháu đề huề. | Chúc cô dâu chú rể sớm sinh quý tử, ^nhà cửa lúc nào cũng rộn tiếng cười!`,
      `M: Một đám cưới đẹp là khi hai họ thương nhau như một nhà. | Hôm nay nhìn nhà trai nhà gái cụng ly là MC biết, ^từ nay về sau chỉ toàn chuyện vui!`,
      `M: Xin kính chúc ông bà nội ngoại hai bên sống lâu trăm tuổi. | Để còn bế chắt, ^còn ăn cưới cháu chắt nữa!`,
      `M: Bà con đang xem live cũng là khách quý của hai họ. | Comment một lời chúc cho cô dâu chú rể đi! | ^Comment là có nhân vật mang tên bạn vào dự tiệc!`,
    ],
    // nói chuyện tình yêu đôi lứa, giọng thủ thỉ tự nhiên (ít hô to)
    love: [
      `M: Bà con biết không, yêu nhau lâu rồi mới thấy, | cái quý nhất không phải lời hứa, mà là người ta vẫn ở đó mỗi ngày.`,
      `M: Có người hỏi MC: làm sao biết người đó là đúng người? | MC nghĩ là khi ở cạnh họ, mình được là chính mình.`,
      `M: Tình yêu đẹp nhất không phải lúc mới quen, | mà là lúc hai người đã quen nhau rồi mà vẫn còn thương.`,
      `M: Ngày xưa ông bà mình cưới nhau, | có khi chỉ gặp nhau vài lần. Vậy mà thương nhau tới đầu bạc răng long.`,
      `M: Yêu là cùng nhau ăn một bữa cơm đơn giản, | mà thấy ngon hơn cả cỗ cưới.`,
      `M: Có những người đi cả đời mới gặp được nhau. | Nên ai đang có người thương, nhớ giữ cho thật kỹ nha.`,
      `M: MC hay nghe nói: cưới nhau rồi là hết lãng mạn. | MC thấy không phải đâu, lãng mạn chỉ đổi cách thôi. Là nhớ mua giùm nhau ổ bánh mì buổi sáng.`,
      `M: Cãi nhau thì cặp nào cũng cãi. | Quan trọng là cãi xong, ai là người nắm tay trước.`,
      `M: Ai đang yêu xa thì cố lên nha. | Khoảng cách chỉ là con số, người thương mới là thật.`,
      `M: Có ai còn nhớ lần đầu nắm tay người yêu không? | Comment cho MC nghe với, chắc ai cũng run hết.`,
      `M: Người ta nói duyên là do trời, nhưng giữ được nhau là do mình. | Hôm nay ai cũng có cơ hội tìm duyên trong sảnh này.`,
      `M: Hạnh phúc đôi khi chỉ là một tin nhắn: em ăn cơm chưa? | Đơn giản vậy thôi mà ấm cả ngày.`,
      `M: Bà con thấy không, cô dâu chú rể nào bước lên lễ đường cũng cười rất tươi. | Vì đó là lúc mình chọn một người để đi cùng cả đời.`,
      `M: Ai còn độc thân cũng đừng buồn. | Có khi người ấy đang ngồi ngay bàn bên cạnh, chỉ chờ bạn gõ cưới a còng tên tài khoản thôi.`,
      `M: Thương một người là nhớ họ thích ăn gì, | sợ cái gì, và hay cười vì chuyện gì.`,
      `M: Có cặp đôi quen nhau qua một buổi live như thế này đó bà con. | Nên đừng ngại comment, biết đâu duyên tới.`,
    ],
    // se duyên, tơ hồng, Nguyệt Lão: nhắc nhẹ, mời gõ SE DUYÊN khi tới lượt
    duyenTalk: [
      `M: Người xưa tin rằng mỗi người sinh ra đều có một sợi chỉ hồng buộc ở cổ chân. | Đầu kia là người mình sẽ cưới.`,
      `M: Lát nữa Nguyệt Lão sẽ xuống sảnh. | Lúc có băng rôn đỏ, ai gõ se duyên là được ông se tơ hồng cho đó.`,
      `M: Ông tơ bà nguyệt làm việc chăm lắm bà con ơi. | Cứ vài phút là ông lại xuống se duyên một lần.`,
      `M: Ai muốn có người thương thì chờ Nguyệt Lão xuống, gõ se duyên nha. | Ông chọn ngẫu nhiên, ai trúng là có tơ hồng nối với nhau.`,
      `M: Tơ hồng đã nối thì chạy đâu cho thoát. | Được se duyên rồi thì gõ cưới luôn cho ông vui.`,
      `M: Duyên tới thì không cản được đâu bà con. | Chỉ cần mình mở lòng một chút thôi.`,
    ],
    // dàn khách quen làm trò (2 tên khác nhau)
    castSkit: [
      (a: string, b: string) => `M: MC để ý ${a} cứ nhìn sang ${b} hoài. | Nếu thương thì nói sớm nha, đừng để lỡ.`,
      (a: string, b: string) => `M: ${a} vừa gắp đồ ăn cho ${b} kìa. | Quan tâm nhau từ những điều nhỏ vậy đó bà con.`,
      (a: string, b: string) => `M: ${a} với ${b} ngồi chung bàn nãy giờ, cười hoài. | Bà con thấy có hợp không?`,
      (a: string, b: string) => `M: Nghe nói ${a} thương thầm ${b} từ hồi đi học. | Hôm nay có dịp thì nói ra đi nha.`,
      (a: string, b: string) => `M: ${a} vừa hỏi MC: ${b} có người yêu chưa? | Câu này để ${b} tự trả lời nha.`,
    ],
  },
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { roleWord };
