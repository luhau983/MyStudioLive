function overlayTugPercent(state){return state.phase==='result'?((Number(state.score?.red)||0)>(Number(state.score?.blue)||0)?-20:(Number(state.score?.blue)||0)>(Number(state.score?.red)||0)?20:0):-Math.max(-1,Math.min(1,Number(state.position)||0))*17;}
'use strict';
const $ = id => document.getElementById(id);
const stage = $('stage');
let current = null, socket, retry, giftTimer;
const phases = {waiting:'CHỜ NGƯỜI CHƠI',lobby:'SẮP ĐỘI',countdown:'CHUẨN BỊ',pull:'ĐANG KÉO',result:'KẾT QUẢ',transition:'CHUYỂN VÒNG'};
function scale(){stage.style.transform = `translateX(-50%) scale(${Math.min(innerWidth / 1080, innerHeight / 1920)})`;}
addEventListener('resize',scale); scale();
function timeLeft(){return current && Number.isFinite(Number(current.endsAt)) && current.endsAt ? Math.max(0,Math.ceil((Number(current.endsAt)-(current.paused ? Number(current.pausedAt) : Date.now()))/1000)) : null;}
function updateResultBanner(state){
 const banner=$('result-banner');
 banner.hidden=state?.phase!=='result'||!!state?.paused;
 if(banner.hidden)return;
 const red=Number(state.score?.red)||0,blue=Number(state.score?.blue)||0;
 const winner=red>blue?'red':blue>red?'blue':'draw';
 banner.className=`result-banner ${winner}`;
 $('result-call').textContent=winner==='draw'?'HÒA!':'KO!';
 $('result-team').textContent=winner==='draw'?'HAI ĐỘI NGANG TÀI':winner==='red'?'ĐỘI ĐỎ CHIẾN THẮNG':state.mode==='pve'?'ĐỘI MÁY CHIẾN THẮNG':'ĐỘI XANH CHIẾN THẮNG';
 $('result-score').textContent=`ĐỎ ${Math.floor(red)}  –  ${Math.floor(blue)} ${state.mode==='pve'?'MÁY':'XANH'}`;
}
function updateManaDisplay(){if(!current)return; for(const side of ['red','blue']){const m=current.mana?.[side]||{}; const value=Math.max(0,Math.min(100,Number(m.value)||0)); const now=current.paused ? current.pausedAt : Date.now(); const seconds=current.phase==='pull' && m.buffUntil ? Math.max(0,Math.ceil((m.buffUntil-now)/1000)) : 0; $(side+'-mana-text').textContent=`MANA ${Math.floor(value)}/100`; $(side+'-mana-fill').style.width=value+'%'; $(side+'-mana-bar').setAttribute?.('aria-valuenow',String(Math.round(value))); $(side+'-buff').textContent=seconds?`×2 ${seconds}s`:''; }}
function updateClock(){updateResultBanner(current);updateManaDisplay();const n=timeLeft(); $('timer').textContent=n===null||current?.waitingForPlayers||current?.waitingForHost?'--':String(n).padStart(2,'0'); if(!current)return; const phase=current.phase; const doubled=phase==='pull' && !current.overtime && n!==null && n<=Number(current.config?.doubleSeconds ?? 10); const tension=globalThis.isFinalTension?.(current,globalThis.overlayConnected===true) || false; stage.className=`stage ${phase||''}${tension?' tension':''}${doubled?' double':''}${current.mode==='pve'?' pve':''}${current.paused?' paused':''}${phase==='result'?(Number(current.score?.red||0)>Number(current.score?.blue||0)?' red-wins':Number(current.score?.blue||0)>Number(current.score?.red||0)?' blue-wins':''):''}`; let text=''; if(phase==='waiting'||phase==='lobby') {const hint=current.autoJoinOpen?'THẢ 1 TIM LÀ VÀO TRẬN':'COMMENT ĐỎ/XANH ĐỂ VÀO ĐỘI'; text=current.waitingForHost?`SẮP BẮT ĐẦU · ${hint}`:current.waitingForPlayers?((current.players?.length||0)?`CẦN THÊM ${current.playersNeeded||1} NGƯỜI · ${hint}`:`CHỜ NGƯỜI CHƠI · ${hint}`):current.demo?'TRẬN TỰ ĐỘNG · COMMENT ĐỂ THAM GIA':current.autoJoinOpen?'Thả 1 tim là vào trận!':'Comment để vào đội!';} else if(phase==='transition') text='SẮP BẮT ĐẦU VÒNG MỚI'; else if(phase==='countdown') text=n===null?'SẴN SÀNG!':String(n); else if(phase==='pull') text=current.overtime?'HIỆP PHỤ!':doubled?'10 GIÂY CUỐI · ĐIỂM ×2':tension?'15 GIÂY CUỐI!':'THẢ TIM KÉO NÀO!'; else if(phase==='result'){const red=Number(current.score?.red)||0, blue=Number(current.score?.blue)||0;text=red===blue?'HÒA NHAU!':red>blue?'ĐỘI ĐỎ CHIẾN THẮNG!':current.mode==='pve'?'ĐỘI MÁY CHIẾN THẮNG!':'ĐỘI XANH CHIẾN THẮNG!';} $('notice').textContent=current.paused?'TẠM DỪNG · MẤT KẾT NỐI LIVE':text;}
// Donor highlights keyed by stable uniqueId (never nickname). A repeat gift extends
// the window instead of stacking; the map is bounded and evicts the soonest expiry.
const DONOR_MS = 5000, MAX_DONORS = 32, donors = new Map();
function addDonor(id, now = Date.now()) {
  if (typeof id !== 'string' || !id || id.length > 128) return;
  donors.delete(id); donors.set(id, now + DONOR_MS);
  if (donors.size > MAX_DONORS) { let oldest = null; for (const [key, at] of donors) if (oldest === null || at < donors.get(oldest)) oldest = key; donors.delete(oldest); }
}
function donorRemaining(id, now = Date.now()) { const at = donors.get(id); if (at === undefined) return 0; if (at <= now) { donors.delete(id); return 0; } return at - now; }
globalThis.donorGlow = {remaining: donorRemaining, clear: () => donors.clear(), ids: () => [...donors.keys()]};
// Remember visible identities for the lifetime of the overlay, including reconnects.
const appearedPlayers = new Set();
const rosterNodes = new WeakMap();
// Original vector art; no player-controlled data is interpolated into this markup.
const characterArt = `<svg class="meme-body" viewBox="0 0 120 170" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
 <g stroke="#181818" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
 <path d="M42 130 L33 155 Q31 161 43 161 L55 143 M78 130 L87 155 Q89 161 77 161 L65 143" fill="#fff"/>
 <path d="M42 95 Q28 99 19 119 L27 124 L42 113 M78 95 Q92 99 101 119 L93 124 L78 113" fill="#fff"/>
 <path d="M43 94 Q60 88 77 94 L84 132 Q60 143 36 132 Z" fill="#fff"/>
 <path d="M46 115 H74" class="team-stripe" fill="none" stroke-width="7"/>
 <ellipse cx="60" cy="53" rx="47" ry="43" fill="#fff"/>
 <image class="face-happy" href="/assets/face-happy.png" x="22" y="20" width="76" height="65" preserveAspectRatio="xMidYMid meet"/>
 <image class="face-pull" href="/assets/face-pull.png" x="22" y="18" width="76" height="68" preserveAspectRatio="xMidYMid meet"/>
 <image class="face-victory" href="/assets/face-victory.png" x="22" y="17" width="76" height="70" preserveAspectRatio="xMidYMid meet"/>
 <image class="face-cry" href="/assets/face-cry.png" x="22" y="17" width="76" height="70" preserveAspectRatio="xMidYMid meet"/>
 </g></svg>`;
