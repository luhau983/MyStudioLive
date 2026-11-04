export const DEFAULT_YOUTUBE_URL='https://www.youtube.com/watch?v=rrZlxX1FsOU';
export function youtubeVideoId(value){
  if(!value)return '';
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
    const host=url.hostname.toLowerCase();
    const id=host==='youtu.be'?url.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(host)?(url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)$/)?.[1]):'';
    return /^[\w-]{11}$/.test(id||'')?id:'';
  }catch{return '';}
}
export const musicVolume=(config,ducked)=>Math.round(Math.min(100,Math.max(0,config?.musicVolume??16))*(ducked?.2:1));
export const useDefaultMusic=({videoId,activated,failed,blocked})=>!videoId||!activated||failed||blocked;

// Overlay heartbeats expire if a browser disappears without sending an end event.
export class VoiceSignals{
  constructor(now=Date.now){this.now=now;this.sources=new Map();}
  update(source,{speaking,muted}){
    if(typeof speaking!=='boolean'||typeof muted!=='boolean')throw Error('Trạng thái âm thanh không hợp lệ');
    this.sources.set(source,{speaking,muted,at:this.now()});
  }
  remove(source){this.sources.delete(source);}
  snapshot(){
    const now=this.now();for(const [source,value] of this.sources)if(now-value.at>3500)this.sources.delete(source);
    return {ducked:[...this.sources.values()].some(s=>s.speaking),muted:[...this.sources.values()].some(s=>s.muted)};
  }
}
