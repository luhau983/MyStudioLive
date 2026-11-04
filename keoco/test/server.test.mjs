import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { validateConfig, createApp } from '../server.mjs';

test('config rejects invalid values and unknown keys', () => {
  assert.throws(() => validateConfig({ pullSeconds: -1 }));
  assert.throws(() => validateConfig({ evil: 1 }));
  assert.deepEqual(validateConfig({ pullSeconds: 60 }), { pullSeconds: 60 });
});

class FakeEngine {
  constructor({config,onResult}) { this.config=config; this.onResult=onResult; this.events=[]; }
  snapshot() { return {config:this.config,events:this.events}; }
  tick() {} comment(e) {this.events.push(e);} like(e) {this.events.push(e);} gift(e) {this.events.push(e);} start() {} stop() {} reset() {} configure(c) {this.config=c;}
}
class FakeConnector extends EventEmitter { constructor() { super(); FakeConnector.instance=this; } connect() { return new Promise(resolve=>{this.resolve=resolve;}); } disconnect() { return Promise.resolve(); } }
async function freePort() { const s=createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
function request(port,path,headers={}) { return new Promise((resolve,reject)=>{ http.get({host:'127.0.0.1',port,path,headers},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject); }); }
function next(ws,predicate) { return new Promise((resolve,reject)=>{ const timer=setTimeout(()=>{ws.off('message',handle);reject(Error('timeout'));},2000); function handle(data) { const v=JSON.parse(data); if(predicate(v)) {clearTimeout(timer);ws.off('message',handle);resolve(v);} } ws.on('message',handle); }); }

test('HTTP and WebSocket enforce origin, host and static allowlist; simulation locks while connecting', async t=>{
  const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
  writeFileSync(join(dir,'control.html'),'ok'); writeFileSync(join(dir,'control.css'),'css'); writeFileSync(join(dir,'overlay.css'),'css');
  const app=await createApp({port,Engine:FakeEngine,Connector:FakeConnector,dataDir:dir,staticDir:dir});
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  assert.equal(await request(port,'/control.html'),200);
  assert.equal(await request(port,'/control.css'),200);
  assert.equal(await request(port,'/overlay.css'),200);
  assert.equal(await request(port,'/stats.json'),404);
  assert.equal(await request(port,'/match-history.jsonl'),404);
  assert.equal(await request(port,'/',{host:`evil.test:${port}`}),403);
  assert.equal(await request(port,'/',{origin:'http://evil.test'}),403);
  const bad=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:'http://evil.test'}); bad.on('error',()=>{}); const [,response]=await once(bad,'unexpected-response'); assert.equal(response.statusCode,403);
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
  let wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'test'})); await wait;
  wait=next(ws,v=>v.type==='error'); ws.send(JSON.stringify({type:'simulate',event:'like',count:1})); assert.match((await wait).message,/giả lập/); assert.equal(app.engine.events.length,0);
  wait=next(ws,v=>v.type==='state' && v.live.status==='disconnected'); ws.send(JSON.stringify({type:'disconnect'})); await wait;
  app.engine.onResult({winner:'red',mvp:{red:{uniqueId:'a',nickname:'A'},blue:null}});
  assert.equal(JSON.parse(readFileSync(join(dir,'stats.json'))).wins.red,1);
  wait=next(ws,v=>v.type==='state' && v.state.events.length===1); ws.send(JSON.stringify({type:'simulate',event:'like',count:1})); await wait;
  ws.close();
});

test('simulation is excluded from stats and cleared before a live connection', async t=>{
  const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
  const app=await createApp({port,Connector:FakeConnector,dataDir:dir});
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
  let wait=next(ws,v=>v.type==='state' && v.state.players.length===1); ws.send(JSON.stringify({type:'simulate',event:'comment',count:1})); await wait;
  app.engine.onResult({winner:'red',mvp:{red:{uniqueId:'sim_1',nickname:'Test'},blue:null}});
  assert.throws(()=>readFileSync(join(dir,'stats.json')),{code:'ENOENT'});
  wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'test'}));
  const state=await wait; assert.equal(state.state.players.length,0); assert.equal(state.state.score.red,0); ws.close();
});

test('disconnect before connect resolves cannot incorrectly report connected', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 const app=await createApp({port,Engine:FakeEngine,Connector:FakeConnector,dataDir:dir,retryMs:1000});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
 let wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'test'})); await wait;
 const c=FakeConnector.instance; wait=next(ws,v=>v.type==='state' && v.live.status==='reconnecting'); c.emit('disconnected'); await wait;
 c.resolve(); await new Promise(r=>setTimeout(r,30));
 wait=next(ws,v=>v.type==='state'); const state=await wait; assert.equal(state.live.status,'reconnecting'); ws.close();
});

