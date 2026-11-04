import {youtubeVideoId} from '/music-state.mjs';
const params=new URLSearchParams(location.search),control=document.body.classList.contains('control-page');
// sl=1: opened through StudioLive's scene redirect, which keeps its own ?preview flag (preview without sound is silent=1).
const viaStudio=params.has('sl'),preview=viaStudio?params.has('silent'):params.has('preview');
let studio=null;
// StudioLive's dashboard reloads a preview frame that stops sending this heartbeat.
if(viaStudio&&window.parent!==window)setInterval(()=>{try{window.parent.postMessage({studioAlive:true},'*');}catch{}},1000);
let classroom,teacherAudio,youtubeMusic,voiceSpeaking=false,voiceMuted=false,lastVoiceAt=0;
const $=id=>document.getElementById(id);let ws,state,live,musicVoice={},initialConfig=false,reconnectTimer,importPending=false,importQuestions=null,activityCache=[],activityKey='';
function reportVoice(force=false){if(preview||control||ws?.readyState!==WebSocket.OPEN)return;const now=Date.now();if(force||now-lastVoiceAt>=1000){lastVoiceAt=now;send('teacher-voice',{speaking:voiceSpeaking,muted:voiceMuted&&state?.config.teacherAudio!==false});}}
if(!control){const {createClassroom}=await import('/classroom.js');classroom=createClassroom();const {createTeacherAudio}=await import('/teacher-audio.js');teacherAudio=createTeacherAudio(classroom,{duck:value=>{if(voiceSpeaking!==value){voiceSpeaking=value;reportVoice(true);}},setMuted:value=>{if(voiceMuted!==value){voiceMuted=value;reportVoice(true);}},unlock(){}},{silent:preview});}
else{const {createStudyMusic}=await import('/study-music.js');const {createYouTubeMusic}=await import('/youtube-music.js');youtubeMusic=createYouTubeMusic({local:createStudyMusic({stage:$('youtube-music-panel')}),host:$('youtube-player-host'),button:$('enable-youtube-music'),status:$('youtube-music-status')});}
const labels={demo:'CHƠI THỬ',connecting:'ĐANG KẾT NỐI',connected:'LIVE',reconnecting:'ĐANG KẾT NỐI LẠI',disconnected:'ĐÃ NGẮT'};
function toast(message){if(!control)return;$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function send(type,extra={}){if(ws?.readyState!==WebSocket.OPEN)return toast('Chưa kết nối được máy chủ');ws.send(JSON.stringify({type,...extra}));}
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws${control?'?role=control':''}`);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='error'){if(control&&importPending){importPending=false;$('import-bank').disabled=!importQuestions;$('question-file').disabled=false;$('import-status').textContent=m.message;}return toast(m.message);}if(m.type==='import-result'){importPending=false;importQuestions=null;$('question-file').disabled=false;$('question-file').value='';$('import-bank').disabled=true;$('import-status').textContent=`Đã thêm ${m.added} câu · Bỏ qua ${m.duplicates} câu trùng · Tổng ${m.total} câu`;toast('Đã import bộ câu hỏi');return;}if(m.type==='navigate'){if(viaStudio&&!control&&Number.isInteger(m.port)){const q=new URLSearchParams(location.search);q.delete('sl');q.delete('silent');location.replace(`${location.protocol}//${location.hostname}:${m.port}/${q.size?'?'+q.toString().replace(/=(&|$)/g,'$1'):''}`);}return;}if(m.studio){studio=m.studio;$('overlay-url').textContent=studio.overlayURL;$('overlay-url').href=studio.overlayURL;}if(m.type==='state'){if(Array.isArray(m.game.activityLog))activityCache=m.game.activityLog;state=m.game;live=m.live;musicVoice=m.music||{};if(!control)renderGift(m.gift);render();}};ws.onclose=()=>{youtubeMusic?.disconnect();if(control){$('server-label').textContent='Mất kết nối máy chủ · đang thử lại…';if(importPending){importPending=false;$('question-file').disabled=false;$('import-bank').disabled=!importQuestions;$('import-status').textContent='Mất kết nối khi import. Bạn có thể thử lại; câu trùng sẽ được bỏ qua.';}}else{$('connection-banner').hidden=false;$('connection-banner').textContent='Mất kết nối máy chủ · Đang thử lại…';}clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,1500);};}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
function replaceList(id,items,fn){const el=$(id);el.replaceChildren(...items.map(fn));}
let giftKey=null,giftTimer;const GIFT_NOTICE_MS=4500;
// Big centre popup the moment someone answers first, so the MVP is obvious on a phone even under TikTok comments.
let mvpPopupKey='',mvpPopupTimer;
function renderMvpPopup(s){
  const w=s.winner;if(!w)return;const key=s.round+':'+w.id;if(key===mvpPopupKey)return;mvpPopupKey=key;
  if(Date.now()-(w.at||0)>4000)return; // page (re)loaded long after the answer: no stale popup
  const el=$('mvp-popup'),card=node('div','mvp-popup-card'),confetti=node('div','mvp-confetti');
  for(let i=0;i<18;i++){const bit=node('i');bit.style.setProperty('--x',(Math.random()*100)+'%');bit.style.setProperty('--d',(Math.random()*.5)+'s');bit.style.setProperty('--r',(Math.random()*720-360)+'deg');bit.style.setProperty('--c',['#f5c64f','#e26a3d','#7fc8a9','#fff3c4','#e88fb0'][i%5]);confetti.append(bit);}
  card.append(node('span','mvp-popup-crown','♛'),node('small','','ĐÚNG ĐẦU TIÊN'),node('strong','',(w.simulated?'[Thử] ':'')+w.nickname),node('p','',`+${w.points} điểm · ${(w.seconds??0).toFixed(1)} giây`));
  el.replaceChildren(confetti,card);el.hidden=false;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  const mvpCard=document.querySelector('.mvp-status-card');mvpCard.classList.remove('mvp-flash');void mvpCard.offsetWidth;mvpCard.classList.add('mvp-flash');
  clearTimeout(mvpPopupTimer);mvpPopupTimer=setTimeout(()=>{el.hidden=true;el.classList.remove('show');},3200);
}
function renderGift(gift){
  const notice=$('gift-notice');clearTimeout(giftTimer);
  if(!gift){notice.hidden=true;giftKey='';return;}
  const key=gift.seq+':'+gift.at;if(key!==giftKey){
    if(giftKey!==null&&GIFT_NOTICE_MS-gift.remaining<1500)teacherAudio?.thank();giftKey=key;const card=node('div','gift-notice-card'),icon=node('span','gift-notice-icon','🎁'),body=node('div','gift-notice-body');
    body.append(node('small','',gift.simulated?'QUÀ THỬ · CẢM ƠN BẠN':'CẢM ƠN MÓN QUÀ CỦA BẠN'),node('strong','gift-sender',gift.nickname));
    const detail=node('p','');detail.append(node('span','',gift.giftName),node('b','', '×'+gift.count.toLocaleString('vi-VN')));body.append(detail);
    card.append(icon,body,node('span','gift-spark','✦'));notice.replaceChildren(card);
  }
  notice.hidden=false;giftTimer=setTimeout(()=>{notice.hidden=true;},Math.max(0,gift.remaining));
}
let overlayKey='',commentsKey='',rankingKey='';
function renderActivity(){
  if(!control)return;
  const filter=$('activity-filter').value,needle=$('activity-search').value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').replace(/^@/,'');
  const rows=activityCache.filter(e=>{const matches=filter==='all'||filter==='correct'?filter==='all'||e.outcome==='correct':e.type===filter;if(!matches)return false;return !needle||[e.nickname,e.userId,e.text].join(' ').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').includes(needle);});
  const key=JSON.stringify([activityCache[0]?.seq,activityCache.length,filter,needle]);if(key===activityKey)return;activityKey=key;
  $('activity-count').textContent=rows.length+' / '+activityCache.length+' sự kiện';
  replaceList('activity-log',rows,e=>{
    const row=node('div','activity-row '+(e.outcome==='correct'?'success':e.type));
    const time=node('time','',new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(e.at));
    const body=node('div','activity-body'),head=node('div','activity-user');head.append(node('strong','',(e.simulated?'[Thử] ':'')+(e.nickname||'Host')));if(e.userId)head.append(node('span','', '@'+e.userId));
    const label=e.type==='gift'?'🎁 Tặng quà':e.type==='join'?'Vào LIVE → vào lớp':e.type==='full'?'Lớp đầy, chưa có ghế':e.type==='position'?(e.outcome==='full'?'Vị trí: chưa có ghế':'Yêu cầu làm nổi bật vị trí'):e.type==='reset'?'Đặt lại phiên':e.type==='stop'?'Dừng lớp':e.outcome==='correct'?(e.mvp?'♛ MVP · ':'ĐÚNG · ')+'+'+e.points+' điểm':e.outcome==='duplicate'?'Đã đúng ở câu này (không cộng lặp)':e.outcome==='ignored'?'Bình luận ngoài lượt':'Bình luận';
    body.append(head,node('small','activity-kind',label));if(e.text)body.append(node('p','',e.text));row.append(time,body);return row;
  });
  if(!rows.length)$('activity-log').append(node('p','subtle',activityCache.length?'Không có sự kiện phù hợp bộ lọc.':'Chưa có hoạt động.'));
}
function render(){const s=state,q=s.question;
  if(control){
    youtubeMusic.update(s,musicVoice);$('server-label').textContent='Máy chủ đang hoạt động';$('phase-label').textContent=s.classStopped?'Đã dừng lớp':s.paused?'Đã tạm dừng':({idle:'Chờ bắt đầu',playing:'Đang đoán chữ',result:'Đang hiện kết quả'}[s.phase]);
    $('round-count').textContent=String(s.round).padStart(2,'0');$('question-count').textContent=s.totalQuestions;$('player-count').textContent=s.players;
    $('top-name').textContent=s.leaderboard[0]?.nickname||'Chưa có';$('top-score').textContent=s.leaderboard[0]?s.leaderboard[0].score+' điểm':'Vương miện đang chờ';renderActivity();
    $('live-badge').textContent=labels[live.status];$('live-message').textContent=live.error||(live.status==='connected'?`Đã nhận comment từ @${live.username}`:live.status==='demo'?'Chơi thử bằng bình luận bên dưới trước khi lên sóng.':'Kết nối tài khoản đang LIVE để nhận đáp án của người xem.');
    // Inside StudioLive the TikTok connection lives on its dashboard; here we only switch between Chơi thử and that connection.
    if(studio){$('follow-live').hidden=live.status!=='demo';$('demo').hidden=live.status==='demo';$('live-message').textContent=live.status==='demo'?'Đang chơi thử: chỉ nhận bình luận giả lập bên dưới. Khi lên sóng bấm nút trên để nhận comment thật.':live.status==='connected'?`Đang nhận comment từ @${live.username} qua kết nối của StudioLive.`:live.error||'Kết nối LIVE ở Bảng điều khiển của StudioLive, game tự nhận comment.';}
    $('connect-button').disabled=['connecting','reconnecting'].includes(live.status);$('disconnect').disabled=['demo','disconnected'].includes(live.status);
    $('control-correct').textContent=(s.correctCount||0)+' người đúng';$('stop-class').disabled=!!s.classStopped;
    $('control-timer').textContent=s.phase==='idle'?'—':Math.ceil(s.remaining)+' GIÂY';$('host-answer').textContent=q?.answer||'Sẵn sàng lên sóng?';$('host-hint').textContent=q?.hint||'Bấm bắt đầu để mở câu hỏi đầu tiên.';
    $('start').textContent=s.phase==='idle'?'▶ Bắt đầu câu đầu tiên':'▶ Mở câu mới';$('pause').textContent=s.classStopped?'▶ Tiếp tục lớp':s.paused?'▶ Tiếp tục câu':'Ⅱ Tạm dừng câu';$('pause').disabled=s.phase==='idle'&&!s.classStopped;$('hint-button').disabled=s.phase!=='playing'||s.paused;$('reveal').disabled=s.phase!=='playing'||s.paused;
    $('show-names').checked=s.config.showNames!==false;const levels=s.questionLevels||{normal:0,hard:0};$('level-normal').textContent=levels.normal;$('level-hard').textContent=levels.hard;$('level-mixed').textContent=levels.normal+levels.hard;for(const b of document.querySelectorAll('[data-difficulty]')){const on=b.dataset.difficulty===(s.config.difficulty||'mixed');b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);}$('send-comment').disabled=live.status!=='demo'||s.phase!=='playing'||s.paused;$('simulate-member').disabled=live.status!=='demo';$('simulate-gift').disabled=live.status!=='demo';
    if(!initialConfig){$('round-seconds').value=s.config.roundSeconds;$('result-seconds').value=s.config.resultSeconds;$('base-points').value=s.config.points;$('auto-next').checked=s.config.autoNext;$('ignore-accents').checked=s.config.ignoreAccents;$('teacher-audio').checked=s.config.teacherAudio;$('audio-volume').value=s.config.audioVolume;$('music-enabled').checked=s.config.musicEnabled!==false;$('music-volume').value=s.config.musicVolume??16;$('music-volume-value').textContent=(s.config.musicVolume??16)+'%';$('youtube-music-url').value=s.config.youtubeMusicUrl||'';initialConfig=true;}
    const key=JSON.stringify(s.comments);if(key!==commentsKey){commentsKey=key;replaceList('comment-feed',s.comments,c=>{const row=node('div',c.correct?'comment-row correct':'comment-row');row.append(node('strong','',c.nickname),node('span','',c.text),node('small','',c.correct?'ĐÚNG ✓':c.simulated?'THỬ':''));return row;});if(!s.comments.length)$('comment-feed').append(node('p','subtle','Bình luận của câu hiện tại sẽ xuất hiện ở đây.'));}
    return;
  }
  classroom.update(s);teacherAudio.update(s);reportVoice();
  $('correct-count').textContent=s.correctCount||0;$('mvp-label').textContent=s.winner?s.winner.nickname:'Đang chờ chủ nhân';document.querySelector('.mvp-status-card').classList.toggle('has-mvp',!!s.winner);renderMvpPopup(s);
  $('timer').textContent=s.phase==='idle'?'—':String(Math.ceil(s.remaining)).padStart(2,'0');$('progress').style.width=(s.phase==='playing'?Math.min(100,s.remaining/s.duration*100):s.phase==='idle'?100:0)+'%';
  $('stage').classList.toggle('urgent',s.phase==='playing'&&s.remaining<=10);$('stage').classList.toggle('has-result',s.phase==='result');$('stage').classList.toggle('long-puzzle',(q?.tiles?.length||0)>12);
  $('category').textContent=q?.category||'ĐỐ VUI TIẾNG VIỆT';$('puzzle-label').textContent=s.phase==='result'?'ĐÁP ÁN CỦA CHÚNG TA':s.phase==='idle'?'BẠN ĐÃ SẴN SÀNG CHƯA?':'SẮP XẾP CÁC CHỮ SAU';
  const key=JSON.stringify([s.round,s.phase,s.hints]);if(key!==overlayKey){overlayKey=key;
    const groups=(q?.mask||[]).join('').split(' '),letters=s.phase==='result'?Array.from(q.answer.replace(/\s/g,'')):q?.tiles||['V','U','A'];
    // 2-3 word answers: one row per word length (the mask already shows word lengths, so nothing leaks).
    const rows=groups.length>=2&&groups.length<=3&&groups.reduce((n,g)=>n+g.length,0)===letters.length?groups.map(g=>g.length):[letters.length];let cut=0;const breaks=new Set(rows.slice(0,-1).map(n=>cut+=n));
    replaceList('tiles',letters.flatMap((c,i)=>breaks.has(i)?[null,c]:[c]),c=>c===null?node('i','tile-break'):node('span','',c));$('stage').classList.toggle('three-rows',rows.length===3);
    replaceList('mask',groups,g=>{const word=node('span','mask-word');for(const c of g)word.append(node('span',c==='_'?'blank':'revealed',c==='_'?'':c));return word;});
  }
  $('hint').textContent=q?.hint||'Host đang chuẩn bị câu hỏi. Cùng chờ một chút nhé!';$('points-label').textContent=Math.max(10,s.config.points-s.hints*20);
  $('callout').hidden=s.phase==='result';$('result').hidden=s.phase!=='result';
  if(s.phase==='result'){$('result-label').textContent=s.winner?'♛ MVP · ĐÚNG ĐẦU TIÊN':s.reason==='timeout'?'HẾT GIỜ RỒI!':'CÙNG XEM ĐÁP ÁN';$('winner-name').textContent=s.winner?(s.winner.simulated?'[Thử] ':'')+s.winner.nickname:'Hẹn bạn ở câu tiếp theo';$('result-answer').textContent=q.answer;$('winner-points').textContent=s.winner?'+'+s.winner.points:'✦';}
  const rank=JSON.stringify(s.leaderboard);if(rank!==rankingKey){rankingKey=rank;replaceList('leaderboard',s.leaderboard.slice(0,3),(p,i)=>{const row=node('li','rank-row');row.append(node('span','rank-number',String(i+1).padStart(2,'0')),node('span','avatar',p.nickname.slice(0,1).toUpperCase()),node('strong','rank-name',(p.simulated?'[Thử] ':'')+p.nickname),node('span','rank-score',p.score+' đ'));return row;});if(!s.leaderboard.length)$('leaderboard').append(node('li','empty-ranking','Bảng vàng đang chờ tên cả lớp…'));}
  const latest=s.comments[0];$('latest-comment').textContent=latest?`${latest.simulated?'[Thử] ':''}${latest.nickname}: ${latest.text}`:'Chỉ cần comment đáp án · Ai cũng có thể chơi';
  const blocked=s.paused||!['demo','connected'].includes(live.status);$('connection-banner').hidden=!blocked;$('connection-banner').textContent=s.classStopped?'ĐÃ DỪNG LỚP · Bấm Tiếp tục trong control':s.paused?'ĐÃ TẠM DỪNG · Chờ host tiếp tục':labels[live.status];
}
if(control){
  let liveWindow;
  function fitLiveWindow(){
    if(!liveWindow||liveWindow.closed)return;
    const chromeW=Math.max(0,liveWindow.outerWidth-liveWindow.innerWidth),chromeH=Math.max(0,liveWindow.outerHeight-liveWindow.innerHeight);
    const height=Math.floor(Math.min(960,screen.availHeight-chromeH-32,(screen.availWidth-chromeW-32)*16/9));
    const width=Math.round(height*9/16);
    try{liveWindow.resizeTo(width+chromeW,height+chromeH);liveWindow.moveTo(Math.round((screen.availLeft||0)+(screen.availWidth-width-chromeW)/2),Math.round((screen.availTop||0)+(screen.availHeight-height-chromeH)/2));}catch{}
  }
  async function openLiveWindow(){
    // Inside StudioLive: the host app intercepts this and opens its own output window on this scene.
    if(studio){window.open('/overlay.html','_blank');$('live-window-status').textContent='Đã chuyển live sang Vua Tiếng Việt và mở màn hình phát của StudioLive.';return;}
    if(window.desktop){
      try{const size=await window.desktop.openOverlay();$('live-window-status').textContent=`Đã mở khung LIVE ${size.width} × ${size.height} px · tỉ lệ 9:16`;$('close-live-window').hidden=false;}catch(e){toast('Không mở được overlay: '+e.message);}return;
    }
    if(liveWindow&&!liveWindow.closed){fitLiveWindow();liveWindow.focus();return;}
    const height=Math.floor(Math.min(960,screen.availHeight-140)),width=Math.round(height*9/16);
    liveWindow=window.open('/overlay.html','vua-tieng-viet-live',`popup=yes,width=${width},height=${height},left=${Math.max(0,Math.round((screen.availWidth-width)/2))},top=30,resizable=yes,scrollbars=no`);
    if(!liveWindow){toast('Trình duyệt đang chặn cửa sổ bật lên. Hãy cho phép popup cho trang này.');return;}
    const report=()=>{if(!liveWindow||liveWindow.closed)return;const stage=liveWindow.document.getElementById('stage');const width=Math.round(stage?.clientWidth||liveWindow.innerWidth),height=Math.round(stage?.clientHeight||liveWindow.innerHeight);$('live-window-status').textContent=`Đã mở khung LIVE ${width} × ${height} px · tỉ lệ 9:16`;$('close-live-window').hidden=false;};
    liveWindow.addEventListener('load',()=>{fitLiveWindow();liveWindow.requestAnimationFrame(report);},{once:true});
    liveWindow.addEventListener('resize',report);fitLiveWindow();report();liveWindow.focus();
  }
  $('close-live-window').onclick=async()=>{try{if(window.desktop)await window.desktop.closeOverlay();else if(liveWindow&&!liveWindow.closed)liveWindow.close();liveWindow=null;$('live-window-status').textContent='Đã đóng cửa sổ LIVE.';$('close-live-window').hidden=true;}catch(e){toast(e.message);}};
  document.querySelectorAll('[data-open-live-window]').forEach(button=>button.onclick=openLiveWindow);
  let musicSaveTimer;
  $('music-volume').oninput=()=>{
    $('music-volume-value').textContent=$('music-volume').value+'%';clearTimeout(musicSaveTimer);
    musicSaveTimer=setTimeout(()=>send('config',{config:{musicVolume:Number($('music-volume').value)}}),250);
  };
  $('apply-music').onclick=()=>{
    const url=$('youtube-music-url').value.trim();
    if(url&&!youtubeVideoId(url))return toast('Nhập link YouTube hợp lệ hoặc để trống để dùng nhạc mặc định.');
    clearTimeout(musicSaveTimer);send('config',{config:{youtubeMusicUrl:url,musicEnabled:$('music-enabled').checked,musicVolume:Number($('music-volume').value)}});toast('Đã gửi cài đặt nhạc');
  };
  $('question-file').onchange=async()=>{
    importQuestions=null;$('import-bank').disabled=true;
    const file=$('question-file').files[0];if(!file){$('import-status').textContent='Chưa chọn file câu hỏi.';return;}
    try{
      if(file.size>512*1024)throw Error('File vượt 512 KB. Hãy chia nhỏ bộ câu hỏi.');
      const parsed=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
      if($('question-file').files[0]!==file)return;
      const rows=Array.isArray(parsed)?parsed:parsed?.questions;
      if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error('File cần chứa mảng từ 1 đến 1000 câu. Bạn có thể tải file mẫu phía trên.');
      importQuestions=rows;$('import-bank').disabled=false;$('import-status').textContent=`Đã chọn ${file.name}: ${rows.length} câu. Bấm Import để bổ sung vào bộ hiện tại.`;
    }catch(e){$('import-status').textContent=e instanceof SyntaxError?'File JSON không hợp lệ. Hãy kiểm tra theo file mẫu.':e.message;}
  };
  $('import-bank').onclick=()=>{
    if(!importQuestions||importPending)return;
    if(ws?.readyState!==WebSocket.OPEN)return toast('Chưa kết nối được máy chủ');
    if(new TextEncoder().encode(JSON.stringify({type:'import-questions',questions:importQuestions})).length>512*1024){$('import-status').textContent='Dữ liệu quá lớn. Hãy chia nhỏ file.';return;}
    importPending=true;$('import-bank').disabled=true;$('question-file').disabled=true;$('import-status').textContent='Đang kiểm tra và lưu câu hỏi…';send('import-questions',{questions:importQuestions});
  };
  $('connect-form').onsubmit=e=>{e.preventDefault();send('connect',{username:$('username').value});};
  for(const id of ['start','next','reveal','disconnect','stop-class'])$(id).onclick=()=>send(id);
  $('show-names').onchange=e=>{send('config',{config:{showNames:e.target.checked}});toast(e.target.checked?'Đang hiện tên học viên':'Đã ẩn tên học viên');};for(const b of document.querySelectorAll('[data-difficulty]'))b.onclick=()=>{send('config',{config:{difficulty:b.dataset.difficulty}});toast(state?.phase==='idle'?'Đã chọn độ khó':'Độ khó áp dụng từ câu kế tiếp');};$('pause').onclick=()=>send(state?.paused?'resume':'pause');$('hint-button').onclick=()=>send('hint');
  $('follow-live').onclick=()=>send('follow-live');
  $('demo').onclick=()=>{if(confirm('Chuyển sang chơi thử sẽ đặt lại điểm phiên hiện tại. Tiếp tục?'))send('demo');};
  $('reset').onclick=()=>{if(confirm('Xóa toàn bộ điểm của phiên hiện tại?'))send('reset');};
  $('activity-search').oninput=renderActivity;$('activity-filter').onchange=renderActivity;$('clear-activity').onclick=()=>send('clear-activity');
  $('simulate-gift').onclick=()=>send('gift-demo',{id:$('test-id').value.trim(),nickname:$('test-name').value.trim()});
  $('simulate-member').onclick=()=>send('member',{id:$('test-id').value.trim(),nickname:$('test-name').value.trim()});
  $('comment-form').onsubmit=e=>{e.preventDefault();send('comment',{id:$('test-id').value.trim(),nickname:$('test-name').value.trim(),text:$('test-comment').value});$('test-comment').value='';$('test-comment').focus();};
  $('config-form').onsubmit=e=>{e.preventDefault();send('config',{config:{roundSeconds:Number($('round-seconds').value),resultSeconds:Number($('result-seconds').value),points:Number($('base-points').value),autoNext:$('auto-next').checked,ignoreAccents:$('ignore-accents').checked,teacherAudio:$('teacher-audio').checked,audioVolume:Number($('audio-volume').value),musicEnabled:$('music-enabled').checked,musicVolume:Number($('music-volume').value),youtubeMusicUrl:$('youtube-music-url').value.trim()}});toast('Đã gửi cài đặt');};
  $('overlay-url').textContent=location.origin+'/overlay.html';$('copy-url').onclick=async()=>{const url=studio?.overlayURL||location.origin+'/overlay.html';try{if(window.desktop)await window.desktop.copyOverlayURL();else await navigator.clipboard.writeText(url);toast('Đã sao chép link màn hình LIVE');}catch{toast(url);}};
  if(window.desktop){
    $('desktop-data').hidden=false;
    window.desktop.getInfo().then(info=>{$('desktop-data-path').textContent=info.dataDir;}).catch(e=>toast(e.message));
    $('open-data-folder').onclick=()=>window.desktop.openDataFolder().catch(e=>toast(e.message));
  }
}
connect();
