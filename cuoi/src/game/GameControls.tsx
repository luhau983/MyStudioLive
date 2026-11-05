import { useEffect, useState, type ReactNode } from 'react';
import { emitTest, sendControl } from '../live/page';
import { GAME } from './config';

// Nút giả lập riêng của game Cưới Liền Tay (trang điều khiển)
const NAMES = ['Lan Anh', 'Minh Tuấn', 'Bé Na 🌸', 'Hoàng Long', 'Thu Trang', 'Quốc Bảo', 'duyanh99', 'Ngọc Hân', 'Gia Huy', 'Khánh Linh', 'Mai Phương', 'Tuấn Kiệt', 'Hải Yến', 'Đức Anh', 'Phương Thảo', 'Bảo Ngọc', 'Trọng Nhân', 'Thanh Hà', 'Kim Chi', 'Văn Toàn'];
const POOL = Array.from({ length: 30 }, (_, i) => {
  const nickname = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : '');
  return { nickname, username: `khach${i}` };
});
type P = (typeof POOL)[number];
const CHATS = ['Chúc mừng hạnh phúc!', 'Đẹp đôi quá', 'cỗ ngon ghê', 'mình độc thân nè', 'Vui quá trời', 'ai cưới mình không'];
const anyone = () => POOL[Math.floor(Math.random() * POOL.length)];
const chat = (who: P, comment: string) => emitTest('chat', { ...who, comment });
const gift = (who: P, diamondCount: number, giftName: string) => emitTest('gift', { ...who, giftName, giftId: 1, diamondCount, repeatCount: 1 });
const many = (n: number, f: (i: number) => void) => {
  for (let i = 0; i < n; i++) setTimeout(() => f(i), i * 200);
};
// 2 người khác nhau
const two = () => {
  const a = anyone();
  let b = anyone();
  while (b === a) b = anyone();
  return [a, b] as const;
};