test('simulated gift sends a bounded notification and activity log', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 const app=await createApp({port,Connector:FakeConnector,dataDir:dir});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
 const gift=next(ws,v=>v.type==='gift'), log=next(ws,v=>v.type==='log' && /quà/i.test(v.message));
 ws.send(JSON.stringify({type:'simulate',event:'gift',count:1}));
 assert.deepEqual(await gift,{type:'gift',nickname:'Test 1',team:'red',mode:'pvp',simulated:true}); assert.match((await log).message,/Test 1/); ws.close();
});

test('live gift notifications exclude private payloads and limit bursts', async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'test'}); await settle(); FakeConnector.instance.resolve(); await settle();
 const payload=liveGift('private-id',{user:{displayId:'private-id',nickname:'A\n'+'x'.repeat(100),avatarThumb:{urlList:['secret']}}});
 FakeConnector.instance.emit('gift',payload); FakeConnector.instance.emit('gift',payload);
 const gifts=ws.messages.filter(m=>m.type==='gift'); assert.equal(gifts.length,1);
 assert.deepEqual(Object.keys(gifts[0]).sort(),['giftCount','mode','nickname','team','type']);
 assert.equal(gifts[0].nickname.length,80); assert.ok(!gifts[0].nickname.includes('\n'));
 assert.ok(!JSON.stringify(gifts).includes('secret')); assert.equal(app.engine.players.size,1);
});

test('connector v2.5 protobuf gift payload maps value and streak flag', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 const app=await createApp({port,Engine:FakeEngine,Connector:FakeConnector,dataDir:dir});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
 let wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'test'})); await wait;
 FakeConnector.instance.emit('gift',{user:{displayId:'alice',nickname:'Alice',avatarThumb:{urlList:['photo']}},gift:{type:1,diamondCount:5},repeatCount:3,repeatEnd:0});
 assert.deepEqual(app.engine.events[0],{live:true,uniqueId:'alice',nickname:'Alice',avatar:'photo',giftId:undefined,groupId:undefined,msgId:undefined,diamondCount:5,giftCount:3,repeatCount:3,repeatEnd:false,streakable:true}); ws.close();
});

test('connector member events refresh known player activity using v2.5 user fields', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 const app=await createApp({port,Connector:FakeConnector,dataDir:dir});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
 const wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'test'})); await wait;
 app.engine.comment({uniqueId:'alice',comment:'do'}); const old=app.engine.players.get('alice').lastActivity;
 await new Promise(r=>setTimeout(r,10)); FakeConnector.instance.emit('member',{user:{displayId:'alice',nickname:'Alice'},action:1});
 assert.ok(app.engine.players.get('alice').lastActivity>old); assert.equal(app.engine.players.get('alice').nickname,'Alice'); ws.close();
});

test('inactivity timeout configuration is validated',()=>{
 assert.deepEqual(validateConfig({inactivitySeconds:300}),{inactivitySeconds:300});
 assert.throws(()=>validateConfig({inactivitySeconds:0}));
});


test('the last LIVE room reconnects after a restart until the operator disconnects', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let app=await createApp({port,Connector:FakeConnector,dataDir:dir});
 let ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
 let wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'@Host.Live'})); await wait;
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'live.json'),'utf8')),{username:'Host.Live'});
 ws.close(); await app.close();
 FakeConnector.instance=null; app=await createApp({port,Connector:FakeConnector,dataDir:dir});
 assert.ok(FakeConnector.instance,'a connector starts without any operator command');
 ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`});
 wait=next(ws,v=>v.type==='state' && v.live.status==='connecting' && v.live.username==='Host.Live'); await wait;
 wait=next(ws,v=>v.type==='state' && v.live.status==='disconnected'); ws.send(JSON.stringify({type:'disconnect'})); await wait;
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'live.json'),'utf8')),{username:''});
 ws.close(); await app.close();
 FakeConnector.instance=null; app=await createApp({port,Connector:FakeConnector,dataDir:dir}); t.after(()=>app.close());
 assert.equal(FakeConnector.instance,null,'a deliberate disconnect stays offline after restart');
});

test('live loss pauses until reconnect and stale connector cannot resume', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 const app=await createApp({port,Connector:FakeConnector,dataDir:dir,retryMs:40});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`}); await once(ws,'open');
 let wait=next(ws,v=>v.type==='state' && v.live.status==='connecting'); ws.send(JSON.stringify({type:'connect',username:'test'})); await wait;
 const old=FakeConnector.instance; wait=next(ws,v=>v.type==='state' && v.live.status==='connected'); old.resolve(); await wait;
 wait=next(ws,v=>v.type==='state' && v.live.status==='reconnecting'); old.emit('disconnected'); assert.equal((await wait).state.paused,true);
 await new Promise(r=>setTimeout(r,60)); const replacement=FakeConnector.instance; assert.notEqual(replacement,old);
 old.emit('chat',{user:{displayId:'stale'},comment:'do'}); assert.equal(app.engine.players.size,0);
 wait=next(ws,v=>v.type==='state' && v.live.status==='connected'); replacement.resolve(); assert.equal((await wait).state.paused,false);
 wait=next(ws,v=>v.type==='state' && v.live.status==='disconnected'); ws.send(JSON.stringify({type:'disconnect'})); assert.equal((await wait).state.paused,true);
 wait=next(ws,v=>v.type==='state' && v.state.players.length===1 && !v.state.paused); ws.send(JSON.stringify({type:'simulate',event:'comment',count:1})); await wait; ws.close();
});

