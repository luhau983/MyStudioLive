import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ropeHeave,springRope,teamDrag,pullExpression,sweatLevel,sweatDrop,PULL_FACES} from '../pull-drama.mjs';

test('rope heaves both ways around the lead and calms when one side runs away',()=>{
 const even=[],lopsided=[];
 for(let t=0;t<4;t+=.05){even.push(ropeHeave(t,0));lopsided.push(ropeHeave(t,.9));}
 assert.ok(Math.min(...even)<-.15&&Math.max(...even)>.15);
 assert.ok(Math.max(...lopsided.map(Math.abs))<Math.max(...even.map(Math.abs)));
});

test('spring overshoots a lead swing slightly, then settles; reduced motion snaps',()=>{
 let s={x:0,v:0},peak=0;
 for(let i=0;i<300;i++){s=springRope(s,1,1/60,false);peak=Math.max(peak,s.x);}
 assert.ok(peak>1&&peak<1.25);
 assert.ok(Math.abs(s.x-1)<.01);
 assert.deepEqual(springRope({x:0,v:3},1,1/60,true),{x:1,v:0});
});

test('drag is positive for the team whose rope is being pulled away',()=>{
 assert.ok(teamDrag('red',1)>0&&teamDrag('blue',1)<0);
 assert.equal(teamDrag('red',99),1);
});

test('faces follow the fight: yanked gasp, leading grin, losing rage',()=>{
 const faces=o=>new Set(Array.from({length:40},(_,i)=>pullExpression(null,{id:'p'+i,time:i*.9,...o}).expression));
 assert.deepEqual([...faces({strain:.5,drag:.8})].sort(),['gasp','shock']);
 assert.deepEqual([...faces({strain:.2})].sort(),['evil','grin','happy']);
 const losing=faces({strain:.8}),even=faces({strain:.5});
 assert.ok(losing.has('rage')&&losing.has('wail')&&!losing.has('grin'));
 assert.ok(even.size>=3&&!even.has('grin'));
});

test('pullers on one team do not share the same face in unison',()=>{
 const team=['a','b','c','d','e'].map(id=>pullExpression(null,{id,time:3,strain:.5}).expression);
 assert.ok(new Set(team).size>1);
});

test('every pull-atlas tile has a unique name',()=>{
 assert.equal(PULL_FACES.length,8);
 assert.equal(new Set(PULL_FACES).size,8);
});

test('faces hold briefly instead of flickering, except a sudden yank',()=>{
 const first=pullExpression(null,{id:'x',strain:.8,dt:1/60});
 assert.equal(pullExpression(first,{id:'x',strain:.2,dt:1/60}).expression,first.expression);
 assert.ok(['grin','evil','happy'].includes(pullExpression(first,{id:'x',strain:.2,dt:.6}).expression));
 assert.ok(['gasp','shock'].includes(pullExpression(first,{id:'x',strain:.5,drag:.9,dt:1/60}).expression));
});

test('sweat builds through the round and peaks for the losing side late',()=>{
 assert.equal(sweatLevel({pullElapsed:0,strain:.4}),0);
 assert.ok(sweatLevel({pullElapsed:20,strain:.8,secondsLeft:5})>sweatLevel({pullElapsed:20,strain:.3,secondsLeft:30}));
 assert.equal(sweatDrop(0,{level:0}),null);
 assert.equal(sweatDrop(2,{level:.3}),null);
 const d=sweatDrop(0,{time:.5,level:1});
 assert.ok(d.fall>=0&&d.fall<1&&d.opacity>=0&&d.opacity<=1);
});

test('result faces: winners gloat in turns, losers keep their defeat style',async()=>{
 const {resultExpression}=await import('../pull-drama.mjs');
 const set=o=>new Set(Array.from({length:40},(_,i)=>resultExpression({id:'p'+i,time:i*.7,...o})));
 assert.deepEqual([...set({win:true})].sort(),['cool','evil','grin','victory']);
 assert.deepEqual([...set({style:'cry'})].sort(),['cry','wail']);
 assert.deepEqual([...set({style:'speechless'})].sort(),['brows','speechless','squint']);
 assert.ok(['cry','wail'].includes(resultExpression({id:'z',style:'unknown'})));
});
