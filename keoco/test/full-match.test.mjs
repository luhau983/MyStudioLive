import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine} from '../engine.mjs';

function match(config={}, random=()=>0) {
  let time=0;
  const results=[];
  const game=new GameEngine({now:()=>time,random,onResult:r=>results.push(r),config:{earlyWinMinSeconds:1000,idleSeconds:3600,...config}});
  return {game,results,at(ms){assert.ok(ms>=time);time=ms;game.tick();},advance(ms){time+=ms;game.tick();}};
}
const join=(g,id,team)=>g.comment({uniqueId:id,comment:team==='blue'?'xanh':'do'});
const single=(id,msg,extra={})=>({live:true,uniqueId:id,giftId:'5655',msgId:msg,diamondCount:1,repeatCount:1,streakable:false,repeatEnd:true,...extra});
function invariants(g) {
  const s=g.snapshot();
  assert.ok(Number.isFinite(s.position)&&Math.abs(s.position)<=1);
  for(const team of ['red','blue']) {
    const humans=s.players.filter(p=>p.team===team), bots=s.bots.filter(p=>p.team===team);
    // Bots only fill around real players; an empty room has none.
    assert.equal(Math.min(5,humans.length)+bots.length,s.players.length?5:0);
    assert.ok(Number.isFinite(s.score[team])&&s.score[team]>=0);
    const sum=[...humans,...bots].reduce((n,p)=>n+p.points,0);
    // Replaced bots leave their earned score on the team after their model exits.
    assert.ok(sum<=s.score[team]+1e-7,`${team}: visible contributors cannot exceed team score`);
    assert.ok(s.mana[team].value>=0&&s.mana[team].value<=100);
    assert.equal(new Set(humans.map(p=>p.lineupRank)).size,humans.length);
    assert.ok(s.upNext[team].length<=5);
    assert.ok(s.upNext[team].every(id=>humans.some(p=>p.uniqueId===id&&p.lineupRank>5)));
    if(s.mvp[team])assert.ok(humans.some(p=>p.uniqueId===s.mvp[team].uniqueId));
  }
  assert.equal(new Set([...s.players,...s.bots].map(p=>p.uniqueId)).size,s.players.length+s.bots.length);
}

for(const winner of ['red','blue','draw'])for(const overtime of [false,true]) {
  test(`whole default match: ${winner}, ${overtime?'overtime':'regulation'}, then next round`,()=>{
    const m=match(),g=m.game;join(g,'r','red');join(g,'b','blue');
    m.at(4999);assert.equal(g.phase,'lobby');m.at(5000);assert.equal(g.phase,'countdown');
    m.at(7999);assert.equal(g.phase,'countdown');m.at(8000);assert.equal(g.phase,'pull');
    // A regulation draw necessarily enters overtime.
    const needsOvertime=overtime||winner==='draw';
    if(!needsOvertime)g.gift(single(winner==='red'?'r':'b','regulation'));
    m.at(52999);assert.equal(g.phase,'pull');m.at(53000);
    if(needsOvertime){assert.equal(g.overtime,true);assert.equal(g.phase,'pull');if(winner!=='draw')g.gift(single(winner==='red'?'r':'b','overtime'));m.at(63000);}
    assert.equal(g.phase,'result');assert.equal(m.results.length,1);assert.equal(m.results[0].winner,winner);
    const resultEnd=g.endsAt, frozen={...g.score};
    g.like({uniqueId:'r',likeCount:100});g.gift(single('b','result'));assert.deepEqual(g.score,frozen);
    m.at(resultEnd-1);assert.equal(g.phase,'result');m.at(resultEnd);assert.equal(g.phase,'transition');
    assert.deepEqual(g.score,{red:0,blue:0});assert.deepEqual(g.mana,{red:{value:0,buffUntil:null},blue:{value:0,buffUntil:null}});
    m.at(resultEnd+2000);assert.equal(g.phase,'lobby');m.at(resultEnd+10000);assert.equal(g.phase,'pull');
    assert.equal(m.results.length,1);assert.equal(g.players.size,2);invariants(g);
  });
}

for(const team of ['red','blue'])test(`early victory for ${team} happens at minimum time, emits once, and cycles`,()=>{
  const m=match({earlyWinMinSeconds:15}),g=m.game;join(g,'r','red');join(g,'b','blue');m.at(8000);
  g.gift(single(team==='red'?'r':'b','winning',{diamondCount:100}));
  m.at(22999);assert.equal(g.phase,'pull');m.at(23000);assert.equal(g.phase,'result');
  assert.equal(m.results.length,1);assert.equal(m.results[0].winner,team);assert.equal(g.mana[team].buffUntil,null);
  m.at(35000);assert.equal(g.phase,'lobby');assert.equal(m.results.length,1);
});

for(const phase of ['lobby','countdown','pull','result','transition'])test(`pause/resume an entire ${phase} phase rejects input and preserves the remaining cycle`,()=>{
  const m=match(),g=m.game;join(g,'r','red');join(g,'b','blue');
  const times={lobby:1000,countdown:6000,pull:9000,result:64000,transition:74000};m.at(times[phase]);
  if(phase==='pull')g.gift(single('r','buff',{diamondCount:100}));
  assert.equal(g.phase,phase);g.pause();const before=g.snapshot(),count=m.results.length;
  m.advance(120000);g.comment({uniqueId:'late',comment:'do'});g.like({uniqueId:'r',likeCount:100});assert.equal(g.gift(single('r','paused')),'paused');
  assert.deepEqual(g.snapshot(),before);assert.equal(m.results.length,count);
  g.resume();assert.equal(g.endsAt,before.endsAt+120000);
  m.at(g.endsAt);assert.notEqual(g.phase,phase);invariants(g);
});

