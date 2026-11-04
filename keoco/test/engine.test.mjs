import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.mjs';

test('starts in lobby with deterministic deadline', () => {
  const game = new GameEngine({ now: () => 1000 });
  assert.equal(game.snapshot().phase, 'lobby');
  assert.equal(game.snapshot().endsAt, 6000);
});

function setup(config = {}) {
  let time = 0; const results = [];
  const game = new GameEngine({ config: {lobbySeconds:30, resultSeconds:15, idleSeconds:3600, ...config}, now: () => time, random: () => 0, onResult: r => results.push(r) });
  return { game, results, advance(ms) { time += ms; game.tick(); } };
}
const join = (game, id, comment = 'do') => game.comment({ uniqueId: id, nickname: id, comment });

test('one real player starts a bot-filled match and the next replaces a bot without resetting countdown', () => {
  const {game, advance} = setup(); join(game, 'first'); advance(30000);
  assert.equal(game.snapshot().phase, 'countdown');
  const deadline=game.endsAt;join(game, 'a', 'XANH');assert.equal(game.snapshot().phase,'countdown');
  assert.equal(game.endsAt,deadline);assert.equal(game.snapshot().mode,'pvp');
  assert.equal(game.snapshot().players.find(p=>p.uniqueId==='a').team, 'blue');
  assert.equal(game.snapshot().phase, 'countdown'); advance(3000);
  assert.equal(game.snapshot().phase, 'pull');
});

test('team comments ignore case, accents, punctuation and emoji', () => {
  const {game} = setup();
  ['Do','ĐỎ','đỏ!!',' Xanh 💙','XANH.','do ❤'].forEach((c,i)=>join(game,String(i),c));
  assert.deepEqual(['0','1','2','3','4','5'].map(id=>game.players.get(id).team),['red','red','red','blue','blue','red']);
});

test('default regulation lasts 45 seconds and tied overtime lasts 10 seconds', () => {
  const {game, advance, results} = setup();
  for (let i=0; i<6; i++) join(game, String(i), i<3 ? 'do' : 'xanh');
  advance(33000); assert.equal(game.phase, 'pull'); assert.equal(game.endsAt, 78000);
  advance(44999); assert.equal(game.phase, 'pull'); assert.equal(game.overtime, false);
  advance(1); assert.equal(game.overtime, true); assert.equal(game.endsAt, 88000);
  advance(9999); assert.equal(game.phase, 'pull');
  advance(1); assert.equal(game.phase, 'result'); assert.equal(results[0].winner, 'draw');
});

test('custom regulation length remains configurable', () => {
  const {game, advance} = setup({pullSeconds: 60});
  for (let i=0; i<6; i++) join(game, String(i), i<3 ? 'do' : 'xanh');
  advance(33000); assert.equal(game.endsAt, 93000);
  advance(45000); assert.equal(game.overtime, false);
  advance(15000); assert.equal(game.overtime, true);
});

test('pvp locks teams, late players are balanced, and every real heart counts', () => {
  const {game, advance} = setup();
  for (let i=0; i<6; i++) join(game, String(i), i<3 ? 'đỏ' : 'xanh');
  advance(33000); assert.equal(game.snapshot().mode, 'pvp');
  join(game, '0', 'xanh'); assert.equal(game.snapshot().players[0].team, 'red');
  game.like({uniqueId:'0', likeCount:100}); assert.equal(game.snapshot().score.red,100);
  advance(2000); game.like({uniqueId:'0',likeCount:100}); assert.equal(game.snapshot().score.red,200);
  join(game, 'late', 'hello'); assert.equal(game.snapshot().players.find(p=>p.uniqueId==='late').team,'red');
});

test('gift streak charges mana and scores once at end without likes', () => {
  const {game, advance} = setup(); for(let i=0;i<6;i++) join(game,String(i),i<3?'do':'xanh');
  advance(33000); advance(35000);
  game.gift({uniqueId:'0',diamondCount:2,repeatCount:3,streakable:true,repeatEnd:false});
  assert.equal(game.snapshot().score.red,0);
  game.gift({uniqueId:'0',diamondCount:2,repeatCount:3,streakable:true,repeatEnd:true});
  assert.equal(game.snapshot().score.red,300); assert.equal(game.snapshot().mana.red.value,6);
});

test('15-second warning does not move the 10-second scoring multiplier or apply it in overtime', () => {
  const {game, advance} = setup({earlyWinMinSeconds: 1000});
  for (let i=0; i<6; i++) join(game, String(i), i<3 ? 'do' : 'xanh');
  advance(33000); advance(30000);
  game.like({uniqueId:'0',likeCount:1}); assert.equal(game.score.red,1);
  game.like({uniqueId:'3',likeCount:1}); assert.equal(game.score.blue,1);
  advance(5000);
  game.like({uniqueId:'0',likeCount:1}); assert.equal(game.score.red,3);
  game.like({uniqueId:'3',likeCount:1}); assert.equal(game.score.blue,3);
  advance(10000); assert.equal(game.overtime,true);
  game.like({uniqueId:'0',likeCount:1}); assert.equal(game.score.red,4);
});

