'use strict';
/*
 * KẾT NỐI TRỰC TIẾP — không qua máy chủ trung gian.
 *
 * App mở trang live TikTok trong một cửa sổ trình duyệt ẩn (Chromium có sẵn trong Electron).
 * Chính trang TikTok tự kết nối tới máy chủ TikTok như khi bạn xem live trên web.
 * App chỉ đọc các gói dữ liệu WebSocket mà trang nhận được (qua DevTools Protocol)
 * rồi giải mã protobuf ngay trên máy bằng tiktok-live-connector.
 * => Dữ liệu chỉ đi giữa máy bạn và TikTok, không gửi tới bên thứ ba.
 */
const { EventEmitter } = require('events');
const { BrowserWindow, session } = require('electron');

const PARTITION = 'persist:tiktok';
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CHROME_UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const UA = process.platform === 'win32' ? CHROME_UA_WIN : CHROME_UA;

// Giải mã protobuf bằng tiktok-live-connector 2.0.0 (giấy phép MIT)
const { deserializeWebSocketMessage } = require('tiktok-live-connector');

let sessionReady = false;
function tiktokSession() {
  const ses = session.fromPartition(PARTITION);
  if (!sessionReady) {
    sessionReady = true;
    ses.setUserAgent(UA, 'vi-VN,vi,en-US,en');
    // Chặn tải video/âm thanh của buổi live để tiết kiệm mạng & CPU (chỉ cần dữ liệu chat/quà)
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
      const u = details.url;
      const isStream = details.resourceType === 'media' || /\.(flv|m3u8|ts|m4s)(\?|$)/i.test(u) || /\/\/pull-[^/]*\.(tiktokcdn|tiktokv|ttlivecdn)/i.test(u);
      cb({ cancel: isStream });
    });
  }
  return ses;
}

const TYPE_MAP = {
  WebcastChatMessage: 'chat',
  WebcastGiftMessage: 'gift',
  WebcastLikeMessage: 'like',
  WebcastMemberMessage: 'member',
  WebcastRoomUserSeqMessage: 'roomUser',
  WebcastEmoteChatMessage: 'emote'
};

class DirectConnection extends EventEmitter {
  constructor(uniqueId) {
    super();
    this.uniqueId = uniqueId;
    this.win = null;
    this.wsIds = new Set();
    this.roomId = '';
    this.closed = false;
    this.seen = new Set(); // chống trùng msgId
  }

  connect(timeoutMs = 35000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(probe);
        if (err) { this.destroy(); reject(err); } else resolve(val);
      };