test("local Three.js module is served but node_modules is private", async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),"keoco-"));
 const app=await createApp({port,Engine:FakeEngine,dataDir:dir});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 assert.equal(await request(port,"/three.module.js"),200);
 assert.equal(await request(port,"/node_modules/three/build/three.module.js"),404);
});

// Exercise the real command handlers without requiring local listening sockets.
async function socketFreeApp(t, initialStats) {
  let onConnection, sockets;
  const originalOn=WebSocketServer.prototype.on;
  t.mock.method(WebSocketServer.prototype,'on',function(event,handler) {
    if(event==='connection') { onConnection=handler; sockets=this.clients; }
    return originalOn.call(this,event,handler);
  });
  t.mock.method(http.Server.prototype,'listen',function(...args) { queueMicrotask(args.at(-1)); return this; });
  t.mock.method(http.Server.prototype,'close',function(callback) { callback(); return this; });
  const dir=mkdtempSync(join(tmpdir(),'keoco-'));
  if (initialStats) writeFileSync(join(dir,'stats.json'),JSON.stringify(initialStats));
  // Isolate from the operator's project config.json, which the app falls back to.
  writeFileSync(join(dir,'config.json'),'{}');
  const app=await createApp({Connector:FakeConnector,dataDir:dir});app.engine.random=()=>0;
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  function addClient() {
    const client=new EventEmitter(); client.readyState=WebSocket.OPEN; client.bufferedAmount=0; client.messages=[];
    client.send=data=>client.messages.push(JSON.parse(data));
    client.terminate=()=>{client.readyState=WebSocket.CLOSED;sockets.delete(client);};
    sockets.add(client); onConnection(client); return client;
  }
  const ws=addClient();
  return {app,ws,dir,addClient,command(message) {ws.emit('message',Buffer.from(JSON.stringify(message)));},
    async settle() {await new Promise(resolve=>setImmediate(resolve));}};
}

test('completed live matches append minimal private history without changing aggregate stats', async t=>{
 const {app,dir,command,settle}=await socketFreeApp(t,{matches:3,wins:{red:2,blue:1,draw:0},mvp:{p1:{nickname:'Player',count:3}}});
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 let clock=Date.now(); app.engine.now=()=>clock; app.engine.configure({pvpThreshold:1});
 FakeConnector.instance.emit('chat',{user:{displayId:'p1',nickname:'Player',avatarThumb:{urlList:['avatar-secret']}},comment:'do'});
 app.engine.start(); clock+=4000; app.engine.tick(); app.engine.like({uniqueId:'p1',likeCount:5});
 clock+=60000; app.engine.tick();
 let lines=readFileSync(join(dir,'match-history.jsonl'),'utf8').trim().split('\n');
 assert.equal(lines.length,1); const first=JSON.parse(lines[0]);
 assert.deepEqual(Object.keys(first).sort(),['mvp','score','timestamp','winner']);
 assert.ok(!Number.isNaN(Date.parse(first.timestamp))); assert.equal(first.winner,'red');
 assert.ok(first.score.red>0); assert.ok(first.score.blue>=0);
 assert.deepEqual(first.mvp.red,{uniqueId:'p1',nickname:'Player'}); assert.equal(first.mvp.blue,null);
 assert.ok(!lines[0].includes('avatar-secret'));
 // POSIX permission bits are not represented by Windows ACLs.
 if(process.platform!=='win32')assert.equal(statSync(join(dir,'match-history.jsonl')).mode & 0o777,0o600);
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'stats.json'))),{matches:4,wins:{red:3,blue:1,draw:0},mvp:{p1:{nickname:'Player',count:4}}});
 app.engine.start(); clock+=4000; app.engine.tick(); app.engine.like({uniqueId:'p1',likeCount:5}); clock+=60000; app.engine.tick();
 lines=readFileSync(join(dir,'match-history.jsonl'),'utf8').trim().split('\n'); assert.equal(lines.length,2);
 assert.equal(JSON.parse(readFileSync(join(dir,'stats.json'))).matches,5);
});