function renderPlayers(container, players) {
  const squadSize=current?.squadSize??5;
  let nodes = rosterNodes.get(container);
  if (!nodes) { nodes = new Map(); rosterNodes.set(container, nodes); }
  const visible = players.slice().sort((a,b)=>(Number(a.lineupRank)||Infinity)-(Number(b.lineupRank)||Infinity)).slice(0,squadSize);
  const keys = new Set(visible.map((p,i)=>p.uniqueId || `anonymous-${i}`));
  for (const [key, item] of nodes) if (!keys.has(key)) { item.remove(); nodes.delete(key); }
  visible.forEach((p,i)=>{
    const key = p.uniqueId || `anonymous-${i}`;
    let item = nodes.get(key);
    if (!item) {
      item = document.createElement('div');
      const avatar = document.createElement('div'); avatar.className = 'avatar';
      if (p.uniqueId && !appearedPlayers.has(p.uniqueId)) { avatar.className += ' join-drop'; appearedPlayers.add(p.uniqueId); }
      const name = document.createElement('div'); name.className = 'player-name';
      item.append(avatar,name); nodes.set(key,item);
      item.onanimationend = event => { if (event.target === item && event.animationName === 'player-join-drop') avatar.className = 'avatar'; };
    }
    const avatar = item.children[0], name = item.children[1];
    const avatarUrl = p.avatar && /^https?:\/\//i.test(p.avatar) ? p.avatar : '';
    if (item.avatarUrl !== avatarUrl || item.isBot !== !!p.isBot) {
      item.avatarUrl = avatarUrl; item.isBot = !!p.isBot;
      avatar.innerHTML = characterArt;
      if (avatarUrl) { const img=document.createElement('img'); img.className='profile-badge'; img.src=avatarUrl; img.alt=''; img.referrerPolicy='no-referrer'; img.onerror=()=>img.remove(); avatar.append(img); }
    }
    item.className = p.uniqueId && !p.isBot && donorRemaining(p.uniqueId) ? 'player donor' : 'player';
    item.title=`Hạng ${p.lineupRank || i+1} · Ưu tiên: ${p.priorityDiamonds || 0} kim cương · Vòng này: ${p.giftDiamonds || 0} kim cương`;
    name.textContent=p.nickname||p.uniqueId||'Người chơi';
    if (container.children[i] !== item) {
      const before = container.children[i] || null;
      if (item.parentNode === container && container.moveBefore) container.moveBefore(item,before);
      else { if (item.parentNode === container) avatar.className = 'avatar'; container.insertBefore(item,before); }
    }
  });
  let extra = container.querySelector('.extra');
  if (players.length > squadSize) { if (!extra) { extra=document.createElement('div'); extra.className='extra'; container.append(extra); } extra.textContent=`+${players.length-squadSize}`; }
  else if (extra) extra.remove();
}
function mvp(side,player){$(side+'-mvp').textContent=player?.nickname||player?.uniqueId||'Chưa có';$(side+'-mvp-points').textContent=player?`${Number(player.points)||0} điểm`:'';}
// Compare authoritative lineup slots by identity, never by nickname.
// Initial/reconnected snapshots establish a baseline, without replaying arrivals.
function rosterArrivals(previous,state){
 const squadSize=state.squadSize??5;
 const next=new Map(),events=[];
 for(const side of ['red','blue']){
  const players=(Array.isArray(state.players)?state.players:[]).filter(p=>p.team===side&&!p.bot&&!p.isBot&&p.uniqueId).slice().sort((a,b)=>(Number(a.lineupRank)||Infinity)-(Number(b.lineupRank)||Infinity));
  players.forEach((p,i)=>{
   const slot={id:p.uniqueId,name:p.nickname||p.uniqueId,team:side,area:i<squadSize?'active':state.upNext?.[side]?.includes(p.uniqueId)?'ready':'waiting',position:i<squadSize?i+1:i-squadSize+1};
   next.set(p.uniqueId,slot);const old=previous?.get(p.uniqueId);
   if(previous&&(!old||(old.area!==slot.area&&slot.area!=='waiting')||old.team!==side))events.push(slot);
  });
 }
 return {next,events};
}
let arrivalRoster=null,arrivalTimer,arrivalShowing=false;
const arrivalQueue=[];
// Join feed below the arena: comment-style rows, newest at the bottom; each fades out on its own.
const feedRows=[];
function feedPush(name,text,team){const feed=$('join-feed');if(!feed||typeof document.createElement!=='function')return;
 const row=document.createElement('div'),who=document.createElement('b'),what=document.createElement('span');
 row.className=`join-row ${team}`;who.textContent=cleanGiftText(name,32)||'Người chơi';what.textContent=` ${text}`;row.append(who,what);feed.append(row);feedRows.push(row);
 while(feedRows.length>5)feedRows.shift().remove();
 setTimeout(function expireFeedRow(){const i=feedRows.indexOf(row);if(i>=0){feedRows.splice(i,1);row.remove();}},15000);}
