'use strict';
const fs = require('fs');
const path = require('path');
const { DEFAULT_BAR_RULES, sanitizeBarRules } = require('./bar-rules');

const DEFAULTS = {
  username: '',
  port: 3000,
  autoReconnect: true,
  previewSound: true,       // nghe âm thanh overlay ngay trong app
  maStyle: 'game',          // kiểu của Live Ma Online: game | cards
  uiTheme: 'dark',          // giao diện app: dark | light | system
  overlay: {
    showChat: true,
    showGifts: true,
    showFollows: true,
    showShares: true,
    showJoins: false,
    showLikeCounter: true,
    showViewerCounter: true,
    showTopGifter: true,
    mode: 'game',               // game (Nhà Ma) | cards (thẻ bình luận) | chua (Đi Chùa) | rap (Rạp Phim) | vua (Vua Tiếng Việt) | keoco (Kéo Co) | bar (Live Bar) | trada (Trà Đá) | nhau (Đi Nhậu) | denxanh (Đèn Xanh Đèn Đỏ) | danhboss (Đánh Boss) | thabi (Thả Bi)
    barName: '',                // tên bar (màn LED + tiêu đề)
    barJoinMode: 'keyword',     // keyword: gõ từ khoá / tặng quà mới vào sàn | all: mọi tương tác đều vào sàn
    barJoinKeyword: 'hey',      // từ khoá vào sàn
    barNpc: 5,                  // số khách ảo giữ cho sàn không trống
    barEnergyGoal: 1000,        // điểm PARTY ENERGY để cả sàn cùng quẩy + pháo hoa
    barBpm: 128,                // nhịp đèn / sàn LED
    barChroma: false,           // nền xanh lá (chỉ giữ nhân vật + hiệu ứng) để ghép trong OBS
    barMusic: '',               // file nhạc nền trên máy (mp3/wav/ogg)
    barMusicVolume: 0.35,
    barFireworkSound: true,
    barDjModel: '',             // model DJ 3D .fbx/.glb/.gltf ('' = DJ Megan gốc, 'none' = DJ vẽ bằng code)
    barCharDir: '',             // thư mục nhân vật GIF/PNG/WEBP ('' = 33 GIF gốc, 'none' = vẽ bằng code)
    barFireworkFile: '',        // tiếng pháo hoa ('' = mp3 gốc, 'none' = tự tổng hợp)
    barScreen: '',              // ảnh / video trên màn LED sau bàn DJ (trống = màn LED nhảy theo nhạc)
    barRules: DEFAULT_BAR_RULES,  // Master Rules: luật chat / quà -> hành động, ưu tiên hơn bảng quà mặc định
    rapName: '',                // tên rạp (tiêu đề + giọng đọc)
    rapVoice: true,
    rapGreet: true,
    rapRate: 1,
    rapVolume: 0.8,             // âm lượng phim
    rapLikeGoal: 500,           // số tim để mưa bắp rang
    rapVideos: [],              // danh sách đường dẫn file phim trên máy
    rapIndex: 0,                // phim đang chiếu
    rapLoop: true,              // hết danh sách thì chiếu lại từ đầu
    rapTheme: 'classic',        // classic | gold | imax | home
    rapLightsOff: false,        // tắt đèn phòng chiếu
    rapIdleMin: 0,              // im lặng quá số phút này thì tự ra về (0 = không)
    chuaName: '',               // tên kênh: tiêu đề + cách giọng đọc tự xưng
    chuaVoice: true,            // giọng đọc (chào, cảm ơn quà, chúc)
    chuaGreet: true,            // chào người mới vào
    chuaRate: 1,                // tốc độ đọc
    chuaLikeGoal: 666,          // số tim để mưa hoa sen
    chuaMusic: true,            // nhạc nền thiền (mp3)
    chuaMusicVolume: 0.45,
    tradaName: '',              // Trà Đá Vỉa Hè: tên quán (bảng hiệu + giọng đọc)
    tradaVoice: true,
    tradaGreet: true,
    tradaBots: true,            // khách quen giả lập khi quán vắng
    tradaLikeGoal: 500,         // số tim để bà chủ khao cả quán
    nhauName: '',               // Đi Nhậu: tên quán
    nhauVoice: true,
    nhauGreet: true,
    nhauBots: true,
    nhauLikeGoal: 500,          // số tim để cả quán dzô 100%
    quanAmbient: true,          // tiếng phố / tiếng quán cho 2 cảnh trên
    roundEvery: 3,              // phút giữa các vòng TRỐN TÌM, 0 = tắt
    bots: true,                 // ma NPC đi hù người xem
    background: 'haunted',      // transparent | haunted
    accent: '#3b82f6',
    chatDuration: 4.5,          // giây
    maxCards: 6,                // số thẻ chat tối đa cùng lúc
    bigGiftDiamonds: 30,        // quà >= số kim cương này: jumpscare + Bà Ma
    sound: true,
    volume: 0.7,
    chatSound: false,
    customGiftSound: '',        // đường dẫn file mp3/wav trên máy
    customChatSound: '',
    customJumpscare: '',        // ảnh/gif/video jumpscare tự chọn
    customScareSound: '',       // tiếng khi bị hù (tuỳ chọn)
    customAmbient: '',          // nhạc nền (tuỳ chọn)
    ambient: true,              // nhạc nền rùng rợn
    ambientPreset: 'drone',     // drone | wind | rain | church | heartbeat | musicbox | whispers | forest
    ambientVolume: 0.5,
    tutorialEvery: 2,           // phút giữa các lần hiện bảng CÁCH CHƠI, 0 = tắt
    filterWords: '',            // các từ cần ẩn, ngăn cách bằng dấu phẩy
    liveBoost: 15               // % tăng độ tươi màu để bù phần TikTok nén làm nhạt (0-40)
  }
};

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (!(k in base)) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = merge(base[k], v);
    } else if (typeof v === typeof base[k]) {
      out[k] = v;
    }
  }
  return out;
}

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = merge(DEFAULTS, {});
    try {
      this.data = merge(DEFAULTS, JSON.parse(fs.readFileSync(this.file, 'utf8')));
      if (this.data.overlay.mode === 'cards') this.data.overlay.mode = 'game'; // bản bán chỉ còn 2 cảnh
      this.data.overlay.barRules = sanitizeBarRules(this.data.overlay.barRules);
    } catch { /* lần đầu chạy hoặc file hỏng -> dùng mặc định */ }
  }

  get() {
    return structuredClone(this.data);
  }

  update(patch) {
    this.data = merge(this.data, patch);
    this.data.port = Math.min(65535, Math.max(1024, Math.round(this.data.port) || 3000));
    const o = this.data.overlay;
    o.volume = Math.min(1, Math.max(0, o.volume));
    o.chatDuration = Math.min(20, Math.max(2, o.chatDuration));
    o.maxCards = Math.min(20, Math.max(1, Math.round(o.maxCards)));
    o.bigGiftDiamonds = Math.max(0, Math.round(o.bigGiftDiamonds));
    o.roundEvery = Math.min(30, Math.max(0, Math.round(o.roundEvery)));
    o.tutorialEvery = Math.min(30, Math.max(0, Math.round(o.tutorialEvery)));
    o.chuaName = o.chuaName.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40);
    o.chuaRate = Math.min(1.3, Math.max(0.6, o.chuaRate));
    o.chuaMusicVolume = Math.min(1, Math.max(0, o.chuaMusicVolume));
    o.chuaLikeGoal = Math.min(100000, Math.max(10, Math.round(o.chuaLikeGoal)));
    o.ambientVolume = Math.min(1, Math.max(0, o.ambientVolume));
    o.liveBoost = Math.min(40, Math.max(0, Math.round(o.liveBoost)));
    if (!['drone', 'wind', 'rain', 'church', 'heartbeat', 'musicbox', 'whispers', 'forest'].includes(o.ambientPreset)) o.ambientPreset = 'drone';
    if (!['game', 'cards', 'chua', 'rap', 'vua', 'keoco', 'bar', 'trada', 'nhau', 'denxanh', 'danhboss', 'thabi'].includes(o.mode)) o.mode = 'game';
    o.barName = String(o.barName).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 28);
    if (!['keyword', 'all'].includes(o.barJoinMode)) o.barJoinMode = 'keyword';
    o.barJoinKeyword = String(o.barJoinKeyword).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24) || 'hey';
    o.barNpc = Math.min(40, Math.max(0, Math.round(o.barNpc) || 0));
    o.barEnergyGoal = Math.min(100000, Math.max(50, Math.round(o.barEnergyGoal) || 1000));
    o.barBpm = Math.min(180, Math.max(70, Math.round(o.barBpm) || 128));
    o.barMusicVolume = Math.min(1, Math.max(0, o.barMusicVolume));
    o.barRules = sanitizeBarRules(o.barRules);
    for (const k of ['trada', 'nhau']) {
      o[k + 'Name'] = String(o[k + 'Name']).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40);
      o[k + 'LikeGoal'] = Math.min(100000, Math.max(10, Math.round(o[k + 'LikeGoal']) || 500));
    }
    o.rapName = String(o.rapName).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40);
    o.rapRate = Math.min(1.3, Math.max(0.6, o.rapRate));
    if (!['classic', 'gold', 'imax', 'home'].includes(o.rapTheme)) o.rapTheme = 'classic';
    o.rapIdleMin = Math.min(120, Math.max(0, Math.round(o.rapIdleMin)));
    o.rapVolume = Math.min(1, Math.max(0, o.rapVolume));
    o.rapLikeGoal = Math.min(100000, Math.max(10, Math.round(o.rapLikeGoal)));
    o.rapVideos = (Array.isArray(o.rapVideos) ? o.rapVideos : [])
      .filter((x) => typeof x === 'string' && x && (!/^[a-z]+:/i.test(x) || /^https?:\/\//i.test(x) || /^[a-z]:[\\/]/i.test(x)))
      .map((x) => x.trim().slice(0, 2000)).slice(0, 100);
    o.rapIndex = Math.max(0, Math.min(Math.max(0, o.rapVideos.length - 1), Math.round(o.rapIndex) || 0));
    if (!['game', 'cards'].includes(this.data.maStyle)) this.data.maStyle = 'game';
    if (!['dark', 'light', 'system'].includes(this.data.uiTheme)) this.data.uiTheme = 'dark';
    if (o.mode === 'game' || o.mode === 'cards') this.data.maStyle = o.mode;
    if (!/^#[0-9a-f]{6}$/i.test(o.accent)) o.accent = DEFAULTS.overlay.accent;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('[settings] Không lưu được:', e.message);
    }
    return this.get();
  }
}

module.exports = { Settings, DEFAULTS };
