'use strict';
const { EventEmitter } = require('events');

/*
 * Bọc thư viện tiktok-live-connector v2 (ESM) và chuẩn hoá dữ liệu sự kiện.
 * Lưu ý: v2 dùng schema protobuf mới -> chat là `content`, like là `count`/`total`,
 * quà nằm trong `gift` (name, diamondCount, type), user.displayId là @username.
 */


const pickUrl = (img) => {
  const url = img?.urlList?.find((u) => typeof u === 'string' && u.startsWith('https://'));
  return url || '';
};

function normUser(u) {
  return {
    id: String(u?.id || u?.userId || ''),
    uniqueId: u?.displayId || u?.uniqueId || '',
    nickname: u?.nickname || u?.displayId || u?.uniqueId || 'Ẩn danh',
    avatar: pickUrl(u?.avatarThumb) || pickUrl(u?.avatarMedium) || pickUrl({ urlList: u?.profilePicture?.urls }) || u?.profilePictureUrl || ''
  };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function friendlyError(err) {
  const name = err?.constructor?.name || err?.name || '';
  const msg = String(err?.message || err || '');
  if (name === 'UserOfflineError' || /isn't online|offline/i.test(msg)) {
    return 'Kênh này hiện không phát live. Hãy bật live trước rồi kết nối lại.';
  }
  if (/[\u00C0-\u1EF9]/.test(msg)) return msg; // đã là thông báo tiếng Việt
  if (/rate.?limit|429|too many/i.test(msg)) {
    return 'Máy chủ ký (sign server) đang giới hạn lượt. Đợi 1-2 phút hoặc nhập Euler API key trong Cài đặt.';
  }
  if (/not found|does not exist|invalid.*unique/i.test(msg)) {
    return 'Không tìm thấy kênh TikTok này. Kiểm tra lại username.';
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|socket hang up/i.test(msg)) {
    return 'Lỗi mạng: không kết nối được tới TikTok. Kiểm tra Internet.';
  }
  return msg || 'Lỗi không xác định';
}

class LiveService extends EventEmitter {
  constructor() {
    super();
    this.conn = null;
    this.username = '';
    this.status = 'idle'; // idle | connecting | live | reconnecting | ended | error
    this.manualStop = false;
    this.retry = 0;
    this.retryTimer = null;
    this.giftStreaks = new Map();
    this.resetStats();
  }

  resetStats() {
    this.stats = {
      roomId: '', startedAt: 0, viewers: 0, likes: 0, comments: 0,
      gifts: 0, diamonds: 0, follows: 0, shares: 0, joins: 0
    };
    this.gifters = new Map();
  }

  setStatus(status, message = '') {
    this.status = status;
    this.emit('status', { status, message, username: this.username, retry: this.retry });
  }

  snapshot() {
    return {
      status: this.status,
      username: this.username,
      stats: { ...this.stats },
      topGifters: this.topGifters()
    };
  }

  topGifters(limit = 5) {
    return [...this.gifters.values()].sort((a, b) => b.diamonds - a.diamonds).slice(0, limit);
  }

  async start(username, opts = {}) {
    username = String(username || '').trim().replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '').replace(/^@/, '').replace(/\/live.*$/i, '');
    if (!/^[A-Za-z0-9._]{2,24}$/.test(username)) {
      throw new Error('Username không hợp lệ (chỉ gồm chữ, số, dấu chấm, gạch dưới).');
    }
    await this.stop(true);
    this.username = username;
    this.opts = opts;
    this.manualStop = false;
    this.retry = 0;
    this.resetStats();
    this.emitStats();
    return this.connect();
  }

  async connect() {
    clearTimeout(this.retryTimer);
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    let conn;
    {
      // Kết nối trực tiếp qua trình duyệt ẩn, không qua bên thứ ba
      const { DirectConnection } = require('./direct');
      conn = new DirectConnection(this.username);
    }
    this.conn = conn;
    this.bind(conn);

    try {
      const state = await conn.connect();
      if (this.conn !== conn) return; // đã bị thay thế
      this.retry = 0;
      this.stats.roomId = String(state?.roomId || '');
      this.stats.startedAt = this.stats.startedAt || Date.now();
      const v = num(state?.roomInfo?.data?.user_count ?? state?.roomInfo?.user_count);
      if (v) this.stats.viewers = v;
      this.setStatus('live');
      this.emitStats();
    } catch (err) {
      if (this.conn !== conn) return;
      const message = friendlyError(err);
      const offline = err?.offline || /không phát live|Không tìm thấy|không hợp lệ|yêu cầu xác minh/.test(message);
      this.conn = null;
      conn.removeAllListeners();
      conn.disconnect?.().catch?.(() => {});
      if (!this.manualStop && this.opts?.autoReconnect && !offline && this.retry < 8) {
        this.scheduleReconnect(message);
      } else {
        this.setStatus('error', message);
      }
    }
  }

  scheduleReconnect(reason) {
    this.retry += 1;
    const delay = Math.min(60, 5 * 2 ** (this.retry - 1));
    this.setStatus('reconnecting', `${reason} — thử lại sau ${delay}s (lần ${this.retry})`);
    this.retryTimer = setTimeout(() => this.connect().catch((e) => this.setStatus('error', friendlyError(e))), delay * 1000);
  }

  async stop(silent = false) {
    this.manualStop = true;
    clearTimeout(this.retryTimer);
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      conn.removeAllListeners();
      try { await conn.disconnect(); } catch { /* bỏ qua */ }
    }
    if (!silent) this.setStatus('idle', 'Đã ngắt kết nối');
  }

  emitStats() {
    this.emit('stats', { ...this.stats, topGifters: this.topGifters() });
  }

  bind(conn) {
    const guard = (fn) => (data) => {
      if (this.conn !== conn) return;
      try { fn(data || {}); } catch (e) { console.error('[live] handler error', e); }
    };

    conn.on('disconnected', guard(() => {
      this.conn = null;
      conn.removeAllListeners();
      Promise.resolve(conn.disconnect?.()).catch(() => {});
      if (this.manualStop || this.status === 'ended') return;
      if (this.opts?.autoReconnect) this.scheduleReconnect('Mất kết nối');
      else this.setStatus('error', 'Mất kết nối tới phòng live');
    }));

    conn.on('streamEnd', guard(() => {
      this.manualStop = true;
      this.setStatus('ended', 'Buổi live đã kết thúc');
    }));

    conn.on('error', guard((e) => {
      console.warn('[live] error:', e?.info || '', e?.exception?.message || '');
    }));

    conn.on('chat', guard((d) => {
      const text = String(d.content ?? d.comment ?? '').trim();
      if (!text) return;
      this.stats.comments += 1;
      this.emit('event', { type: 'chat', user: normUser(d.user), text, ts: Date.now() });
      this.emitStats();
    }));

    conn.on('gift', guard((d) => {
      // tên trường kiểu mới (gift) hoặc kiểu cũ (giftDetails)
      const gd = d.giftDetails;
      const g = d.gift || d.extendedGiftInfo || (gd ? {
        name: gd.giftName, diamondCount: gd.diamondCount, type: gd.giftType,
        image: { urlList: [gd.giftImage?.giftPictureUrl].filter(Boolean) }
      } : {});
      const giftType = num(g.type ?? d.giftDetails?.giftType ?? d.giftType);
      const repeatCount = Math.max(1, num(d.repeatCount));
      const user = normUser(d.user);
      const key = `${user.id}:${d.giftId}:${d.groupId || ''}`;
      const streaking = giftType === 1 && !d.repeatEnd;
      const unit = num(g.diamondCount ?? d.diamondCount);
      // Định danh gốc của quà (chuỗi, không ép Number vì là số 64-bit): Kéo Co dùng để chống cộng điểm trùng
      const str = (v) => (v === undefined || v === null || v === '' ? undefined : String(v));
      const ids = {
        giftId: str(d.giftId), groupId: str(d.groupId),
        msgId: str(d.common?.msgId ?? d.event?.msgId ?? d.msgId), streakable: giftType === 1
      };

      if (streaking) {
        // Quà combo đang chạy: chỉ báo tạm thời, chưa cộng thống kê
        this.giftStreaks.set(key, repeatCount);
        this.emit('event', {
          type: 'giftStreak', user, giftName: g.name || 'Quà', repeatCount, diamonds: unit, ...ids,
          giftImage: pickUrl(g.image) || pickUrl(g.icon), ts: Date.now()
        });
        return;
      }
      this.giftStreaks.delete(key);
      const total = unit * repeatCount;
      this.stats.gifts += repeatCount;
      this.stats.diamonds += total;
      const prev = this.gifters.get(user.id || user.nickname) || { ...user, diamonds: 0, gifts: 0 };
      prev.diamonds += total;
      prev.gifts += repeatCount;
      prev.avatar = user.avatar || prev.avatar;
      this.gifters.set(user.id || user.nickname, prev);
      this.emit('event', {
        type: 'gift', user, giftName: g.name || d.giftName || 'Quà', repeatCount,
        diamonds: unit, total, ...ids, giftImage: pickUrl(g.image) || pickUrl(g.icon), ts: Date.now()
      });
      this.emitStats();
    }));

    conn.on('like', guard((d) => {
      const total = num(d.total ?? d.totalLikeCount);
      const count = num(d.count ?? d.likeCount);
      this.stats.likes = total > this.stats.likes ? total : this.stats.likes + count;
      this.emit('event', { type: 'like', user: normUser(d.user), count, ts: Date.now() });
      this.emitStats();
    }));

    conn.on('roomUser', guard((d) => {
      const v = num(d.total ?? d.viewerCount);
      if (v) this.stats.viewers = v;
      this.emitStats();
    }));

    conn.on('member', guard((d) => {
      this.stats.joins += 1;
      const mc = num(d.memberCount);
      if (mc) this.stats.viewers = mc;
      this.emit('event', { type: 'join', user: normUser(d.user), ts: Date.now() });
      this.emitStats();
    }));

    conn.on('follow', guard((d) => {
      this.stats.follows += 1;
      this.emit('event', { type: 'follow', user: normUser(d.user), ts: Date.now() });
      this.emitStats();
    }));

    conn.on('share', guard((d) => {
      this.stats.shares += 1;
      this.emit('event', { type: 'share', user: normUser(d.user), ts: Date.now() });
      this.emitStats();
    }));
  }
}

module.exports = { LiveService, friendlyError };
