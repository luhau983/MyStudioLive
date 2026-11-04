import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CLASS_CAPACITY as N} from '../engine.mjs';
import {connect as connectTCP} from 'node:net';
import {WebSocket} from 'ws';
import {createApp} from '../server.mjs';
class FakeConnector extends EventEmitter {
  static instances=[];
  constructor(username,options){super();this.username=username;this.options=options;FakeConnector.instances.push(this);}
  async connect(){return {};}
  async disconnect(){}
}
test('shutdown closes incomplete HTTP clients so the desktop can exit',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vua-shutdown-'));
  const questionsPath=join(dir,'questions.json');await writeFile(questionsPath,'[{"answer":"CHỮ","hint":"Gợi ý"}]');
  const app=await createApp({port:0,dataDir:dir,questionsPath,Connector:FakeConnector});
  const socket=connectTCP(app.server.address().port,'127.0.0.1');
  try{
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
    socket.write('GET / HTTP/1.1\r\n');
    await new Promise(resolve=>setTimeout(resolve,20));
    await app.close();assert.equal(app.server.listening,false);
  }finally{socket.destroy();await rm(dir,{recursive:true,force:true});}
});
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'vua-test-'));await writeFile(join(dir,'questions.json'),JSON.stringify([{answer:'TIẾNG VIỆT',hint:'Ngôn ngữ'},{answer:'ĐOÀN KẾT',hint:'Chung lòng'}]));const app=await createApp({port:0,dataDir:dir,questionsPath:join(dir,'questions.json'),Connector:FakeConnector,retryMs:30});const origin='http://127.0.0.1:'+app.server.address().port;const sockets=[];t.after(async()=>{sockets.forEach(s=>s.terminate());await app.close();await rm(dir,{recursive:true,force:true});});return {app,dir,origin,open:async(control=true)=>{const socket=new WebSocket(origin.replace('http:','ws:')+'/ws'+(control?'?role=control':''),{origin});sockets.push(socket);const messages=[];socket.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});return {socket,messages,send:m=>socket.send(JSON.stringify(m)),wait:predicate=>waitFor(()=>messages.find(predicate))};}};}
async function waitFor(fn){const end=Date.now()+2500;while(Date.now()<end){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for state');}
test('static allowlist and local origin protection',async t=>{const f=await setup(t);for(const path of ['/','/app.js','/style.css','/overlay.html'])assert.equal((await fetch(f.origin+path)).status,200);for(const path of ['/questions.json','/data/scores.json','/engine.mjs','/../package.json'])assert.equal((await fetch(f.origin+path)).status,404);assert.equal((await fetch(f.origin,{headers:{Origin:'https://example.com'}})).status,403);});
test('websocket rejects foreign origin',async t=>{const f=await setup(t);const ws=new WebSocket(f.origin.replace('http:','ws:')+'/ws',{origin:'https://example.com'});await new Promise((resolve,reject)=>{ws.once('unexpected-response',(_,res)=>{assert.equal(res.statusCode,403);res.resume();resolve();});ws.once('open',()=>reject(Error('Unexpected access')));ws.once('error',()=>{});});ws.terminate();});
test('TikTok member events join while idle, deduplicate, and reject stale connector events',async t=>{
  const f=await setup(t),host=await f.open();host.send({type:'connect',username:'classroom_live'});
  await host.wait(m=>m.live?.status==='connected');const c=FakeConnector.instances.at(-1);
  c.emit('member',{action:1,user:{uniqueId:'a',nickname:'An'}});
  c.emit('member',{action:1,user:{uniqueId:'a',nickname:'An'}});
  c.emit('member',{action:2,user:{uniqueId:'not_join',nickname:'Không vào'}});
  assert.equal(f.app.game.snapshot().participants.length,1);assert.equal(f.app.game.phase,'idle');assert.equal(f.app.game.leaderboard().length,0);
  c.emit('disconnected');await waitFor(()=>FakeConnector.instances.at(-1)!==c);await waitFor(()=>host.messages.some(m=>m.live?.status==='connected'&&m.game?.participants.length===1));
  c.emit('member',{action:1,user:{uniqueId:'old',nickname:'Cũ'}});assert.equal(f.app.game.snapshot().participants.length,1);
  const next=FakeConnector.instances.at(-1);await waitFor(()=>next!==c);await new Promise(r=>setTimeout(r,20));
  next.emit('member',{uniqueId:'b',nickname:'Bình'});assert.equal(f.app.game.snapshot().participants.length,2);
});
test('demo join works without starting question and preserves occupied seats at capacity',async t=>{
  const f=await setup(t),host=await f.open();host.send({type:'member',id:'a',nickname:'An'});
  await host.wait(m=>m.game?.participants.length===1);assert.equal(f.app.game.phase,'idle');assert.equal(f.app.game.snapshot().participants[0].simulated,true);
  for(let i=1;i<N;i++)f.app.game.join({id:String(i),simulated:true});
  host.send({type:'member',id:'new',nickname:'Mới'});await host.wait(m=>m.type==='error'&&m.message.includes(String(N)));
  assert.equal(f.app.game.snapshot().participants.length,N);assert.equal(f.app.game.snapshot().participants[0].id,'demo:a');
});
test('demo comments award once, overlay hides answers and cannot control game',async t=>{const f=await setup(t);const host=await f.open();const overlay=await f.open(false);host.send({type:'start'});const state=await host.wait(m=>m.game?.phase==='playing');await overlay.wait(m=>m.game?.phase==='playing');assert.equal(overlay.messages.find(m=>m.game?.phase==='playing').game.question.answer,undefined);overlay.send({type:'reset'});await overlay.wait(m=>m.type==='error');assert.equal(f.app.game.phase,'playing');host.send({type:'comment',id:'a',nickname:'An',text:state.game.question.answer});host.send({type:'comment',id:'b',text:state.game.question.answer});const result=await host.wait(m=>m.game?.winner);assert.equal(result.game.winner.nickname,'An');assert.equal(f.app.game.leaderboard().length,2);assert.equal(f.app.game.snapshot().correctCount,2);assert.equal(f.app.game.phase,'playing');assert.equal(f.app.game.winner.simulated,true);});
test('live v2 chat parsing, source isolation, reconnection pause, stale connector rejection',async t=>{const f=await setup(t);const host=await f.open();host.send({type:'connect',username:'@test_live'});await host.wait(m=>m.live?.status==='connected');host.send({type:'start'});await host.wait(m=>m.game?.phase==='playing');const c=FakeConnector.instances.at(-1);assert.equal(c.options.processInitialData,false);host.send({type:'comment',id:'test',text:f.app.game.snapshot(true).question.answer});await host.wait(m=>m.type==='error');assert.equal(f.app.game.leaderboard().length,0);
  c.emit('disconnected');assert.equal(f.app.game.paused,true);await waitFor(()=>FakeConnector.instances.at(-1)!==c);await waitFor(()=>!f.app.game.paused);const current=FakeConnector.instances.at(-1);const answer=f.app.game.snapshot(true).question.answer;c.emit('chat',{user:{uniqueId:'old'},content:answer});assert.equal(f.app.game.phase,'playing');current.emit('chat',{user:{uniqueId:'real',nickname:'Người thật'},content:answer,common:{msgId:'1'}});assert.equal(f.app.game.winner.nickname,'Người thật');assert.equal(f.app.game.winner.simulated,false);});
test('manual pause survives reconnect and data survives server restart',async t=>{const f=await setup(t);const host=await f.open();host.send({type:'config',config:{roundSeconds:60}});await waitFor(()=>f.app.game.config.roundSeconds===60);host.send({type:'start'});await waitFor(()=>f.app.game.phase==='playing');host.send({type:'comment',id:'x',text:f.app.game.snapshot(true).question.answer});await waitFor(()=>!!f.app.game.winner);host.send({type:'reveal'});await waitFor(()=>f.app.game.phase==='result');await waitFor(async()=>{try{return JSON.parse(await readFile(join(f.dir,'scores.json'),'utf8')).length===1;}catch{return false;}});
  const other=await createApp({port:0,dataDir:f.dir,Connector:FakeConnector});try{assert.equal(other.game.leaderboard()[0].score,100);assert.equal(other.game.config.roundSeconds,60);assert.equal(other.game.phase,'idle');}finally{await other.close();}
  host.send({type:'connect',username:'test_live'});await host.wait(m=>m.live?.status==='connected');host.send({type:'start'});await waitFor(()=>f.app.game.phase==='playing');host.send({type:'pause'});await waitFor(()=>f.app.game.paused);const c=FakeConnector.instances.at(-1);c.emit('disconnected');await waitFor(()=>FakeConnector.instances.at(-1)!==c);await new Promise(r=>setTimeout(r,50));assert.equal(f.app.game.paused,true);
});

test('large JSON import persists without interrupting current question and duplicates are skipped',async t=>{
  const f=await setup(t),host=await f.open();host.send({type:'start'});const before=await host.wait(m=>m.game?.phase==='playing');
  const questions=Array.from({length:200},(_,i)=>({answer:'TỪ MỚI '+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),hint:'Gợi ý mẫu cho câu số '+i,category:'Bổ sung'}));
  host.send({type:'import-questions',questions});const result=await host.wait(m=>m.type==='import-result');
  assert.equal(result.added,200);assert.equal(result.total,202);assert.equal(f.app.game.snapshot(true).question.answer,before.game.question.answer);assert.equal(f.app.game.phase,'playing');
  assert.equal(JSON.parse(await readFile(join(f.dir,'questions.json'),'utf8')).length,202);
  host.send({type:'import-questions',questions});await host.wait(m=>m.type==='import-result'&&m.added===0&&m.duplicates===200);
  const restarted=await createApp({port:0,dataDir:f.dir,questionsPath:join(f.dir,'questions.json'),Connector:FakeConnector});try{assert.equal(restarted.game.questions.length,202);}finally{await restarted.close();}
  const template=await fetch(f.origin+'/questions-template.json');assert.equal(template.status,200);assert.match(template.headers.get('content-type'),/application\/json/);
});
test('concurrent imports serialize and malformed file leaves bank untouched',async t=>{
  const f=await setup(t),host=await f.open();
  host.send({type:'import-questions',questions:[{answer:'HOA PHƯỢNG',hint:'Hoa sân trường'}]});
  host.send({type:'import-questions',questions:[{answer:'HOA HỒNG',hint:'Hoa có gai'}]});
  await waitFor(()=>host.messages.filter(m=>m.type==='import-result').length===2);assert.equal(f.app.game.questions.length,4);
  host.send({type:'import-questions',questions:[{answer:'HOA ĐÀO',hint:'Hoa Tết'},{answer:'X',hint:''}]});await host.wait(m=>m.type==='error');assert.equal(f.app.game.questions.length,4);assert.equal(JSON.parse(await readFile(join(f.dir,'questions.json'),'utf8')).length,4);
});