test('full gift lifecycle: pending, duplicate, invalid, overtime completion, cross-round replay and source reset',()=>{
  const m=match(),g=m.game;join(g,'r','red');join(g,'b','blue');m.at(8000);
  const streak={...single('r','start'),streakable:true,groupId:'90071992547409931',repeatEnd:false};
  assert.equal(g.gift(streak),'pending');assert.equal(g.score.red,0);
  assert.equal(g.gift(single('r','invalid',{diamondCount:-1})),'invalid-value');
  m.at(53000);assert.equal(g.overtime,true);
  const end={...streak,msgId:'end',repeatEnd:true,repeatCount:3};
  assert.equal(g.gift(end),'credited');assert.equal(g.score.red,150);assert.equal(g.gift(end),'duplicate');
  m.at(63000);assert.equal(m.results[0].mvp.red.points,150);
  m.at(83000);assert.equal(g.phase,'pull');assert.equal(g.gift(end),'cross-round');assert.equal(g.score.red,0);
  g.reset({clearPlayers:true});assert.equal(g.players.size,0);assert.equal(g.gifts.size,0);invariants(g);
});

test('waiting squad takes the next match even when active players donate more',()=>{
  const m=match(),g=m.game;
  for(const team of ['red','blue'])for(let i=0;i<12;i++)join(g,`${team}-${i}`,team);
  m.at(8000);g.gift(single('red-0','active',{diamondCount:99}));g.gift(single('red-9','waiting',{diamondCount:3}));
  const expected=g.snapshot().upNext.red.slice();assert.deepEqual(expected,['red-9','red-5','red-6','red-7','red-8']);
  m.at(65000);m.at(73000);assert.equal(g.phase,'pull');
  const active=g.snapshot().players.filter(p=>p.team==='red'&&p.lineupRank<=5).sort((a,b)=>a.lineupRank-b.lineupRank).map(p=>p.uniqueId);
  assert.deepEqual(active,expected);invariants(g);
});

for(const phase of ['lobby','countdown','pull','result','transition'])test(`manual stop and restart from ${phase} never emits an aborted result`,()=>{
  const m=match(),g=m.game;join(g,'r','red');join(g,'b','blue');
  m.at({lobby:1000,countdown:6000,pull:9000,result:64000,transition:74000}[phase]);
  assert.equal(g.phase,phase);const count=m.results.length;g.stop();m.advance(120000);
  assert.equal(g.phase,'waiting');assert.equal(m.results.length,count);
  g.start();assert.equal(g.phase,'countdown');m.advance(3000);assert.equal(g.phase,'pull');
  assert.deepEqual(g.score,{red:0,blue:0});invariants(g);
});

test('events exactly at regulation and overtime deadlines belong to the resulting phase',()=>{
  const m=match(),g=m.game;join(g,'r','red');join(g,'b','blue');m.at(8000);
  m.at(53000);assert.equal(g.overtime,true);
  g.like({uniqueId:'r',likeCount:1});assert.equal(g.score.red,1); // no regulation double
  m.at(63000);assert.equal(g.phase,'result');
  const frozen={...g.score};g.gift(single('b','too-late',{diamondCount:100}));g.like({uniqueId:'b',likeCount:100});
  assert.deepEqual(g.score,frozen);assert.equal(m.results[0].winner,'red');
});

test('delayed server ticks produce the same bot matches as small regular ticks',()=>{
  const seedRandom=()=>{let seed=42;return ()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);};
  const fine=match({},seedRandom()),coarse=match({},seedRandom());
  join(fine.game,'h','red');join(coarse.game,'h','red');
  for(let time=100;time<=180000;time+=100)fine.at(time);
  coarse.at(180000);
  assert.deepEqual(coarse.results,fine.results);assert.deepEqual(coarse.game.snapshot(),fine.game.snapshot());
  assert.ok(coarse.results.length>=2);
});

// Reproducible mixed-event simulation; failure names include the replay seed.
for(let seed=1;seed<=40;seed++)test(`mixed full-match simulation seed ${seed}`,()=>{
  let state=seed;const random=()=>((state=(1664525*state+1013904223)>>>0)/2**32);
  const m=match({lobbySeconds:1,countdownSeconds:1,pullSeconds:8,overtimeSeconds:2,resultSeconds:2,transitionSeconds:1,inactivitySeconds:40,earlyWinMinSeconds:3},random),g=m.game;
  for(let i=0;i<400;i++) {
    m.advance(Math.floor(random()*600));
    const id=`p${Math.floor(random()*30)}`,action=Math.floor(random()*10);
    if(action<3)join(g,id,random()<.5?'red':'blue');
    else if(action<5)g.like({uniqueId:id,likeCount:Math.floor(random()*120)});
    else if(action<7){const e=single(id,`${seed}-${i}`,{diamondCount:1+Math.floor(random()*5)});g.gift(e);g.gift(e);}
    else if(action===7){g.pause();const frozen=g.snapshot();m.advance(3000);assert.deepEqual(g.snapshot(),frozen);g.resume();}
    else if(action===8)g.member({uniqueId:id});
    invariants(g);
  }
  assert.ok(m.results.length>=3);
  for(const r of m.results){assert.equal(r.phase,'result');assert.ok(['red','blue','draw'].includes(r.winner));for(const team of ['red','blue'])assert.equal(r.mana[team].buffUntil,null);}
});
