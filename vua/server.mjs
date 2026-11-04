import http from 'node:http';
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {WebSocketServer,WebSocket} from 'ws';
import {WordGame,validateConfig,CLASS_CAPACITY} from './engine.mjs';
import {saveImportedQuestions} from './question-import.mjs';
import {VoiceSignals} from './music-state.mjs';
import {GiftFeed} from './gift-feed.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const files={'/':'control.html','/control.html':'control.html','/overlay.html':'overlay.html','/app.js':'app.js','/style.css':'style.css'};
for(const file of ['classroom.js','classroom.css','teacher-audio.js','characters.js','auditorium.js','study-music.js'])files['/'+file]=file;
files['/youtube-music.js']='youtube-music.js';files['/studio-theme.css']='studio-theme.css';files['/music-state.mjs']='music-state.mjs';
files['/entrance.mjs']='entrance.mjs';
files['/auditorium-layout.mjs']='auditorium-layout.mjs';
files['/questions-template.json']='questions-template.json';
// Resolve three from whichever node_modules the host app installed it in (StudioLive keeps vua/ one level down).
const threeModule=createRequire(import.meta.url).resolve('three').replace(/three\.cjs$/,'three.module.js');
for(const name of ['open-sans.ttf','open-sans-italic.ttf','plus-jakarta-sans.ttf'])files['/fonts/'+name]='fonts/'+name;
for(const clip of ['welcome','next-1','next-2','next-3','correct-1','correct-2','correct-3','hurry','timeout','hint','pause','resume','reveal','gift-1','gift-2','gift-3'])files[`/audio/${clip}.mp3`]=`audio/${clip}.mp3`;
const load=async(file,fallback)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
/*
 * bridge (StudioLive): the host app owns the single TikTok connection. Instead of a Connector,
 * pass {connect(username), disconnect(), studioPort, overlayURL}; the host then feeds events
 * through ingest() and connection changes through liveStatus().
 */