test('tie enters overtime then reports draw once and preserves players next round', () => {
  const {game, advance, results} = setup(); for(let i=0;i<6;i++) join(game,String(i),i<3?'do':'xanh');
  advance(33000); advance(45000); assert.equal(game.snapshot().overtime,true);
  advance(10000); assert.equal(game.snapshot().phase,'result'); assert.equal(results.length,1);
  assert.equal(results[0].winner,'draw'); advance(15000);
  assert.equal(game.snapshot().phase,'transition'); advance(5000); assert.equal(game.snapshot().phase,'lobby'); assert.equal(game.snapshot().players.length,6);
});

test('bots score on ticks and are excluded from MVP', () => {
  const {game, advance} = setup();game.random=()=>.5;join(game,'h');advance(33000);advance(1000);
  assert.ok(game.score.red>0&&game.score.blue>0);
  advance(59000); assert.equal(game.snapshot().mvp.blue,null);
});

test('late join takes the requested team while it has a bot slot, otherwise balances', () => {
  const {game, advance} = setup(); for(let i=0;i<6;i++) join(game,String(i),i<4?'do':'xanh');
  advance(33000); join(game,'late','do'); assert.equal(game.snapshot().players.find(p=>p.uniqueId==='late').team,'red');
  join(game,'full','do'); assert.equal(game.snapshot().players.find(p=>p.uniqueId==='full').team,'blue');
  join(game,'any','hello'); assert.equal(game.snapshot().players.find(p=>p.uniqueId==='any').team,'blue');
});

test('configured early win percent changes threshold', () => {
  const {game, advance} = setup({earlyWinPercent: 90}); for(let i=0;i<6;i++) join(game,String(i),i<3?'do':'xanh');
  advance(33000); game.gift({uniqueId:'0',diamondCount:3}); game.gift({uniqueId:'3',diamondCount:1});
  advance(15000); assert.equal(game.snapshot().phase,'pull');
});


test('inactive lobby players expire at five minutes and the bots leave with them', () => {
  const {game, advance} = setup({lobbySeconds: 600});
  join(game, 'idle'); advance(299999);
  assert.equal(game.snapshot().players.length, 1);
  advance(1); assert.equal(game.snapshot().players.length, 0);
  assert.equal(game.snapshot().phase, 'lobby');assert.equal(game.snapshot().bots.length,0);
  join(game, 'back'); assert.equal(game.snapshot().phase, 'lobby');
});


test('ordinary chat and member activity refresh existing players; past the auto-join cap spectators stay out', () => {
  const {game, advance} = setup({lobbySeconds: 600, inactivitySeconds: 10, autoJoinLimit: 2});
  join(game,'chat'); join(game,'member');
  advance(9000); game.comment({uniqueId:'chat',comment:'hello'}); game.member({uniqueId:'member'}); game.member({uniqueId:'spectator'});
  advance(1000); assert.deepEqual(game.snapshot().players.map(p=>p.uniqueId).sort(),['chat','member']);
  advance(9000); assert.equal(game.snapshot().players.length,0);
});

test('inactive players remain locked through result and are pruned only at its boundary', () => {
  const {game, advance, results} = setup({lobbySeconds:1,countdownSeconds:1,pullSeconds:4,resultSeconds:3,inactivitySeconds:2,pvpThreshold:1,earlyWinMinSeconds:100});
  join(game,'a'); advance(2000); game.gift({uniqueId:'a',diamondCount:1}); game.like({uniqueId:'a',likeCount:1});
  const score=game.snapshot().score.red; advance(3000);
  assert.equal(game.snapshot().phase,'pull'); assert.equal(game.snapshot().players.length,1); assert.equal(game.snapshot().score.red,score);
  advance(1000); assert.equal(results[0].mvp.red.uniqueId,'a'); assert.equal(game.snapshot().players.length,1);
  advance(3000); assert.equal(game.snapshot().players.length,0); assert.equal(results[0].mvp.red.uniqueId,'a');
});

test('mode uses active players at lobby deadline, including manual start', () => {
  const {game, advance} = setup({lobbySeconds:100,inactivitySeconds:10,pvpThreshold:2});
  join(game,'idle'); advance(9000); join(game,'active'); advance(1000); game.start();
  assert.equal(game.snapshot().mode,'pvp'); assert.deepEqual(game.snapshot().players.map(p=>p.uniqueId),['active']);
});

test('likes and gifts refresh activity even when they do not score', () => {
  const {game, advance} = setup({lobbySeconds:100,inactivitySeconds:10});
  join(game,'liker'); join(game,'gifter'); advance(9000);
  game.like({uniqueId:'liker',likeCount:1}); game.gift({uniqueId:'gifter',diamondCount:1});
  advance(1000); assert.equal(game.snapshot().players.length,2);
  advance(9000); assert.equal(game.snapshot().players.length,0);
});


test('PvP lock fills an empty team without disturbing nonempty teams', () => {
 const {game}=setup({pvpThreshold:2}); for(let i=0;i<6;i++) join(game,String(i)); game.start();
 assert.equal(game.snapshot().players.filter(p=>p.team==='blue').length,3);
});

