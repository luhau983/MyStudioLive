import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WordGame,CLASS_CAPACITY as N} from '../engine.mjs';
import {SEATS} from '../auditorium-layout.mjs';
import {entranceRoute,entranceTiming} from '../entrance.mjs';
import {shouldPlayStudyMusic} from '../study-music.js';
const questions=[{answer:'HOA SEN',hint:'Hoa từ bùn'}];
function setup(){let clock=10000;const game=new WordGame({questions,now:()=>clock});return {game,advance:ms=>clock+=ms};}

test('accented and unaccented position commands locate the speaker without awarding points',()=>{
  const {game,advance}=setup();
  game.comment({id:'a',nickname:'An',text:'VỊ TRÍ'});assert.equal(game.snapshot().highlight.id,'live:a');assert.equal(game.phase,'idle');
  assert.equal(game.snapshot().participants.length,1);assert.equal(game.leaderboard().length,0);
  game.start();game.comment({id:'a',text:'vi tri'});assert.equal(game.snapshot().highlight.id,'live:a');assert.equal(game.snapshot().correctCount,0);
  advance(7001);assert.equal(game.snapshot().highlight,null);assert.ok(game.snapshot(true).activityLog.some(e=>e.type==='position'));
});
test('all correct users are counted once, first received correct answer stays MVP until results',()=>{
  const {game,advance}=setup();game.start();
  assert.equal(game.comment({id:'a',nickname:'An',text:'hoa sen'}),true);
  advance(200);assert.equal(game.comment({id:'b',nickname:'Bình',text:'HOA SEN'}),true);
  assert.equal(game.comment({id:'a',text:'hoa sen'}),false);assert.equal(game.scores.get('live:a').score,100);
  assert.equal(game.snapshot().correctCount,2);assert.equal(game.snapshot().winner.id,'live:a');assert.equal(game.snapshot().winner.mvpCount,1);assert.equal(game.snapshot().question.answer,undefined);
  advance(44800);game.tick();assert.equal(game.phase,'result');assert.equal(game.reason,'correct');assert.equal(game.snapshot().correctPlayers.length,2);assert.equal(game.snapshot().question.answer,'HOA SEN');
  assert.equal(game.comment({id:'c',text:'hoa sen'}),false);assert.equal(game.snapshot().correctCount,2);
  game.start();assert.equal(game.snapshot().correctCount,0);assert.equal(game.winner,null);
});
test('stop class freezes countdown, preserves seats and points, and resumes cleanly from idle too',()=>{
  const {game,advance}=setup();game.join({id:'a'});game.start();advance(5000);game.stopClass();const remaining=game.snapshot().remaining;
  advance(60000);game.tick();game.comment({id:'a',text:'hoa sen'});assert.equal(game.snapshot().remaining,remaining);assert.equal(game.snapshot().correctCount,0);assert.equal(game.snapshot().participants.length,1);
  game.resume();assert.equal(game.classStopped,false);assert.equal(game.paused,false);assert.equal(game.snapshot().remaining,remaining);
  game.comment({id:'a',text:'hoa sen'});assert.equal(game.snapshot().correctCount,1);game.stopClass();assert.equal(game.scores.get('live:a').score,100);
  game.reset();game.stopClass();game.resume();game.start();assert.ok(Number.isFinite(game.snapshot().remaining));
});
test('every occupied speaker gets a fresh popup; log is capped and visible only to control',()=>{
  const {game,advance}=setup();game.start();
  for(let i=0;i<N;i++)game.comment({id:String(i),nickname:'HV '+i,text:'Đang suy nghĩ'});
  assert.equal(game.snapshot().bubbles.length,N);assert.equal(game.snapshot().activityLog,undefined);
  const seq=game.snapshot().bubbles[0].seq;game.comment({id:String(N-1),text:'Đang suy nghĩ'});assert.ok(game.snapshot().bubbles[0].seq>seq);
  for(let i=0;i<300;i++)game.comment({id:'0',text:'sai'});
  assert.equal(game.snapshot(true).activityLog.length,250);advance(8001);assert.equal(game.snapshot().bubbles.length,0);
  game.clearActivity();assert.equal(game.snapshot(true).activityLog.length,0);assert.equal(game.snapshot().participants.length,N);
});
test('fast entrance keeps all routes and seats but finishes each run in at most 1.6 seconds',()=>{
  let previous=0;
  for(const seat of SEATS){const route=entranceRoute(seat.home),timing=entranceTiming(route,1000,previous);previous=timing.startAt;
    const length=route.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-route[i][j])),0);
    assert.ok(length/timing.speed<=1.600001);assert.ok(timing.startAt<=4000);
  }
});
test('music only plays during active questions and honors the setting',()=>{
  const base={phase:'playing',paused:false,config:{musicEnabled:true}};
  assert.equal(shouldPlayStudyMusic(base),true);for(const phase of ['idle','result'])assert.equal(shouldPlayStudyMusic({...base,phase}),false);
  assert.equal(shouldPlayStudyMusic({...base,paused:true}),false);assert.equal(shouldPlayStudyMusic({...base,config:{musicEnabled:false}}),false);
});
