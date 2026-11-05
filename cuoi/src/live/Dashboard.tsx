import { useState, type ReactNode } from 'react';
import type { LiveStatus } from './types';
import { emitTest, sendControl } from './page';

const FAKE_NAMES = ['Lan Anh', 'Minh Tuấn', 'Bé Na 🌸', 'Hoàng Long', 'Thu Trang', 'Quốc Bảo', 'duyanh99', '𝑵𝒈𝒐̣𝒄 𝑨𝒏𝒉'];
const pick = () => {
  const nickname = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
  return { nickname, username: nickname.normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'khach' };
};

/**
 * Trang điều khiển (http://localhost:3005, cổng bận thì 3006...). Im lặng, không phát tiếng.
 * - Kết nối phòng live
 * - Gõ câu cho giọng đọc trên stage
 * - Nút giả lập sự kiện để test khi chưa live
 * `preview`: bản xem trước của stage (im lặng)
 */
export function Dashboard({
  status,
  channelName,
  preview,
  extra,
}: {
  status: LiveStatus | null;
  channelName: string;
  preview: ReactNode;
  extra?: ReactNode;
}) {
  const [user, setUser] = useState(() => localStorageGet('tiktokUser'));
  const [nameText, setNameText] = useState('');
  const [msg, setMsg] = useState('');
  const [speakText, setSpeakText] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    setMsg('');
    localStorageSet('tiktokUser', user);
    try {
      const r = await fetch('/api/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user }),
      }).then((x) => x.json());
      setMsg(r.success ? 'Đã kết nối' : r.error);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const disconnect = () => fetch('/api/tiktok/disconnect', { method: 'POST' });

  const speak = async () => {
    const r = await sendControl('speak', speakText);
    setMsg(r.pages > 1 ? `Đã gửi (đang mở ${r.pages} trang)` : 'Đã gửi');
    setSpeakText('');
  };

  const saveName = async () => {
    const r = await sendControl('setName', nameText);
    setMsg(r.success ? `Đã lưu tên kênh: ${nameText.trim()}` : r.error);
    if (r.success) setNameText('');
  };

  return (
    // Gọn trong 1 màn hình: cột trái là nút (tự cuộn nếu thiếu chỗ), cột phải là bản xem trước cao bằng màn hình
    <div className="h-screen overflow-hidden bg-slate-950 p-3 text-sm text-slate-100">
      <div className="mx-auto flex h-full max-w-[1500px] gap-3">
        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <Card title="Kết nối TikTok LIVE">
            {status?.bridge ? (
              <div className="text-xs text-slate-400">
                Kết nối TikTok và link LIVE Studio dùng chung của MyStudioLive (ô @username trên cùng, tab <b>Đưa lên live</b>).
              </div>
            ) : (
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-1.5"
                placeholder="username TikTok (không cần @)"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && user.trim() && connect()}
              />
              <Btn onClick={connect} disabled={busy || !user.trim()}>
                {busy ? 'Đang nối...' : 'Kết nối'}
              </Btn>
              <Btn onClick={disconnect} tone="ghost">
                Ngắt
              </Btn>
            </div>
            )}
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs">
              {status?.isConnected ? (
                <span className="text-emerald-400">
                  ● Đang live @{status.username} · {status.viewerCount} người xem · {status.totalLikes} tim
                </span>
              ) : status?.isConnecting ? (
                <span className="text-amber-400">● Đang kết nối...</span>
              ) : (
                <span className="text-slate-400">● Chưa kết nối</span>
              )}
              {!status?.bridge && <span className="text-slate-500">
                {/* đúng cổng game đang chạy (mặc định 3005, bận thì tự đổi) */}
                LIVE Studio: <b className="text-slate-300 select-all">{`http://lvh.me:${window.location.port || '80'}/?view=stage`}</b> · 1080×1920
              </span>}
            </div>
            {(msg || status?.error) && <div className="mt-1 text-xs text-amber-300">{msg || status?.error}</div>}
          </Card>

          <Card title="Giọng đọc trên stage">
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-1.5"
                placeholder="Gõ câu muốn MC đọc ngay..."
                value={speakText}
                onChange={(e) => setSpeakText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && speakText.trim() && speak()}
              />
              <Btn onClick={speak} disabled={!speakText.trim()}>
                Đọc ngay
              </Btn>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <RateSlider />
              <span className="ml-2 text-slate-400">Tên kênh</span>
              <input
                className="w-32 rounded-lg bg-slate-800 px-2 py-1"
                placeholder={channelName}
                maxLength={40}
                value={nameText}
                onChange={(e) => setNameText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && nameText.trim() && saveName()}
              />
              <Btn tone="ghost" onClick={saveName} disabled={!nameText.trim()}>
                Lưu
              </Btn>
              <span className="flex-1" />
              <Btn tone="danger" onClick={() => confirmReset()}>
                Reset game
              </Btn>
            </div>
          </Card>

          {extra}

          <details className="rounded-2xl bg-slate-900 p-3 ring-1 ring-slate-800">
            <summary className="cursor-pointer font-semibold">Giả lập chung (người vào, follow, combo quà...)</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Btn tone="ghost" onClick={() => emitTest('member', pick())}>
                👋 Người vào
              </Btn>
              <Btn tone="ghost" onClick={() => emitTest('chat', { ...pick(), comment: 'Live hay quá' })}>
                💬 Comment
              </Btn>
              <Btn tone="ghost" onClick={() => emitTest('chat', { ...pick(), comment: 'mong mai thi được điểm cao' })}>
                🙏 Cầu chúc
              </Btn>
              <Btn tone="ghost" onClick={() => comboSameUser()}>
                🔁 1 người tặng 3 lần liền
              </Btn>
              <Btn tone="ghost" onClick={() => emitTest('follow', pick())}>
                ➕ Follow
              </Btn>
            </div>
            <p className="mt-2 text-xs text-slate-500">Sự kiện giả đi tới mọi trang đang mở, kể cả stage trong LIVE Studio.</p>
          </details>
        </div>

        {preview && <div className="flex flex-none flex-col items-center">
          <div className="mb-1 text-xs text-slate-400">Xem trước (im lặng)</div>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-700">{preview}</div>
        </div>}
      </div>
    </div>
  );
}