test('pause catches up overdue time then freezes and shifts deadlines and bot ticks', () => {
 let time=0; const results=[]; const game=new GameEngine({now:()=>time,random:()=>0.5,onResult:r=>results.push(r),config:{lobbySeconds:1,countdownSeconds:1,pullSeconds:10}});
 join(game,'a'); time=3500; game.pause(); const frozen=game.snapshot(); assert.equal(frozen.phase,'pull'); assert.ok(frozen.score.blue>0); assert.equal(frozen.paused,true);
 time=23500; game.tick(); assert.equal(game.snapshot().score.blue,frozen.score.blue); assert.equal(results.length,0);
 game.resume(); assert.equal(game.snapshot().endsAt,frozen.endsAt+20000); time+=500; game.tick(); assert.ok(game.snapshot().score.blue>frozen.score.blue);
});


test('PvP preserves uneven teams when neither is empty',()=>{
 const {game}=setup({pvpThreshold:2}); for(let i=0;i<5;i++) join(game,String(i),i===0?'xanh':'do'); game.start();
 assert.deepEqual(game.snapshot().players.map(p=>p.team),['blue','red','red','red','red']);
});

test('overdue result is emitted once before pausing and never repeated on resume',()=>{
 let now=0; const results=[]; const game=new GameEngine({now:()=>now,onResult:r=>results.push(r),config:{lobbySeconds:1,countdownSeconds:1,pullSeconds:1,overtimeSeconds:1,resultSeconds:100,pvpThreshold:1}});
 join(game,'a'); now=5000; game.pause(); assert.equal(results.length,1); assert.equal(game.snapshot().phase,'result'); now=50000; game.tick(); game.resume(); game.tick(); assert.equal(results.length,1);
});


test('snapshot tracks cumulative gift diamonds without modifying gift scoring', () => {
  const {game, advance} = setup({pvpThreshold:1, earlyWinMinSeconds:100});
  join(game,'a'); join(game,'b'); advance(33000);
  assert.deepEqual(game.snapshot().players.map(p=>p.giftDiamonds), [0,0]);
  game.gift({uniqueId:'b',diamondCount:2,repeatCount:3});
  game.gift({uniqueId:'b',diamondCount:4});
  assert.equal(game.snapshot().players[1].giftDiamonds,10);
  assert.equal(game.snapshot().players[1].points,500);
  assert.equal(game.snapshot().players[0].giftDiamonds,0);
});


const ranked = (game, team='red') => game.snapshot().players.filter(p=>p.team===team).sort((a,b)=>a.lineupRank-b.lineupRank);
function priorityRound() {
  const s=setup({lobbySeconds:1,countdownSeconds:1,pullSeconds:100,resultSeconds:1,pvpThreshold:1,earlyWinMinSeconds:1000});
  for(let i=0;i<14;i++) join(s.game,`r${i}`);
  for(let i=0;i<14;i++) join(s.game,`b${i}`,'xanh');
  s.advance(2000); return s;
}
function nextRound(s, manual=false) {
  s.game.finish(s.game.now());
  if(manual) s.game.start();
  else { s.advance(1000); assert.equal(s.game.phase,'transition'); s.advance(s.game.config.transitionSeconds*1000); assert.equal(s.game.phase,'lobby'); s.advance(1000); }
  assert.equal(s.game.phase,'countdown'); s.advance(1000); assert.equal(s.game.phase,'pull');
}

test('next-round rank uses total diamond value, keeps FIFO ties and locks both teams for the round',()=>{
  const s=priorityRound(), {game}=s;
  const initial=ranked(game).map(p=>p.uniqueId);
  game.gift({uniqueId:'r13',diamondCount:10});
  game.gift({uniqueId:'r12',diamondCount:1,repeatCount:9});
  game.gift({uniqueId:'r11',diamondCount:3,repeatCount:2});
  game.gift({uniqueId:'r11',diamondCount:4}); // total 10, FIFO ahead of r13
  game.gift({uniqueId:'b13',diamondCount:7});
  assert.deepEqual(ranked(game).map(p=>p.uniqueId),initial);
  assert.equal(ranked(game)[13].lineupRank,14); // overflow gifter still waits
  nextRound(s);
  assert.deepEqual(ranked(game).slice(0,4).map(p=>p.uniqueId),['r11','r13','r12','r5']);
  assert.deepEqual(ranked(game).map(p=>p.lineupRank),Array.from({length:14},(_,i)=>i+1));
  assert.equal(ranked(game,'blue')[0].uniqueId,'b13');
  assert.equal(ranked(game).filter(p=>p.lineupRank<=12).length,12);
  assert.deepEqual(ranked(game).slice(12).map(p=>p.uniqueId),['r3','r4']);
  assert.equal(game.players.get('r11').priorityDiamonds,10);
  assert.ok(game.snapshot().players.every(p=>p.giftDiamonds===0));
  game.gift({uniqueId:'r10',diamondCount:20});
  assert.equal(ranked(game)[0].uniqueId,'r11');
  nextRound(s,true);
  assert.equal(ranked(game)[0].uniqueId,'r10');
  assert.equal(game.players.get('r11').priorityDiamonds,0);
  assert.deepEqual(ranked(game).slice(1,4).map(p=>p.uniqueId),['r7','r8','r9']);
  nextRound(s);
  assert.deepEqual(ranked(game).map(p=>p.uniqueId),['r1','r2','r3','r4','r5','r6','r11','r12','r13','r0','r7','r8','r9','r10']); // FIFO rotation, no lifetime accumulation
});

