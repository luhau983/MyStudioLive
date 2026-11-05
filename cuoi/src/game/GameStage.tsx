import { useEffect, useRef, useState } from 'react';
import type { GameState } from './useGame';
import { GAME } from './config';
import { H, W, world } from './world/world';
import './stage.css';

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const MEDALS = ['🥇', '🥈', '🥉'];
/** phần trăm thanh phe cướp (chưa ai có điểm thì chia đôi; luôn chừa chỗ cho số của cả 2 phe) */
const pkPct = (a: number, d: number) => (a + d === 0 ? 50 : Math.min(85, Math.max(15, (a / (a + d)) * 100)));

/** Màn hình live 1080x1920: sảnh cưới 3D + lớp bảng tên + bảng chữ phía trên */
export function GameStage({ game }: { game: GameState }) {
  const gl = useRef<HTMLCanvasElement>(null);
  const ov = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    world.attach(gl.current!, ov.current!);
    return () => world.detach();
  }, []);

  // đếm ngược trả lời
  const [, tick] = useState(0);
  const v = game.view;
  useEffect(() => {
    if (v?.phase !== 'proposal' && !game.duyen && !game.vote && !game.pk) return;
    const t = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [v?.phase, !!game.duyen, !!game.vote]);
  const left = v ? Math.max(0, Math.ceil((v.until - Date.now()) / 1000)) : 0;
  const likePct = Math.min(100, (game.likeProgress / game.likeNext) * 100);
  const canSteal = v && v.phase === 'proposal' && !v.pkDone;

  return (
    <div className="dc-stage">
      <canvas ref={gl} width={W} height={H} className="dc-canvas" />
      <canvas ref={ov} width={W} height={H} className="dc-canvas-2d" />

      {/* mất điện: phủ đen sảnh, chữ phía trên vẫn hiện */}
      <div className={`dc-dark ${game.dark ? 'on' : ''}`} />

      <header className="dc-title">{GAME.title}</header>

      <div className="dc-bar">
        {v ? (
          <>
            <div className="dc-pair">
              <Ava src={v.groomAva} />
              <span className="dc-heart">♥</span>
              <Ava src={v.brideAva} />
            </div>
            <div className="dc-who">
              <b>
                {cut(v.groom || '?', 11)} ♥ {cut(v.bride || '?', 11)}
              </b>
              <span>
                {v.phase === 'proposal'
                  ? `${cut(v.waiting, 12)} gõ ĐỒNG Ý · ${left}s`
                  : v.phase === 'walk'
                    ? 'Đang lên lễ đường'
                    : v.phase === 'vows'
                      ? 'Đang làm lễ cưới'
                      : 'Vừa cưới xong!'}
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="dc-pill">Cưới</span>
            <div className="dc-who">
              <b>Gõ CƯỚI VỢ @tên</b>
              <span>hoặc CƯỚI CHỒNG @tên người ấy</span>
            </div>
          </>
        )}
        <div className="dc-side">
          <div className="dc-queue">
            💍 <b>{game.married}</b> cặp
          </div>
          <div className="dc-like">
            <span>
              ❤️ {game.likeProgress}/{game.likeNext}
            </span>
            <div className="dc-like-bar">
              <div style={{ width: `${likePct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Luật chơi + Top đại gia: 1 cột bên phải, luật nằm ngay trên bảng Top, luôn hiện cho người mới vào */}
      {/* chỉ hiện lúc bình thường: có đám cưới, đang nhảy, MC hát, Nguyệt Lão, bình chọn thì ẩn cho khỏi che */}
      <div className={`dc-side-col ${game.busy ? 'off' : ''}`}>
      <div className="dc-rules">
        <div className="dc-rules-h">📜 Luật chơi</div>
        <ol>
          <li>
            Gõ <b>CƯỚI VỢ @tên</b> hoặc <b>CƯỚI CHỒNG @tên</b> để cầu hôn
          </li>
          <li>
            Người được hỏi gõ <b>ĐỒNG Ý</b> là lên lễ đường
          </li>
          <li>
            Gõ <b>QUẨY</b> để lên sân khấu nhảy
          </li>
        </ol>
      </div>

      {/* luôn hiện; chưa ai tặng thì mời tặng quà để lên bảng */}
      <div className="dc-top">
        <div className="dc-top-h">🏆 Top đại gia mừng cưới</div>
        {game.top.map((t, i) => (
          <div key={t.id} className="dc-top-row">
            <span className="dc-top-rank">{MEDALS[i] ?? i + 1}</span>
            <span className="dc-top-name">{cut(t.name, 11)}</span>
            <b>{t.coins} xu</b>
          </div>
        ))}
        {game.top.length === 0 && <div className="dc-top-empty">Tặng quà mừng cưới để lên bảng 🎁</div>}
      </div>
      </div>

      {game.pk ? (
        <div className="dc-pk">
          <div className="dc-pk-head">
            ⚔️ PK TRANH DUYÊN · {Math.max(0, Math.ceil((game.pk.until - Date.now()) / 1000))}s
          </div>
          <div className="dc-pk-bar">
            <div className="dc-pk-atk" style={{ width: `${pkPct(game.pk.atk, game.pk.def)}%` }}>
              <span>⚔️ {game.pk.atk}</span>
            </div>
            <div className="dc-pk-def">
              <span>{game.pk.def} 🛡️</span>
            </div>
          </div>
          <div className="dc-pk-sub">
            <span>Gõ <b>TRANH DUYÊN</b> · phe {cut(game.pk.atkName, 10)}</span>
            <span>Gõ <b>KHÔNG</b> · giữ {cut(game.pk.defName, 10)}</span>
          </div>
          <div className="dc-pk-note">1 comment = 1 điểm · 1 xu quà = 10 điểm</div>
        </div>
      ) : (
        canSteal && (
          <div className="dc-steal">
            ⚔️ Không chịu? Gõ <b>TRANH DUYÊN</b> để mở PK tranh duyên
          </div>
        )
      )}

      {game.parents && (game.parents.groom || game.parents.bride) && (
        <div className="dc-parents">
          👪 {[game.parents.bride, game.parents.groom].filter(Boolean).join(' · ')}
          <small>Tặng quà chúc phúc nhiều nhất được lên làm ba mẹ</small>
        </div>
      )}

      {game.duyen && (
        <div className="dc-steal dc-duyen">
          🧧 Gõ <b>SE DUYÊN</b> · {Math.max(0, Math.ceil((game.duyen.until - Date.now()) / 1000))}s · {game.duyen.count} người
        </div>
      )}

      {/* Thẻ lời nguyện Nguyệt Lão đã ẩn (che nhiều sảnh quá); MC vẫn đọc lời nguyện */}

      {game.vote && (
        <div className="dc-steal dc-vote">
          💘 Hợp không? Gõ <b>1</b> HỢP · <b>2</b> KHÔNG · {Math.max(0, Math.ceil((game.vote.until - Date.now()) / 1000))}s
          {game.vote.yes + game.vote.no > 0 && <> · {Math.round((game.vote.yes / (game.vote.yes + game.vote.no)) * 100)}% hợp</>}
        </div>
      )}

      {game.queueLen > 0 && (
        <div className="dc-queue-pill">
          Chờ cưới: <b>{game.queueLen}</b> đám
        </div>
      )}

      {game.lastGift && (
        <div key={game.lastGift.timestamp} className={`dc-gift ${game.lastGift.coins >= GAME.giftBig ? 'dc-gift-big' : ''}`}>
          <b>{cut(game.lastGift.nickname, 18)}</b> gửi quà mừng cưới 🎁
        </div>
      )}
    </div>
  );
}

function Ava({ src }: { src: string }) {
  return src ? <img className="dc-ava" src={src} referrerPolicy="no-referrer" /> : <span className="dc-ava dc-ava-empty">♥</span>;
}