// Cùng 1 người tặng 3 lần cách nhau 1 giây: chỉ được cảm ơn 1 lần
function comboSameUser() {
  const who = pick();
  for (let i = 0; i < 3; i++) {
    setTimeout(() => emitTest('gift', { ...who, giftName: 'Hoa hồng', giftId: 5655, diamondCount: 1, repeatCount: 1 }), i * 1000);
  }
}

function confirmReset() {
  // không dùng window.confirm để tránh hộp thoại chặn
  void sendControl('reset');
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-slate-900 p-3 ring-1 ring-slate-800">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  tone = 'primary',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost' | 'danger';
}) {
  const cls = {
    primary: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
    ghost: 'bg-slate-800 hover:bg-slate-700',
    danger: 'bg-rose-700 hover:bg-rose-600',
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // bỏ qua
  }
}

// Tốc độ giọng MC: kéo là gửi sang trang stage, stage nhớ mức đã chỉnh
function RateSlider() {
  const [rate, setRate] = useState(() => {
    try {
      return Number(localStorage.getItem('voice-rate')) || 1.35;
    } catch {
      return 1.35;
    }
  });
  const change = (r: number) => {
    setRate(r);
    try {
      localStorage.setItem('voice-rate', String(r));
    } catch {
      // bỏ qua
    }
    void sendControl('setRate', String(r));
  };
  return (
    <label className="flex items-center gap-1.5 text-slate-400">
      Tốc độ giọng
      <input type="range" min={0.8} max={1.5} step={0.05} value={rate} onChange={(e) => change(Number(e.target.value))} className="w-28 accent-amber-500" />
      <b className="w-10 text-slate-200">{rate.toFixed(2)}×</b>
    </label>
  );
}