      const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: { partition: PARTITION, session: tiktokSession(), backgroundThrottling: false, contextIsolation: true, sandbox: true }
      });
      this.win = win;
      win.webContents.setAudioMuted(true);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      const dbg = win.webContents.debugger;
      try { dbg.attach('1.3'); } catch (e) { return done(new Error('Không gắn được bộ đọc dữ liệu: ' + e.message)); }
      dbg.sendCommand('Network.enable').catch(() => {});

      // Phòng live đã kết thúc: TikTok vẫn cho vào trang và mở socket webcast nhưng không đẩy dữ liệu nào.
      const ended = () => Object.assign(new Error('Phiên LIVE của kênh này đã kết thúc. Hãy bật live rồi kết nối lại.'), { offline: true });
      // Chỉ báo "đã kết nối" khi đã nhận gói webcast VÀ TikTok xác nhận vào phòng (room/enter) thành công.
      let gotFrame = 0;
      let enterOk = false;
      const tryResolve = () => {
        if (gotFrame && (enterOk || Date.now() - gotFrame > 6000)) done(null, { roomId: this.roomId, isConnected: true });
      };
      const apiCalls = new Map(); // requestId -> 'enter' | 'alive'
      const readApi = async (requestId, kind) => {
        let body;
        try { body = JSON.parse((await dbg.sendCommand('Network.getResponseBody', { requestId })).body); } catch { return; }
        if (kind === 'enter') {
          if (body?.status_code === 30003 || /finished/i.test(body?.data?.message || '')) return done(ended());
          if (body?.status_code === 0) { enterOk = true; tryResolve(); }
        } else if (this.roomId) {
          const mine = (body?.data || []).find((r) => String(r.room_id_str) === this.roomId);
          if (mine?.alive === false) {
            if (!settled) done(ended());
            else if (!this.closed) this.emit('streamEnd', { action: 'check_alive' });
          }
        }
      };

      dbg.on('message', (_e, method, params) => {
        if (method === 'Network.requestWillBeSent') {
          const u = params.request?.url || '';
          if (/\/webcast\/room\/enter\//.test(u)) apiCalls.set(params.requestId, 'enter');
          else if (/\/webcast\/room\/check_alive\//.test(u)) apiCalls.set(params.requestId, 'alive');
        } else if (method === 'Network.loadingFinished' && apiCalls.has(params.requestId)) {
          const kind = apiCalls.get(params.requestId);
          apiCalls.delete(params.requestId);
          readApi(params.requestId, kind);
        } else if (method === 'Network.webSocketCreated' && /\/webcast\/im\/|im\/push/i.test(params.url)) {
          // Chỉ socket webcast; im-ws-*.tiktok.com/ws/v2 là socket tin nhắn riêng, không chứa dữ liệu live
          this.wsIds.add(params.requestId);
          const m = /[?&]room_id=(\d+)/.exec(params.url);
          if (m) this.roomId = m[1];
        } else if (method === 'Network.webSocketFrameReceived' && this.wsIds.has(params.requestId)) {
          const r = params.response;
          if (r.opcode !== 2) return;
          this.handleFrame(Buffer.from(r.payloadData, 'base64')).then((ok) => {
            if (ok && !gotFrame) gotFrame = Date.now();
            if (ok) tryResolve();
          });
        } else if (method === 'Network.webSocketClosed' && this.wsIds.has(params.requestId)) {
          this.wsIds.delete(params.requestId);
          // TikTok thường tự mở lại socket; chỉ báo mất kết nối nếu không còn socket nào sau 20s
          setTimeout(() => {
            if (!this.closed && settled && this.wsIds.size === 0) this.emit('disconnected', { reason: 'socket closed' });
          }, 20000);
        }
      });
      dbg.on('detach', () => { if (!this.closed && settled) this.emit('disconnected', { reason: 'detached' }); });

      win.webContents.on('render-process-gone', () => {
        if (!settled) done(new Error('Trình duyệt ẩn bị dừng đột ngột'));
        else if (!this.closed) this.emit('disconnected', { reason: 'crashed' });
      });

      // Kiểm tra trang: kênh không live / bị yêu cầu xác minh
      const probe = setInterval(async () => {
        if (settled || win.isDestroyed()) return;
        tryResolve();
        try {
          const st = await win.webContents.executeJavaScript(`(() => {
            const t = document.body ? document.body.innerText : '';
            let room = {};
            try { room = JSON.parse(document.getElementById('SIGI_STATE')?.textContent || '{}').LiveRoom?.liveRoomUserInfo || {}; } catch {}
            return {
              roomId: String(room.user?.roomId || room.liveRoom?.roomId || ''),
              // LiveRoom status: 2 = đang live, 4 = đã kết thúc
              roomStatus: Number(room.liveRoom?.status ?? room.user?.status ?? 0),
              offline: /LIVE has ended|không còn phát trực tiếp|is not LIVE|currently unavailable|đã kết thúc|hiện không LIVE|Buổi LIVE đã kết thúc/i.test(t),
              captcha: !!document.querySelector('#captcha-verify-container, .captcha_verify_container, [id*="captcha"]'),
              notFound: /Couldn't find this account|Không thể tìm thấy tài khoản này/i.test(t)
            };
          })()`);
          if (st.roomId && !this.roomId) this.roomId = st.roomId;
          if (st.notFound) done(new Error('Không tìm thấy kênh TikTok này. Kiểm tra lại username.'));
          else if (st.roomStatus === 4) done(ended());
          else if (st.offline) done(Object.assign(new Error('Kênh này hiện không phát live. Hãy bật live trước rồi kết nối lại.'), { offline: true }));
          else if (st.captcha) done(new Error('TikTok yêu cầu xác minh. Bấm "Đăng nhập TikTok" trong Cài đặt, đăng nhập/xác minh một lần rồi kết nối lại.'));
        } catch { /* trang đang tải */ }
      }, 3000);

      const timer = setTimeout(() => done(new Error('Không nhận được dữ liệu live sau 35 giây. Kiểm tra kênh có đang live không, hoặc thử "Đăng nhập TikTok" trong Cài đặt.')), timeoutMs);

      win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
        if (isMain && [-105, -106, -109, -118, -137].includes(code)) done(new Error('Lỗi mạng: không kết nối được tới TikTok. Kiểm tra Internet.'));
      });
      // Lỗi tải tài nguyên phụ không quan trọng — chờ dữ liệu WebSocket hoặc hết giờ
      win.loadURL(`https://www.tiktok.com/@${encodeURIComponent(this.uniqueId)}/live`).catch(() => {});
    });
  }

  async handleFrame(buf) {
    let frame;
    try {
      frame = await deserializeWebSocketMessage(buf);
    } catch {
      return false;
    }
    if (frame?.type !== 'msg') return true; // gói điều khiển (ack/heartbeat) vẫn tính là đã kết nối
    const msgs = frame?.webcastResponse?.messages || [];
    for (const m of msgs) {
      if (!m.decodedData) continue;
      const d = { type: m.type, data: m.decodedData };
      const id = d.data?.event?.msgId ? String(d.data.event.msgId) : '';
      if (id) {
        if (this.seen.has(id)) continue;
        this.seen.add(id);
        if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2000));
      }
      const data = d.data;
      if (d.type === 'WebcastSocialMessage') {
        const key = data?.event?.eventDetails?.displayType || data?.common?.displayText?.key || '';
        this.emit(key.includes('follow') ? 'follow' : key.includes('share') ? 'share' : 'social', data);
      } else if (d.type === 'WebcastControlMessage') {
        if (data?.action === 3 || data?.action === 4) this.emit('streamEnd', { action: data.action });
      } else if (TYPE_MAP[d.type]) {
        this.emit(TYPE_MAP[d.type], data);
      }
    }
    return true;
  }

  destroy() {
    this.closed = true;
    const w = this.win;
    this.win = null;
    if (w && !w.isDestroyed()) {
      try { w.webContents.debugger.detach(); } catch { /* đã tách */ }
      w.destroy();
    }
  }

  async disconnect() {
    this.destroy();
  }
}

// Cửa sổ đăng nhập TikTok (dùng chung phiên với kết nối trực tiếp)
function openLoginWindow(parent) {
  const win = new BrowserWindow({
    width: 480, height: 760, parent, title: 'Đăng nhập TikTok',
    webPreferences: { partition: PARTITION, session: tiktokSession(), contextIsolation: true, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  win.loadURL('https://www.tiktok.com/login');
  return win;
}

async function logoutTikTok() {
  await tiktokSession().clearStorageData();
}

module.exports = { DirectConnection, openLoginWindow, logoutTikTok };