test('a completed simulated match does not enter history or stats',async t=>{
 const {app,dir,command}=await socketFreeApp(t);
 command({type:'simulate',event:'comment',count:1});
 let clock=Date.now(); app.engine.now=()=>clock; app.engine.configure({pvpThreshold:1});
 app.engine.start(); clock+=4000; app.engine.tick(); app.engine.like({uniqueId:'sim_1',likeCount:5});
 clock+=60000; app.engine.tick();
 assert.throws(()=>readFileSync(join(dir,'match-history.jsonl')),{code:'ENOENT'});
 assert.throws(()=>readFileSync(join(dir,'stats.json')),{code:'ENOENT'});
});

test('automatic bot exhibition does not enter live history or stats',async t=>{
 const {app,dir,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'});await settle();FakeConnector.instance.resolve();await settle();
 let clock=Date.now();app.engine.now=()=>clock;app.engine.start();
 clock+=4000;app.engine.tick();assert.equal(app.engine.demo,true);
 clock+=60000;app.engine.tick();
 assert.throws(()=>readFileSync(join(dir,'match-history.jsonl')),{code:'ENOENT'});
 assert.throws(()=>readFileSync(join(dir,'stats.json')),{code:'ENOENT'});
});

test('LIVE comments immediately enroll the speaker, fill the squad with labelled bots and broadcast their own speech',async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'});await settle();FakeConnector.instance.resolve();await settle();
 const connector=FakeConnector.instance,chat=(id,text)=>connector.emit('chat',{user:{uniqueId:id,nickname:'Trùng tên',avatarThumb:{urlList:['private-avatar']}},comment:text});
 assert.equal(app.engine.bots.length,0);chat('first','Xin chào');
 assert.equal(app.engine.players.size,1);assert.equal(app.engine.bots.length,9);assert.ok(app.engine.bots.every(b=>/^BOT (ĐỎ|XANH) \d$/.test(b.nickname)));
 chat('second','<b>Chào lại</b>');
 const comments=ws.messages.filter(m=>m.type==='comment');assert.equal(comments.length,2);
 assert.equal(comments[0].uniqueId,'first');assert.equal(comments[1].uniqueId,'second');assert.equal(comments[1].text,'<b>Chào lại</b>');
 assert.deepEqual(Object.keys(comments[0]).sort(),['nickname','team','text','type','uniqueId']);
 const index=ws.messages.indexOf(comments[0]);assert.equal(ws.messages[index-1].type,'state');
 app.engine.pause();chat('paused','No popup');assert.equal(app.engine.players.size,2);assert.equal(ws.messages.filter(m=>m.type==='comment').length,2);
 command({type:'disconnect'});chat('stale','No stale popup');assert.equal(ws.messages.filter(m=>m.type==='comment').length,2);
});

test('comment bursts stay bounded and simulation comments are labelled',async t=>{
 const {ws,command,settle}=await socketFreeApp(t);t.mock.method(Date,'now',()=>1e12);
 command({type:'simulate',event:'comment',count:1});
 assert.equal(ws.messages.filter(m=>m.type==='comment').at(-1).simulated,true);
 command({type:'connect',username:'alice'});await settle();FakeConnector.instance.resolve();await settle();
 const before=ws.messages.filter(m=>m.type==='comment').length;
 for(let i=0;i<100;i++)FakeConnector.instance.emit('chat',{user:{uniqueId:`burst-${i}`,nickname:'Chat'},comment:'Hi'});
 assert.equal(ws.messages.filter(m=>m.type==='comment').length-before,30);
});

test('the server never speaks for bots',async t=>{
 let clock=1e12,tick;t.mock.method(Date,'now',()=>clock);
 t.mock.method(globalThis,'setInterval',callback=>{tick=callback;return 0;});
 const {app,ws}=await socketFreeApp(t);app.engine.comment({uniqueId:'human',comment:'do'});
 for(let i=0;i<20;i++){clock+=41000;app.engine.like({uniqueId:'human',likeCount:1});tick();}
 assert.ok(app.engine.bots.length>0);assert.equal(ws.messages.filter(m=>m.type==='comment').length,0);
});