test('late joins append, waiting contributions count next round, and teams stay locked through result',()=>{
  const s=priorityRound(), {game}=s;
  join(game,'late','xanh'); // balanced red despite request
  assert.equal(game.players.get('late').team,'red');
  assert.equal(game.players.get('late').lineupRank,15);
  game.gift({uniqueId:'late',diamondCount:20});
  for(const phase of ['pull','result']) {
    if(phase==='result') game.finish(game.now());
    join(game,'late','xanh'); join(game,'r13','xanh');
    assert.equal(game.players.get('late').team,'red');
    assert.equal(game.players.get('r13').team,'red');
    assert.equal(game.players.get('late').pendingTeam,'blue');
    assert.equal(game.players.get('late').lineupRank,15);
  }
  // Undo the pending switch so this test keeps covering priority carry-over.
  join(game,'late','do'); join(game,'r13','do');
  s.advance(1000); // result -> lobby carries priority exactly once
  assert.equal(game.players.get('late').lineupRank,1);
  join(game,'lobby-new');
  s.advance(1000);
  assert.equal(game.players.get('late').lineupRank,1);
  join(game,'late','xanh'); assert.equal(game.players.get('late').team,'red'); // countdown
  s.advance(1000);
  assert.equal(game.players.get('lobby-new').priorityDiamonds,0);
  assert.ok(game.players.get('lobby-new').lineupRank>12);
});

test('only completed credited pull gifts contribute; result and countdown gifts do not',()=>{
  const {game,advance}=setup({lobbySeconds:1,countdownSeconds:1,pullSeconds:4,resultSeconds:1,pvpThreshold:1,earlyWinMinSeconds:100});
  join(game,'a');
  game.gift({uniqueId:'a',diamondCount:10});
  advance(1000); game.gift({uniqueId:'a',diamondCount:10});
  assert.equal(game.players.get('a').giftDiamonds,0);
  advance(1000);
  game.gift({uniqueId:'a',diamondCount:1,repeatCount:3,streakable:true,repeatEnd:false});
  assert.equal(game.players.get('a').giftDiamonds,0);
  game.gift({uniqueId:'a',diamondCount:1,repeatCount:3,streakable:true,repeatEnd:true}); game.like({uniqueId:'a',likeCount:1});
  assert.equal(game.players.get('a').giftDiamonds,3);
  advance(4000); game.gift({uniqueId:'a',diamondCount:5});
  assert.equal(game.players.get('a').giftDiamonds,3);
  advance(1000); assert.equal(game.players.get('a').priorityDiamonds,3);
  assert.equal(game.players.get('a').giftDiamonds,0);
  advance(1000); assert.equal(game.players.get('a').priorityDiamonds,3);
});

const liveGift = (extra = {}) => ({live:true, uniqueId:'a', giftId:'5655', groupId:'90071992547409930', msgId:'1', diamondCount:2, repeatCount:1, streakable:true, repeatEnd:false, ...extra});
function paidRound(options = {}) {
  const s = setup({lobbySeconds:1,countdownSeconds:1,pullSeconds:4,resultSeconds:1,pvpThreshold:1,earlyWinMinSeconds:100,...options});
  join(s.game,'a'); s.advance(2000); return s;
}

test('LIVE cumulative streak uses group identity despite different message IDs and duplicate ends',()=>{
  const {game}=paidRound();
  game.gift(liveGift()); game.gift(liveGift({msgId:'2',repeatCount:3}));
  assert.equal(game.score.red,0);
  game.gift(liveGift({msgId:'3',repeatCount:3,repeatEnd:true}));
  const earned=game.score.red; assert.equal(earned,300);
  assert.equal(game.gift(liveGift({msgId:'4',repeatCount:3,repeatEnd:true})),'duplicate');
  assert.equal(game.score.red,earned); assert.equal(game.players.get('a').giftDiamonds,6);
});

test('LIVE streak first seen before pull or in a previous match never scores in the next match',()=>{
  const {game,advance}=paidRound(); game.gift(liveGift());
  // Another completed gift is retained when the pending streak is rejected.
  game.gift(liveGift({groupId:'other'})); game.gift(liveGift({groupId:'other',repeatEnd:true})); const earned=game.score.red;
  game.finish(2000); game.gift(liveGift({repeatCount:3,repeatEnd:true}));
  assert.equal(game.score.red,earned);
  advance(1000); game.start(); advance(1000);
  assert.equal(game.phase,'pull');
  assert.equal(game.gift(liveGift({repeatCount:4,repeatEnd:true})),'cross-round');
  assert.equal(game.score.red,0);
  game.reset(); game.gift(liveGift({groupId:'lobby'})); game.start(); advance(1000);
  assert.equal(game.gift(liveGift({groupId:'lobby',repeatEnd:true})),'cross-round');
  assert.equal(game.score.red,0);
});

