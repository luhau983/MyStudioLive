// Captions mirror audio/lines.json; regenerate clips with scripts/generate-audio.mjs after editing.
const lines={welcome:'Hế lô cả lớp! Lớp Vua Tiếng Việt vào học rồi nè. Comment đáp án thật nhanh để lên bảng vàng nha!', 'next-1':'Từ mới lên sóng rồi nè! Cả lớp soi bảng lẹ lẹ nha!', 'next-2':'Câu mới tới rồi! Xếp chữ thần tốc, ai nhanh người đó thắng nha!', 'next-3':'Sẵn sàng chưa cả nhà? Bung lụa với từ tiếp theo nào!', 'correct-1':'Đỉnh quá trời! Chuẩn không cần chỉnh, cả lớp thả tim cho bạn nào!', 'correct-2':'Ối dồi ôi, nhanh dữ vậy! Bạn này xịn thiệt sự luôn!', 'correct-3':'Chính xác luôn! Cô cộng điểm liền tay nè!', hurry:'Mười giây cuối nha! Nhanh tay lên kẻo lỡ nè!', timeout:'Hết giờ mất tiêu! Không sao, cùng xem đáp án nha!', hint:'Cô hé lộ thêm một chữ nè, giờ thì dễ ợt rồi nha!', pause:'Giải lao xíu nha cả lớp, nhớ quay lại liền đó!', resume:'Quay lại rồi nè! Tiếp tục quẩy thôi cả lớp ơi!', reveal:'Cô bật mí luôn nè! Nhìn lên bảng xem ai đoán trúng nha!', 'gift-1':'Trời ơi quà xịn quá! Cô cảm ơn em nhiều nha, thương ghê!', 'gift-2':'Cảm ơn em đã tiếp năng lượng cho lớp mình nha! Cô vui xỉu luôn!', 'gift-3':'Quà xinh xỉu! Cả lớp cùng cảm ơn bạn một tràng pháo tay nào!'};
// gTTS clips are slow for a LIVE pace; speed up playback while keeping the voice pitch.
const TEACHER_RATE=1.5;
export function createTeacherAudio(classroom,music,{silent=false}={}){
  const button=document.getElementById('enable-teacher-audio'),caption=document.getElementById('teacher-caption'),audio=new Audio();audio.preload='auto';audio.preservesPitch=true;audio.defaultPlaybackRate=audio.playbackRate=TEACHER_RATE;let last=null,enabled=false,muted=false,serial=0,warnedRound=-1,currentClip='',pending=null,talking=false,thanks=null,giftCount=0;
  audio.id='teacher-voice';audio.hidden=true;document.body?.append(audio);
  function stop(){talking=false;audio.pause();audio.currentTime=0;classroom.speaking(false);music?.duck(false);}
  function repaint(){button.hidden=silent||last?.config.teacherAudio===false;const label=enabled&&!muted?'Tắt âm thanh':'Bật âm thanh';button.textContent='♫';button.title=label;button.ariaLabel=label;button.classList.toggle('enabled',enabled);button.classList.toggle('muted',!enabled||muted);}
  async function play(clip,force=false){
    currentClip=clip;caption.textContent=lines[clip]||'';if(silent||!last?.config.teacherAudio&&!force)return;
    if(muted&&!force)return;const token=++serial;stop();audio.src='/audio/'+clip+'.mp3';audio.playbackRate=TEACHER_RATE;audio.volume=(last?.config.audioVolume??70)/100;
    try{await audio.play();if(token!==serial)return;talking=true;enabled=true;classroom.speaking(true);music?.duck(true);repaint();}catch(e){if(token!==serial||e.name==='AbortError')return;enabled=false;pending=clip;repaint();}
  }
  audio.onended=()=>{talking=false;classroom.speaking(false);music?.duck(false);if(thanks){const clip=thanks;thanks=null;play(clip);}};audio.onerror=()=>{talking=false;thanks=null;classroom.speaking(false);music?.duck(false);caption.textContent='Cô mời cả lớp nhìn lên bảng và bình luận đáp án nhé!';};
  button.onclick=()=>{if(enabled&&!muted){muted=true;serial++;stop();music?.setMuted(true);}else{muted=false;music?.setMuted(false);music?.unlock();if(last?.config.teacherAudio!==false)play(pending||currentClip||'welcome',true);else enabled=true;pending=null;}repaint();};
  function update(s){
    const prev=last;last=s;audio.volume=(s.config.audioVolume??70)/100;
    if(s.config.teacherAudio===false){serial++;stop();button.hidden=s.config.musicEnabled===false;repaint();return;}button.hidden=false;
    if(!prev){play(s.phase==='idle'?'welcome':s.phase==='result'?(s.winner?'correct-1':s.reason==='timeout'?'timeout':'reveal'):'next-1');return;}
    if(s.phase==='idle'&&prev.phase!=='idle'){warnedRound=-1;play('welcome');}
    else if(s.paused!==prev.paused){play(s.paused?'pause':'resume');}
    else if(s.round!==prev.round&&s.phase==='playing'){warnedRound=-1;play('next-'+((s.round-1)%3+1));}
    else if(s.phase==='result'&&prev.phase!=='result'){play(s.winner?'correct-'+((s.round-1)%3+1):s.reason==='timeout'?'timeout':'reveal');}
    else if(s.hints>prev.hints&&s.phase==='playing'){play('hint');}
    else if(s.phase==='playing'&&!s.paused&&s.remaining<=10&&warnedRound!==s.round){warnedRound=s.round;play('hurry');}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){serial++;stop();}});
  // Thank-you waits for the current line instead of cutting off game narration.
  function thank(){
    if(silent||muted||last?.config.teacherAudio===false)return;
    const clip='gift-'+(giftCount++%3+1);
    if(talking)thanks=clip;else play(clip);
  }
  return {update,thank,test:()=>play('welcome',true)};
}