test('history write failure is reported safely and does not prevent stats persistence',async t=>{
 const {app,ws,dir,command,settle}=await socketFreeApp(t);
 mkdirSync(join(dir,'match-history.jsonl'));
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 let clock=Date.now(); app.engine.now=()=>clock; app.engine.configure({pvpThreshold:1});
 FakeConnector.instance.emit('chat',{user:{displayId:'a'},comment:'do'}); app.engine.start();
 clock+=4000; app.engine.tick(); app.engine.like({uniqueId:'a',likeCount:5}); clock+=60000; app.engine.tick();
 assert.equal(JSON.parse(readFileSync(join(dir,'stats.json'))).matches,1);
 const failure=ws.messages.find(m=>m.type==='log' && /lịch sử/.test(m.message));
 assert.ok(failure); assert.ok(!failure.message.includes(dir));
});

test('manual same-username reconnect preserves match; username switch clears and unpauses it',async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'Alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 app.engine.comment({uniqueId:'old',comment:'do'}); app.engine.start();
 command({type:'disconnect'}); const preserved=app.engine.snapshot();
 command({type:'connect',username:'@alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 assert.equal(app.engine.players.size,1); assert.equal(app.engine.phase,preserved.phase);
 command({type:'disconnect'}); const stale=FakeConnector.instance;
 command({type:'connect',username:'bob'});
 const switched=ws.messages.filter(m=>m.type==='state').at(-1);
 assert.equal(switched.state.players.length,0); assert.deepEqual(switched.state.score,{red:0,blue:0}); assert.equal(switched.state.phase,'lobby'); assert.equal(switched.state.paused,false);
 stale.emit('chat',{user:{displayId:'stale'},comment:'do'}); assert.equal(app.engine.players.size,0);
 await settle(); FakeConnector.instance.resolve(); await settle();
 assert.equal(ws.messages.filter(m=>m.type==='state').at(-1).live.status,'connected');
});

test('every websocket send enforces byte queue budget while healthy clients continue',async t=>{
 const {sendBounded}=await import('../server.mjs');
 const sent=[], ws={readyState:WebSocket.OPEN,bufferedAmount:0,send:data=>sent.push(data),terminate(){this.terminated=true;}};
 assert.equal(sendBounded(ws,'small',16),true); assert.deepEqual(sent,['small']);
 ws.bufferedAmount=14; assert.equal(sendBounded(ws,'éé',16),false); assert.equal(ws.terminated,true); assert.equal(sent.length,1);
 const oversized={...ws,bufferedAmount:0,terminated:false}; assert.equal(sendBounded(oversized,'x'.repeat(17),16),false); assert.equal(oversized.terminated,true);
});

test('installed connector decodes real v3 cumulative gift fields without losing 64-bit identity',async t=>{
 const {WebcastGiftMessage,Gift,User,CommonMessageData,deserializeMessage}=await import('tiktok-live-connector');
 // Inside StudioLive the host's older connector is installed and only the bridge path runs; the standalone v3 schema is absent.
 if(!Gift||!CommonMessageData) return t.skip('installed tiktok-live-connector has no v3 schema (StudioLive bridge mode)');
 const {normalizeLiveGift}=await import('../server.mjs');
 const {GameEngine}=await import('../engine.mjs');
 let time=0; const game=new GameEngine({now:()=>time,config:{pvpThreshold:1,earlyWinMinSeconds:100}});
 game.comment({uniqueId:'alice',comment:'do'}); game.start(); time=3000; game.tick();
 const payload=(count,end,msgId)=>{
   const raw={...WebcastGiftMessage.decode(Buffer.alloc(0)),giftId:'5655',groupId:'90071992547409931',repeatCount:count,repeatEnd:end,
     user:{...User.decode(Buffer.alloc(0)),displayId:'alice',nickname:'Alice'},
     common:{...CommonMessageData.decode(Buffer.alloc(0)),msgId},gift:{...Gift.decode(Buffer.alloc(0)),type:1,diamondCount:5}};
   return deserializeMessage('WebcastGiftMessage',WebcastGiftMessage.encode(raw).finish());
 };
 const first=normalizeLiveGift(payload(1,0,'90071992547409932'));
 assert.equal(first.groupId,'90071992547409931'); assert.equal(first.msgId,'90071992547409932'); assert.equal(first.streakable,true);
 game.gift(first); game.gift(normalizeLiveGift(payload(3,0,'90071992547409933')));
 assert.equal(game.score.red,0);
 assert.equal(game.gift(normalizeLiveGift(payload(3,1,'90071992547409934'))),'credited');
 assert.equal(game.score.red,750);
 assert.equal(game.gift(normalizeLiveGift(payload(3,1,'90071992547409935'))),'duplicate'); assert.equal(game.score.red,750);
});

test('real command replies and state broadcasts bound slow queues without blocking a healthy peer',async t=>{
 const {ws,command,addClient,settle}=await socketFreeApp(t);
 const healthy=addClient(), slow=addClient();
 ws.bufferedAmount=1024*1024;
 command({type:'unknown'}); assert.equal(ws.readyState,WebSocket.CLOSED);
 slow.bufferedAmount=1024*1024;
 healthy.emit('message',Buffer.from(JSON.stringify({type:'simulate',event:'comment',count:1})));
 assert.equal(slow.readyState,WebSocket.CLOSED); assert.equal(healthy.readyState,WebSocket.OPEN);
 assert.equal(healthy.messages.filter(m=>m.type==='state').at(-1).state.players.length,1);
 await settle();
});

test('real LIVE handler preserves group ownership on reconnect and emits safe rejection diagnostics',async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 app.engine.comment({uniqueId:'a',comment:'do'}); app.engine.start();
 // Deterministically enter pull through the engine's own clock.
 const at=Date.now(); app.engine.now=()=>at+4000; app.engine.tick();
 assert.equal(app.engine.phase,'pull');
 const payload={user:{displayId:'a',nickname:'Alice'},giftId:'5655',groupId:'private-group',common:{msgId:'private-message'},gift:{type:1,diamondCount:5},repeatCount:2,repeatEnd:0};
 FakeConnector.instance.emit('gift',payload);
 command({type:'disconnect'}); command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 FakeConnector.instance.emit('gift',{...payload,repeatEnd:1}); const earned=app.engine.score.red; assert.equal(earned,500);
 FakeConnector.instance.emit('gift',{...payload,common:{msgId:'different'},repeatEnd:1}); assert.equal(app.engine.score.red,earned);
 FakeConnector.instance.emit('gift',{...payload,groupId:'0',repeatEnd:1});
 const warning=ws.messages.find(m=>m.type==='log' && /unidentified/.test(m.message));
 assert.ok(warning); assert.ok(!JSON.stringify(warning).includes('private-'));
 command({type:'disconnect'}); command({type:'simulate',event:'comment',count:1});
 assert.equal(app.engine.snapshot().paused,false); assert.deepEqual([...app.engine.players.keys()],['sim_1']);
});

