import {youtubeVideoId,musicVolume,useDefaultMusic} from './music-state.mjs';
import {shouldPlayStudyMusic} from './study-music.js';

let apiPromise;
function loadAPI(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
    const previous=window.onYouTubeIframeAPIReady;
    const timeout=setTimeout(()=>{script.remove();apiPromise=null;reject(Error('Không tải được YouTube'));},12000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);previous?.();resolve(window.YT);};
    script.onerror=()=>{clearTimeout(timeout);script.remove();apiPromise=null;reject(Error('Không kết nối được YouTube'));};
    document.head.append(script);
  });return apiPromise;
}

// The player stays visible in Control; the LIVE overlay contains no YouTube video.
export function createYouTubeMusic({local,host,button,status,load=loadAPI}){
  let state,ducked=false,muted=false,activated=false,failed=false,blocked=false,player,ready=false,started=false,videoId='',generation=0,fadeTimer,startTimer,currentVolume=0,targetVolume=-1,playing=false,pausedAt=0,retryTimer;
  const RETRY_MS=60000,OWN_PAUSE_MS=1500;
  function ramp(value){
    if(!ready||value===targetVolume)return;targetVolume=value;clearInterval(fadeTimer);
    const from=currentVolume,start=Date.now(),duration=value<from?180:650;
    fadeTimer=setInterval(()=>{
      const t=Math.min(1,(Date.now()-start)/duration);currentVolume=from+(value-from)*t;player?.setVolume(Math.round(currentVolume));
      if(t===1){clearInterval(fadeTimer);fadeTimer=null;}
    },40);
  }
  function sync(){
    const fallback=useDefaultMusic({videoId,activated,failed,blocked});
    local.duck(ducked);local.setMuted(muted);
    if(state)local.update({...state,config:{...state.config,musicEnabled:state.config.musicEnabled!==false&&(fallback||!started)}});
    const desired=shouldPlayStudyMusic(state)&&!muted&&!fallback;
    if(ready){
      ramp(desired?musicVolume(state?.config,ducked):0);
      if(desired&&!playing){playing=true;clearTimeout(startTimer);startTimer=setTimeout(()=>{failed=true;playing=false;sync();},10000);player.playVideo();}
      else if(!desired&&playing){playing=false;pausedAt=Date.now();clearTimeout(startTimer);player.pauseVideo();}
    }
    if(activated&&failed&&videoId&&!retryTimer)retryTimer=setTimeout(()=>{retryTimer=null;if(failed)void start();},RETRY_MS);
    button.textContent=activated&&!failed&&!blocked?'Thử lại YouTube':'Bật nhạc YouTube';
    if(!state)return;
    status.textContent=state.config.musicEnabled===false?'Đã tắt nhạc nền.':muted?'Âm thanh đang tắt từ overlay.':fallback?(failed||blocked?'YouTube không phát được · Đang dùng nhạc mặc định.':videoId?'Đang dùng nhạc mặc định · Bấm Bật nhạc YouTube để chuyển nguồn.':'Không có link YouTube · Dùng nhạc mặc định.'):
      !ready||!started?'Đang chờ YouTube · Dùng nhạc mặc định khi làm bài.':!shouldPlayStudyMusic(state)?'Nhạc tạm nghỉ · Chờ làm bài.':ducked?'Cô giáo đang nói · Đã hạ nhạc còn 20%.':'Đang phát nhạc YouTube khi làm bài.';
  }
  function destroy(){generation++;clearTimeout(retryTimer);retryTimer=null;clearInterval(fadeTimer);clearTimeout(startTimer);fadeTimer=null;ready=false;started=false;playing=false;targetVolume=-1;currentVolume=0;player?.destroy();player=null;host.replaceChildren();}
  async function start(){
    local.unlock();if(!videoId){sync();return;}
    destroy();activated=true;failed=false;blocked=false;const token=generation;sync();
    try{
      const YT=await load();if(token!==generation)return;
      const frame=document.createElement('iframe');frame.id='youtube-study-player';frame.title='Nhạc làm bài từ YouTube';frame.width='480';frame.height='270';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.src=`https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&playsinline=1&loop=1&playlist=${videoId}`;host.append(frame);
      player=new YT.Player(frame,{events:{
        onReady:event=>{if(token!==generation)return;player=event.target;ready=true;player.setVolume(0);sync();},
        onStateChange:event=>{
          if(token!==generation)return;
          if(event.data===1){clearTimeout(startTimer);started=true;blocked=false;failed=false;playing=true;if(!shouldPlayStudyMusic(state)||muted){playing=false;pausedAt=Date.now();player.pauseVideo();}sync();}
          else if(event.data===0){playing=false;if(shouldPlayStudyMusic(state)&&!muted){player.seekTo(0);player.playVideo();}}
          else if(event.data===3){clearTimeout(startTimer);startTimer=setTimeout(()=>{failed=true;playing=false;sync();},10000);}
          else if(event.data===2){playing=false;if(Date.now()-pausedAt>OWN_PAUSE_MS)sync();}
        },
        onAutoplayBlocked:()=>{if(token!==generation)return;blocked=true;playing=false;sync();},
        onError:()=>{if(token!==generation)return;failed=true;playing=false;sync();}
      }});
    }catch{if(token!==generation)return;failed=true;sync();}
  }
  button.onclick=start;
  return {
    update(s,voice={}){
      state=s;ducked=!!voice.ducked;muted=!!voice.muted;
      const id=youtubeVideoId(s.config.youtubeMusicUrl);
      if(id!==videoId){destroy();videoId=id;failed=false;blocked=false;if(activated&&id)void start();}
      sync();
    },
    disconnect(){if(state){state={...state,paused:true};sync();}},
    destroy
  };
}