export function GameControls({ stageCount = 0 }: { stageCount?: number }) {
  const [auto, setAuto] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [musicVol, setMusicVol] = useState(() => {
    try {
      return Number(localStorage.getItem('cuoi3d-music-vol')) || 100;
    } catch {
      return 100;
    }
  });
  const changeVol = (v: number) => {
    setMusicVol(v);
    try {
      localStorage.setItem('cuoi3d-music-vol', String(v));
    } catch {
      // bỏ qua
    }
    void sendControl('custom', `musicVol:${v}`);
  };

  // Live giả: khách vào, chúc, zô; thỉnh thoảng có người cầu hôn
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      const w = anyone();
      const r = Math.random();
      if (r < 0.06) {
        const [a, b] = two();
        chat(a, `cưới ${Math.random() < 0.5 ? 'vợ' : 'chồng'} @${b.nickname}`);
        setTimeout(() => chat(b, Math.random() < 0.8 ? 'đồng ý' : 'không'), 6000 + Math.random() * 8000);
      } else if (r < 0.25) chat(w, 'zô');
      else chat(w, CHATS[Math.floor(Math.random() * CHATS.length)]);
    }, 900);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <section className="space-y-2 rounded-2xl bg-slate-900 p-3 ring-1 ring-slate-800">
      {stageCount > 1 && (
        <p className="rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-xs text-amber-300">
          ⚠ Đang có {stageCount} trang stage mở cùng lúc (2 nguồn Link trong LIVE Studio hoặc thêm tab ?view=stage). Chỉ trang mở sau cùng phát tiếng; nên xoá bớt nguồn thừa.
        </p>
      )}
      <Row label="Điều khiển">
        <B onClick={() => void sendControl('custom', 'clearStage')}>✖ Dọn sân khấu</B>
        <B onClick={() => void sendControl('custom', 'party')}>🎉 Cả sảnh quẩy</B>
        <B onClick={() => void sendControl('custom', 'duyen')}>🧵 Nguyệt Lão se duyên</B>
        <B onClick={() => void sendControl('custom', 'event')}>🎲 Sự kiện bất ngờ</B>
        <B onClick={() => void sendControl('custom', 'car')}>🚗 Xe hoa</B>
        <B onClick={() => void sendControl('custom', 'dj')}>🎧 Quẩy DJ cả sảnh</B>
        <B onClick={() => void sendControl('custom', 'song')}>🎤 MC hát (đèn rọi)</B>
        <B onClick={() => void sendControl('custom', 'hire')}>🧑‍🍳 Tuyển người xem làm nhân viên</B>
        <B onClick={() => void sendControl('custom', 'roses')}>🌹 Mưa hoa hồng</B>
        <B
          on={musicOn}
          onClick={() => {
            const next = !musicOn;
            setMusicOn(next);
            void sendControl('custom', next ? 'music:on' : 'music:off');
          }}
        >
          {musicOn ? '🎵 Nhạc nền: BẬT' : '🔇 Nhạc nền: TẮT'}
        </B>
        <label className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs">
          Âm lượng nhạc
          <input type="range" min={0} max={200} step={10} value={musicVol} onChange={(e) => changeVol(Number(e.target.value))} className="w-24 accent-amber-500" />
          <b className="w-9 text-right">{musicVol}%</b>
        </label>
        <B onClick={() => testVoice()}>🔊 Thử 2 giọng MC (trang này)</B>
        <B onClick={() => void (window as unknown as { cMusicPreview: () => Promise<void> }).cMusicPreview()}>🎵 Nghe thử nhạc nền (trang này)</B>
      </Row>
      <Row label="Thử khách">
        <B onClick={() => setAuto((a) => !a)} on={auto}>
          {auto ? '⏸ Dừng live giả' : '▶ Live giả 30 khách'}
        </B>
        <B onClick={() => many(8, () => chat(anyone(), CHATS[Math.floor(Math.random() * CHATS.length)]))}>💬 8 khách vào</B>
        <B
          onClick={() => {
            const [a, b] = two();
            chat(b, 'xin chào');
            setTimeout(() => chat(a, `cưới vợ @${b.nickname}`), 1500);
            setTimeout(() => chat(b, 'đồng ý'), 12000);
          }}
        >
          💍 Cầu hôn + đồng ý
        </B>
        <B
          onClick={() => {
            const [a, b] = two();
            chat(b, 'hello');
            setTimeout(() => chat(a, `cưới chồng @${b.nickname}`), 1500);
            setTimeout(() => chat(b, 'không'), 12000);
          }}
        >
          🙅 Cầu hôn + từ chối
        </B>
        <B
          onClick={() => {
            const [a, b] = two();
            let c = anyone();
            while (c === a || c === b) c = anyone();
            chat(b, 'chào cả nhà');
            setTimeout(() => chat(a, `cưới @${b.nickname}`), 1500);
            setTimeout(() => chat(b, 'đồng ý'), 9000);
            setTimeout(() => gift(c, 30, 'Donut'), 15000);
          }}
        >
          🦹 Cưới rồi bị cướp (30 xu)
        </B>
        <B onClick={() => many(10, () => chat(anyone(), 'zô'))}>🥂 10 zô</B>
        <B onClick={() => many(6, () => chat(anyone(), 'se duyên'))}>🙏 6 người se duyên</B>
      </Row>
      <Row label="Quà / tim">
        <B onClick={() => gift(anyone(), 1, 'Hoa hồng')}>🌹 1</B>
        <B onClick={() => gift(anyone(), 10, 'Kẹo')}>🎈 10</B>
        <B onClick={() => gift(anyone(), 30, 'Donut')}>🧧 30</B>
        <B onClick={() => gift(anyone(), 99, 'Bắn tim')}>🎆 99</B>
        <B onClick={() => gift(anyone(), 299, 'Xe')}>🚗 299</B>
        <B onClick={() => gift(anyone(), 1000, 'Thiên hà')}>💎 1000</B>
        <B onClick={() => emitTest('like', { ...anyone(), likeCount: 100 })}>❤️ 100 tim</B>
        <B onClick={() => many(8, () => chat(anyone(), Math.random() < 0.7 ? '1' : '2'))}>💘 8 phiếu bình chọn</B>
      </Row>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 flex-none text-xs font-semibold text-slate-400">{label}</span>
      {children}
    </div>
  );
}

// Nghe thử ngay ở trang điều khiển, không gửi sang stage (không thành 2 giọng trên live)
const SAMPLES = [
  GAME.proposal.groom[0]('Minh Tuấn', 'Lan Anh'),
  GAME.stolen[0]('Hoàng Long', 'Minh Tuấn', 'groom'),
  GAME.ceremonyOpen[0]('Minh Tuấn', 'Lan Anh'),
  GAME.greetings[1]('bạn Lan Anh và bạn Thu Trang'),
];
let sample = 0;
async function testVoice() {
  // cùng cách đọc với stage: "M:"/"F:" đổi giọng, "|" tách đoạn, "^" hô to hơn
  let who = 'M';
  for (let t of SAMPLES[sample++ % SAMPLES.length].split('|')) {
    t = t.trim();
    const m = /^(M|F):\s*/.exec(t);
    if (m) {
      who = m[1];
      t = t.slice(m[0].length);
    }
    const a = new Audio(`/api/tts?rate=1.25${t.startsWith('^') ? '&hype=1' : ''}${who === 'F' ? '&v=f' : ''}&text=${encodeURIComponent(t.replace(/^\^+/, ''))}`);
    await new Promise<void>((r) => {
      a.onended = a.onerror = () => r();
      a.play().catch(() => r());
    });
  }
}

function B({ children, onClick, on }: { children: ReactNode; onClick: () => void; on?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${on ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700'}`}>
      {children}
    </button>
  );
}