// ---------- Donor highlight notifications ----------
const liveGift=(id,extra={})=>({user:{displayId:id,nickname:`Nick ${id}`,avatarThumb:{urlList:['https://cdn.example/secret.png']}},giftId:'5655',common:{msgId:`m-${id}`},gift:{type:2,diamondCount:1},repeatCount:1,repeatEnd:1,...extra});
const donorsOf=ws=>ws.messages.filter(m=>m.type==='donor');

test('donor highlight carries only the stable id of a completed, verified live gift',async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 let clock=Date.now(); t.mock.method(Date,'now',()=>clock);
 const streak=liveGift('bob',{groupId:'g-1',gift:{type:1,diamondCount:1},repeatEnd:0});
 FakeConnector.instance.emit('gift',streak);
 assert.equal(donorsOf(ws).length,0,'an unfinished streak is not a donation yet');
 FakeConnector.instance.emit('gift',{...streak,repeatCount:3,repeatEnd:1});
 assert.deepEqual(donorsOf(ws),[{type:'donor',uniqueId:'bob'}],'only type + uniqueId: no nickname, avatar, gift or message ids');
 clock+=5000;
 FakeConnector.instance.emit('gift',{...streak,repeatCount:3,repeatEnd:1});
 assert.equal(donorsOf(ws).length,1,'a replayed completion does not highlight again');
 FakeConnector.instance.emit('gift',liveGift('carol',{giftId:undefined}));
 FakeConnector.instance.emit('gift',liveGift('erin',{gift:{type:2,diamondCount:0}}));
 assert.equal(donorsOf(ws).length,1,'unidentified and invalid-value gifts never highlight');
 assert.ok(app.engine.players.has('carol'),'the rejected donor is still a player, so exclusion is by outcome');
 // Same username reconnect: the old connector is stale and must not highlight anyone.
 command({type:'disconnect'}); const stale=FakeConnector.instance;
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 clock+=5000; stale.emit('gift',liveGift('dave'));
 assert.equal(donorsOf(ws).length,1);
 FakeConnector.instance.emit('gift',liveGift('dave'));
 assert.deepEqual(donorsOf(ws).at(-1),{type:'donor',uniqueId:'dave'});
 assert.ok(!JSON.stringify(donorsOf(ws)).match(/Nick|secret|m-|5655/));
});