// Team list below the arena: who is on court (lineup order, bots fill as on the 3D court) and how many wait.
function renderTeamList(players,bots,squadSize){const list=$('team-list');if(!list||typeof document.createElement!=='function'||typeof list.replaceChildren!=='function')return;
 const cols=['red','blue'].map(team=>{const members=players.filter(p=>p.team===team).sort((a,b)=>(Number(a.lineupRank)||Infinity)-(Number(b.lineupRank)||Infinity)).concat(bots.filter(b=>b.team===team));
  const col=document.createElement('div'),head=document.createElement('b'),names=document.createElement('ol');col.className=`team-col ${team}`;
  head.textContent=`${team==='red'?'ĐỘI ĐỎ':current?.mode==='pve'?'ĐỘI MÁY':'ĐỘI XANH'} · ${Math.min(members.length,squadSize)}/${squadSize}`;
  for(const p of members.slice(0,squadSize)){const li=document.createElement('li');li.textContent=cleanGiftText(p.nickname||p.uniqueId,24)||'Người chơi';names.append(li);}
  if(!members.length){const li=document.createElement('li');li.className='empty';li.textContent='Chưa có ai';names.append(li);}
  col.append(head,names);
  if(members.length>squadSize){const more=document.createElement('small');more.textContent=`+${members.length-squadSize} đang chờ`;col.append(more);}
  return col;});
 list.replaceChildren(...cols);}
