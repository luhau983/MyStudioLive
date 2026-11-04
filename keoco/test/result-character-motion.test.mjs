import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterPose,blendCharacterPose,WIN_DANCE_STYLES,LOSS_STYLES,LEG_SEGMENT} from '../stage-character-poses.mjs';

const result=(id,time,outcome='win',extra={})=>characterPose({phase:'result',outcome,id,resultElapsed:time,...extra});
const ids=Array.from({length:80},(_,i)=>`motion-${i}`);

test('victory includes real jumps, depth footwork and coordinated fan sweeps',()=>{
 for(const style of WIN_DANCE_STYLES){
  const id=ids.find(id=>result(id,1).style===style);assert.ok(id,style);
  const frames=Array.from({length:241},(_,i)=>result(id,1+i/60));
  assert.ok(Math.max(...frames.map(p=>p.bounce))>(style==='victory-jump'?.35:.05),style);
  assert.ok(Math.min(...frames.map(p=>p.bounce))<.001,'land between jumps');
  if(style==='shuffle')assert.ok(Math.max(...frames.map(p=>p.legPitch[0]))>.5);
  if(style==='fan-dance')for(const key of ['armPitch','armYaw','elbowPitch','elbowTwist']){
   const values=frames.map(p=>p[key][0]);assert.ok(Math.max(...values)-Math.min(...values)>.4,key);
  }
 }
});

test('smoothed result rig keeps the supporting foot at floor plus jump height',()=>{
 const leg=new THREE.Group(),knee=new THREE.Group();knee.position.y=-LEG_SEGMENT;leg.add(knee);
 for(const outcome of ['win','lose'])for(const id of ids.slice(0,12)){
  let p=characterPose({phase:'lobby'});
  for(let i=0;i<360;i++){
   p=blendCharacterPose(p,result(id,i/60,outcome),1/60,{plantDanceFeet:true});
   const feet=p.legs.map((angle,j)=>{
    leg.position.set(0,2*LEG_SEGMENT+p.bounce-p.bodyDrop,0);
    leg.rotation.set(p.legPitch[j],0,angle);knee.rotation.set(p.kneePitch[j],0,p.knees[j]);
    leg.updateMatrixWorld(true);return knee.localToWorld(new THREE.Vector3(0,-LEG_SEGMENT,0)).y;
   });
   assert.ok(Math.abs(Math.min(...feet)-p.bounce)<1e-8,`${outcome}: ${feet}`);
  }
 }
});

test('losers have distinct sad, crying and speechless reactions with static reduced motion',()=>{
 const seen=new Set();
 for(const id of ids){
  const a=result(id,1,'lose'),b=result(id,2.2,'lose');seen.add(a.style);
  assert.equal(a.expression,a.style);assert.equal(a.style,b.style);assert.equal(a.bounce,0);
  assert.deepEqual(result(id,1,'lose',{reducedMotion:true}),result(id,20,'lose',{reducedMotion:true}));
  if(a.style==='cry'){
   assert.ok(a.armPitch.every(x=>x<-.8));assert.notEqual(a.headNod,b.headNod);
  }
  if(a.style==='sad')assert.ok(a.headNod>.3);
  if(a.style==='speechless')assert.ok(Math.abs(a.headNod)<.1);
 }
 assert.deepEqual([...seen].sort(),[...LOSS_STYLES].sort());
});

test('result motion is continuous across beat and routine boundaries',()=>{
 for(const id of ids.slice(0,20))for(const outcome of ['win','lose'])for(let t=.001;t<9;t+=.019){
  const a=result(id,t,outcome),b=result(id,t+.0001,outcome);
  for(const key of ['arms','elbows','legPitch','kneePitch','elbowTwist'])for(let j=0;j<2;j++)assert.ok(Math.abs(a[key][j]-b[key][j])<.005,`${outcome} ${key} at ${t}`);
  assert.ok(Math.abs(a.bounce-b.bounce)<.002);
 }
});