test('two donors sharing a nickname are highlighted by their own uniqueId',async t=>{
 const {ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 FakeConnector.instance.emit('chat',{user:{displayId:'twin_a',nickname:'Twin'},comment:'do'});
 FakeConnector.instance.emit('chat',{user:{displayId:'twin_b',nickname:'Twin'},comment:'do'});
 FakeConnector.instance.emit('gift',liveGift('twin_b',{user:{displayId:'twin_b',nickname:'Twin'}}));
 assert.deepEqual(donorsOf(ws),[{type:'donor',uniqueId:'twin_b'}]);
});

test('switching event source clears highlights before the new source can issue any',async t=>{
 const {ws,command,settle}=await socketFreeApp(t);
 t.mock.method(Date,'now',()=>1e12);
 command({type:'simulate',event:'gift',count:1});
 const kinds=()=>ws.messages.map(m=>m.type).filter(type=>type.startsWith('donor'));
 assert.deepEqual(kinds(),['donor-clear','donor']);
 assert.deepEqual(donorsOf(ws),[{type:'donor',uniqueId:'sim_1'}]);
 command({type:'simulate',event:'gift',count:1});
 assert.deepEqual(kinds(),['donor-clear','donor'],'same source within the window: no clear, no duplicate burst');
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 assert.equal(kinds().at(-1),'donor-clear');
 const clearAt=ws.messages.findIndex((m,i)=>i>0&&m.type==='donor-clear'&&ws.messages.slice(0,i).some(x=>x.type==='donor'));
 const stateAfter=ws.messages.findIndex((m,i)=>i>clearAt&&m.type==='state');
 assert.ok(clearAt>0&&stateAfter>clearAt,'clear precedes the empty-roster state of the new source');
});

test('a gift burst is capped per second and never repeats a donor within the window',async t=>{
 const {ws,command}=await socketFreeApp(t);
 t.mock.method(Date,'now',()=>1e12);
 command({type:'simulate',event:'gift',count:30});
 const ids=donorsOf(ws).map(m=>m.uniqueId);
 assert.equal(ids.length,20); assert.equal(new Set(ids).size,20);
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,30,'all burst notices reach overlay queue');
});

test('presentation module is served to browser', async t=>{
 const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
 const app=await createApp({port, dataDir:dir});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 assert.equal(await request(port,'/presentation.mjs'),200);
});

 test('gift banner uses the engine team after enrollment and rejects invalid gifts',async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 let clock=Date.now(); t.mock.method(Date,'now',()=>clock);
 FakeConnector.instance.emit('gift',liveGift('new'));
 assert.deepEqual(ws.messages.filter(m=>m.type==='gift').at(-1),{type:'gift',nickname:'Nick new',team:'red',mode:'pvp',giftCount:1});
 clock+=2000; FakeConnector.instance.emit('gift',liveGift('other'));
 assert.equal(ws.messages.filter(m=>m.type==='gift').at(-1).team,'blue');
 clock+=2000; FakeConnector.instance.emit('gift',liveGift('bad',{giftId:undefined}));
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,2);
 clock+=2000; FakeConnector.instance.emit('gift',liveGift('new'));
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,2);
});

test('gift banner handles waiting roster, streak completion, stale source, and saturation',async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 let clock=Date.now(); t.mock.method(Date,'now',()=>clock);
 for(let i=0;i<15;i++) app.engine.comment({uniqueId:`r${i}`,nickname:`R${i}`,comment:'do'});
 const streak=liveGift('r14',{groupId:'streak',gift:{type:1,diamondCount:1},repeatEnd:0});
 FakeConnector.instance.emit('gift',streak); assert.equal(ws.messages.filter(m=>m.type==='gift').length,0);
 FakeConnector.instance.emit('gift',{...streak,repeatEnd:1});
 assert.equal(ws.messages.filter(m=>m.type==='gift').at(-1).team,'red');
 clock+=2000; FakeConnector.instance.emit('gift',{...streak,repeatEnd:1});
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,1);
 app.engine.maxPlayers=15; FakeConnector.instance.emit('gift',liveGift('overflow'));
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,1);
 command({type:'disconnect'}); const stale=FakeConnector.instance;
 clock+=2000; stale.emit('gift',liveGift('r14',{common:{msgId:'stale'}}));
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,1);
});

test('metadata is optional, bounded, and an unobserved streak completion is not announced',async t=>{
 const {ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'test'}); await settle(); FakeConnector.instance.resolve(); await settle();
 FakeConnector.instance.emit('gift',liveGift('first',{giftDetails:{giftName:'Rose\n<script>'},repeatCount:3}));
 const first=ws.messages.filter(m=>m.type==='gift').at(-1);
 assert.equal(first.giftName,'Rose <script>'); assert.equal(first.giftCount,3);
 FakeConnector.instance.emit('gift',liveGift('late',{groupId:'missing-start',gift:{type:1,diamondCount:1},repeatEnd:1}));
 assert.equal(ws.messages.filter(m=>m.type==='gift').length,1);
});

