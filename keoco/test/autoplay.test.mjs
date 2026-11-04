import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine} from '../engine.mjs';

function setup(){
 let time=0;const results=[];
 const game=new GameEngine({now:()=>time,random:()=>.5,onResult:r=>results.push(r),config:{lobbySeconds:1,countdownSeconds:1,pullSeconds:3,resultSeconds:1,transitionSeconds:1,overtimeSeconds:1,inactivitySeconds:20,earlyWinMinSeconds:100}});
 return {game,results,advance(ms){time+=ms;game.tick();}};
}

test('an empty room holds the lobby and never plays a bot-only match',()=>{
 const {game,results,advance}=setup();
 assert.equal(game.snapshot().demo,true);assert.equal(game.players.size,0);assert.equal(game.bots.length,0);
 for(let i=0;i<60;i++){advance(1000);assert.equal(game.phase,'lobby');}
 game.start();assert.equal(game.phase,'lobby');assert.equal(results.length,0);
});

test('the first viewer starts a match with clearly labelled bots filling both squads',()=>{
 const {game,advance}=setup();game.comment({uniqueId:'human',comment:'do'});
 assert.equal(game.demo,false);assert.equal(game.players.size,1);assert.equal(game.bots.length,9);
 assert.ok(game.bots.every(b=>/^BOT (ĐỎ|XANH) \d$/.test(b.nickname)));
 assert.deepEqual(game.bots.filter(b=>b.team==='red').map(b=>b.nickname),['BOT ĐỎ 2','BOT ĐỎ 3','BOT ĐỎ 4','BOT ĐỎ 5']);
 advance(1000);assert.equal(game.phase,'countdown');
});

test('humans replace bots one at a time without restarting a running match',()=>{
 for(const elapsed of [0,1000,3000,5000,6000])for(const event of ['comment','like','gift']){
  const {game,advance}=setup();game.comment({uniqueId:'first',comment:'do'});advance(elapsed);
  const before=game.snapshot(),botIds=new Set(game.bots.map(b=>b.uniqueId));
  if(event==='comment')game.comment({uniqueId:'human',comment:'xanh'});
  if(event==='like')game.like({uniqueId:'human',likeCount:1});
  if(event==='gift')game.gift({uniqueId:'human',diamondCount:1});
  assert.equal(game.bots.length,8);assert.equal(game.players.size,2);
  assert.equal(game.phase,before.phase);assert.equal(game.endsAt,before.endsAt);
  for(const team of ['red','blue']){
   assert.equal(game.bots.filter(b=>b.team===team).length+[...game.players.values()].filter(p=>p.team===team).length,5);
   assert.ok(game.score[team]>=before.score[team]);
  }
  assert.ok(game.bots.every(b=>botIds.has(b.uniqueId)));
 }
});

test('five humans remove all bots on their team and overflow waits for the next squad',()=>{
 const {game}=setup();game.comment({uniqueId:'blue',comment:'xanh'});
 for(let i=0;i<7;i++)game.comment({uniqueId:'red-'+i,comment:'do'});
 game.start();const state=game.snapshot();
 assert.equal(state.squadSize,5);assert.equal(state.bots.filter(b=>b.team==='red').length,0);
 assert.equal(state.bots.filter(b=>b.team==='blue').length,4);
 assert.deepEqual(state.upNext.red,['red-5','red-6']);
 assert.ok(!state.mvp.red&&!state.mvp.blue);
});

test('a bot-filled match respects manual stop and pause and resumes without accumulating paused scores',()=>{
 const {game,advance}=setup();game.comment({uniqueId:'human',comment:'do'});advance(3000);game.pause();const before=game.snapshot();
 advance(10000);assert.deepEqual(game.snapshot(),before);
 game.resume();game.tick();assert.deepEqual(game.score,before.score);
 game.stop();advance(10000);assert.equal(game.phase,'waiting');
 game.start();assert.equal(game.phase,'countdown');assert.equal(game.demo,false);
});

test('bots leave with the last human and the room goes back to waiting',()=>{
 const {game,advance}=setup();game.comment({uniqueId:'human',comment:'do'});advance(2000);
 game.like({uniqueId:'human',likeCount:1});advance(22000);
 assert.equal(game.players.size,0);assert.equal(game.demo,true);assert.equal(game.bots.length,0);
 advance(10000);assert.equal(game.phase,'lobby');
});