export async function createApp({port=3001,dataDir=join(root,'data'),questionsPath=join(root,'questions.json'),Connector,retryMs=5000,bridge=null}={}) {
  let RoomIdRouteConfig;
  if(!bridge&&!Connector)({TikTokLiveConnection:Connector,RoomIdRouteConfig}=await import('tiktok-live-connector'));
  const hosts=['127.0.0.1','localhost',...(bridge?['lvh.me']:[])];
  // StudioLive embeds the control and preview pages in its dashboard (a file:// page).
  const frameAncestors=bridge?"'self' file:":"'self'";
  await mkdir(dataDir,{recursive:true}); let queue=Promise.resolve(),closed=false;
  const save=(name,value)=>{const content=JSON.stringify(value,null,2);queue=queue.then(async()=>{const p=join(dataDir,name);await writeFile(p+'.tmp',content);await rename(p+'.tmp',p);}).catch(e=>broadcast({type:'error',message:'Không lưu được dữ liệu: '+e.message}));};
  const game=new WordGame({questions:await load(questionsPath,[]),config:await load(join(dataDir,'config.json'),{}),scores:await load(join(dataDir,'scores.json'),[]),onScore:s=>save('scores.json',s)});
  let importQueue=Promise.resolve();
  let live={status:'demo',username:'',error:''},connector,generation=0,retry,pausedForLive=false;
  const wss=new WebSocketServer({noServer:true,maxPayload:512*1024}),voices=new VoiceSignals(),gifts=new GiftFeed();
  const send=(ws,data)=>{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>1024*1024)return ws.terminate();ws.send(JSON.stringify(data));};
  function broadcast(data){for(const ws of wss.clients)send(ws,data);}
  function sendState(){const music=voices.snapshot(),gift=gifts.snapshot();for(const ws of wss.clients){const snapshot=game.snapshot(ws.control);if(ws.control){if(ws.activityVersion===game.activityVersion)delete snapshot.activityLog;else ws.activityVersion=game.activityVersion;}send(ws,{type:'state',game:snapshot,live,gift,...(ws.control?{music}:{})});}}
  const detach=()=>{generation++;clearTimeout(retry);const old=connector;connector=null;if(old)Promise.resolve().then(()=>old.disconnect()).catch(()=>{});};
  function attempt(token){
    if(closed||token!==generation)return;
    let ended=false;const c=connector=new Connector(live.username,{processInitialData:false,enableExtendedGiftInfo:false});
    const valid=()=>!ended&&!closed&&token===generation&&connector===c;
    const lost=(message)=>{if(!valid())return;ended=true;Promise.resolve().then(()=>c.disconnect()).catch(()=>{});if(!game.paused){game.pause();pausedForLive=game.paused;}live.status='reconnecting';live.error=String(message).slice(0,240);sendState();clearTimeout(retry);retry=setTimeout(()=>attempt(token),retryMs);};
    const seen=new Set();
    c.on('member',d=>{if(!valid()||live.status!=='connected')return;if(d.action!=null&&![1,3].includes(Number(d.action)))return;game.join({id:d.user?.uniqueId||d.user?.displayId||d.uniqueId,nickname:d.user?.nickname||d.nickname});sendState();});
    c.on('chat',d=>{if(!valid()||live.status!=='connected')return;const msg=d.common?.msgId??d.msgId;if(msg){const k=String(msg);if(seen.has(k))return;seen.add(k);if(seen.size>5000)seen.delete(seen.values().next().value);}game.comment({id:d.user?.uniqueId||d.user?.displayId||d.uniqueId,nickname:d.user?.nickname||d.nickname,text:d.content??d.comment});sendState();});
    c.on('gift',d=>{if(!valid()||live.status!=='connected')return;const event=gifts.accept(d);if(event){game.record('gift',{userId:event.userId,nickname:event.nickname,text:`${event.giftName} ×${event.count}`,simulated:false});sendState();}});
    c.on('disconnected',()=>lost('Mất kết nối LIVE. Đang thử lại…'));
    c.on('streamEnd',()=>lost('LIVE đã kết thúc. Đang chờ kết nối lại…'));
    c.on('error',e=>{if(valid()){live.error=String(e?.message||e).slice(0,240);sendState();}});
    Promise.resolve().then(()=>c.connect()).then(()=>{if(!valid())return Promise.resolve(c.disconnect()).catch(()=>{});live.status='connected';live.error='';if(pausedForLive){game.resume();pausedForLive=false;}sendState();}).catch(e=>lost(e.message));
  }
  const server=http.createServer(async(req,res)=>{
    if(!allowedHost(req.headers.host)||(req.headers.origin&&!allowedOrigin(req.headers.origin))){res.writeHead(403);return res.end('Forbidden');}
    const pathname=req.url?.split('?')[0],file=pathname==='/three.module.js'?threeModule:files[pathname];if(!file){res.writeHead(404);return res.end('Not found');}
    try{let body=await readFile(file===threeModule?file:join(root,file));
      // Embedded in StudioLive: dark theme matching its dashboard (see studio-theme.css).
      if(bridge&&file==='control.html')body=Buffer.from(body.toString('utf8').replace('</head>','<link rel="stylesheet" href="/studio-theme.css"></head>').replace('<body class="control-page">','<body class="control-page studio-embed">'));res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json; charset=utf-8':file.endsWith('.ttf')?'font/ttf':file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws:; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src 'self' https://www.youtube.com; style-src 'self'; frame-ancestors "+frameAncestors+"; base-uri 'none'; form-action 'self'",'Referrer-Policy':'strict-origin-when-cross-origin'});res.end(body);}catch{res.writeHead(500);res.end('File error');}
  });
  const allowedHost=h=>hosts.some(n=>h===`${n}:${port}`);
  const allowedOrigin=o=>hosts.some(n=>o===`http://${n}:${port}`);
  server.on('upgrade',(req,socket,head)=>{if(!['/ws','/ws?role=control'].includes(req.url)||!allowedHost(req.headers.host)||!allowedOrigin(req.headers.origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>{ws.control=req.url.includes('role=control');wss.emit('connection',ws);});});
  wss.on('connection',ws=>{
    send(ws,{type:'state',game:game.snapshot(ws.control),live,gift:gifts.snapshot(),...(ws.control?{music:voices.snapshot()}:{}),...(ws.control&&bridge?{studio:{overlayURL:bridge.overlayURL||''}}:{})});ws.activityVersion=game.activityVersion;let windowAt=Date.now(),count=0;
    ws.on('message',async raw=>{try{
      if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}if(++count>20)throw Error('Thao tác quá nhanh');
      const m=JSON.parse(raw.toString());
      if(m.type==='teacher-voice'&&!ws.control){voices.update(ws,m);return;}
      if(!ws.control)throw Error('Màn hình LIVE chỉ dùng để hiển thị');
      switch(m.type){
        case 'start':case 'next':if(!['demo','connected'].includes(live.status))throw Error('Hãy kết nối LIVE hoặc chuyển sang Chơi thử');game.start();break;
        case 'pause':game.pause();break;
        case 'stop-class':game.stopClass();break;
        case 'resume':if(!['demo','connected'].includes(live.status))throw Error('Đang chờ kết nối LIVE');game.resume();pausedForLive=false;break;
        case 'reveal':game.finish();break;
        case 'hint':game.hint();break;
        case 'clear-activity':game.clearActivity();break;
        case 'reset':game.reset();gifts.clear();pausedForLive=false;break;
        case 'config':game.config={...game.config,...validateConfig(m.config)};save('config.json',game.config);break;
        case 'import-questions':{
          const job=importQueue.then(async()=>{
            const result=await saveImportedQuestions(questionsPath,game.questions,m.questions);
            if(result.added)game.replaceQuestionBank(result.questions);
            send(ws,{type:'import-result',added:result.added,duplicates:result.duplicates,total:result.total});sendState();
          });
          importQueue=job.catch(()=>{});await job;break;
        }
        case 'comment':if(live.status!=='demo')throw Error('Comment thử chỉ dùng ở chế độ Chơi thử');game.comment({id:m.id,nickname:m.nickname,text:m.text,simulated:true});break;
        case 'member':{if(live.status!=='demo')throw Error('Vào lớp thử chỉ dùng ở chế độ Chơi thử');const outcome=game.join({id:m.id,nickname:m.nickname,simulated:true});if(outcome==='full')throw Error(`Lớp đã đủ ${CLASS_CAPACITY} người, không còn chỗ trống`);if(outcome==='invalid')throw Error('ID người chơi không hợp lệ');break;}
        case 'gift-demo':{if(live.status!=='demo')throw Error('Quà thử chỉ dùng ở chế độ Chơi thử');const event=gifts.accept({uniqueId:m.id,nickname:m.nickname,giftName:'Hoa hồng',repeatCount:1},{simulated:true});if(!event)throw Error('ID người tặng không hợp lệ');game.record('gift',{userId:event.userId,nickname:event.nickname,text:`${event.giftName} ×${event.count}`,simulated:true});break;}
        case 'connect':{const username=String(m.username||'').trim().replace(/^@/,'');if(!/^[a-zA-Z0-9._]{1,24}$/.test(username))throw Error('Username TikTok không hợp lệ');detach();game.reset();gifts.clear();pausedForLive=false;live={status:'connecting',username,error:''};if(bridge){demoLock=false;bridgeConnect(username);}else attempt(generation);break;}
        case 'disconnect':detach();game.pause();live={...live,status:'disconnected',error:''};if(bridge)Promise.resolve().then(()=>bridge.disconnect()).catch(()=>{});break;
        case 'demo':detach();game.reset();gifts.clear();pausedForLive=false;live={status:'demo',username:'',error:''};demoLock=true;break;
        // Embedded in StudioLive: leave Chơi thử and follow the dashboard's TikTok connection again.
        case 'follow-live':{if(!bridge)throw Error('Lệnh không hợp lệ');demoLock=false;const cur=bridge.current?.()||{status:'idle'};if(cur.status==='idle'||cur.status==='ended'||cur.status==='error'){game.pause();live={status:'disconnected',username:cur.username||'',error:'Chưa kết nối LIVE. Nhập username và bấm Kết nối ở Bảng điều khiển của StudioLive.'};}else{if(live.status==='demo')live={status:'disconnected',username:'',error:''};liveStatus(cur);}break;}
        default:throw Error('Lệnh không hợp lệ');
      }sendState();
    }catch(e){send(ws,{type:'error',message:e.message});}});
    ws.on('close',()=>{voices.remove(ws);if(!closed)sendState();});
  });
  if(RoomIdRouteConfig)RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute=true;
  // ---- StudioLive bridge ----
  // demoLock: the host chose Chơi thử / Ngắt kết nối here, so StudioLive connection changes are ignored until they press Kết nối again.
  let demoLock=false;
  function bridgeConnect(username){
    Promise.resolve().then(()=>bridge.connect(username)).then(r=>{if(r&&r.ok===false&&!demoLock&&live.status==='connecting'){live={...live,status:'disconnected',error:String(r.message||'Không kết nối được LIVE').slice(0,240)};sendState();}}).catch(e=>{if(!demoLock){live={...live,status:'disconnected',error:String(e?.message||e).slice(0,240)};sendState();}});
  }
  // StudioLive statuses: idle | connecting | live | reconnecting | ended | error
  function liveStatus({status,username='',message=''}={}){
    if(!bridge||closed||demoLock)return;
    const was=live.status;
    if(status==='live'){
      // First time on air (or a different channel): drop demo scores, like the standalone Kết nối button does.
      if(was==='demo'||was==='disconnected'||(live.username&&username&&live.username!==username)){game.reset();gifts.clear();pausedForLive=false;}
      live={status:'connected',username:username||live.username,error:''};
      if(pausedForLive){game.resume();pausedForLive=false;}
    }else if(status==='connecting'){if(was==='demo')return;live={status:'connecting',username:username||live.username,error:''};}
    else if(status==='reconnecting'||status==='ended'||status==='error'){
      if(was==='demo')return;
      if(!game.paused){game.pause();pausedForLive=game.paused;}
      live={status:status==='reconnecting'?'reconnecting':'disconnected',username:username||live.username,error:String(message||'').slice(0,240)};
    }else if(status==='idle'){if(was==='demo')return;if(!game.paused){game.pause();pausedForLive=game.paused;}live={...live,status:'disconnected',error:''};}
    sendState();
  }
  // Events already normalised by StudioLive's LiveService ({type,user:{id,uniqueId,nickname},text,...}).
  function ingest(ev){
    if(!bridge||closed||live.status!=='connected'||!ev||!ev.user)return;
    const id=String(ev.user.uniqueId||ev.user.id||''),nickname=ev.user.nickname;if(!id)return;
    if(ev.type==='chat')game.comment({id,nickname,text:String(ev.text??'')});
    else if(ev.type==='join')game.join({id,nickname});
    else if(ev.type==='gift'){const event=gifts.accept({uniqueId:id,nickname,giftName:ev.giftName,repeatCount:ev.repeatCount});if(!event)return;game.record('gift',{userId:event.userId,nickname:event.nickname,text:`${event.giftName} ×${event.count}`,simulated:false});}
    else return;
    sendState();
  }
  // Send overlays opened through StudioLive (marked ?sl=1) back to the StudioLive scene when another scene goes on air.
  function navigateOverlays(){for(const ws of wss.clients)if(!ws.control)send(ws,{type:'navigate',port:bridge?.studioPort});}
  if(bridge?.initialStatus)liveStatus(bridge.initialStatus);
  const timer=setInterval(()=>{game.tick();sendState();},200);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}).catch(e=>{clearInterval(timer);throw e;});
  port=server.address().port;
  return {server,game,ingest,liveStatus,navigateOverlays,close:async()=>{closed=true;detach();clearInterval(timer);for(const ws of wss.clients)ws.terminate();wss.close();const stopped=new Promise(r=>server.close(r));server.closeAllConnections();await stopped;await importQueue;await queue;}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)createApp({port:Number(process.env.PORT||3001)}).then(()=>console.log('Vua Tiếng Việt: http://127.0.0.1:'+(process.env.PORT||3001)+'/control.html')).catch(e=>{console.error(e);process.exitCode=1;});
