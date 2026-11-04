import http from 'node:http';
import {SQUAD_SIZE} from './lineup-flow.mjs';
import {readFile} from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const root = dirname(fileURLToPath(import.meta.url));
// Resolved through the package so it works standalone and inside StudioLive, where dependencies are hoisted to the app root.
const threeModule = (() => { try { return fileURLToPath(import.meta.resolve('three')); } catch { return join(root,'node_modules/three/build/three.module.js'); } })();
const bounds = { minPlayers:[2,100], heartStartPlayers:[2,100], autoStart:[0,1], autoJoinLimit:[0,1000], botsEnabled:[0,1], audioVolume:[0,100], audioMuted:[0,1], inactivitySeconds:[1,86400], idleSeconds:[10,86400], lobbySeconds:[1,3600], countdownSeconds:[1,300], pullSeconds:[1,3600], resultSeconds:[1,3600], transitionSeconds:[1,3600], overtimeSeconds:[1,300], pvpThreshold:[1,1000], giftMultiplier:[1,10000], likesPerSecond:[1,10000], earlyWinPercent:[51,100] };
export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Invalid config');
  for (const [k,v] of Object.entries(config)) if (!Object.hasOwn(bounds,k) || !Number.isInteger(v) || v < bounds[k][0] || v > bounds[k][1]) throw Error(`Invalid config: ${k}`);
  return { ...config };
}
const atomicWrite = (file, value) => { const tmp = `${file}.tmp`; writeFileSync(tmp, JSON.stringify(value,null,2)+'\n', { mode: 0o600 }); renameSync(tmp,file); };
const readJSON = (path, fallback) => { try { return JSON.parse(readFileSync(path,'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };
const files = { '/character-hair.mjs':'character-hair.mjs', '/stand-crowd.mjs':'stand-crowd.mjs', '/presentation.mjs':'presentation.mjs', '/crowd-ui.js':'crowd-ui.js', '/crowd-audio.js':'crowd-audio.js', '/assets/stadium-crowd-03.wav':'assets/stadium-crowd-03.wav', '/three.module.js':threeModule,'/stage3d.js':'stage3d.js', '/stage3d-grip.mjs':'stage3d-grip.mjs', '/stage-character-poses.mjs':'stage-character-poses.mjs', '/':'control.html', '/control.html':'control.html', '/overlay.html':'overlay.html', '/control.css':'control.css', '/overlay.css':'overlay.css', '/control.js':'control.js', '/overlay.js':'overlay.js', '/assets/face-happy.png':'assets/face-happy.png', '/assets/face-pull.png':'assets/face-pull.png', '/assets/face-victory.png':'assets/face-victory.png', '/assets/face-cry.png':'assets/face-cry.png' };
files['/assets/crowd-faces/atlas.png']='assets/crowd-faces/atlas.png';
files['/assets/crowd-faces/pull-atlas.png']='assets/crowd-faces/pull-atlas.png';
files['/street-outfits.mjs']='street-outfits.mjs';
files['/articulated-limbs.mjs']='articulated-limbs.mjs';
files['/rope-handoff.mjs']='rope-handoff.mjs';
files['/lineup-flow.mjs']='lineup-flow.mjs';
files['/rigid-parts.mjs']='rigid-parts.mjs';
files['/pull-drama.mjs']='pull-drama.mjs';
files['/tug-rope.mjs']='tug-rope.mjs';
for(const clip of ['02','04','05','09'])files[`/assets/stadium-crowd-${clip}.mp3`]=`assets/stadium-crowd-${clip}.mp3`;
files['/lobby-music.js']='lobby-music.js';
for(const clip of ['count-1','count-2','count-3','start-whistle','ko','lobby-music'])files[`/assets/${clip}.mp3`]=`assets/${clip}.mp3`;
// Completed gifts that represent a real donation. Rejected/duplicate/unidentifiable
// gifts never highlight anyone; scoring is decided by the engine, not here.
const DONOR_OUTCOMES = new Set(['credited','pending','cross-round','unobserved-start']);
const mime = { html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8', mjs:'text/javascript; charset=utf-8', png:'image/png', wav:'audio/wav', mp3:'audio/mpeg' };

// v2.5.0 uses raw v3 protobuf fields; legacy/extended fields are fallbacks.
export function normalizeLiveGift(d) {
  const type = d.gift?.type ?? d.giftDetails?.giftType ?? d.extendedGiftInfo?.type;
  return {
    live:true, uniqueId:d.user?.uniqueId || d.user?.displayId, nickname:d.user?.nickname,
    avatar:d.user?.avatarThumb?.urlList?.[0] || d.user?.avatarLarge?.urlList?.[0] || '',
    giftId:d.giftId, groupId:d.groupId, msgId:d.common?.msgId ?? d.msgId,
    diamondCount:Number(d.gift?.diamondCount ?? d.giftDetails?.diamondCount ?? d.extendedGiftInfo?.diamondCount ?? 0),
    ...(typeof d.giftDetails?.giftName === 'string' && d.giftDetails.giftName.trim() ? {giftName:d.giftDetails.giftName} : {}),
    ...(Number.isSafeInteger(d.repeatCount) && d.repeatCount > 0 ? {giftCount:d.repeatCount} : {}),
    repeatCount:Number(d.repeatCount ?? 1), repeatEnd:d.repeatEnd === true || d.repeatEnd === 1,
    streakable:type == null ? null : type === 1
  };
}

export const isPositionComment = text => typeof text === 'string' && text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') === 'vi tri';
const commentText=(value,max=180)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim()).slice(0,max).join(''):'';
export function commentNotice(state,event,simulated=false){
  if(state?.paused||typeof event?.uniqueId!=='string'||!event.uniqueId||event.uniqueId.length>128)return null;
  const text=commentText(event.comment),player=state?.players?.find(p=>p.uniqueId===event.uniqueId);
  if(!text||!player||player.bot||player.isBot||!['red','blue'].includes(player.team))return null;
  return {type:'comment',uniqueId:event.uniqueId,nickname:commentText(player.nickname||event.nickname,40)||'Người chơi',text,team:player.team,...(simulated?{simulated:true}:{})};
}
const positionName = value => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,80) : '') || 'Người xem';
export function positionNotice(state, event, simulated = false) {
  const players = Array.isArray(state.players) ? state.players : [];
  const player = players.find(p => p.uniqueId === event.uniqueId);
  const base = {type:'position',nickname:positionName(player?.nickname || event.nickname)};
  if (simulated) base.simulated = true;
  if (!player || !['red','blue'].includes(player.team)) return {...base,area:'unjoined'};
  const lineup = players.filter(p => p.team === player.team).concat(Array.isArray(state.bots) ? state.bots.filter(b=>b.team===player.team) : []).sort((a,b)=>(Number(a.lineupRank)||Infinity)-(Number(b.lineupRank)||Infinity));
  const index = lineup.indexOf(player);
  return {...base,team:player.team,area:index < SQUAD_SIZE ? 'active' : 'waiting',position:index < SQUAD_SIZE ? index+1 : index-SQUAD_SIZE+1,...(state.upNext?.[player.team]?.includes(player.uniqueId)?{preparing:true}:index >= SQUAD_SIZE+30 ? {offscreen:true} : {})};
}

// Bound application queues in bytes, including the message about to be sent.
// Terminating a slow client releases its queue; healthy clients keep receiving.
export function sendBounded(ws, data, maxBytes = 1024 * 1024) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount + Buffer.byteLength(data) > maxBytes) { ws.terminate(); return false; }
  try { ws.send(data); return true; } catch { ws.terminate(); return false; }
}

