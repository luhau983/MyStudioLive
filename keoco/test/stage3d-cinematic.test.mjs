import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
const {plan,shot}=vm.runInNewContext(`${prefix}\n({plan:cinematicPlan,shot:cinematicShot})`);

test('match edit establishes the court, covers both teams and cuts to named-player closeups',()=>{
 assert.equal(plan({phase:'pull',elapsed:1}).kind,'opening');
 const faces=new Set(),teams=new Set();
 for(let elapsed=2;elapsed<30;elapsed+=.1){const p=plan({phase:'pull',elapsed,remaining:45-elapsed});if(p.kind==='face')faces.add(p.view);if(p.kind==='team')teams.add(p.view);}
 assert.deepEqual([...faces].sort(),['blue','red']);assert.deepEqual([...teams].sort(),['blue','red']);
});
test('final seconds show the rope and both sides, even during a mana buff',()=>{
 for(const remaining of [5,3,1,0])assert.equal(plan({phase:'pull',elapsed:42,remaining,buffs:{red:4}}).kind,'duel');
 const powered=plan({phase:'pull',elapsed:8,remaining:30,buffs:{blue:4}});
 assert.equal(powered.view,'blue');assert.equal(powered.powered,true);
});
test('result closeups follow the actual MVP side, and draws stay neutral',()=>{
 for(const winner of ['red','blue']){
  assert.equal(plan({phase:'result',winner,resultElapsed:.5}).kind,'finish');
  const p=plan({phase:'result',winner,resultElapsed:4});assert.equal(p.kind,'face');assert.equal(p.view,winner);assert.equal(p.subject,'mvp');
 }
 assert.equal(plan({phase:'result',winner:null,resultElapsed:4}).view,'court');
});
test('closeups follow the actual animated head and keep cameras on the same sideline',()=>{
 const head={x:-3,y:1.9,z:1.2},p={kind:'face',view:'red',progress:.4};
 const a=shot(p,{head}),b=shot(p,{head:{...head,x:head.x+2}});
 assert.ok(Math.abs(b.target[0]-a.target[0]-2)<1e-9);assert.ok(Math.abs(b.position[0]-a.position[0]-2)<1e-9);
 assert.ok(a.position[2]>a.target[2]+3.5);assert.ok(a.fov>=36&&a.fov<=40,'a medium shot retains the upper body');
 for(const kind of ['opening','start','duel','rope','celebrate','team']){const s=shot({kind,view:'red',progress:.5},{ropeX:-.8,time:2});assert.ok(s.position.every(Number.isFinite));assert.ok(s.position[2]>s.target[2]);}
});
test('reduced motion uses a neutral fixed shot at every match phase',()=>{
 for(const phase of ['lobby','countdown','pull','result']){
  const a=plan({phase,elapsed:3,resultElapsed:4,winner:'red',still:true});
  const b=plan({phase,elapsed:9,resultElapsed:8,winner:'blue',still:true});
  assert.equal(a.kind,'court');assert.equal(JSON.stringify(shot(a)),JSON.stringify(shot(b)));
 }
});

test('overhead cut shows both teams from above and yields to the final duel',()=>{
 for(const elapsed of [12,13.5,14.99,28,30.99]){
  const p=plan({phase:'pull',elapsed,remaining:45-elapsed});
  assert.equal(p.kind,'overhead');assert.equal(p.view,'court');
  for(const ropeX of [-1.5,0,1.5]){
   const s=shot(p,{ropeX}),height=s.position[1]-s.target[1];
   assert.ok(height>7*Math.hypot(s.position[0]-s.target[0],s.position[2]-s.target[2]),'camera looks down at more than 80 degrees');
   // Court viewport is approximately square: both five-person lines fit the
   // horizontal frustum even at the greatest rope displacement.
   const halfWidth=(s.position[1]-2)*Math.tan(s.fov*Math.PI/360)*.9;
   for(const side of [-1,1])assert.ok(Math.abs(side*(.95+4*.8)+ropeX-s.target[0])+.6<halfWidth);
  }
 }
 for(const remaining of [5,1,0])assert.equal(plan({phase:'pull',elapsed:44,remaining}).kind,'duel');
 assert.equal(plan({phase:'pull',elapsed:13,remaining:32,still:true}).kind,'court');
});