test('LIVE single gifts deduplicate by message ID across reset; unidentified and conflicting streaks fail closed',()=>{
  const {game}=paidRound();
  const single=liveGift({streakable:false,groupId:undefined,repeatEnd:true});
  game.gift(single); const earned=game.score.red;
  assert.equal(game.gift(single),'duplicate'); assert.equal(game.score.red,earned);
  assert.equal(game.gift(liveGift({groupId:'0',repeatEnd:true})),'unidentified');
  game.gift(liveGift({repeatCount:4}));
  assert.equal(game.gift(liveGift({repeatCount:2,repeatEnd:true})),'conflict');
  assert.equal(game.score.red,earned);
  game.reset(); assert.equal(game.gift(single),'cross-round');
});

test('roster capacity rejects newcomers without evicting earned points and still refreshes existing players',()=>{
  const game=new GameEngine({maxPlayers:3,now:()=>0});
  for(let i=0;i<4;i++) join(game,String(i));
  assert.equal(game.players.size,3); game.start(); game.phase='pull';
  game.gift({uniqueId:'0',diamondCount:1}); const earned=game.players.get('0').points;
  game.like({uniqueId:'new',likeCount:10}); game.comment({uniqueId:'0',nickname:'Updated'});
  assert.equal(game.players.size,3); assert.equal(game.players.get('0').points,earned);
  assert.equal(game.players.get('0').nickname,'Updated');
});

test('gift identity storage saturates safely without evicting duplicate protection',()=>{
  const game=new GameEngine({maxTrackedGifts:2,now:()=>0,config:{earlyWinMinScore:1000000}}); join(game,'a'); game.start(); game.phase='pull';
  game.gift(liveGift({groupId:'one'})); game.gift(liveGift({groupId:'one',repeatEnd:true}));
  game.gift(liveGift({groupId:'two'})); game.gift(liveGift({groupId:'two',repeatEnd:true}));
  const earned=game.score.red;
  assert.equal(game.gift(liveGift({groupId:'three',repeatEnd:true})),'capacity');
  assert.equal(game.gift(liveGift({groupId:'one',repeatEnd:true})),'duplicate'); assert.equal(game.score.red,earned);
});

test('LIVE completion without an observed streak start fails closed, and pending gifts refresh roster',()=>{
 const {game}=paidRound();
 assert.equal(game.gift(liveGift({repeatEnd:true})),'unobserved-start'); assert.equal(game.score.red,0);
 assert.equal(game.gift(liveGift({uniqueId:'new',groupId:'new'})),'pending'); assert.ok(game.players.has('new'));
});

test('default roster limit is bounded and natural match transitions retain gift tombstones',()=>{
 const game=new GameEngine({now:()=>0}); for(let i=0;i<1005;i++) join(game,`p${i}`);
 assert.equal(game.players.size,1000);
 const {game:paid,advance}=paidRound();
 paid.gift(liveGift());
 paid.gift(liveGift({streakable:false,msgId:'single'})); paid.like({uniqueId:'a',likeCount:1});
 const earned=paid.score.red; advance(4000);
 assert.equal(paid.phase,'result'); assert.equal(paid.score.red,earned);
 advance(8000); assert.equal(paid.phase,'pull');
 assert.equal(paid.gift(liveGift({repeatEnd:true,repeatCount:5})),'cross-round'); assert.equal(paid.score.red,0);
});

test('paid duplicate, invalid and cross-round streaks cannot inflate next-round priority',()=>{
  const s=priorityRound(), {game}=s;
  const gift=extra=>liveGift({uniqueId:'r13',...extra});
  assert.equal(game.gift(gift({repeatCount:2})),'pending');
  assert.equal(game.gift(gift({repeatCount:4,repeatEnd:true})),'credited');
  assert.equal(game.gift(gift({msgId:'different',repeatCount:4,repeatEnd:true})),'duplicate');
  assert.equal(game.gift(gift({streakable:false,msgId:'bad',diamondCount:-10})),'invalid-value');
  game.gift(gift({groupId:'unfinished'}));
  assert.equal(game.players.get('r13').giftDiamonds,8);
  nextRound(s);
  assert.equal(ranked(game)[0].uniqueId,'r13');
  assert.equal(game.players.get('r13').priorityDiamonds,8);
  assert.equal(game.gift(gift({repeatCount:4,repeatEnd:true})),'cross-round');
  assert.equal(game.gift(gift({groupId:'unfinished',repeatCount:30,repeatEnd:true})),'cross-round');
  assert.equal(game.players.get('r13').giftDiamonds,0);
  nextRound(s);
  assert.equal(game.players.get('r13').priorityDiamonds,0);
  assert.equal(ranked(game)[0].uniqueId,'r9');
});

test('manual reset clears priority while retaining paid gift tombstones',()=>{
  const s=priorityRound(), {game}=s;
  const single=liveGift({uniqueId:'r13',streakable:false,msgId:'paid-single'});
  game.gift(single); nextRound(s,true);
  assert.equal(ranked(game)[0].uniqueId,'r13');
  game.reset(); game.start(); s.advance(1000);
  assert.equal(ranked(game)[0].uniqueId,'r5'); // reset keeps the current FIFO queue
  assert.equal(game.gift(single),'cross-round');
  assert.equal(game.players.get('r13').giftDiamonds,0);
});