test('position chat uses stable identity, never enrolls, and bounds bursts', async t=>{
 const {app,ws,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'test'}); await settle(); FakeConnector.instance.resolve(); await settle();
 const c=FakeConnector.instance; c.emit('chat',{user:{uniqueId:'id',nickname:'<img src=x onerror=1>'},comment:'ĐỎ'});
 app.engine.phase='pull'; app.engine.mode='pvp'; app.engine.endsAt=Date.now()+30000;
 const before=app.engine.players.size;
 c.emit('chat',{user:{uniqueId:'id',nickname:'other'},comment:' VỊ TRÍ '});
 c.emit('chat',{user:{uniqueId:'id',nickname:'other'},comment:'vi tri'});
 for(let i=0;i<100;i++) c.emit('chat',{user:{uniqueId:'new'+i,nickname:'x'},comment:'vi tri'});
 const notices=ws.messages.filter(m=>m.type==='position'); assert.equal(notices.length,1);
 assert.equal(notices[0].nickname,'<img src=x onerror=1>'); assert.equal(notices[0].position,1);
 assert.equal(app.engine.players.size,before); assert.equal(app.engine.score.red,0);
});
test('simulation position is labelled and cleared when live starts', async t=>{
 const {ws,command,settle}=await socketFreeApp(t);
 command({type:'simulate',event:'comment',count:1}); command({type:'simulate',event:'position',count:1});
 assert.equal(ws.messages.find(m=>m.type==='position').simulated,true);
 command({type:'connect',username:'test'}); await settle(); FakeConnector.instance.resolve(); await settle();
 FakeConnector.instance.emit('chat',{user:{uniqueId:'sim_1',nickname:'Real'},comment:'vi tri'});
 const notices=ws.messages.filter(m=>m.type==='position'); assert.equal(notices.at(-1).area,'unjoined'); assert.equal(notices.at(-1).simulated,undefined);
});

test('control panel drives overlay audio: settings persist, test cue broadcasts, overlay status resets on disconnect', async t=>{
  const port=await freePort(), dir=mkdtempSync(join(tmpdir(),'keoco-'));
  writeFileSync(join(dir,'config.json'),'{}');
  const app=await createApp({port,Engine:FakeEngine,Connector:FakeConnector,dataDir:dir,staticDir:dir});
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const open=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`});const first=next(ws,v=>v.type==='state');await once(ws,'open');return [ws,await first];};
  const [control,initial]=await open(); assert.deepEqual(initial.audio,{volume:18,muted:false,overlay:'unknown'});
  const [overlay]=await open();
  let wait=next(control,v=>v.type==='state'&&v.audio.overlay==='on'); overlay.send(JSON.stringify({type:'audio-status',status:'on'})); await wait;
  wait=next(overlay,v=>v.type==='state'&&v.audio.volume===70); control.send(JSON.stringify({type:'audio',volume:70,muted:true})); assert.equal((await wait).audio.muted,true);
  const saved=JSON.parse(readFileSync(join(dir,'config.json'))); assert.equal(saved.audioVolume,70); assert.equal(saved.audioMuted,1);
  wait=next(overlay,v=>v.type==='audio-test'); control.send(JSON.stringify({type:'audio-test'})); await wait;
  for(const bad of [{type:'audio',volume:101,muted:false},{type:'audio',volume:50,muted:'yes'},{type:'audio-status',status:'loud'}]){wait=next(control,v=>v.type==='error');control.send(JSON.stringify(bad));await wait;}
  wait=next(control,v=>v.type==='state'&&v.audio.overlay==='unknown'); overlay.close(); await wait;
  control.close();
});

test('v2.5.0 live payloads: chat text in content and like totals in count reach the engine',async t=>{
 const {app,command,settle}=await socketFreeApp(t);
 command({type:'connect',username:'alice'}); await settle(); FakeConnector.instance.resolve(); await settle();
 FakeConnector.instance.emit('chat',{user:{displayId:'v2fan',nickname:'Fan'},content:'xanh'});
 assert.equal(app.engine.players.get('v2fan')?.team,'blue');
 const likes=[];const like=app.engine.like.bind(app.engine);app.engine.like=e=>{likes.push(e);return like(e);};
 FakeConnector.instance.emit('like',{user:{displayId:'v2fan'},count:7,total:47});
 assert.equal(likes[0].uniqueId,'v2fan');assert.equal(likes[0].likeCount,7);
});
