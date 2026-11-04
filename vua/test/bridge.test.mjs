// StudioLive bridge: the host app owns the TikTok connection and feeds normalised events in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';

async function setup(t,extra={}){
  const dir=await mkdtemp(join(tmpdir(),'vua-bridge-'));
  await writeFile(join(dir,'questions.json'),JSON.stringify([{answer:'TIẾNG VIỆT',hint:'Ngôn ngữ'},{answer:'ĐOÀN KẾT',hint:'Chung lòng'}]));
  const calls=[];
  const bridge={studioPort:3000,overlayURL:'http://localhost:3000',connect:async u=>{calls.push(['connect',u]);return {ok:true};},disconnect:async()=>{calls.push(['disconnect']);},...extra};
  const app=await createApp({port:0,dataDir:dir,questionsPath:join(dir,'questions.json'),bridge});
  const port=app.server.address().port,sockets=[];
  t.after(async()=>{sockets.forEach(s=>s.terminate());await app.close();await rm(dir,{recursive:true,force:true});});
  const open=async(control=true,host='127.0.0.1')=>{
    const origin=`http://${host}:${port}`;
    const socket=new WebSocket(`ws://127.0.0.1:${port}/ws${control?'?role=control':''}`,{origin,headers:{host:`${host}:${port}`}});sockets.push(socket);
    const messages=[];socket.on('message',raw=>messages.push(JSON.parse(raw)));
    await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
    return {messages,send:m=>socket.send(JSON.stringify(m))};
  };
  return {app,calls,port,open};
}
const user=(uniqueId,nickname=uniqueId)=>({id:'9'+uniqueId,uniqueId,nickname,avatar:''});
const until=async fn=>{const end=Date.now()+2500;while(Date.now()<end){const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');};

test('ingest is ignored in demo and scores once StudioLive goes live',async t=>{
  const f=await setup(t);
  f.app.ingest({type:'chat',user:user('a'),text:'tiếng việt'});
  assert.equal(f.app.game.snapshot().participants.length,0);
  f.app.liveStatus({status:'live',username:'kenh'});
  f.app.game.start();const answer=f.app.game.questions[f.app.game.index].answer;
  f.app.ingest({type:'join',user:user('b','Bình')});
  f.app.ingest({type:'chat',user:user('a','An'),text:answer.toLowerCase()});
  const s=f.app.game.snapshot();
  assert.equal(s.participants.length,2);assert.equal(s.winner.nickname,'An');assert.equal(s.leaderboard[0].id,'live:a');
});

test('reconnecting pauses the round and live resumes it without resetting scores',async t=>{
  const f=await setup(t);
  f.app.liveStatus({status:'live',username:'kenh'});f.app.game.start();
  f.app.ingest({type:'chat',user:user('a'),text:f.app.game.questions[f.app.game.index].answer});
  f.app.liveStatus({status:'reconnecting',username:'kenh',message:'mất mạng'});
  assert.equal(f.app.game.paused,true);
  f.app.ingest({type:'chat',user:user('c'),text:'x'});
  assert.equal(f.app.game.snapshot().participants.length,1);
  f.app.liveStatus({status:'live',username:'kenh'});
  assert.equal(f.app.game.paused,false);assert.equal(f.app.game.leaderboard().length,1);
});

test('control connect goes through the host app; demo locks out host status',async t=>{
  const f=await setup(t),host=await f.open();
  await until(()=>host.messages.find(m=>m.studio?.overlayURL==='http://localhost:3000'));
  host.send({type:'connect',username:'@kenh_live'});
  await until(()=>f.calls.find(c=>c[0]==='connect'&&c[1]==='kenh_live'));
  f.app.liveStatus({status:'live',username:'kenh_live'});
  await until(()=>host.messages.find(m=>m.live?.status==='connected'));
  host.send({type:'demo'});await until(()=>host.messages.at(-1)?.live?.status==='demo');
  f.app.liveStatus({status:'live',username:'kenh_live'});
  assert.equal(host.messages.at(-1).live.status,'demo');
});

test('failed host connect is reported on the control page',async t=>{
  const f=await setup(t,{connect:async()=>({ok:false,message:'Kênh này hiện không phát live.'})}),host=await f.open();
  host.send({type:'connect',username:'kenh'});
  const m=await until(()=>host.messages.find(m=>m.live?.status==='disconnected'));
  assert.match(m.live.error,/không phát live/);
});

test('gift events from StudioLive show the thank-you notice',async t=>{
  const f=await setup(t);f.app.liveStatus({status:'live',username:'kenh'});
  f.app.ingest({type:'gift',user:user('g','Giang'),giftName:'Hoa hồng',repeatCount:5});
  f.app.ingest({type:'giftStreak',user:user('g','Giang'),giftName:'Hoa hồng',repeatCount:2});
  assert.equal(f.app.game.activityLog.filter(e=>e.type==='gift').length,1);
});

test('lvh.me host (TikTok LIVE Studio) is accepted and overlays can be sent back to StudioLive',async t=>{
  const f=await setup(t);
  assert.equal((await fetch(`http://127.0.0.1:${f.port}/overlay.html`,{headers:{host:`lvh.me:${f.port}`}})).status,200);
  const res=await fetch(`http://127.0.0.1:${f.port}/overlay.html`);
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'self' file:/);
  assert.equal((await fetch(`http://127.0.0.1:${f.port}/three.module.js`)).status,200);
  const control=await (await fetch(`http://127.0.0.1:${f.port}/control.html`)).text();
  assert.match(control,/studio-theme\.css/);assert.match(control,/class="control-page studio-embed"/);
  assert.equal((await fetch(`http://127.0.0.1:${f.port}/studio-theme.css`)).headers.get('content-type'),'text/css; charset=utf-8');
  const overlay=await f.open(false,'lvh.me');
  f.app.navigateOverlays();
  await until(()=>overlay.messages.find(m=>m.type==='navigate'&&m.port===3000));
});

test('follow-live leaves Chơi thử and adopts the StudioLive connection',async t=>{
  let cur={status:'idle',username:''};
  const f=await setup(t,{current:()=>cur}),host=await f.open();
  host.send({type:'follow-live'});
  await until(()=>host.messages.find(m=>m.live?.status==='disconnected'&&/Bảng điều khiển/.test(m.live.error)));
  host.send({type:'demo'});await until(()=>host.messages.at(-1)?.live?.status==='demo');
  cur={status:'live',username:'kenh'};
  host.send({type:'follow-live'});
  await until(()=>host.messages.find(m=>m.live?.status==='connected'&&m.live.username==='kenh'));
});