test('lobby team selection and mode rebalance produce contiguous ranks before locking',()=>{
  const s=priorityRound(), {game}=s;
  game.gift({uniqueId:'r13',diamondCount:10}); game.finish(game.now()); s.advance((game.config.resultSeconds+game.config.transitionSeconds)*1000);
  join(game,'r13','xanh'); assert.equal(game.players.get('r13').team,'blue');
  game.start();
  assert.equal(ranked(game,'blue')[0].uniqueId,'r13');
  for(const team of ['red','blue']) assert.deepEqual(ranked(game,team).map(p=>p.lineupRank),Array.from({length:ranked(game,team).length},(_,i)=>i+1));
  const pve=setup({pvpThreshold:100}); join(pve.game,'a','xanh'); join(pve.game,'b'); pve.game.start();
  assert.deepEqual(ranked(pve.game).map(p=>p.lineupRank),[1]);assert.deepEqual(ranked(pve.game,'blue').map(p=>p.lineupRank),[1]);
});


test('default cycle reaches the next lobby in 65 seconds with a two-second transition', () => {
  const {game, advance} = setup({lobbySeconds:5, resultSeconds:10, earlyWinMinSeconds: 1000});
  for (let i=0; i<6; i++) join(game, String(i), i<3 ? 'do' : 'xanh');
  assert.equal(game.endsAt,5000);
  advance(5000); assert.equal(game.phase,'countdown'); assert.equal(game.endsAt,8000);
  advance(3000); assert.equal(game.phase,'pull'); assert.equal(game.endsAt,53000);
  game.gift({uniqueId:'0',diamondCount:1}); game.like({uniqueId:'0',likeCount:1});
  advance(45000); assert.equal(game.phase,'result'); assert.equal(game.endsAt,63000);
  advance(10000); assert.equal(game.phase,'transition'); assert.equal(game.endsAt,65000);
  advance(2000); assert.equal(game.phase,'lobby'); assert.equal(game.endsAt,70000);
});


test('transition freezes while paused, retains priority, and never scores', () => {
  let now=0; const game=new GameEngine({now:()=>now,config:{lobbySeconds:1,countdownSeconds:1,pullSeconds:2,resultSeconds:1,transitionSeconds:7,pvpThreshold:1,earlyWinMinSeconds:100}});
  join(game,'a'); now=2000; game.tick(); game.gift({uniqueId:'a',diamondCount:2}); game.like({uniqueId:'a',likeCount:1});
  now=5000; game.tick(); assert.equal(game.phase,'transition'); assert.equal(game.endsAt,12000);
  assert.equal(game.players.get('a').priorityDiamonds,2); game.like({uniqueId:'a',likeCount:10}); game.gift({uniqueId:'a',diamondCount:9});
  assert.equal(game.score.red,0); assert.equal(game.players.get('a').priorityDiamonds,2);
  now=6000; game.pause(); now=16000; game.resume(); assert.equal(game.endsAt,22000);
  now=22000; game.tick(); assert.equal(game.phase,'lobby'); assert.equal(game.players.get('a').priorityDiamonds,2);
});

test('empty lobby keeps scheduling automatic matches', () => {
  let now=0; const game=new GameEngine({now:()=>now}); now=15000; game.tick();
  assert.equal(game.demo,true);assert.ok(game.endsAt>now); now=1000000; game.tick(); assert.notEqual(game.phase,'waiting');assert.ok(game.endsAt>now);
});

test('bots are labelled by team and slot and yield their slot to real players', () => {
  const {game} = setup();
  const names = () => game.snapshot().bots.map(b => b.nickname);
  join(game, 'a', 'DO');
  assert.deepEqual(names(), ['BOT ĐỎ 2','BOT ĐỎ 3','BOT ĐỎ 4','BOT ĐỎ 5','BOT XANH 1','BOT XANH 2','BOT XANH 3','BOT XANH 4','BOT XANH 5']);
  join(game, 'b', 'XANH');
  assert.ok(!names().includes('BOT XANH 1')); assert.equal(names().length, 8);
});

test('a mid-match team request waits for the next round, then moves the player', () => {
  const {game, advance} = setup();
  join(game,'a','do'); join(game,'b','xanh'); advance(30000); advance(3000);
  assert.equal(game.snapshot().phase,'pull');
  join(game,'a','xanh');
  let a=game.snapshot().players.find(p=>p.uniqueId==='a');
  assert.equal(a.team,'red'); assert.equal(a.pendingTeam,'blue');
  join(game,'a','do'); a=game.snapshot().players.find(p=>p.uniqueId==='a'); assert.equal(a.pendingTeam,undefined);
  join(game,'a','xanh');
  advance(45000); advance(10000); advance(15000);
  a=game.snapshot().players.find(p=>p.uniqueId==='a');
  assert.equal(a.team,'blue'); assert.equal(a.pendingTeam,undefined);
  assert.deepEqual(game.snapshot().players.filter(p=>p.team==='blue').map(p=>p.lineupRank).sort(),[1,2]);
});

