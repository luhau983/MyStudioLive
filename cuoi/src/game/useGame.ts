import { useEffect, useRef, useState } from 'react';
import { useLiveEvents } from '../live/useLiveEvents';
import type { GiftEvent, LiveStatus } from '../live/types';
import { voice, speakableName } from '../live/voice';
import { containsBanned, maskBanned } from '../live/bannedWords';
import { NameBatcher } from '../live/scoreboard';
import { GiftThanker, OncePerPerson, RecentPeople, plain } from '../live/chatter';
import { NGUYEN, type Nguyen } from './seDuyen';
import { IS_STAGE } from '../live/page';
import { GAME } from './config';
import { matchName, nameScore, other, parseCommand, pickRole, type Role } from './rules';
import { pickWeddingSet } from './world/chibi3d';
import { world } from './world/world';
import { music } from './music';

// Bốc kiểu "rút bài": đọc hết 1 vòng mới lặp lại, để giọng MC không bị nhắc lại câu cũ
const bags = new Map<readonly unknown[], number[]>();
const lastPicked = new Map<readonly unknown[], number>();
function pick<T>(list: readonly T[]): T | undefined {
  if (!list.length) return undefined;
  let bag = bags.get(list);
  if (!bag?.length) {
    bag = list.map((_, i) => i).sort(() => Math.random() - 0.5);
    // vòng mới không mở đầu bằng đúng câu vừa đọc cuối vòng trước
    const prev = lastPicked.get(list);
    if (bag.length > 1 && bag[bag.length - 1] === prev) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    bags.set(list, bag);
  }
  const i = bag.pop()!;
  lastPicked.set(list, i);
  return list[i];
}

export type Phase = 'idle' | 'proposal' | 'walk' | 'vows' | 'after';

/** Đám cưới đang diễn ra */
interface Wedding {
  phase: Phase;
  ids: Record<Role, string | null>; // ai đang là chú rể / cô dâu
  stealRole: Role; // vai bị cướp: vai của người gõ cầu hôn
  targetName: string; // tên được @ (khi người đó chưa vào tiệc)
  until: number; // hạn trả lời
  nudged: number;
  pkDone?: boolean; // mỗi đám chỉ PK cướp dâu 1 lần
  yesAfterPk?: boolean; // người được hỏi gõ đồng ý lúc đang PK
  open?: boolean; // người được hỏi im lặng / vắng mặt: ai gõ đồng ý trước là được cưới
}

// ---------- Bảng Top đại gia: lưu theo ngày trong trình duyệt, làm mới nguồn Link LIVE Studio không bị mất ----------
type TopRow = { id: string; name: string; coins: number };
const topKey = () => `cuoi-lien-tay-top-${new Date().toLocaleDateString('en-CA')}`;
function loadTop(): Map<string, { name: string; coins: number }> {
  try {
    const raw = JSON.parse(localStorage.getItem(topKey()) ?? '[]') as [string, { name: string; coins: number }][];
    return new Map(raw);
  } catch {
    return new Map();
  }
}
function saveTop(m: Map<string, { name: string; coins: number }>) {
  try {
    localStorage.setItem(topKey(), JSON.stringify([...m.entries()]));
  } catch {
    /* trình duyệt chặn lưu: bảng vẫn chạy, chỉ là làm mới thì mất */
  }
}
const topRows = (m: Map<string, { name: string; coins: number }>): TopRow[] =>
  [...m.entries()]
    .sort((a, b) => b[1].coins - a[1].coins)
    .slice(0, 7)
    .map(([id, v]) => ({ id, name: v.name, coins: v.coins }));

/** PK cướp dâu đang diễn ra */
interface Pk {
  w: Wedding;
  until: number;
  atk: number; // điểm phe cướp
  def: number; // điểm phe giữ
  atkBy: Map<string, number>; // ai góp bao nhiêu điểm bên cướp (người nhiều nhất thế chỗ nếu thắng)
  atkIds: Set<string>;
  last: Map<string, number>; // lần tính điểm comment gần nhất của mỗi người (1 điểm/giây)
  challenger: string;
  dirty: boolean; // điểm đổi, cần vẽ lại bảng
  saidMid: boolean;
}

interface Pending {
  id: string;
  role: Role | 'any';
  target: string;
}

export interface WeddingView {
  phase: Phase;
  groom: string;
  bride: string;
  groomAva: string;
  brideAva: string;
  stealRole: Role;
  price: number;
  pkDone: boolean; // đám này đã PK cướp dâu rồi (ẩn lời mời "gõ CƯỚP")
  until: number;
  waiting: string; // tên người đang được hỏi (chưa trả lời)
}

/** Mỗi việc chỉ cho phép 1 lần / `ms` */
function limiter(ms: number) {
  const last = new Map<string, number>();
  return (key: string, now = Date.now()) => {
    if (now - (last.get(key) ?? -Infinity) < ms) return false;
    last.set(key, now);
    return true;
  };
}

