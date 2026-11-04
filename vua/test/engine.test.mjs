import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WordGame,normalizeAnswer,validateConfig,CLASS_CAPACITY as N} from '../engine.mjs';
const questions=[{answer:'TIẾNG VIỆT',hint:'Ngôn ngữ',category:'Từ vựng'},{answer:'ĐOÀN KẾT',hint:'Chung lòng'}];
function fixture(config={}){let time=10000;const g=new WordGame({questions,config,now:()=>time,random:()=>.8});g.start();return {g,advance:n=>{time+=n;}};}
test('normalizes Vietnamese Unicode, spaces, punctuation and đ; accent mode remains strict',()=>{
  assert.equal(normalizeAnswer(' ĐOÀN  KẾT! '),'doanket');assert.equal(normalizeAnswer('TIẾNG VIỆT'.normalize('NFD')),'tiengviet');
  assert.notEqual(normalizeAnswer('tieng viet',false),normalizeAnswer('tiếng việt',false));
});
test('whole answers score once per user, first correct is MVP, round remains open',()=>{
  const {g}=fixture();const answer=g.snapshot(true).question.answer;
  assert.equal(g.comment({id:'a',text:'tôi đoán '+answer}),false);
  assert.equal(g.comment({id:'a',nickname:'An',text:answer}),true);
  assert.equal(g.comment({id:'b',text:answer}),true);assert.equal(g.comment({id:'a',text:answer}),false);
  assert.equal(g.leaderboard().length,2);assert.equal(g.leaderboard()[0].score,100);assert.equal(g.phase,'playing');assert.equal(g.snapshot().correctCount,2);assert.equal(g.winner.id,'live:a');assert.equal(g.snapshot().question.answer,undefined);g.finish();assert.equal(g.phase,'result');
});
test('no scoring before start, while paused, or at deadline',()=>{
  const {g,advance}=fixture();const answer=g.snapshot(true).question.answer;g.pause();advance(90000);
  assert.equal(g.comment({id:'a',text:answer}),false);g.resume();assert.equal(Math.ceil(g.snapshot().remaining),45);
  advance(45000);assert.equal(g.comment({id:'a',text:answer}),false);assert.equal(g.reason,'timeout');assert.equal(g.leaderboard().length,0);
  g.reset();assert.equal(g.comment({id:'a',text:answer}),false);
});
test('hints reveal characters, reduce points, and have a minimum of 10',()=>{
  const {g}=fixture();for(let i=0;i<20;i++)g.hint();const q=g.snapshot(true).question;
  assert.ok(q.mask.includes('_'));assert.equal(g.comment({id:'a',text:q.answer}),true);assert.equal(g.winner.points,10);
});
test('overlay hides answer until result; control gets answer',()=>{
  const {g}=fixture();assert.equal(g.snapshot().question.answer,undefined);assert.ok(g.snapshot(true).question.answer);g.finish();assert.ok(g.snapshot().question.answer);
});
test('auto-next advances, manual mode holds, no repeat before bank exhausted',()=>{
  const {g,advance}=fixture();const a=g.index;g.finish();advance(6000);g.tick();assert.notEqual(g.index,a);assert.equal(g.round,2);
  g.config.autoNext=false;g.finish();advance(60000);g.tick();assert.equal(g.phase,'result');
});
test('pause freezes result and preserves manual pause',()=>{
  const {g,advance}=fixture();g.finish();g.pause();advance(60000);g.tick();assert.equal(g.phase,'result');assert.equal(g.snapshot().remaining,6);g.resume();advance(6000);g.tick();assert.equal(g.phase,'playing');
});
test('simulation is explicitly labeled and separate from real users',()=>{
  const {g}=fixture();g.comment({id:'a',text:g.snapshot(true).question.answer,simulated:true});assert.equal(g.leaderboard()[0].simulated,true);assert.equal(g.leaderboard()[0].id,'demo:a');
  g.start();g.comment({id:'a',text:g.snapshot(true).question.answer});assert.equal(g.leaderboard().length,2);
});
test('class roster retains a full class of commenters and never evicts occupied seats when full',()=>{
  const {g}=fixture();
  for(let i=0;i<N;i++)g.comment({id:String(i),nickname:'Học viên '+i,text:'sai',simulated:true});
  let roster=g.snapshot().participants;
  assert.equal(roster.length,N);assert.equal(g.comments.length,6);assert.equal(g.leaderboard().length,0);
  assert.equal(new Set(roster.map(p=>p.id)).size,N);
  g.start();assert.equal(g.snapshot().participants.length,N);
  g.comment({id:String(N-1),nickname:'Tên mới',text:'sai',simulated:true});
  assert.equal(g.snapshot().participants.length,N);assert.equal(g.snapshot().participants.at(-1).nickname,'Tên mới');
  g.comment({id:String(N),nickname:'Người mới',text:'sai',simulated:true});
  roster=g.snapshot().participants;assert.equal(roster.length,N);assert.ok(roster.some(p=>p.id==='demo:0'));assert.ok(!roster.some(p=>p.id==='demo:'+N));
  g.reset();assert.equal(g.snapshot().participants.length,0);
});
test('joining works while idle, does not score, and repeated joins keep one seat',()=>{
  const g=new WordGame({questions});
  assert.equal(g.join({id:'a',nickname:'An'}),'joined');
  assert.equal(g.phase,'idle');assert.equal(g.round,0);assert.equal(g.leaderboard().length,0);
  assert.equal(g.join({id:'a',nickname:'An mới'}),'existing');assert.equal(g.snapshot().participants.length,1);
  assert.equal(g.snapshot().participants[0].nickname,'An mới');
  assert.equal(g.join({id:''}),'invalid');assert.equal(g.join({id:'x'.repeat(129)}),'invalid');
  for(let i=1;i<N;i++)assert.equal(g.join({id:String(i)}),'joined');
  assert.equal(g.join({id:'new'}),'full');assert.equal(g.snapshot().participants[0].id,'live:a');
  g.start();g.pause();assert.equal(g.join({id:'a'}),'existing');assert.equal(g.snapshot().participants.length,N);
});
test('invalid input and config rejected; comments bounded',()=>{
  const {g}=fixture();for(const input of [{roundSeconds:0},{points:Infinity},{autoNext:1},{x:1},null])assert.throws(()=>validateConfig(input));
  assert.equal(g.comment({id:undefined,text:'a'}),false);assert.equal(g.comment({id:'x',text:'a'.repeat(201)}),false);
  for(let i=0;i<20;i++)g.comment({id:'x',text:'sai'});assert.equal(g.comments.length,6);
});
test('bank has unique valid answers and shuffle preserves every accented character',async()=>{
  const bank=JSON.parse(await readFile(new URL('../questions.json',import.meta.url),'utf8'));assert.ok(bank.length>0&&bank.length<=5000);
  assert.equal(new Set(bank.map(q=>normalizeAnswer(q.answer))).size,bank.length);
  const g=new WordGame({questions:bank});const seen=new Set();for(let i=0;i<bank.length;i++){g.start();seen.add(g.index);const q=g.snapshot(true).question;assert.deepEqual([...q.answer.replace(/\s/g,'')].sort(),[...q.tiles].sort());assert.notEqual(q.tiles.join(''),q.answer.replace(/\s/g,''));}assert.equal(seen.size,bank.length);
});
test('viewers beyond class capacity can still answer and score, full is logged once',()=>{
  const {g}=fixture();
  for(let i=0;i<N;i++)assert.equal(g.join({id:'s'+i}),'joined');
  const answer=g.snapshot(true).question.answer;
  assert.equal(g.comment({id:'extra',nickname:'Ngoài lớp',text:'sai'}),false);
  assert.equal(g.comment({id:'extra',nickname:'Ngoài lớp',text:answer}),true);
  assert.equal(g.scores.get('live:extra').score,100);assert.equal(g.winner.id,'live:extra');
  assert.ok(!g.snapshot().participants.some(p=>p.id==='live:extra'));
  assert.equal(g.snapshot(true).activityLog.filter(e=>e.type==='full').length,1);
  g.reset();assert.equal(g.join({id:'extra'}),'joined');
});
test('difficulty picks questions from the chosen level and switches from the next question',()=>{
  const bank=[{answer:'HOA SEN',hint:'a'},{answer:'UYÊN BÁC',hint:'b',difficulty:'hard'},{answer:'QUÊ HƯƠNG',hint:'c'},{answer:'MẪN TIỆP',hint:'d',difficulty:'hard'}];
  const g=new WordGame({questions:bank,config:{difficulty:'hard'}});
  for(let i=0;i<6;i++){g.start();assert.equal(bank[g.index].difficulty,'hard');}
  g.config={...g.config,...validateConfig({difficulty:'normal'})};
  for(let i=0;i<6;i++){g.start();assert.equal(bank[g.index].difficulty,undefined);}
  assert.deepEqual(g.snapshot().questionLevels,{normal:2,hard:2});
  assert.throws(()=>validateConfig({difficulty:'extreme'}));
  const plain=new WordGame({questions:[{answer:'HOA SEN',hint:'a'}],config:{difficulty:'hard'}});plain.start();assert.equal(plain.index,0,'empty level falls back to the whole bank');
});
test('showNames defaults on and only accepts booleans',()=>{
  const g=new WordGame({questions});assert.equal(g.config.showNames,true);
  assert.deepEqual(validateConfig({showNames:false}),{showNames:false});assert.throws(()=>validateConfig({showNames:'yes'}));
});