test('with bots off the lobby waits for two real players, then splits a one-sided lobby',()=>{
  const {game, advance} = setup({botsEnabled:0});
  assert.equal(game.snapshot().bots.length,0); assert.equal(game.snapshot().waitingForPlayers,true);
  advance(30000); assert.equal(game.snapshot().phase,'lobby');
  join(game,'a','do'); advance(30000); assert.equal(game.snapshot().phase,'lobby'); assert.equal(game.snapshot().bots.length,0);
  game.start(); assert.equal(game.snapshot().phase,'lobby');
  join(game,'b','do'); assert.equal(game.snapshot().waitingForPlayers,false);
  advance(30000); const s=game.snapshot();
  assert.equal(s.phase,'countdown'); assert.equal(s.bots.length,0);
  assert.deepEqual(s.players.map(p=>p.team).sort(),['blue','red']);
  game.configure({botsEnabled:1}); assert.equal(game.snapshot().bots.length,8);
});

test('room entrants, likes and any comment auto-join balanced teams until the cap, then only ĐỎ/XANH enrolls',()=>{
  const {game} = setup({autoJoinLimit:3});
  game.member({uniqueId:'m1',nickname:'M1'}); game.like({uniqueId:'l1',likeCount:5}); game.comment({uniqueId:'c1',comment:'hello'});
  const s=game.snapshot(); assert.deepEqual(s.players.map(p=>p.uniqueId).sort(),['c1','l1','m1']);
  assert.deepEqual(s.players.map(p=>p.team).sort(),['blue','red','red']);
  game.member({uniqueId:'m2'}); game.like({uniqueId:'l2',likeCount:5}); game.comment({uniqueId:'c2',comment:'hello'});
  assert.equal(game.snapshot().players.length,3);
  game.comment({uniqueId:'c3',comment:'xanh'}); assert.equal(game.snapshot().players.find(p=>p.uniqueId==='c3').team,'blue');
});

test('with autoStart off each round waits in the lobby for the host to press start',()=>{
  const {game, advance} = setup({botsEnabled:0,autoStart:0});
  join(game,'a','do'); join(game,'b','xanh'); advance(60000);
  assert.equal(game.snapshot().phase,'lobby'); assert.equal(game.snapshot().waitingForHost,true);
  game.start(); assert.equal(game.snapshot().phase,'countdown'); assert.equal(game.snapshot().waitingForHost,false);
  advance(3000); advance(45000); advance(15000); advance(2000); advance(60000);
  assert.equal(game.snapshot().phase,'lobby'); assert.equal(game.snapshot().waitingForHost,true);
});

test('with bots off the lobby auto-starts at minPlayers; the host may start earlier from two',()=>{
  const {game, advance} = setup({botsEnabled:0,minPlayers:4});
  for(const id of ['a','b','c'])join(game,id,'do'); advance(60000);
  assert.equal(game.snapshot().phase,'lobby'); assert.equal(game.snapshot().playersNeeded,1);
  join(game,'d','do'); assert.equal(game.snapshot().playersNeeded,0); advance(30000);
  const s=game.snapshot(); assert.equal(s.phase,'countdown');
  assert.deepEqual(s.players.map(p=>p.team).sort(),['blue','blue','red','red']);
  const early=setup({botsEnabled:0,minPlayers:4}); join(early.game,'x','do'); join(early.game,'y','xanh');
  early.game.start(); assert.equal(early.game.snapshot().phase,'countdown');
});

test('with heartStartPlayers active players in the lobby, any of their hearts starts the match at once',()=>{
  const {game} = setup({botsEnabled:0,minPlayers:10,lobbySeconds:600});
  for(const id of ['a','b','c'])join(game,id,'do');
  game.like({uniqueId:'a',likeCount:1}); assert.equal(game.snapshot().phase,'lobby');
  join(game,'d','xanh'); assert.equal(game.snapshot().phase,'lobby');
  game.like({uniqueId:'c',likeCount:1}); assert.equal(game.snapshot().phase,'countdown');
  const held=setup({botsEnabled:0,autoStart:0}); for(const id of ['a','b','c','d'])join(held.game,id,'do');
  held.game.like({uniqueId:'a',likeCount:1}); assert.equal(held.game.snapshot().phase,'lobby');
});

test('a puller silent for idleSeconds of their turn walks to the stands, even with nobody to replace them',()=>{
  const {game, advance} = setup({lobbySeconds:5,idleSeconds:20,botsEnabled:0,minPlayers:2});
  join(game,'a','do'); join(game,'b','xanh'); advance(5000); advance(3000);
  assert.equal(game.snapshot().phase,'pull');
  for(let t=0;t<25;t++){ game.like({uniqueId:'b',likeCount:1}); advance(1000); }
  const rank=id=>game.snapshot().players.find(p=>p.uniqueId===id).lineupRank;
  assert.ok(rank('a')>5); assert.ok(rank('b')<=5);
  game.like({uniqueId:'a',likeCount:1}); advance(100); assert.ok(rank('a')<=5);
});

