import { IS_SILENT, IS_STAGE } from './page';
import { containsBanned } from './bannedWords';

/**
 * Hàng đợi giọng đọc. Chỉ phát trên trang stage.
 *   voice.say('Chào bạn A')            -> xếp cuối hàng
 *   voice.say('Cảm ơn quà', true)      -> ưu tiên, chen lên đầu (dùng cho quà)
 *   voice.say('Trời ơi! | ^Hoan hô!') -> "|" tách đoạn; "^" hô to hơn một chút
 *   voice.say('M: Anh nói | F: Em nói')  -> 2 MC: "M:" giọng nam, "F:" giọng nữ (giữ tới khi đổi)
 * Câu nào chờ quá lâu (mặc định 60 giây) thì bỏ, để không đọc chuyện đã cũ.
 */
interface Line {
  text: string;
  at: number;
  done?: () => void;
  start?: () => void; // gọi khi câu bắt đầu đọc (để camera lia tới người được nói tới)
  valid?: () => boolean; // tới lượt đọc mà trả về false thì bỏ câu (chuyện đã cũ, vd. đã bị cướp mà vẫn "sắp trả lời")
  keep?: boolean; // không bỏ dù chờ lâu (lời dẫn khai mạc dài)
  gapMs?: number; // dòng im lặng: nghỉ giữa 2 cảnh
}

const ONE_VOICE = true; // false: 2 MC nam nữ đối đáp như bản gốc
const MAX_WAIT_MS = 25_000; // chờ lâu hơn là chuyện trên màn hình đã qua, đọc ra sẽ lệch hình

/** "M: Anh nói | F: ^Em hô" -> từng đoạn với giọng + link đọc */
function segments(text: string, rate: number) {
  let who: 'M' | 'F' = 'M';
  const out: { who: 'M' | 'F'; url: string }[] = [];
  for (let raw of text.split('|')) {
    raw = raw.trim();
    const sp = /^(M|F):\s*/.exec(raw);
    if (sp) {
      // chủ kênh chốt: chỉ 1 giọng nam suốt buổi live, câu "F:" cũng đọc bằng giọng nam
      who = ONE_VOICE ? 'M' : (sp[1] as 'M' | 'F');
      raw = raw.slice(sp[0].length);
    }
    const hype = raw.startsWith('^');
    const t = raw.replace(/^\^+/, '');
    if (t) out.push({ who, url: `/api/tts?rate=${rate}${hype ? '&hype=1' : ''}${who === 'F' ? '&v=f' : ''}&text=${encodeURIComponent(t)}` });
  }
  return out;
}
const MAX_QUEUE = 30;
const MAX_MINOR = 6;
const MINOR_MAX_WAIT_MS = 12_000;

class Voice {
  private normal: Line[] = [];
  private priority: Line[] = [];
  private minor: Line[] = [];
  private playing = false;
  private current: HTMLAudioElement | null = null;
  private lastSpokeAt = Date.now();
  rate = readRate(); // mặc định 1.25: MC nói nhanh cho tiết tấu dồn dập (chủ kênh chốt); chỉnh ở trang điều khiển
  volume = 1;
  enabled = IS_STAGE && !IS_SILENT;
  /** báo MC nào đang nói (để nhân vật MC trên sân khấu nhún nhảy) */
  onSpeaker?: (who: 'M' | 'F' | null) => void;

  /** `done`: gọi khi câu đọc xong, bị bỏ, hoặc trang này không phát tiếng */
  say(text: string, priority = false, done?: () => void, keep = false, start?: () => void, valid?: () => boolean) {
    if (!this.enabled || !text.trim()) {
      if (start) setTimeout(start, 0);
      if (done) setTimeout(done, 0);
      return;
    }
    const q = priority ? this.priority : this.normal;
    q.push({ text: text.trim(), at: Date.now(), done, keep, start, valid });
    if (q.length > MAX_QUEUE) q.shift()?.done?.();
    // MC đang nói: tải trước câu sắp tới để nói liền mạch
    if (this.playing) for (const l of [...this.priority, ...this.normal].slice(0, 2)) this.warm(l);
    void this.next();
  }

  /**
   * Câu phụ (chào khách, cảm ơn quà nhỏ, theo dõi, chia sẻ...): chỉ đọc khi không còn câu chính nào chờ,
   * chờ quá 12 giây thì bỏ, tối đa 6 câu — để không chen ngang cảnh đang diễn và không dồn khi live đông.
   */
  sayMinor(text: string, start?: () => void) {
    if (!this.enabled || !text.trim()) {
      if (start) setTimeout(start, 0);
      return;
    }
    this.minor.push({ text: text.trim(), at: Date.now(), start });
    if (this.minor.length > MAX_MINOR) this.minor.shift();
    void this.next();
  }