function clearFeed(){for(const row of feedRows.splice(0))row.remove();}
function clearArrivals(){clearFeed();arrivalRoster=null;arrivalQueue.length=0;arrivalShowing=false;clearTimeout(arrivalTimer);$('join-notice').hidden=true;}
function announceArrivals(state){
 const {next,events}=rosterArrivals(arrivalRoster,state);arrivalRoster=next;
 const order={active:0,ready:1,waiting:2};events.sort((a,b)=>order[a.area]-order[b.area]);
 for(const event of events){
  const teamName=event.team==='red'?'Đội Đỏ':'Đội Xanh';
  feedPush(event.name,event.area==='active'?`vừa vào ${teamName} ⚡`:event.area==='ready'?`sắp tới lượt ở ${teamName} 🔥`:`vào hàng chờ ${teamName} ⏳`,event.team);
  let group=arrivalQueue.find(g=>g.team===event.team&&g.area===event.area);
  if(!group){group={team:event.team,area:event.area,names:[],count:0,position:event.position};arrivalQueue.push(group);}
  if(group.names.length<3)group.names.push(event.name);group.count++;
 }
 if(!arrivalShowing&&arrivalQueue.length)showNextArrival();
}
// A mid-match team request is confirmed on screen; the switch itself happens next round.
function announceSwitch(data){feedPush(data.nickname,`sẽ sang ${data.team==='red'?'Đội Đỏ':'Đội Xanh'} từ trận sau 🔁`,data.team);arrivalQueue.push({team:data.team,area:'switch',names:[data.nickname],count:1});if(!arrivalShowing)showNextArrival();}
function showNextArrival(){
 const group=arrivalQueue.shift(),el=$('join-notice');
 if(!group){arrivalShowing=false;el.hidden=true;return;}
 arrivalShowing=true;el.className=`join-notice ${group.team}`;
 const names=group.names.map(name=>cleanGiftText(name,32)||'Người chơi').join(', ');
 const extra=group.count>group.names.length?` và ${group.count-group.names.length} người nữa`:'';
 const team=group.team==='red'?'Đội Đỏ':'Đội Xanh';
 el.textContent=group.area==='switch'?`🔁 ${names} sẽ sang ${team} từ trận sau`:group.area==='ready'?`🔥 ${names}${extra} xuống khu chờ ${team} · SẮP TỚI LƯỢT!`:group.area==='waiting'?`⏳ ${names}${extra} đã vào hàng chờ ${team}`:`⚡ ${names}${extra} vào sân ${team}${group.count===1?' · vị trí #'+group.position:''}`;
 el.hidden=false;arrivalTimer=setTimeout(showNextArrival,3200);
}
function render(state){announceArrivals(state);current=state; $('heart-hint').hidden=!state.autoJoinOpen; globalThis.syncOverlayCrowd?.(state,globalThis.overlayConnected===true); globalThis.lastOverlayState=state; globalThis.updateStage3D?.(state); $('phase').textContent=state.paused?'TẠM DỪNG':state.waitingForPlayers?'CHỜ NGƯỜI CHƠI':state.waitingForHost?'SẮP BẮT ĐẦU':(phases[state.phase]||'TRẬN ĐẤU');$('mode').textContent=state.bots?.length?'NGƯỜI + BOT':state.mode==='pve'?'ĐẤU MÁY':state.mode==='pvp'?'ĐẤU NGƯỜI':'KÉO CO ONLINE';$('red-score').textContent=Math.floor(Number(state.score?.red)||0);$('blue-score').textContent=Math.floor(Number(state.score?.blue)||0);const machine=state.mode==='pve';$('blue-name').textContent=machine?'🤖 ĐỘI MÁY':'ĐỘI XANH';$('blue-label').textContent=machine?'🤖 ĐỘI MÁY':'ĐỘI XANH';$('blue-mvp-title').textContent=machine?'★ MVP ĐỘI MÁY':'★ MVP ĐỘI XANH';const players=Array.isArray(state.players)?state.players:[];let bots=Array.isArray(state.bots)?state.bots:[];bots=bots.map((b,i)=>({...b,nickname:b.nickname||b.name||'Người chơi',isBot:true}));renderPlayers($('red-players'),players.filter(p=>p.team==='red').concat(bots.filter(b=>b.team==='red')));renderPlayers($('blue-players'),players.filter(p=>p.team==='blue').concat(bots.filter(b=>b.team==='blue')));renderTeamList(players,bots,state.squadSize??5);mvp('red',state.mvp?.red);mvp('blue',state.mvp?.blue);$('rope').style.transform=`translateX(${overlayTugPercent(state)}%)`;updateClock();}
// FIFO is bounded; overflow is summarized instead of silently disappearing.
const giftQueue=[], MAX_GIFT_QUEUE=3; let giftOverflow=0, giftShowing=false;
const cleanGiftText=(value, max)=>typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,max) : '';
// Latest message per real identity, never a backlog of old speech bubbles.
const comments=new Map(),COMMENT_MS=7000,MAX_COMMENTS=24;
function showComment(data,now=Date.now()){
 if(typeof data?.uniqueId!=='string'||!data.uniqueId||data.uniqueId.length>128||!['red','blue'].includes(data.team))return;
 const text=Array.from(cleanGiftText(data.text,360)).slice(0,180).join('');if(!text)return;
 comments.delete(data.uniqueId);
 comments.set(data.uniqueId,{uniqueId:data.uniqueId,nickname:Array.from(cleanGiftText(data.nickname,80)).slice(0,40).join('')||'Người chơi',text,team:data.team,simulated:data.simulated===true,expiresAt:now+COMMENT_MS});
 while(comments.size>MAX_COMMENTS)comments.delete(comments.keys().next().value);
}
function clearComments(){comments.clear();}
globalThis.characterComments={clear:clearComments,entries(now=Date.now()){
 for(const [id,entry] of comments)if(entry.expiresAt<=now)comments.delete(id);
 return [...comments.values()].reverse();
}};
function clearGiftQueue(){giftQueue.length=0;giftOverflow=0;giftShowing=false;clearTimeout(giftTimer);$('gift-notice').hidden=true;}
function enqueueGift(data){
 if(giftOverflow) giftOverflow++; else if(giftQueue.length>=MAX_GIFT_QUEUE) { giftOverflow=giftQueue.length+1; giftQueue.length=0; } else giftQueue.push(data);
 if(!giftShowing) showNextGift();
}
function showNextGift(){
 const data=giftQueue.shift();
 if(!data && !giftOverflow){giftShowing=false;$('gift-notice').hidden=true;return;}
 giftShowing=true;
 if(!data){$('gift-notice').textContent=`Có thêm ${giftOverflow} lượt tặng quà`;giftOverflow=0;}
 else {
  const team=data.team==='red'?'Đội Đỏ':data.team==='blue'?'Đội Xanh':'';
  const name=cleanGiftText(data.nickname,80)||'Người xem', gift=cleanGiftText(data.giftName,60);
  const count=Number.isSafeInteger(data.giftCount)&&data.giftCount>0?` ×${data.giftCount}`:'';
  $('gift-notice').textContent=`${data.simulated===true?'[Giả lập] ':''}${name} đã tặng ${gift||'quà'}${count}${team?' cho '+team:''}`;
 }
 $('gift-notice').hidden=false;giftTimer=setTimeout(showNextGift,5000);
}
let positionTimer;
function showPosition(data){
 const el=$('position-notice'), standard=$('instruction-default');
 const name=cleanGiftText(data.nickname,80)||'Người xem';
 let detail='Chưa vào đội · Comment ĐỎ/XANH để tham gia';
 if ((data.team==='red'||data.team==='blue') && (data.area==='active'||data.area==='waiting') && Number.isSafeInteger(data.position) && data.position>0) detail=`Đội ${data.team==='red'?'ĐỎ':'XANH'} · ${data.area==='active'?'Đội kéo':'Hàng chờ'} #${data.position}${data.offscreen?' · ngoài sân':''}`;
 if(data.preparing===true)detail=`Đội ${data.team==='red'?'ĐỎ':'XANH'} · Khu chờ cạnh sân · Sắp tới lượt!`;
 el.textContent=`${data.simulated===true?'[Giả lập] ':''}${name} · ${detail}`; standard.hidden=true; el.hidden=false;
 clearTimeout(positionTimer);positionTimer=setTimeout(clearPosition,4000);
}
function clearPosition(){clearTimeout(positionTimer);$('position-notice').hidden=true;$('instruction-default').hidden=false;}
// sl=1: opened through StudioLive's scene redirect; when another scene goes on air, return to StudioLive with the original query.
function navigateToStudio(port){if(!new URLSearchParams(location.search).has('sl')||!Number.isInteger(port))return;const q=new URLSearchParams(location.search);q.delete('sl');q.delete('silent');const s=q.toString().replace(/=(&|$)/g,'$1');location.replace(`${location.protocol}//${location.hostname}:${port}/${s?'?'+s:''}`);}
globalThis.sendOverlay=m=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));};
function connect(){socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket.onopen=()=>{globalThis.overlayConnected=true;globalThis.reportOverlayAudio?.();globalThis.syncOverlayCrowd?.(null,false);$('connection').hidden=true;donors.clear();clearArrivals();clearComments();};socket.onmessage=e=>{let data;try{data=JSON.parse(e.data);}catch{return;}if(data.type==='navigate'){navigateToStudio(data.port);return;}if(data.type==='state'&&data.state)render(data.state);if(data.type==='state'&&data.audio){globalThis.lastOverlayAudio=data.audio;globalThis.applyOverlayAudio?.(data.audio);}if(data.type==='audio-test')globalThis.playOverlayAudioTest?.();if(data.type==='gift'&&typeof data.nickname==='string')enqueueGift(data);if(data.type==='comment')showComment(data);if(data.type==='position')showPosition(data);if(data.type==='team-request'&&typeof data.nickname==='string'&&['red','blue'].includes(data.team))announceSwitch(data);if(data.type==='donor')addDonor(data.uniqueId);if(data.type==='donor-clear'){clearComments();donors.clear();clearGiftQueue();clearPosition();clearArrivals();arrivalRoster=new Map();}};socket.onclose=()=>{globalThis.overlayConnected=false;globalThis.syncOverlayCrowd?.(current,false);$('connection').hidden=false;clearArrivals();clearComments();clearTimeout(retry);retry=setTimeout(connect,2000);};socket.onerror=()=>socket.close();}
setInterval(updateClock,250);connect();