export function useGame() {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [channelName, setChannelName] = useState(GAME.defaultChannelName);
  const [lastGift, setLastGift] = useState<(GiftEvent & { coins: number }) | null>(null);
  const [likeProgress, setLikeProgress] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [view, setView] = useState<WeddingView | null>(null);
  const [queueLen, setQueueLen] = useState(0);
  const [married, setMarried] = useState(0);
  const [duyen, setDuyen] = useState<{ until: number; count: number } | null>(null);
  const [nguyen, setNguyen] = useState<Nguyen | null>(null);
  const [stageCount, setStageCount] = useState(0);
  const [likeNext, setLikeNext] = useState(GAME.likeMilestones[0]);
  const [vote, setVote] = useState<{ until: number; yes: number; no: number } | null>(null);
  const [dark, setDark] = useState(false);
  const [pk, setPk] = useState<{ until: number; atk: number; def: number; atkName: string; defName: string } | null>(null);
  const [parents, setParents] = useState<{ groom: string; bride: string } | null>(null);
  const [top, setTop] = useState<TopRow[]>(() => topRows(loadTop()));
  const [busy, setBusy] = useState(false); // đang có đám cưới / tiết mục (ẩn bảng Luật chơi + Top đại gia)
  const likeBase = useRef<number | null>(null);
  const avatars = useRef(new Map<string, string>());
  const names = useRef(new Map<string, string>()); // id -> tên hiển thị (đã che từ bậy)

  const [s] = useState(() => ({
    greeter: new NameBatcher(
      GAME.greetEveryMs,
      GAME.namesPerGreeting,
      // người lướt vào: chào ưu tiên (chỉ sau câu cảm ơn quà)
      (n) => !inCeremony() && voice.sayMinor(pick(GAME.greetings)!(joinNames(n))),
      () => voice.waitingPriority >= 2,
    ),
    gifts: new GiftThanker(GAME.giftThanksCooldownMs, GAME.giftBig),
    follows: new OncePerPerson(),
    recent: new RecentPeople(),
    w: null as Wedding | null,
    queue: [] as Pending[],
    married: 0,
    vowsNo: 0,
    lastWeddingAt: Date.now(),
    zoCount: [] as number[],
    zoLimit: limiter(60_000),
    nudgeLimit: limiter(15_000),
    stealLowLimit: limiter(10_000),
    lastPair: Date.now() - 30_000,
    duyen: null as null | { ids: Set<string>; until: number; said: number; maker: string | null },
    fightLimit: limiter(25_000),
    passerLimit: limiter(15_000),
    // màn mở đầu: ~12 giây sau khi mở trang đã có đám cưới dở dang của dàn khách quen
    lastActivity: Date.now() - GAME.autoAfterMs,
    lastAuto: Date.now() - GAME.autoEveryMs + 12_000,
    likeCycle: null as number | null, // tổng tim lúc bắt đầu vòng mốc (100/300/1000)
    likeStep: 0,
    vote: null as null | { until: number; yes: number; no: number; voted: Set<string>; g: string; b: string },
    nextEventAt: Date.now() + GAME.eventEveryMs[0],
    lastDj: Date.now() - GAME.djEveryMs + 3 * 60_000, // lần đầu sau ~3 phút
    danceCalls: [] as number[],
    lastHire: Date.now() - GAME.hireEveryMs + 45_000, // lần đầu sau ~45 giây
    actLimit: limiter(6_000),
    crewLimit: limiter(45_000),
    lastDuyen: Date.now() - GAME.duyen.everyMs + 90_000, // lần đầu sau ~1,5 phút
    lastChatter: '',
    pk: null as null | Pk,
    bless: new Map<string, number>(), // xu chúc phúc trong đám hiện tại
    parents: [null, null] as [string | null, string | null], // [phụ huynh nhà trai, nhà gái]
    giftTotal: loadTop(), // tổng xu mỗi người trong ngày (bảng Top đại gia, chỉ tính quà; làm mới trang không mất)
    djPending: false,
    danceCam: [] as string[], // người gõ quẩy lúc đang nhảy DJ, chờ camera quay cận (5 giây/người)
    danceCamUntil: 0, // có quà / tim gọi nhảy lúc đang cưới: nhảy sau khi cưới xong
    chatterGap: GAME.chatterQuietMs,
  }));

  /** đám cưới đang chạy (từ lúc cầu hôn tới khi xe hoa đi) */
  function weddingBusy() {
    return !!s.w && s.w.phase !== 'after';
  }

  /** tiết mục khác đang chạy: nhảy DJ, MC hát, Nguyệt Lão, bình chọn đẹp đôi */
  function showBusy() {
    return world.djOn || world.singing || !!s.duyen || !!s.vote;
  }

  /** được quay cận người gõ quẩy: đang nhạc DJ, hoặc rảnh (không có đám cưới, không tiết mục khác) */
  function danceCamOk() {
    return world.djOn || (!weddingBusy() && !showBusy());
  }

  /** đang cử hành lễ (đi thảm đỏ, bái đường, xe hoa đón): MC chỉ nói về cô dâu chú rể, không chào khách */
  function inCeremony() {
    const ph = s.w?.phase;
    return ph === 'walk' || ph === 'vows';
  }

  const safeName = (nickname: string, username: string) => (containsBanned(nickname) ? username : nickname);
  const shown = (id: string) => names.current.get(id) ?? id;
  const spoken = (id: string | null) => (id ? speakableName(shown(id)) : 'bạn ấy');

  // cập nhật bảng trên màn hình
  const sync = () => {
    const w = s.w;
    setQueueLen(s.queue.length);
    if (!w) return setView(null);
    setView({
      phase: w.phase,
      groom: w.ids.groom ? shown(w.ids.groom) : w.stealRole === 'bride' ? w.targetName : '',
      bride: w.ids.bride ? shown(w.ids.bride) : w.stealRole === 'groom' ? w.targetName : '',
      groomAva: (w.ids.groom && avatars.current.get(w.ids.groom)) || '',
      brideAva: (w.ids.bride && avatars.current.get(w.ids.bride)) || '',
      stealRole: w.stealRole,
      price: GAME.stealMin,
      pkDone: !!w.pkDone,
      until: w.until,
      waiting: w.phase === 'proposal' ? (w.ids[other(w.stealRole)] ? shown(w.ids[other(w.stealRole)]!) : w.targetName) : '',
    });
  };

  const meet = (id: string, nickname: string, avatar: string) => {
    const name = safeName(nickname, id);
    names.current.set(id, name);
    if (avatar) avatars.current.set(id, avatar);
    s.recent.note(id, speakableName(name));
    world.ensure(id, name, avatar);
    return name;
  };

  /**
   * Tìm người đang trong tiệc theo chữ gõ sau @ (tên hiển thị hoặc username).
   * Ưu tiên khớp đúng; khớp gần đúng (đầu tên / một phần tên) chỉ nhận khi cả sảnh có đúng 1 người khớp.
   */
  const findGuest = (typed: string) => {
    const scored = world.ids().map((x) => ({ x, s: nameScore(typed, shown(x), x) })).filter((e) => e.s > 0);
    const best = Math.max(0, ...scored.map((e) => e.s));
    const top = scored.filter((e) => e.s === best);
    if (best === 3) return top[0].x;
    return top.length === 1 ? top[0].x : null;
  };

  // ---------- cầu hôn ----------
  const propose = (p: Pending) => {
    // không đè giai đoạn: đang có đám, đang nhảy, MC đang hát, Nguyệt Lão, bình chọn -> xếp hàng chờ xong
    if (weddingBusy() || showBusy()) {
      if (s.queue.some((q) => q.id === p.id)) return;
      if (s.queue.length >= GAME.maxQueue) return void voice.say(GAME.queueFull);
      s.queue.push(p);
      voice.say(weddingBusy() ? GAME.queued(spoken(p.id), s.queue.length) : GAME.queuedShow(spoken(p.id), s.queue.length));
      return sync();
    }
    const targetId = findGuest(p.target);
    if (targetId === p.id) return void voice.say(GAME.self(spoken(p.id)));
    const role: Role = p.role === 'any' ? pickRole(p.id) : p.role;
    s.w = {
      phase: 'proposal',
      ids: { groom: null, bride: null, [role]: p.id } as Record<Role, string | null>,
      stealRole: role,
      targetName: targetId ? shown(targetId) : p.target.replace(/^@+\s*/, '').slice(0, 30), // chưa vào tiệc: giữ chữ đã gõ để chờ đúng người
      until: Date.now() + GAME.answerMs,
      nudged: 0,
    };
    if (targetId) s.w.ids[other(role)] = targetId;
    resetParents();
    world.setNames('', '');
    world.proposal(p.id, role, targetId);
    const a = spoken(p.id);
    const b = targetId ? spoken(targetId) : speakableName(s.w.targetName);
    if (p.role === 'any') voice.say(GAME.proposal.picked(a, role));
    voice.say(pick(GAME.proposal[role])!(a, b), false, undefined, false, () => world.look('gate', 9000));
    const asking = () => s.w?.phase === 'proposal' && s.w.ids[role] === p.id; // vẫn đang chờ trả lời đúng đám này
    if (!targetId) voice.say(GAME.targetMissing(b), false, undefined, false, undefined, asking);
    else if (Math.random() < 0.6) voice.say(GAME.proposal.stealHint(GAME.stealMin, role), false, undefined, false, undefined, asking);
    sync();
  };

  const accept = () => {
    const w = s.w;
    if (!w || w.phase !== 'proposal') return;
    // đang PK cướp dâu: ghi nhận đồng ý, PK xong mới lên lễ đường
    if (s.pk) {
      w.yesAfterPk = true;
      return;
    }
    w.phase = 'walk';
    const set = pickWeddingSet();
    world.accept(set);
    world.setNames(shown(w.ids.groom!), shown(w.ids.bride!));
    const a = spoken(w.ids[w.stealRole]);
    const b = spoken(w.ids[other(w.stealRole)]);
    voice.say(pick(GAME.accepted)!(a, b), true, undefined, true, () => {
      world.cannons();
      world.roseRain(220);
      world.balloonsUp(20);
      world.dance(9000);
      world.confetti(160);
      world.heartsRain(60);
    });
    // thay đồ đúng lúc MC giới thiệu bộ đồ, bước đi đúng lúc MC hô lên lễ đường (khớp lời với hình)
    voice.say(set.rare ? GAME.outfitFunny : pick(GAME.outfit)!(set.name), false, undefined, true, () => world.dressCouple());
    voice.say(pick(GAME.walk)!(spoken(w.ids.groom), spoken(w.ids.bride)), false, undefined, true, () => {
      world.startWalk();
      world.smokeBurst(20, 'aisle');
    });
    // phòng hờ giọng đọc kẹt: quá 40 giây vẫn chưa đi thì tự đi
    setTimeout(() => s.w === w && w.phase === 'walk' && world.startWalk(), 40_000);
    sync();
  };

  const endProposal = (why: 'no' | 'timeout') => {
    const w = s.w;
    if (!w || w.phase !== 'proposal') return;
    const pid = w.ids[w.stealRole];
    const a = spoken(pid);
    const b = w.ids[other(w.stealRole)] ? spoken(w.ids[other(w.stealRole)]) : speakableName(w.targetName);
    world.reject();
    if (pid) world.setTitle(pid, { text: GAME.titles.rejected, gold: false });
    voice.say(pick(why === 'no' ? GAME.rejected : GAME.timeout)!(a, b), true);
    s.w = null;
    sync();
    setTimeout(nextInQueue, 6000);
  };

  // lên tới sân khấu: đọc lời làm lễ, trao nhẫn, ôm, nâng ly, chúc
  const runVows = () => {
    const w = s.w;
    if (!w || w.phase !== 'walk') return;
    w.phase = 'vows';
    sync();
    const g = spoken(w.ids.groom);
    const b = spoken(w.ids.bride);
    const keep = true;
    const st = () => world.look('stage', 60_000);
    voice.say(pick(GAME.ceremonyOpen)!(g, b), false, undefined, keep, () => {
      st();
      world.fountains(7000);
      world.smokeBurst(16);
    });
    // bái đường: MC xướng (quay người, chắp tay) -> hô "Bái!" (cúi đúng lúc đó) -> nói tiếp
    for (const step of GAME.bai) {
      voice.say(pick(step.call)!, false, undefined, keep, () => {
        if (step.kind === 'parents') world.showParents(s.parents); // người tặng quà chúc phúc nhiều nhất lên làm ba mẹ
        world.bowFace(step.kind);
      });
      voice.say(GAME.baiCue, false, undefined, keep, () => world.bowNow());
      voice.say(pick(step.after)!, false, undefined, keep);
    }
    // đưa vào động phòng: xe hoa vào tận thảm đỏ đón, phóng ra cổng
    voice.say(pick(GAME.dongPhong)!(g, b), false, undefined, keep, () => {
      world.petals(260);
      world.fireworks(3);
      world.dongPhong(() => {
        finish();
        voice.say(pick(GAME.closing)!(g, b)); // chúc + mời cặp tiếp theo gõ cưới
        voice.gap(3500); // nghỉ một nhịp trước cảnh sau
      });
    });
  };

  const finish = () => {
    const w = s.w;
    if (!w) return;
    w.phase = 'after';
    s.married++;
    setMarried(s.married);
    s.lastWeddingAt = Date.now();
    const { groom, bride } = w.ids;
    if (groom && bride) {
      world.setTitle(groom, { text: GAME.titles.married(cut(shown(bride), 10)), gold: true });
      world.setTitle(bride, { text: GAME.titles.married(cut(shown(groom), 10)), gold: true });
    }
    world.wave(60_000);
    world.look('wide', 1);
    setTimeout(() => s.w?.phase === 'after' && world.setBaseCamera('wide'), 15_000);
    sync();
    if (groom && bride) setTimeout(() => startVote(groom, bride), 2500);
    setTimeout(nextInQueue, GAME.voteMs + 8000);
  };

  // ---------- Quẩy DJ: cả sảnh lên sân khấu, nhạc DJ, MC hô liên tục ----------
  const startDj = () => {
    if (world.djOn) return;
    // đám cưới được ưu tiên: đang có đám (hoặc còn đám chờ) thì để dành, cưới xong mới nhảy
    if (weddingBusy() || world.singing || s.queue.length) {
      s.djPending = true;
      return;
    }
    s.djPending = false;
    s.lastDj = Date.now();
    world.djParty(GAME.djMs);
    music.dj(GAME.djMs);
    world.look('stage', 8000);
    voice.say(pick(GAME.djIntro)!, true);
    s.danceCam = [];
    // MC hô mỗi 15 giây; camera đổi giữa toàn cảnh và sân khấu, trừ khi đang quay người vừa gõ quẩy
    const hype = Math.floor(GAME.djMs / GAME.djHypeEveryMs) - 1;
    for (let i = 1; i <= hype; i++)
      setTimeout(() => {
        // xen kẽ: câu hô nhảy, rồi câu chúc sức khỏe / tình duyên
        if (world.djOn)
          voice.say(pick(i % 2 ? GAME.djHype : GAME.djWish)!, true, undefined, false, () => {
            if (!s.danceCam.length && Date.now() > s.danceCamUntil) world.look(i % 2 ? 'wide' : 'stage', 8000);
          });
      }, i * GAME.djHypeEveryMs);
    setTimeout(() => {
      voice.say(GAME.djEnd);
      voice.gap(3000); // nghỉ một nhịp trước cảnh sau
    }, GAME.djMs + 500);
  };

  // ---------- Bình chọn đẹp đôi ----------
  const startVote = (g: string, b: string) => {
    if (s.vote) return;
    const until = Date.now() + GAME.voteMs;
    s.vote = { until, yes: 0, no: 0, voted: new Set(), g, b };
    setVote({ until, yes: 0, no: 0 });
    voice.say(pick(GAME.voteAsk)!(spoken(g), spoken(b)), true);
    setTimeout(() => {
      const v = s.vote;
      s.vote = null;
      setVote(null);
      if (!v) return;
      const total = v.yes + v.no;
      if (!total) return void voice.say(GAME.voteNone);
      const p = Math.round((v.yes / total) * 100);
      voice.say(p >= 70 ? GAME.voteHigh(p) : p >= 40 ? GAME.voteMid(p) : GAME.voteLow(p), true);
      if (p >= 70) {
        world.fireworks(4);
        world.heartsRain(80);
      }
    }, GAME.voteMs);
  };

  // ---------- Sự kiện bất ngờ ----------
  /** MC ra giữa sân khấu, đèn rọi, cả sảnh tắt đèn, hát 2–3 câu rồi về chỗ */
  const startSong = () => {
    if (world.singing || weddingBusy() || showBusy() || s.queue.length) return;
    const E = GAME.ev;
    let startAt = Date.now();
    voice.say(E.songIntro, false, undefined, true, () => {
      startAt = Date.now();
      world.singStart();
    });
    voice.say(pick(E.songs)!, false, () => {
      // giữ đèn rọi ít nhất 10 giây (bản xem trước im lặng cũng thấy được tiết mục)
      setTimeout(() => {
        world.singEnd();
        world.confetti(120);
        voice.say(E.songOutro);
      }, Math.max(0, startAt + 10_000 - Date.now()));
    }, true);
  };

  const runEvent = () => {
    if (weddingBusy() || world.djOn || world.singing || s.duyen) return;
    const w = s.w;
    const onStage = w?.phase === 'after' && w.ids.groom && w.ids.bride;
    const kinds = onStage ? ['blackout', 'mom', 'ex', 'envelope', 'song'] : ['blackout', 'envelope', 'song', 'song'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const E = GAME.ev;
    if (kind === 'song') startSong();
    else if (kind === 'envelope') {
      voice.say(E.envelope, true, undefined, false, () => {
        world.goldRain(400);
        world.confetti(200);
        world.cannons();
      });
    } else if (kind === 'blackout') {
      voice.say(E.blackoutStart, true, undefined, false, () => {
        setDark(true);
        setTimeout(() => {
          const cur = s.w;
          const bride = cur?.phase === 'after' ? cur.ids.bride : null;
          const pool = world.ids().filter((id) => id !== cur?.ids.groom && id !== bride && !id.startsWith('ev-'));
          if (cur && bride && pool.length) {
            const nb = pool[Math.floor(Math.random() * pool.length)];
            world.steal(bride, nb);
            cur.ids.bride = nb;
            world.setNames(shown(cur.ids.groom!), shown(nb));
            sync();
            setTimeout(() => {
              setDark(false);
              voice.say(E.blackoutSwap(spoken(bride), spoken(nb)), true, undefined, false, () => world.look('stage', 6000));
            }, 1200);
          } else {
            setDark(false);
            voice.say(E.blackoutNoCouple(1 + Math.floor(Math.random() * 20)), true);
          }
        }, 2800);
      });
    } else if (kind === 'mom' && w) {
      world.visit('ev-mom', 'Mẹ Chồng', { age: 'old', body: 'aodaiF', main: '#5b3a29', hair: '#d9d9d9', longHair: false, hat: 'bun' }, 'poke', 7000, '🧽 Rửa bát đi con!');
      voice.say(E.mom(spoken(w.ids.bride)), true);
    } else if (kind === 'ex' && w) {
      world.visit('ev-ex', 'Người Yêu Cũ', { body: 'shirt', main: '#2b2b2b', hair: '#141010', longHair: Math.random() < 0.5, hat: 'none' }, 'cry', 7000, '😭 Sao anh nỡ cưới người ta!');
      voice.say(E.ex(spoken(w.ids.groom)), true);
    }
  };

  // ---------- Nguyệt Lão se duyên ----------
  const startDuyen = () => {
    if (weddingBusy() || showBusy() || s.queue.length) return;
    s.lastDuyen = Date.now();
    const until = Date.now() + GAME.duyen.windowMs;
    s.duyen = { ids: new Set(), until, said: 0, maker: null };
    setDuyen({ until, count: 0 });
    world.nguyetLao(true);
    world.fountains(3000);
    voice.say(pick(GAME.duyen.intro)!, true, undefined, false, () => world.look('stage', 6000));
    setTimeout(endDuyen, GAME.duyen.windowMs);
  };

  const endDuyen = () => {
    const d = s.duyen;
    if (!d) return;
    setDuyen(null);
    const busy = new Set([s.w?.ids.groom, s.w?.ids.bride, d.maker].filter(Boolean));
    const ids = [...d.ids].filter((id) => world.has(id) && !busy.has(id)).sort(() => Math.random() - 0.5);
    const close = () => {
      s.duyen = null;
      world.nguyetLao(false);
      world.matchmaker(null);
      setNguyen(null);
    };
    if (!ids.length) {
      voice.say(pick(GAME.duyen.none)!, false, close);
      return;
    }
    const n = pick(NGUYEN)!;
    voice.say(pick(GAME.duyen.before)!, false, undefined, true, () => world.look('stage', 8000));
    voice.say(`F: ${n.ten}. | F: ${n.loi}`, false, undefined, true, () => {
      setNguyen(n);
      world.petals(160);
      world.smokeBurst(12);
    });
    if (ids.length === 1) {
      voice.say(GAME.duyen.single(spoken(ids[0])), false, close, true, () => world.look(ids[0], 6000));
      return;
    }
    const [a, b] = ids;
    const pairLine = d.maker && world.has(d.maker) ? pick(GAME.pairBy)!(spoken(d.maker), spoken(a), spoken(b)) : pick(GAME.duyen.pair)!(spoken(a), spoken(b));
    voice.say(pairLine, false, close, true, () => {
      setNguyen(null);
      world.redThread(a, b, 40_000);
      world.cheerPair(a, b, 8000);
      world.fountains(5000);
      const pa = world.posOf(a);
      const pb = world.posOf(b);
      if (pa && pb) world.lookPoint(pa.add(pb).multiplyScalar(0.5), 9000);
      world.setTitle(a, { text: GAME.titleThread(cut(shown(b), 10)), gold: true });
      world.setTitle(b, { text: GAME.titleThread(cut(shown(a), 10)), gold: true });
    });
  };

  const nextInQueue = () => {
    if (weddingBusy() || showBusy()) return;
    const p = s.queue.shift();
    sync();
    if (p && world.has(p.id)) propose(p);
    else if (!s.queue.length && s.djPending) startDj(); // hết đám chờ mới tới lượt nhảy để dành
  };

  // ---------- PK cướp dâu / cướp rể ----------
  // Lúc chờ đồng ý: ai comment "cướp" (hoặc tặng từ 30 xu) là mở PK 30 giây.
  // Phe CÔNG: comment "cướp". Phe THỦ: comment "không". 1 comment = 1 điểm (mỗi người tối đa 1 điểm/giây cho công bằng
  // và đỡ nghẽn khi hàng nghìn comment), quà 1 xu = 10 điểm. Công thắng: người góp nhiều điểm nhất bên công thế chỗ.
  const isCouple = (w: Wedding, id: string) => w.ids.groom === id || w.ids.bride === id;

  const pkView = () => {
    const p = s.pk;
    if (!p) return setPk(null);
    setPk({ until: p.until, atk: p.atk, def: p.def, atkName: shown(p.challenger), defName: shown(p.w.ids[p.w.stealRole] ?? '') });
  };

  const startPk = (challenger: string) => {
    const w = s.w;
    if (!w || w.phase !== 'proposal' || w.pkDone || s.pk || isCouple(w, challenger) || !w.ids[w.stealRole]) return false;
    w.pkDone = true;
    const until = Date.now() + GAME.pk.ms;
    w.until += GAME.pk.ms; // dừng đồng hồ trả lời trong lúc PK
    s.pk = { w, until, atk: 0, def: 0, atkBy: new Map(), atkIds: new Set(), last: new Map(), challenger, dirty: true, saidMid: false };
    world.say(challenger, '⚔️ Tranh duyên!', 3000);
    sync(); // ẩn lời mời "gõ TRANH DUYÊN" (mỗi đám PK 1 lần)
    voice.say(pick(GAME.pk.start)!(spoken(challenger), spoken(w.ids[w.stealRole])), true, undefined, true, () => world.look('gate', GAME.pk.ms));
    pkView();
    return true;
  };

  const pkPoint = (id: string, side: 'atk' | 'def', pts: number) => {
    const p = s.pk;
    if (!p) return;
    if (side === 'atk') {
      p.atk += pts;
      p.atkBy.set(id, (p.atkBy.get(id) ?? 0) + pts);
      p.atkIds.add(id);
    } else p.def += pts;
    p.dirty = true;
  };

  /** comment trong lúc PK: true nếu đã tính điểm (không xử lý tiếp như comment thường) */
  const pkComment = (id: string, text: string) => {
    const p = s.pk;
    if (!p) return false;
    const t = plain(text);
    const atk = /(^| )(tranh duyen|cuop)( |$)/.test(t);
    const def = !atk && /(^| )(khong|ko|k|giu|thu)( |$)/.test(t);
    if (!atk && !def) return false;
    const now = Date.now();
    if (now - (p.last.get(id) ?? 0) < 1000) return true; // 1 điểm/giây/người
    p.last.set(id, now);
    // cô dâu chú rể chỉ được giữ, không tự cướp mình
    const side = atk && !isCouple(p.w, id) ? 'atk' : 'def';
    pkPoint(id, side, 1);
    if (p.last.size < 60 || Math.random() < 0.2) world.say(id, side === 'atk' ? '⚔️ Tranh duyên!' : '🛡️ Không!', 1500);
    return true;
  };

  const endPk = () => {
    const p = s.pk;
    if (!p) return;
    s.pk = null;
    setPk(null);
    const w = p.w;
    if (s.w !== w || w.phase !== 'proposal') return;
    const oldId = w.ids[w.stealRole]!;
    const winner =
      p.atk > p.def
        ? [...p.atkBy.entries()].filter(([x]) => world.has(x) && !isCouple(w, x)).sort((a, b) => b[1] - a[1])[0]?.[0]
        : undefined;
    if (winner) {
      w.ids[w.stealRole] = winner;
      world.steal(oldId, winner);
      world.setTitle(winner, { text: GAME.titles.stealer(w.stealRole), gold: true });
      world.setTitle(oldId, { text: GAME.titles.robbed, gold: false });
      world.fireworks(2);
      world.cannons(80);
      voice.say(GAME.pk.atkWin(spoken(winner), spoken(oldId), p.atk, p.def), true, undefined, true);
      sync();
      // người được hỏi đã có mặt: thắng PK là lên lễ đường luôn
      if (w.ids[other(w.stealRole)]) {
        voice.say(GAME.stealAccept, true);
        setTimeout(accept, 3500);
      }
      return;
    }
    world.setTitle(oldId, { text: GAME.titles.kept, gold: true });
    world.heartsAt(oldId, 30);
    voice.say(GAME.pk.defWin(spoken(oldId), p.atk, p.def), true, undefined, true);
    if (w.yesAfterPk) setTimeout(accept, 2500);
  };

  // ---------- Quà chúc phúc: ai tặng cao nhất trong đám được lên làm ba / mẹ cô dâu, chú rể ----------
  // s.parents = [phụ huynh nhà trai, phụ huynh nhà gái]; người tặng nhiều nhất làm bên nhà gái, nhì làm bên nhà trai
  const parentLabel = (id: string, side: 0 | 1) => `${world.isFem(id) ? 'Mẹ' : 'Ba'} ${side ? 'cô dâu' : 'chú rể'}`;

  const resetParents = () => {
    for (const id of s.parents) if (id) world.setTitle(id, null);
    s.parents = [null, null];
    s.bless.clear();
    setParents(null);
  };

  const bless = (id: string, coins: number) => {
    const w = s.w;
    if (!w || w.phase === 'after' || isCouple(w, id)) return;
    s.bless.set(id, (s.bless.get(id) ?? 0) + coins);
    const top = [...s.bless.entries()].filter(([x]) => world.has(x) && !isCouple(w, x)).sort((a, b) => b[1] - a[1]);
    const next: [string | null, string | null] = [top[1]?.[0] ?? null, top[0]?.[0] ?? null];
    ([1, 0] as const).forEach((side) => {
      const nid = next[side];
      if (nid === s.parents[side]) return;
      const old = s.parents[side];
      if (old && !next.includes(old)) world.setTitle(old, null);
      if (nid) {
        world.setTitle(nid, { text: `👪 ${parentLabel(nid, side)}`, gold: true });
        voice.sayMinor(GAME.parentsTake(spoken(nid), parentLabel(nid, side).toLowerCase()));
      }
    });
    s.parents = next;
    setParents({
      groom: next[0] ? `${parentLabel(next[0], 0)}: ${cut(shown(next[0]), 12)}` : '',
      bride: next[1] ? `${parentLabel(next[1], 1)}: ${cut(shown(next[1]), 12)}` : '',
    });
  };

  useEffect(() => {
    music.start();
    voice.onSpeaker = (who) => world.setSpeaker(who);
    world.events = {
      coupleOnStage: runVows,
      // chủ kênh bỏ chuyện đánh nhau: MC không bình luận (bàn tiệc cũng không còn đấm nhau, chỉ chọc cười)
      fight: () => {},
    };
    return () => {
      world.events = {};
      voice.onSpeaker = undefined;
    };
  }, []);

  useLiveEvents({
    onStatus: setStatus,
    onSpeaker: (d) => setStageCount(d.count),

    onChat: (e) => {
      const id = e.username;
      s.lastActivity = Date.now();
      const isNew = !world.has(id);
      meet(id, e.nickname, e.avatar);
      if (isNew) setGuestCount(world.count);
      const w = s.w;

      // người được @ vừa vào tiệc: ra cổng hoa
      if (w?.phase === 'proposal' && !w.ids[other(w.stealRole)] && w.ids[w.stealRole] !== id && matchName(w.targetName, shown(id), id)) {
        w.ids[other(w.stealRole)] = id;
        world.targetCome(id, other(w.stealRole));
        voice.say(GAME.targetArrived(spoken(id)), true, undefined, false, () => world.look(id, 4000));
        sync();
      }

      // đang bình chọn đẹp đôi: "1"/"hợp" hoặc "2"/"không hợp", mỗi người 1 phiếu
      if (s.vote && !s.vote.voted.has(id)) {
        const t = plain(e.comment).trim();
        const yes = t === '1' || t === 'hop' || t === 'hop qua';
        const no = t === '2' || t === 'khong hop';
        if (yes || no) {
          s.vote.voted.add(id);
          if (yes) s.vote.yes++;
          else s.vote.no++;
          setVote({ until: s.vote.until, yes: s.vote.yes, no: s.vote.no });
          world.say(id, yes ? '💘 Hợp!' : '💔 Không hợp', 2500);
          return;
        }
      }
      // PK tranh duyên: đang PK thì "tranh duyên"/"không" là điểm; đang chờ đồng ý mà có người comment "tranh duyên" thì mở PK
      if (s.pk && pkComment(id, e.comment)) return;
      if (w?.phase === 'proposal' && !w.pkDone && /(^| )(tranh duyen|cuop)( |$)/.test(plain(e.comment)) && startPk(id)) {
        s.pk!.last.set(id, Date.now());
        return pkPoint(id, 'atk', 1);
      }
      const cmd = parseCommand(e.comment);
      if (cmd?.type === 'propose') {
        if (w && (w.ids.groom === id || w.ids.bride === id) && w.phase !== 'after') return;
        world.say(id, `💍 Cưới ${cut(cmd.target, 16)}!`, 4000);
        return propose({ id, role: cmd.role, target: cmd.target });
      }
      const isTarget = w?.phase === 'proposal' && w.ids[other(w.stealRole)] === id;
      if (cmd?.type === 'yes' && isTarget) {
        world.say(id, '💖 Đồng ý!', 4000);
        return accept();
      }
      // người được hỏi không trả lời / không có mặt: MC mở cho cả sảnh, ai gõ đồng ý trước là được cưới
      if (cmd?.type === 'yes' && w?.phase === 'proposal' && w.open && w.ids.groom !== id && w.ids.bride !== id) {
        const role = other(w.stealRole);
        const old = w.ids[role];
        w.ids[role] = id;
        w.open = false;
        if (old) world.steal(old, id);
        else world.targetCome(id, role);
        world.say(id, '💖 Đồng ý!', 4000);
        voice.say(GAME.openTaken(spoken(id), spoken(w.ids[w.stealRole])), true);
        sync();
        setTimeout(() => s.w === w && accept(), 3000);
        return;
      }
      if (cmd?.type === 'no' && isTarget) {
        world.say(id, '🙅 Không!', 4000);
        return endProposal('no');
      }
      // chủ kênh bỏ lệnh ĐẤM / TRÊU @tên và ZÔ: gõ mấy chữ đó chỉ hiện bong bóng như comment thường
      if (cmd?.type === 'dance') {
        const now = Date.now();
        s.danceCalls = [...s.danceCalls.filter((t) => now - t < 30_000), now];
        if (s.danceCalls.length >= 5 && !world.djOn) {
          s.danceCalls = [];
          startDj();
          return;
        }
        world.joinDance(id);
        world.say(id, '💃 Quẩy!', 2500);
        // camera lần lượt quay cận người gõ quẩy, mỗi người 5 giây (lúc nhạc DJ, hoặc lúc rảnh không có đám / tiết mục)
        if (danceCamOk() && !s.danceCam.includes(id) && s.danceCam.length < 30) s.danceCam.push(id);
        if (!inCeremony() && s.actLimit('dance')) voice.sayMinor(pick(GAME.danceJoin)!(spoken(id)));
        return;
      }
      if (cmd?.type === 'duyen') {
        const d = s.duyen;
        if (!d || Date.now() > d.until) return void world.say(id, maskBanned(e.comment));
        if (d.ids.has(id)) return;
        d.ids.add(id);
        world.say(id, pick(GAME.duyen.bubble)!, 4000);
        world.heartsAt(id, 12);
        setDuyen({ until: d.until, count: d.ids.size });
        const marks = [3, 6, 10, 20];
        if (marks.includes(d.ids.size) && d.said < marks.length) {
          d.said++;
          voice.say(pick(GAME.duyen.count)!(d.ids.size));
        }
        return;
      }
      // comment thường: bong bóng trên đầu (đã che từ bậy). Không đọc nguyên văn.
      world.say(id, maskBanned(e.comment));
    },

    onGift: (e) => {
      const id = e.username;
      s.lastActivity = Date.now();
      const name = meet(id, e.nickname, e.avatar);
      const coins = e.diamondCount * e.repeatCount;
      setLastGift({ ...e, nickname: name, coins });
      const w = s.w;
      if (w?.phase === 'proposal') {
        // người được hỏi tặng quà = đồng ý luôn; người được @ chưa vào tiệc mà giờ tặng quà = ra cổng hoa rồi đồng ý
        if (w.ids[other(w.stealRole)] === id) accept();
        else if (!w.ids[other(w.stealRole)] && !isCouple(w, id) && matchName(w.targetName, shown(id), id)) {
          w.ids[other(w.stealRole)] = id;
          world.targetCome(id, other(w.stealRole));
          setTimeout(accept, 2500);
        }
      }
      // quà trong PK: 1 xu = 10 điểm, tính cho phe người tặng đã chọn (chưa chọn thì tính phe giữ = chúc phúc)
      let pkAtk = false;
      if (s.pk) {
        pkAtk = (s.pk.atkIds.has(id) || s.pk.challenger === id) && !isCouple(s.pk.w, id);
        pkPoint(id, pkAtk ? 'atk' : 'def', coins * GAME.pk.giftMul);
      } else if (w?.phase === 'proposal' && coins >= GAME.stealMin && !isCouple(w, id) && startPk(id)) {
        // tặng từ 30 xu lúc chờ đồng ý: mở PK, quà tính luôn cho phe cướp
        pkPoint(id, 'atk', coins * GAME.pk.giftMul);
        pkAtk = true;
      }
      if (!pkAtk) bless(id, coins);
      // bảng Top đại gia mừng cưới (góc dưới phải): 7 người tặng nhiều xu nhất cả buổi
      const prev = s.giftTotal.get(id);
      s.giftTotal.set(id, { name, coins: (prev?.coins ?? 0) + coins });
      saveTop(s.giftTotal);
      setTop(topRows(s.giftTotal));
      if (s.duyen && !s.duyen.maker && Date.now() < s.duyen.until && world.has(id)) {
        s.duyen.maker = id;
        world.matchmaker(id);
        voice.say(pick(GAME.matchmaker)!(speakableName(name)), true);
      }

      const tier = GAME.giftTiers.find((t) => coins >= t.min) ?? GAME.giftTiers[GAME.giftTiers.length - 1];
      // quà nào cũng bay từ người tặng lên sân khấu; quà to thêm pháo sáng + khói
      world.giftTrail(id, coins >= 99 ? 120 : coins >= 10 ? 70 : 40);
      if (coins >= 10) world.fountains(coins >= 99 ? 8000 : 4000);
      if (coins >= 10) world.roseRain(coins >= 99 ? 260 : 120);
      if (coins >= 99) world.balloonsUp(coins >= 299 ? 36 : 18);
      if (coins >= 299) startDj();
      if (coins >= 30) {
        world.dance(coins >= 99 ? 10000 : 6000);
        if (s.crewLimit('all')) voice.sayMinor(pick(GAME.danceCrew)!);
      }
      if (coins >= 30) world.smokeBurst(coins >= 299 ? 30 : 14, coins >= 299 ? 'hall' : 'stage');
      for (const fx of tier.fx) {
        if (fx === 'hearts') world.heartsAt(id, coins >= 30 ? 40 : 16);
        if (fx === 'confetti') world.confetti(coins >= 99 ? 260 : 140);
        if (fx === 'petals') world.petals(180);
        if (fx === 'fireworks') world.fireworks(coins >= 999 ? 10 : 4);
        if (fx === 'gold') world.goldRain(coins >= 999 ? 500 : 300);
        if (fx === 'party') world.partyAll(coins >= 999 ? 15000 : 9000);
      }
      // quà to (từ 99 xu) cảm ơn ngay; quà nhỏ xếp sau câu chính, không chen ngang cảnh đang diễn
      if (s.gifts.shouldThank(id, coins, voice.waitingPriority)) {
        if (coins >= 99) voice.say(pick(tier.lines)!(speakableName(name)), true);
        else voice.sayMinor(pick(tier.lines)!(speakableName(name)));
      }
    },

    onMember: (e) => {
      const name = safeName(e.nickname, e.username);
      const n = speakableName(name);
      if (n !== 'bạn') s.greeter.add(e.username, n);
      // người lướt qua: cho vào ngồi ăn cỗ luôn (người comment vẫn được ưu tiên ghế)
      if (!world.has(e.username)) {
        names.current.set(e.username, name);
        if (e.avatar) avatars.current.set(e.username, e.avatar);
        world.ensure(e.username, name, e.avatar, true);
        setTimeout(() => {
          if (!world.has(e.username)) return;
          world.say(e.username, pick(GAME.passerEmoji)!, 3000);
          if (n !== 'bạn' && !inCeremony() && s.passerLimit('all') && voice.waiting < 4)
            voice.sayMinor(pick(GAME.passer)!(n));
        }, 7000);
      }
    },

    onFollow: (e) => {
      if (s.follows.first(e.username) && !inCeremony()) voice.sayMinor(GAME.thankFollow(speakableName(safeName(e.nickname, e.username))));
    },

    onLike: (e) => {
      // mốc tim theo vòng: 100 pháo giấy, 300 cả sảnh quẩy, 1000 xe hoa; qua 1000 thì bắt đầu vòng mới
      if (s.likeCycle === null) s.likeCycle = e.totalLikes - e.likeCount;
      const M = GAME.likeMilestones;
      let inCycle = e.totalLikes - s.likeCycle;
      while (inCycle >= M[s.likeStep]) {
        const mark = M[s.likeStep];
        if (mark === 100) {
          world.cannons();
          world.heartsRain(80);
          voice.sayMinor(GAME.likes100);
        } else if (mark === 300) {
          world.heartsRain(120);
          world.roseRain(200);
          voice.say(GAME.boostLine, true);
          startDj();
        } else {
          world.weddingCar();
          world.fireworks(8);
          world.partyAll(12000);
          voice.say(GAME.likes1000, true);
        }
        s.likeStep++;
        if (s.likeStep >= M.length) {
          s.likeStep = 0;
          s.likeCycle += M[M.length - 1];
          inCycle = e.totalLikes - s.likeCycle;
        }
      }
      setLikeProgress(Math.max(0, inCycle));
      setLikeNext(M[s.likeStep]);
    },

    onControl: (c) => {
      if (c.action === 'setName' && c.text) setChannelName(c.text);
      if (c.action === 'custom' && c.text === 'clearStage') {
        world.clearStage();
        world.setNames('', '');
        s.w = null;
        s.queue = [];
        sync();
      }
      if (c.action === 'custom' && c.text === 'party') world.partyAll(10000);
      if (c.action === 'custom' && c.text === 'duyen') startDuyen();
      if (c.action === 'custom' && c.text === 'event') runEvent();
      if (c.action === 'custom' && c.text === 'car') world.weddingCar();
      if (c.action === 'custom' && c.text === 'dj') startDj();
      if (c.action === 'custom' && c.text === 'song') startSong();
      if (c.action === 'custom' && c.text === 'hire') s.lastHire = 0;
      if (c.action === 'custom' && c.text === 'roses') world.roseRain(300);
      if (!IS_STAGE) return; // chỉ trang stage làm theo lệnh có tiếng, tránh 2 giọng
      if (c.action === 'speak' && c.text) voice.say(c.text, true);
      if (c.action === 'custom' && (c.text === 'music:on' || c.text === 'music:off')) music.set(c.text === 'music:on');
      if (c.action === 'custom' && c.text?.startsWith('musicVol:')) music.setLevel(Number(c.text.slice(9)) / 100);
      if (c.action === 'setRate' && c.text) {
        voice.rate = Math.min(1.5, Math.max(0.5, Number(c.text) || 1.25));
        try {
          localStorage.setItem('voice-rate', String(voice.rate));
        } catch {
          // bỏ qua
        }
      }
      if (c.action === 'reset') {
        voice.stop();
        s.greeter.reset();
        s.gifts.reset();
        s.follows.reset();
        s.recent.reset();
        s.w = null;
        s.queue = [];
        world.reset();
        setGuestCount(0);
        sync();
      }
    },
  });

  // MC rảnh là nói: hướng dẫn, mai mối, kể số cặp đã cưới
  const chatterLine = (): string | null => {
    const C = GAME.chatter;
    const w = s.w;
    const quiet = Date.now() - s.lastActivity > 30_000;
    const castHere = GAME.cast.filter((_, i) => world.has(`cast-${i}`)).map((c) => c.name).sort(() => Math.random() - 0.5);
    // [loại, trọng số, câu]; không lặp cùng loại hai lần liền. Chủ yếu nói về tình yêu đôi lứa, cô dâu chú rể, se duyên
    // (bỏ kiểu tấu hài hai MC; phòng vắng thì thêm lời chúc hai họ)
    const opts: [string, number, () => string | null][] = [
      ['love', 5, () => pick(C.love) ?? null],
      // chỉ trong 4 phút sau đám cưới
      ['recentCouple', 2, () => (w?.phase === 'after' && Date.now() - s.lastWeddingAt < 4 * 60_000 ? pick(C.recentCouple)!(spoken(w.ids.groom), spoken(w.ids.bride)) : null)],
      ['married', 1, () => (s.married ? pick(C.married)!(s.married) : null)],
      ['duyenTalk', 2, () => pick(C.duyenTalk) ?? null],
      ['praise', quiet ? 3 : 1, () => pick(C.praise) ?? null],
      ['custom', 2, () => pick(C.custom) ?? null],
      ['howTo', 1, () => pick(C.howTo) ?? null],
      ['questions', 1, () => pick(C.questions) ?? null],
      ['castSkit', 1, () => (castHere.length >= 2 ? pick(C.castSkit)!(castHere[0], castHere[1]) : null)],
      ['crowd', 1, () => (world.count >= 3 && !s.married ? pick(C.crowd)!(world.count) : null)],
    ];
    const total = opts.reduce((n, o) => n + o[1], 0);
    for (let i = 0; i < 8; i++) {
      let r = Math.random() * total;
      const o = opts.find((x) => (r -= x[1]) < 0) ?? opts[0];
      if (o[0] === s.lastChatter) continue;
      const line = o[2]();
      if (line) {
        s.lastChatter = o[0];
        return line;
      }
    }
    return null;
  };

  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = [];
    timers.push(setInterval(() => setGuestCount(world.count), 2000));
    timers.push(setInterval(() => setBusy(weddingBusy() || showBusy()), 500));
    // hạn trả lời + nhắc
    timers.push(
      setInterval(() => {
        const w = s.w;
        if (!w || w.phase !== 'proposal') return;
        const left = Math.ceil((w.until - Date.now()) / 1000);
        if (left <= 0) return endProposal('timeout');
        const b = w.ids[other(w.stealRole)] ? spoken(w.ids[other(w.stealRole)]) : speakableName(w.targetName);
        // người được hỏi vắng mặt (sau 10 giây) hoặc im lặng (sau 25 giây): mở cho cả sảnh, ai gõ đồng ý trước là cưới
        const waited = GAME.answerMs / 1000 - left;
        if (!w.open && waited >= (w.ids[other(w.stealRole)] ? 25 : 10)) {
          w.open = true;
          voice.say(GAME.openCall(spoken(w.ids[w.stealRole]), b), true, undefined, false, undefined, () => s.w === w && w.phase === 'proposal' && !!w.open);
        }
        if ((left <= 35 && w.nudged === 0) || (left <= 15 && w.nudged === 1)) {
          w.nudged++;
          if (s.nudgeLimit('all')) voice.say(pick(GAME.nudge)!(b, left), true, undefined, false, undefined, () => s.w === w && w.phase === 'proposal');
        }
      }, 1000),
    );
    // Người gõ quẩy: camera lần lượt quay cận từng người, mỗi người 5 giây.
    // Hết nhạc DJ (hoặc bắt đầu có đám / tiết mục khác) thì bỏ hàng chờ, không quay tiếp.
    timers.push(
      setInterval(() => {
        if (!danceCamOk()) {
          s.danceCam = [];
          return;
        }
        if (Date.now() < s.danceCamUntil) return;
        while (s.danceCam.length) {
          const id = s.danceCam.shift()!;
          if (world.spotlightDancer(id, 5000)) {
            s.danceCamUntil = Date.now() + 5000;
            break;
          }
        }
      }, 300),
    );
    // PK: vẽ lại bảng điểm tối đa ~3 lần/giây (không vẽ theo từng comment, để chịu được hàng nghìn comment), hết giờ thì chốt
    timers.push(
      setInterval(() => {
        const p = s.pk;
        if (!p) return;
        const left = p.until - Date.now();
        if (left <= 0) return endPk();
        if (!p.saidMid && left < GAME.pk.ms / 2) {
          p.saidMid = true;
          voice.say(GAME.pk.mid(p.atk, p.def), true);
        }
        if (p.dirty) {
          p.dirty = false;
          pkView();
        }
      }, 350),
    );
    // Giai đoạn trước xong hẳn (nhảy, hát, Nguyệt Lão, bình chọn) mới cho đám đang chờ lên; hết đám mới tới nhảy để dành
    timers.push(
      setInterval(() => {
        if (weddingBusy() || showBusy() || Date.now() - s.lastWeddingAt < 4000 || voice.waiting > 1) return;
        if (s.queue.length || s.djPending) nextInQueue();
      }, 2000),
    );
    // Dàn khách quen vào tiệc (nhân vật của chương trình, không phải người xem)
    GAME.cast.forEach(({ name, fem }, i) =>
      setTimeout(() => {
        names.current.set(`cast-${i}`, name);
        world.ensure(`cast-${i}`, name, '', false, fem);
      }, 1500 + i * 900),
    );
    // Phòng vắng: dàn khách quen tự cầu hôn nhau, đồng ý / từ chối ngẫu nhiên như thật
    timers.push(
      setInterval(() => {
        const now = Date.now();
        if (weddingBusy() || showBusy() || s.queue.length || now - s.lastActivity < GAME.autoAfterMs || now - s.lastAuto < GAME.autoEveryMs || voice.waiting > 0) return;
        const cast = GAME.cast.map((_, i) => `cast-${i}`).filter((id) => world.has(id)).sort(() => Math.random() - 0.5);
        if (cast.length < 2) return;
        s.lastAuto = now;
        const fem = (id: string) => GAME.cast[Number(id.slice(5))]?.fem ?? false;
        const a = cast[0];
        // ưu tiên ghép 1 nam 1 nữ, vai theo giới tính người hỏi
        const b = cast.slice(1).find((x) => fem(x) !== fem(a)) ?? cast[1];
        world.say(a, '💍 Cưới em nhé!', 4000);
        propose({ id: a, role: fem(a) ? 'bride' : 'groom', target: shown(b) });
        voice.say(pick(GAME.autoHook)!(spoken(a), spoken(b)), false, undefined, false, undefined, () => s.w?.phase === 'proposal' && s.w.ids[other(s.w.stealRole)] === b && Object.values(s.w.ids).includes(a));
        setTimeout(() => {
          const w = s.w;
          if (w?.phase !== 'proposal' || w.ids[other(w.stealRole)] !== b) return;
          if (Math.random() < 0.7) {
            world.say(b, '💖 Đồng ý!', 4000);
            accept();
          } else {
            world.say(b, '🙅 Thôi khỏi!', 4000);
            endProposal('no');
          }
        }, 10_000 + Math.random() * 12_000);
      }, 4000),
    );
    // Tuyển ngẫu nhiên 1 người xem (không phải dàn khách quen) làm nhân viên bưng mâm hoặc vũ công
    timers.push(
      setInterval(() => {
        if (Date.now() - s.lastHire < GAME.hireEveryMs || voice.waiting > 2 || inCeremony()) return;
        const busy = new Set([s.w?.ids.groom, s.w?.ids.bride]);
        const pool = world.ids().filter((id) => !id.startsWith('cast-') && !id.startsWith('ev-') && !busy.has(id));
        if (!pool.length) return;
        const id = pool[Math.floor(Math.random() * pool.length)];
        const kind = Math.random() < 0.5 ? 'waiter' : 'dancer';
        if (!world.hire(id, kind, GAME.hireMs)) return;
        s.lastHire = Date.now();
        voice.sayMinor(pick(kind === 'waiter' ? GAME.hireWaiter : GAME.hireDancer)!(spoken(id)));
      }, 5000),
    );
    // Quẩy DJ định kỳ lúc không có đám
    timers.push(
      setInterval(() => {
        const ph = s.w?.phase;
        if (Date.now() - s.lastDj < GAME.djEveryMs || (ph && ph !== 'after') || s.duyen || s.vote || world.djOn) return;
        startDj();
      }, 5000),
    );
    // Sự kiện bất ngờ mỗi 3–5 phút (không chen vào lúc cầu hôn / đi thảm đỏ / làm lễ / se duyên / bình chọn)
    timers.push(
      setInterval(() => {
        const ph = s.w?.phase;
        if (Date.now() < s.nextEventAt || (ph && ph !== 'after') || s.duyen || s.vote || voice.waiting > 1) return;
        const [lo, hi] = GAME.eventEveryMs;
        s.nextEventAt = Date.now() + lo + Math.random() * (hi - lo);
        runEvent();
      }, 5000),
    );
    // Nguyệt Lão định kỳ xuống se duyên lúc không có đám
    timers.push(
      setInterval(() => {
        const ph = s.w?.phase;
        if (s.duyen || (ph && ph !== 'after') || Date.now() - s.lastDuyen < GAME.duyen.everyMs || world.count < 2) return;
        startDuyen();
      }, 5000),
    );
    // Mai mối: thỉnh thoảng zoom vào 1 bàn, MC gọi 2 bạn lên cưới
    timers.push(
      setInterval(() => {
        const ph = s.w?.phase;
        if (s.duyen || world.djOn || world.singing || (ph && ph !== 'after') || Date.now() - s.lastPair < GAME.pairEveryMs || voice.waiting > 1) return;
        const p = world.pickPair();
        if (!p) return;
        s.lastPair = Date.now() + Math.random() * 20_000; // lệch nhịp cho tự nhiên
        const a = spoken(p.a);
        const b = spoken(p.b);
        voice.say(pick(GAME.pair)!(a, b), false, undefined, false, () => {
          world.lookPoint(p.at, 11_000);
          world.cheerPair(p.a, p.b, 9000);
          world.say(p.a, '😳 Hả? Tui hả?', 5000);
          world.say(p.b, pick(GAME.pairBubble)!, 5000);
        });
        // 15 giây chưa ai gõ cưới thì MC ép tiếp
        setTimeout(() => {
          if (!s.w && world.has(p.a) && world.has(p.b)) voice.say(pick(GAME.pairPush)!(a, b), false, undefined, false, () => world.lookPoint(p.at, 6000));
        }, 15_000);
      }, 3000),
    );
    if (IS_STAGE) {
      timers.push(
        setInterval(() => {
          if (inCeremony()) return;
          const n = s.recent.latest(3, GAME.shareReminderEveryMs);
          voice.sayMinor(n.length ? GAME.shareWithNames(joinNames(n)) : pick(GAME.shareLines)!);
        }, GAME.shareReminderEveryMs),
      );
      timers.push(
        setInterval(() => {
          const ph = s.w?.phase;
          if (ph === 'vows' || ph === 'walk' || world.djOn || voice.quietForMs() < s.chatterGap) return;
          const line = chatterLine();
          if (line) voice.say(line);
          // nghỉ giữa các câu như người thật: 5–9 giây, phòng vắng thì 8–14 giây (đỡ nói dồn, đỡ nghe lặp)
          s.chatterGap = Date.now() - s.lastActivity > 30_000 ? 8000 + Math.random() * 6000 : 5000 + Math.random() * 4000;
        }, 2000),
      );
    }
    return () => timers.forEach(clearInterval);
  }, []);

  useEffect(() => {
    if (!lastGift) return;
    const t = setTimeout(() => setLastGift(null), 5000);
    return () => clearTimeout(t);
  }, [lastGift]);

  return { status, channelName, lastGift, likeProgress, likeNext, guestCount, view, queueLen, married, duyen, nguyen, stageCount, vote, dark, pk, parents, top, busy };
}

export type GameState = ReturnType<typeof useGame>;

const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

function joinNames(list: string[]) {
  const sp = list.map((n) => (n === 'bạn' ? n : `bạn ${n}`));
  return sp.length > 1 ? `${sp.slice(0, -1).join(', ')} và ${sp[sp.length - 1]}` : sp[0] ?? '';
}