/*
 * bridge (StudioLive): the host app owns the single TikTok connection. Instead of a Connector,
 * LIVE events already normalised by StudioLive arrive through ingest() and connection changes through liveStatus().
 */
export async function createApp({ port = 3000, Engine, Connector, dataDir = root, staticDir = root, retryMs = 5000, bridge = null } = {}) {
  let RoomIdRouteConfig = null;
  if (!bridge && !Connector) ({ TikTokLiveConnection: Connector, RoomIdRouteConfig } = await import('tiktok-live-connector'));
  if (!Engine) ({ GameEngine: Engine } = await import('./engine.mjs'));
  const configPath = join(dataDir,'config.json'), statsPath = join(dataDir,'stats.json'), historyPath = join(dataDir,'match-history.jsonl'), livePath = join(dataDir,'live.json');
  let config = validateConfig(readJSON(configPath, readJSON(join(root,'config.json'),{})));
  let stats = readJSON(statsPath,{ matches:0, wins:{red:0,blue:0,draw:0}, mvp:{} });
  let live = {status:'disconnected',username:''}, connector, retry, generation = 0, closed = false, simulated = false, liveUsername = '';
  const wss = new WebSocketServer({ noServer:true, maxPayload:16384 });
  const broadcast = obj => { const data = JSON.stringify(obj); for (const ws of wss.clients) sendBounded(ws,data); };
  const log = message => broadcast({type:'log',message:String(message)});
  const safeName = value => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,80) : '') || 'Người xem';
  let lastEventLog = 0, lastGiftWarning = 0;
  function activity(message) { const now=Date.now(); if(now-lastEventLog>=1000) { lastEventLog=now; log(message); } }
  const giftSeen = new Set();
  function notifyGift(event, outcome, identity = null, isSimulation = false) {
    if (!DONOR_OUTCOMES.has(outcome) || outcome === 'unobserved-start') return;
    if (identity !== null) {
      if (giftSeen.has(identity) || giftSeen.size >= 10000) return;
      giftSeen.add(identity);
    }
    const state=engine.snapshot(), player=state.players?.find(p=>p.uniqueId===event.uniqueId);
    if (!player || !['red','blue'].includes(player.team)) return;
    const nickname=safeName(event.nickname || player.nickname);
    const giftName=event.giftName ? safeName(event.giftName).slice(0,60) : '';
    broadcast({type:'gift',nickname,team:player.team,mode:state.mode === 'pve' ? 'pve' : state.mode === 'pvp' ? 'pvp' : null,...(giftName ? {giftName} : {}),...(event.giftCount ? {giftCount:event.giftCount} : {}),...(isSimulation ? {simulated:true} : {})});
    log(`${isSimulation ? '[Giả lập] ' : ''}${nickname} đã tặng quà`);
  }
  // Donor highlight: only the stable uniqueId (already public in state) of a rostered
  // player whose completed gift passed integrity checks. Throttled per id and capped
  // per second so bursts cannot flood clients; extra donors in a burst do not glow.
  // Outside pull the engine reports a replayed completion as 'cross-round' before it
  // can say 'duplicate', so live gift identities are also remembered here (bounded).
  let donorWindow = 0; const donorSent = new Set(), donorSeen = new Set();
  function notifyDonor(uniqueId, outcome, identity = null) {
    if (!DONOR_OUTCOMES.has(outcome) || typeof uniqueId !== 'string' || !uniqueId || uniqueId.length > 128) return;
    if (identity !== null) { if (donorSeen.has(identity)) return; if (donorSeen.size >= 4096) donorSeen.delete(donorSeen.values().next().value); donorSeen.add(identity); }
    const now = Date.now(); if (now - donorWindow >= 1000) { donorWindow = now; donorSent.clear(); }
    if (donorSent.has(uniqueId) || donorSent.size >= 20) return;
    if (!engine.snapshot().players?.some(p => p.uniqueId === uniqueId)) return;
    donorSent.add(uniqueId); broadcast({type:'donor',uniqueId});
  }
  let positionLast = 0; const positionUsers = new Map();
  function notifyPosition(event, fake = false) {
    if (typeof event.uniqueId !== 'string' || !event.uniqueId || event.uniqueId.length > 128) return;
    const now=Date.now(); for (const [id,at] of positionUsers) if (now-at >= 30000) positionUsers.delete(id);
    if (now-positionLast < 4000 || positionUsers.has(event.uniqueId) || positionUsers.size >= 256) return;
    positionLast=now; positionUsers.set(event.uniqueId,now); broadcast(positionNotice(engine.snapshot(),event,fake));
  }
  let commentWindow=0,commentCount=0;
  function notifyComment(event,fake=false){
    const notice=commentNotice(engine.snapshot(),event,fake);if(!notice)return;
    const now=Date.now();if(now-commentWindow>=1000){commentWindow=now;commentCount=0;}
    if(commentCount>=30)return;commentCount++;
    // Send the new roster first so the bubble can immediately find its owner.
    sendState();broadcast(notice);
  }
  // A new event source invalidates every highlight issued by the previous one.
  function switchSource() { engine.resume?.(); engine.reset({clearPlayers:true}); donorSent.clear(); donorSeen.clear(); giftSeen.clear(); positionUsers.clear(); positionLast=0;commentWindow=0;commentCount=0; broadcast({type:'donor-clear'}); }
  const onResult = result => {
    if (simulated || result.demo || result.exhibition) return;
    if (liveUsername && ['connected','reconnecting'].includes(live.status)) {
      try {
        const mvp = Object.fromEntries(['red','blue'].map(team => {
          const player = result.mvp?.[team];
          return [team, player ? {uniqueId:player.uniqueId, nickname:player.nickname} : null];
        }));
        appendFileSync(historyPath, JSON.stringify({timestamp:new Date().toISOString(),winner:result.winner,score:{red:result.score.red,blue:result.score.blue},mvp})+'\n', {mode:0o600});
      } catch { log('Không lưu được lịch sử trận đấu'); }
    }
    try {
      stats.matches++; const winner = result.winner; if (Object.hasOwn(stats.wins,winner)) stats.wins[winner]++;
      for (const player of Object.values(result.mvp || {})) if (player?.uniqueId && !player.isBot) { const id = player.uniqueId; if (!Object.hasOwn(stats.mvp,id)) Object.defineProperty(stats.mvp,id,{value:{nickname:player.nickname, count:0},enumerable:true,writable:true,configurable:true}); stats.mvp[id].count++; }
      atomicWrite(statsPath,stats);
    } catch(e) { log(`Không lưu được thống kê: ${e.message}`); }
  };
  // Silence-based estimate only: TikTok never says who left the room.
  const onPresence = ({type,player}) => { const name=safeName(player?.nickname||player?.uniqueId),team=player?.team==='red'?'Đội Đỏ':'Đội Xanh';
    if(type==='away')log(`💤 ${name} (${team}) im lặng ${config.idleSeconds??30}s khi đang kéo · có thể đã thoát live, xuống khán đài`);
    else if(type==='quiet')log(`💤 ${name} (${team}) im lặng ${config.idleSeconds??30}s · có thể đã thoát live`);
    else if(type==='back')log(`↩️ ${name} (${team}) đã quay lại`);
    else if(type==='removed')log(`🚪 ${name} (${team}) bị xoá khỏi danh sách sau ${config.inactivitySeconds??300}s không tương tác`); };
  const engine = new Engine({config,onResult,onPresence});
  // Overlay audio is driven from the control panel; the overlay reports whether its browser let it start.
  let overlayAudio='unknown', audioReporter=null;
  const audioState = () => ({volume:config.audioVolume ?? 18, muted:config.audioMuted === 1, overlay:overlayAudio});
  const sendState = () => broadcast({type:'state',state:engine.snapshot(),live,audio:audioState()});
  // LIVE event handlers shared by the standalone connector and the StudioLive bridge.
  function liveChat(event) {
    if(!commentText(event.comment)) return;
    if(isPositionComment(event.comment)){engine.touch?.(event);notifyPosition(event);notifyComment(event);return;}
    const find=s=>s.players?.find(p=>p.uniqueId===event.uniqueId), before=find(engine.snapshot());
    engine.comment(event);
    const snapshot=engine.snapshot();
    notifyComment(event);
    // Operators see every join and team change; viewers see a card when a switch waits for the next round.
    const after=find(snapshot), name=safeName(event.nickname||event.uniqueId), team=t=>t==='red'?'Đội Đỏ':'Đội Xanh';
    if(after&&!before) log(`${name} vào ${team(after.team)}`);
    else if(after&&before&&after.team!==before.team) log(`${name} chuyển sang ${team(after.team)}`);
    else if(after?.pendingTeam&&after.pendingTeam!==before?.pendingTeam){ log(`${name} sẽ sang ${team(after.pendingTeam)} từ trận sau`); broadcast({type:'team-request',nickname:name,team:after.pendingTeam}); }
    else activity(`${name} đã bình luận`);
  }
  function liveMember(u) {
    const had=engine.snapshot().players?.some(p=>p.uniqueId===u.uniqueId); engine.member(u);
    const joined=!had&&engine.snapshot().players?.find(p=>p.uniqueId===u.uniqueId);
    if(joined) log(`${safeName(u.nickname||u.uniqueId)} vào ${joined.team==='red'?'Đội Đỏ':'Đội Xanh'} (tự vào khi xem live)`);
  }
  function liveLike(u, count) {
    const had=engine.snapshot().players?.some(p=>p.uniqueId===u.uniqueId); engine.like({...u,likeCount:Number(count)});
    const joined=!had&&engine.snapshot().players?.find(p=>p.uniqueId===u.uniqueId);
    if(joined) log(`${safeName(u.nickname||u.uniqueId)} vào ${joined.team==='red'?'Đội Đỏ':'Đội Xanh'} (tự vào khi thả tim)`); else activity(`${safeName(u.nickname)} đã thả tim`);
  }
  function liveGift(event) {
    const outcome=engine.gift(event);
    if (['unobserved-start','unidentified','invalid-value','capacity','conflict','cross-round','roster-full'].includes(outcome)) { const now=Date.now(); if(now-lastGiftWarning>=1000) { lastGiftWarning=now; log(`Quà không được tính điểm (${outcome})`); } }
    if((!event.streakable || event.repeatEnd) && outcome !== 'duplicate') { const identity=JSON.stringify([event.streakable, event.uniqueId, event.giftId, event.streakable ? event.groupId : event.msgId]); notifyGift(event, outcome, identity); notifyDonor(event.uniqueId, outcome, identity); }
  }
  function scheduleReconnect(token) { if (closed || token !== generation || retry) return; if (live.status === 'connected') engine.pause?.(); live.status='reconnecting'; sendState(); retry=setTimeout(()=>{ retry=null; connectAttempt(token); },retryMs); }
  function connectAttempt(token) {
    if (closed || token !== generation) return;
    // The gift list is a signed Euler request that needs a paid plan; gift events already carry giftDetails.diamondCount.
    const c = connector = new Connector(live.username,{ processInitialData:false, enableExtendedGiftInfo:false });
    let ended = false;
    const valid = () => !ended && !closed && generation === token && connector === c;
    const user = d => ({uniqueId:d.user?.uniqueId || d.user?.displayId, nickname:d.user?.nickname, avatar:d.user?.avatarThumb?.urlList?.[0] || d.user?.avatarLarge?.urlList?.[0] || ''});
    // v2.5.0 chat carries the text in `content` and likes in `count`; the older names stay as fallbacks.
    const chatText = d => typeof d.content === 'string' ? d.content : d.comment;
    c.on('chat', d=>{ if(valid() && user(d).uniqueId) liveChat({...user(d),comment:chatText(d)}); });
    c.on('member', d=>{ if(valid() && [1,3].includes(d.action) && user(d).uniqueId) liveMember(user(d)); });
    c.on('like', d=>{ if(valid() && user(d).uniqueId) liveLike(user(d),d.count ?? d.likeCount); });
    c.on('gift', d=>{ if(valid() && user(d).uniqueId) liveGift(normalizeLiveGift(d)); });
    c.on('error', e=>{ if(valid()) log(`Live: ${[e?.info,e?.exception?.message||e?.message].filter(Boolean).join(': ') || e}`); });
    c.on('disconnected', ()=>{ if(valid()) { ended=true; scheduleReconnect(token); } });
    c.on('streamEnd', ()=>{ if(valid()) { ended=true; log('Live đã kết thúc'); scheduleReconnect(token); } });
    Promise.resolve().then(()=>c.connect()).then(()=>{ if(!valid()) { Promise.resolve(c.disconnect()).catch(()=>{}); return; } if(retry) { clearTimeout(retry); retry=null; } engine.resume?.(); live.status='connected'; log(`Đã kết nối @${live.username}`); sendState(); }).catch(e=>{ if(valid()) { log(`Không kết nối được: ${e.message}`); scheduleReconnect(token); } });
  }
  function startLive(username) {
    if(simulated || (liveUsername && liveUsername !== username.toLowerCase())) { switchSource(); simulated=false; }
    liveUsername=username.toLowerCase();
    live={status:'connecting',username}; const token=++generation; sendState(); connectAttempt(token);
  }
  if (RoomIdRouteConfig) RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
  // ---- StudioLive bridge ----
  // StudioLive statuses: idle | connecting | live | reconnecting | ended | error
  function liveStatus({status,username='',message=''}={}) {
    if (!bridge || closed) return;
    const was = live.status;
    if (status === 'live') {
      // First time on air, or a different channel: the previous roster belongs to another source.
      if (simulated || (liveUsername && username && liveUsername !== username.toLowerCase())) { switchSource(); simulated=false; }
      liveUsername = String(username || liveUsername).toLowerCase();
      engine.resume?.(); live = {status:'connected',username:username || live.username};
      if (was !== 'connected') log(`Đã kết nối @${live.username} (qua StudioLive)`);
    } else if (status === 'connecting') {
      live = {status:'connecting',username:username || live.username};
    } else if (status === 'reconnecting') {
      if (was === 'connected') engine.pause?.();
      live = {status:'reconnecting',username:username || live.username};
    } else if (['idle','ended','error'].includes(status)) {
      if (was === 'connected' || was === 'reconnecting') engine.pause?.();
      live = {status:'disconnected',username:''};
      if (message && was !== 'disconnected') log(`Live: ${message}`);
    } else return;
    sendState();
  }
  // Events normalised by StudioLive's LiveService: {type,user:{id,uniqueId,nickname,avatar},text|count|giftName,...}.
  function ingest(ev) {
    if (!bridge || closed || live.status !== 'connected' || !ev?.user) return;
    const u = {uniqueId:String(ev.user.uniqueId || ev.user.id || ''), nickname:ev.user.nickname, avatar:ev.user.avatar || ''};
    if (!u.uniqueId || u.uniqueId.length > 128) return;
    if (ev.type === 'chat') liveChat({...u,comment:ev.text});
    else if (ev.type === 'join') liveMember(u);
    else if (ev.type === 'like') liveLike(u, ev.count);
    else if (ev.type === 'gift' || ev.type === 'giftStreak') {
      const id = v => v == null || v === '' ? undefined : String(v);
      const count = Number(ev.repeatCount ?? 1);
      liveGift({live:true, ...u, giftId:id(ev.giftId), groupId:id(ev.groupId), msgId:id(ev.msgId),
        diamondCount:Number(ev.diamonds ?? 0),
        ...(typeof ev.giftName === 'string' && ev.giftName.trim() ? {giftName:ev.giftName} : {}),
        ...(Number.isSafeInteger(count) && count > 0 ? {giftCount:count} : {}),
        repeatCount:count, repeatEnd:ev.type === 'gift', streakable:typeof ev.streakable === 'boolean' ? ev.streakable : null});
    }
  }
  // Overlays opened through StudioLive's redirect (?sl=1) go back to the StudioLive scene when another scene goes on air.
  const navigateOverlays = () => { if (bridge) broadcast({type:'navigate',port:bridge.studioPort}); };
  const hosts = ['127.0.0.1','localhost',...(bridge ? ['lvh.me'] : [])];
  const allowedHost = h => hosts.some(name => h === `${name}:${port}`);
  const allowedOrigin = o => hosts.some(name => o === `http://${name}:${port}`);
  const server = http.createServer(async(req,res)=>{
    if (!allowedHost(req.headers.host) || (req.headers.origin && !allowedOrigin(req.headers.origin))) { res.writeHead(403); return res.end('Forbidden'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const file = files[req.url?.split('?')[0]]; if (!file || !Object.hasOwn(files,req.url?.split('?')[0])) { res.writeHead(404); return res.end('Not found'); }
    try { let body=await readFile(file===threeModule ? file : join(staticDir,file));
      if (bridge && file === 'control.html') body = Buffer.from(body.toString('utf8').replace('Kết nối phòng live bằng tên tài khoản TikTok.','Dùng chung kết nối TikTok với StudioLive: kết nối ở đây hoặc ở Bảng điều khiển StudioLive đều được.'));
      res.writeHead(200,{'Content-Type':mime[file.split('.').pop()], 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store'}); res.end(req.method==='HEAD' ? undefined : body); } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.on('upgrade',(req,socket,head)=>{ if(req.url !== '/ws' || !allowedHost(req.headers.host) || !allowedOrigin(req.headers.origin)) return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req)); });
  wss.on('connection', ws=>{
    sendBounded(ws,JSON.stringify({type:'state',state:engine.snapshot(),live,audio:audioState()}));
    ws.on('error',()=>{});
    ws.on('close',()=>{ if(audioReporter===ws){ audioReporter=null; overlayAudio='unknown'; sendState(); } });
    ws.on('message', raw=>{
      try {
        const m=JSON.parse(raw.toString()); if(!m || typeof m !== 'object' || Array.isArray(m)) throw Error('Thông điệp không hợp lệ');
        switch(m.type) {
          case 'connect': {
            const username=typeof m.username==='string' ? m.username.trim().replace(/^@/,'') : '';
            if(!/^[a-zA-Z0-9._]{1,24}$/.test(username)) throw Error('Username không hợp lệ');
            if(live.status !== 'disconnected') throw Error('Đang kết nối live');
            if(bridge){ live={status:'connecting',username}; Promise.resolve().then(()=>bridge.connect(username)).then(r=>{ if(r?.ok===false){ log(`Không kết nối được: ${r.message||'lỗi không xác định'}`); if(live.status==='connecting'){ live={status:'disconnected',username:''}; sendState(); } } }).catch(e=>log(`Không kết nối được: ${e?.message||e}`)); sendState(); break; }
            startLive(username); atomicWrite(livePath,{username}); break;
          }
          case 'disconnect': if(bridge){ Promise.resolve().then(()=>bridge.disconnect()).catch(e=>log(e?.message||String(e))); break; } { if (live.status === 'connected' || live.status === 'reconnecting') engine.pause?.(); ++generation; clearTimeout(retry); retry=null; const c=connector; connector=null; live={status:'disconnected',username:''}; atomicWrite(livePath,{username:''}); if(c) Promise.resolve(c.disconnect()).catch(e=>log(e.message)); sendState(); break; }
          case 'simulate': {
            if(live.status !== 'disconnected') throw Error('Không thể giả lập khi đang kết nối live');
            if(!['comment','like','gift','position'].includes(m.event) || ![1,5,10,30].includes(m.count)) throw Error('Giả lập không hợp lệ');
            if(!simulated) { switchSource(); simulated=true; }
            for(let i=0;i<m.count;i++) { const u={uniqueId:`sim_${i+1}`,nickname:`Test ${i+1}`,avatar:''}; if(m.event==='position' && i===m.count-1) notifyPosition(u,true); if(m.event==='comment') {const event={...u,comment:i%2?'xanh':'đỏ'};engine.comment(event);notifyComment(event,true);} if(m.event==='like') engine.like({...u,likeCount:15}); if(m.event==='gift') { const outcome=engine.gift({...u,diamondCount:1,repeatCount:1,repeatEnd:true,streakable:false}); notifyDonor(u.uniqueId, outcome); notifyGift(u, outcome, null, true); } } if(m.event!=='gift' && m.event!=='position') activity(`Giả lập ${m.event==='comment'?'bình luận':'thả tim'}: ${m.count} người`); sendState(); break;
          }
          case 'start': case 'stop': case 'reset': case 'replay': if(engine.snapshot().paused) throw Error('Trận đấu đang tạm dừng vì mất kết nối live'); engine[m.type](); sendState(); break;
          case 'config': { const next={...config,...validateConfig(m.config)}; engine.configure(next); atomicWrite(configPath,next); config=next; sendState(); break; }
          case 'audio': {
            if(!Number.isInteger(m.volume) || m.volume<0 || m.volume>100 || typeof m.muted!=='boolean') throw Error('Âm thanh không hợp lệ');
            const next={...config,audioVolume:m.volume,audioMuted:m.muted?1:0}; atomicWrite(configPath,next); config=next; sendState(); break;
          }
          case 'audio-test': broadcast({type:'audio-test'}); break;
          case 'audio-status': if(!['on','blocked'].includes(m.status)) throw Error('Trạng thái âm thanh không hợp lệ'); overlayAudio=m.status; audioReporter=ws; sendState(); break;
          default: throw Error('Lệnh không hợp lệ');
        }
      } catch(e) { sendBounded(ws,JSON.stringify({type:'error',message:e.message})); }
    });
  });
  const timer=setInterval(()=>{ try {
    engine.tick({snapshot:false});sendState();
  } catch(e) { console.error('Game tick:',e); } },100);
  await new Promise((resolve,reject)=>{ server.once('error',reject); server.listen(port,'127.0.0.1',resolve); }).catch(e=>{ clearInterval(timer); throw e; });
  port=server.address()?.port ?? port;
  if(bridge){ if(bridge.initialStatus) liveStatus(bridge.initialStatus); }
  else {
    // A restart resumes the last LIVE room; pressing Ngắt clears it so the next start stays offline.
    const saved=readJSON(livePath,{})?.username;
    if(typeof saved==='string'&&/^[a-zA-Z0-9._]{1,24}$/.test(saved)){ log(`Tự kết nối lại @${saved}`); startLive(saved); }
  }
  return {server,engine,ingest,liveStatus,navigateOverlays,close:async()=>{ closed=true; ++generation; clearInterval(timer); clearTimeout(retry); if(connector) await Promise.resolve(connector.disconnect()).catch(()=>{}); for(const ws of wss.clients) ws.terminate(); await new Promise(resolve=>server.close(resolve)); wss.close(); }};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createApp().then(()=>console.log('http://127.0.0.1:3000/control.html')).catch(e=>{ console.error(e); process.exitCode=1; });