  /** khoảng nghỉ giữa 2 cảnh (MC im `ms`) cho người xem kịp thở */
  gap(ms: number) {
    if (!this.enabled) return;
    this.normal.push({ text: '', at: Date.now(), keep: true, gapMs: ms });
    void this.next();
  }

  stop() {
    for (const l of [...this.normal, ...this.priority, ...this.minor]) l.done?.();
    this.normal = [];
    this.priority = [];
    this.minor = [];
    this.current?.pause();
    this.current = null;
    this.playing = false;
  }

  get busy() {
    return this.playing || this.normal.length + this.priority.length + this.minor.length > 0;
  }

  /** Số câu thường đang chờ (không tính câu đang đọc) */
  get waiting() {
    return this.normal.length;
  }

  /** Số câu ưu tiên (quà) đang chờ */
  get waitingPriority() {
    return this.priority.length;
  }

  /** Giọng đã im bao lâu (0 khi đang đọc hoặc còn câu chờ) */
  quietForMs(now = Date.now()) {
    return this.busy ? 0 : now - this.lastSpokeAt;
  }

  /** tải trước mọi đoạn của câu (server + trình duyệt đều nhớ), để giữa các đoạn không phải chờ tải giọng */
  private warmed = new WeakSet<Line>();
  private warm(line: Line) {
    if (this.warmed.has(line)) return;
    this.warmed.add(line);
    for (const s of segments(line.text, this.rate)) void fetch(s.url).catch(() => null);
  }

  private async next() {
    if (this.playing) return;
    const now = Date.now();
    let line: Line | undefined;
    while ((line = this.priority.shift() ?? this.normal.shift())) {
      if (line.valid && !line.valid()) {
        line.done?.();
        continue;
      }
      if (line.keep || now - line.at < MAX_WAIT_MS) break;
      line.done?.();
    }
    // hết câu chính mới tới câu phụ; câu phụ cũ quá thì bỏ
    while (!line && (line = this.minor.shift())) if (now - line.at > MINOR_MAX_WAIT_MS) line = undefined;
    if (!line) return;
    this.playing = true;
    if (line.gapMs) {
      const gapLine = line;
      await new Promise((r) => setTimeout(r, gapLine.gapMs));
      this.playing = false;
      this.lastSpokeAt = Date.now();
      gapLine.done?.();
      void this.next();
      return;
    }
    const segs = segments(line.text, this.rate);
    this.warm(line);
    for (const l of [...this.priority, ...this.normal].slice(0, 2)) this.warm(l);
    // chờ đoạn đầu tải xong rồi mới báo bắt đầu, để camera / hiệu ứng khớp đúng lúc MC cất tiếng
    if (segs[0]) await Promise.race([fetch(segs[0].url).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
    if (!this.playing) return line.done?.(); // stop() trong lúc chờ tải
    line.start?.();
    try {
      // "Trời ơi! | ^Hoan hô!" -> đọc thường rồi hô to hơn
      for (const { who, url } of segs) {
        this.onSpeaker?.(who);
        const audio = new Audio(url);
        audio.volume = this.volume;
        this.current = audio;
        await new Promise<void>((resolve) => {
          // Tự gỡ kẹt: 1 câu treo (không tải xong, không báo lỗi) sẽ làm MC im cả buổi live.
          // Chưa phát được sau 8 giây thì bỏ câu; đang phát thì cắt khi quá độ dài câu + 4 giây.
          let guard = setTimeout(finish, 8000);
          function finish() {
            clearTimeout(guard);
            if (!audio.ended) audio.pause();
            resolve();
          }
          audio.onplaying = () => {
            clearTimeout(guard);
            const ms = Number.isFinite(audio.duration) ? audio.duration * 1000 + 4000 : 40_000;
            guard = setTimeout(finish, ms);
          };
          audio.onended = finish;
          audio.onerror = finish;
          // trình duyệt chặn tự phát tiếng: thử lại vài lần thay vì bỏ câu
          const tryPlay = (left: number) =>
            audio.play().catch(() => (left > 0 ? setTimeout(() => tryPlay(left - 1), 1500) : finish()));
          tryPlay(4);
        });
        if (this.current !== audio) break; // stop() giữa chừng
      }
    } finally {
      this.onSpeaker?.(null);
      line.done?.();
      this.current = null;
      this.playing = false;
      this.lastSpokeAt = Date.now();
      void this.next();
    }
  }
}

function readRate() {
  try {
    const r = Number(localStorage.getItem('voice-rate'));
    return r >= 0.5 && r <= 1.5 ? r : 1.35;
  } catch {
    return 1.35;
  }
}

export const voice = new Voice();

export { speakableName } from './names';