test('viewers waiting quietly in the stands still get the next turn',()=>{
  const {game, advance} = setup({lobbySeconds:5,resultSeconds:5,idleSeconds:20,botsEnabled:0,minPlayers:2,earlyWinMinSeconds:1000});
  for(let i=1;i<=7;i++) join(game,'r'+i,'do'); join(game,'b1','xanh');
  advance(5000); advance(3000);
  const field=()=>game.snapshot().players.filter(p=>p.team==='red'&&p.lineupRank<=5).map(p=>p.uniqueId);
  assert.deepEqual(field().sort(),['r1','r2','r3','r4','r5']);
  for(let t=0;t<70;t++){ for(const id of field().concat('b1')) game.like({uniqueId:id,likeCount:1}); advance(1000); if(game.snapshot().phase==='countdown')break; }
  const next=field(); assert.ok(next.includes('r6')&&next.includes('r7'));
});

test('presence events report a puller who goes quiet, and comes back', () => {
  let time = 0; const events = [];
  const game = new GameEngine({ config:{lobbySeconds:1, countdownSeconds:1, pullSeconds:600, idleSeconds:10, inactivitySeconds:60, earlyWinMinSeconds:1000, autoJoinLimit:0}, now:()=>time, random:()=>0, onPresence:e=>events.push([e.type,e.player.uniqueId]) });
  game.comment({uniqueId:'a', nickname:'A', comment:'do'}); game.comment({uniqueId:'b', nickname:'B', comment:'xanh'});
  const step = ms => { time += ms; game.tick(); };
  step(1000); step(1000); assert.equal(game.phase, 'pull');
  for (let i=0;i<15;i++) { step(1000); game.like({uniqueId:'b', likeCount:1}); }
  // Quiet is flagged first from silence alone; the pull then benches them as away.
  assert.deepEqual(events, [['quiet','a'],['away','a']]);
  const a = () => game.snapshot().players.find(p=>p.uniqueId==='a');
  assert.equal(a().away, true); assert.ok(!game.snapshot().upNext.red.includes('a'));
  game.like({uniqueId:'a', likeCount:1}); assert.deepEqual(events.at(-1), ['back','a']); assert.equal(a().away, false);
  // Interacting again brings them straight back down to pull, mid-match.
  step(100); assert.equal(game.phase, 'pull'); assert.ok(a().lineupRank <= 5);
});

test('the waiting queue is never flagged quiet, only the squad', () => {
  let time = 0; const events = [];
  const game = new GameEngine({ config:{lobbySeconds:600, idleSeconds:10, inactivitySeconds:60, autoJoinLimit:0, botsEnabled:0}, now:()=>time, random:()=>0, onPresence:e=>events.push([e.type,e.player.uniqueId]) });
  for (const id of ['r1','r2','r3','r4','r5','r6']) game.comment({uniqueId:id, nickname:id, comment:'do'});
  const rank = () => game.snapshot().players.find(p=>p.uniqueId==='r6');
  assert.equal(rank().lineupRank, 6);
  time = 9000; game.tick(); assert.deepEqual(events, []);
  time = 10000; game.tick();
  assert.deepEqual(events.map(e=>e[1]).sort(), ['r1','r2','r3','r4','r5']);
  assert.equal(rank().quiet, false); assert.equal(rank().away, false); assert.equal(rank().lineupRank, 6);
  time = 20000; game.tick(); assert.equal(events.length, 5, 'flagged once, not every tick');
  game.comment({uniqueId:'r1', comment:'hi'}); assert.deepEqual(events.at(-1), ['back','r1']);
});

test('touch neither renames an existing player nor enrolls a stranger', () => {
  const {game} = setup({lobbySeconds:600});
  join(game,'a'); game.touch({uniqueId:'a', nickname:'other'}); game.touch({uniqueId:'stranger'});
  const s = game.snapshot();
  assert.equal(s.players.length, 1); assert.equal(s.players[0].nickname, 'a');
});

test('replay restarts the current match with the same squad, a zeroed score and no recorded result', () => {
  const {game, results, advance} = setup({lobbySeconds:5, countdownSeconds:3, pullSeconds:60, botsEnabled:0, earlyWinMinSeconds:1000});
  for (let i=1;i<=7;i++) join(game,'r'+i,'do'); for (let i=1;i<=3;i++) join(game,'b'+i,'xanh');
  advance(5000); advance(3000); assert.equal(game.phase,'pull');
  const squad = () => game.snapshot().players.filter(p=>p.lineupRank<=5).map(p=>p.uniqueId).sort();
  const before = squad();
  game.like({uniqueId:'r1', likeCount:20}); advance(1000); assert.ok(game.snapshot().score.red > 0);
  game.replay();
  const s = game.snapshot();
  assert.equal(s.phase,'countdown'); assert.deepEqual(s.score,{red:0,blue:0}); assert.deepEqual(squad(), before);
  assert.equal(results.length, 0);
  advance(3000); assert.equal(game.phase,'pull');
});

test('replay outside a match just starts one', () => {
  const {game} = setup({lobbySeconds:600, botsEnabled:0});
  join(game,'a','do'); join(game,'b','xanh');
  game.replay(); assert.equal(game.phase,'countdown');
});
