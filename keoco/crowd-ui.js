import { finalTension } from './presentation.mjs';
import { CrowdAudio } from './crowd-audio.js';
import { LobbyMusic, lobbyMusicActive } from './lobby-music.js';
const cues={cheer:'./assets/stadium-crowd-02.mp3',clap:'./assets/stadium-crowd-04.mp3',applause:'./assets/stadium-crowd-05.mp3',tension:'./assets/stadium-crowd-09.mp3',whistle:'./assets/start-whistle.mp3',ko:'./assets/ko.mp3',1:'./assets/count-1.mp3',2:'./assets/count-2.mp3',3:'./assets/count-3.mp3'};
const cueStates=new WeakMap();
export function syncCrowd(audio, state, connected, now=Date.now()) {
  audio.setPulling(state?.phase === 'pull');
  audio.setPaused(!connected || !!state?.paused);
  let previous=cueStates.get(audio);if(!previous){previous={phase:null,tension:false,buffed:false};cueStates.set(audio,previous);}
  if(!connected||state?.paused){audio.stopCues?.();return;}
  const phase=state?.phase;
  if(phase!==previous.phase){
    audio.stopCues?.();previous.phase=phase;previous.tension=false;previous.buffed=false;previous.count=null;
    if(phase==='countdown')void audio.playCue?.(cues.clap,{gain:1.1});
    if(phase==='pull'){
      void audio.playCue?.(cues.whistle,{gain:1.6});
      void audio.playCue?.(cues.cheer,{gain:1.0,delaySeconds:.55});
    }
    if(phase==='result'){
      const won=(Number(state.score?.red)||0)!==(Number(state.score?.blue)||0);
      if(won){
        void audio.playCue?.(cues.ko,{gain:2});
        void audio.playCue?.(cues.cheer,{gain:1.2,delaySeconds:1.05});
      }
      void audio.playCue?.(cues.applause,{gain:1.1,delaySeconds:won?1.6:0});
    }
  }
  if(phase==='countdown'&&state.endsAt!=null){
    const count=Math.ceil((Number(state.endsAt)-now)/1000);
    if(count>=1&&count<=3&&count!==previous.count){
      previous.count=count;
      void audio.playCue?.(cues[count],{gain:1.8,expiresAt:Number(state.endsAt)-(count-1)*1000});
    }
  }
  const tense=finalTension(state,connected,now),buffed=phase==='pull'&&['red','blue'].some(side=>Number(state?.mana?.[side]?.buffUntil)>now);
  if(tense&&!previous.tension)void audio.playCue?.(cues.tension,{gain:1.2});
  if(buffed&&!previous.buffed)void audio.playCue?.(cues.clap,{gain:1.25});
  previous.tension=tense;previous.buffed=buffed;
}
if (typeof document !== 'undefined') {
  // Settings come from the control panel over the socket; the overlay has no on-screen audio controls.
  const audio = new CrowdAudio(), music = new LobbyMusic();
  let enabled = false, attempted = false;
  // silent=1: StudioLive's dashboard preview without sound. It stays muted and never reports audio status,
  // so the control panel keeps describing the real LIVE output window.
  const silent = new URLSearchParams(location.search).has('silent');
  const report = () => { if (attempted && !silent) globalThis.sendOverlay?.({ type: 'audio-status', status: enabled ? 'on' : 'blocked' }); };
  const settle = ok => { attempted = true; if (ok && !enabled) { enabled = true; void audio.preloadCues(Object.values(cues)); music.attach(audio.context); void audio.loadCue('./assets/lobby-music.mp3').then(buffer => music.useTrack(buffer), () => {}); } report(); return ok; };
  // Without a gesture this only starts when the browser allows autoplay (Chromium: --autoplay-policy=no-user-gesture-required);
  // resume() can stay pending instead of failing, hence the timeout.
  void Promise.race([audio.enable(), new Promise(resolve => setTimeout(() => resolve(false), 1500))]).then(settle);
  // Fallback: one click or key press on the overlay window starts it.
  const unlock = () => { if (!enabled) void audio.enable().then(settle); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  globalThis.reportOverlayAudio = report;
  globalThis.applyOverlayAudio = settings => { audio.setVolume(Number(settings?.volume) / 100); audio.setMuted(silent || !!settings?.muted); music.setVolume(Number(settings?.volume) / 100); music.setMuted(silent || !!settings?.muted); };
  if (silent) { audio.setMuted(true); music.setMuted(true); }
  globalThis.playOverlayAudioTest = () => { if (enabled) void audio.playCue(cues.whistle, { gain: 1.6 }); else report(); };
  if (globalThis.lastOverlayAudio) globalThis.applyOverlayAudio(globalThis.lastOverlayAudio);
  globalThis.isFinalTension = finalTension;
  const sync = (state, connected) => { syncCrowd(audio, state, connected); music.setActive(lobbyMusicActive(state, connected)); };
  globalThis.syncOverlayCrowd = sync;
  sync(globalThis.lastOverlayState, globalThis.overlayConnected === true);
  const cueClock=setInterval(()=>sync(globalThis.lastOverlayState,globalThis.overlayConnected===true),100);
  addEventListener('pagehide', () => { clearInterval(cueClock); delete globalThis.syncOverlayCrowd; music.destroy(); void audio.destroy(); }, {once:true});
}
