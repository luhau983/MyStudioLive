export const shouldPlayStudyMusic=s=>!!s&&s.phase==='playing'&&!s.paused&&s.config?.musicEnabled!==false;

export function createStudyMusic({stage=document.getElementById('stage')}={}){
  let context,master,filter,timer,state,muted=false,ducked=false,active=false,step=0,next=0;
  const melody=[72,76,79,76,74,76,79,81,69,72,76,72,71,72,76,79,69,72,77,76,72,69,72,76,67,71,74,79,76,74,71,67];
  const bass=[48,45,41,43];
  function status(){stage.dataset.music=state?.config?.musicEnabled===false?'off':muted?'muted':!context||context.state!=='running'?'locked':active?'playing':'paused';}
  function volume(){if(master&&context){const level=active&&!muted?(state?.config?.musicVolume??16)/100*(ducked?.22:1):0;master.gain.setTargetAtTime(level,context.currentTime,.13);}status();}
  function note(midi,at,duration,level,type='triangle'){
    const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type=type;oscillator.frequency.value=440*2**((midi-69)/12);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.025);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,level*.18),at+.25);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain);gain.connect(filter);oscillator.start(at);oscillator.stop(at+duration+.03);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  function schedule(){
    if(!context||context.state!=='running'||!active||muted)return;
    // Hidden tabs throttle timers to ~1s, so schedule further ahead to avoid gaps.
    const ahead=document.hidden?1.5:.18;
    while(next<context.currentTime+ahead){const i=step%melody.length;note(melody[i],next,.72,.17);if(step%4===0){const root=bass[Math.floor(i/8)];note(root,next,1.4,.18,'sine');note(root+7,next,1.25,.05,'sine');}next+=60/86/2;step++;}
  }
  function sync(){
    const desired=shouldPlayStudyMusic(state)&&!muted;
    if(desired!==active){active=desired;clearInterval(timer);timer=null;if(active&&context?.state==='running'){step=0;next=context.currentTime+.05;schedule();timer=setInterval(schedule,100);}}
    if(active&&context?.state==='running'&&!timer){step=0;next=context.currentTime+.05;schedule();timer=setInterval(schedule,100);}volume();
  }
  async function unlock(){
    try{
      if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context=new Audio();master=context.createGain();master.gain.value=0;filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2400;filter.connect(master);const compressor=context.createDynamicsCompressor();master.connect(compressor);compressor.connect(context.destination);context.onstatechange=sync;}
      if(context.state==='suspended')await context.resume();sync();
    }catch{stage.dataset.music='blocked';}
  }
  document.addEventListener('pointerdown',()=>{if(!muted)unlock();},{once:true});
  return {update:s=>{state=s;sync();},unlock,setMuted:value=>{muted=value;sync();},duck:value=>{ducked=value;volume();}};
}
