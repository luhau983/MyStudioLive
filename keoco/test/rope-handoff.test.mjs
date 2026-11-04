import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {advanceRopeHandoff,ropePickupPose,ROPE_HELD_Y,ROPE_GROUND_Y} from '../rope-handoff.mjs';
import {gripRope} from '../stage3d-grip.mjs';
import {makeRoute,advanceRoute} from '../lineup-flow.mjs';

test('old team releases, rope falls and stays grounded until every replacement arrives',()=>{
 let s=advanceRopeHandoff(null,{phase:'pull'});assert.equal(s.height,ROPE_HELD_Y);
 s=advanceRopeHandoff(s,{phase:'result',dt:.09});assert.equal(s.stage,'release');assert.ok(s.reach>0&&s.reach<1);
 s=advanceRopeHandoff(s,{phase:'result',dt:.19});assert.equal(s.stage,'drop');assert.ok(s.height>ROPE_GROUND_Y&&s.height<ROPE_HELD_Y);assert.equal(s.reach,0);
 s=advanceRopeHandoff(s,{phase:'result',dt:1});assert.equal(s.stage,'ground');assert.equal(s.height,ROPE_GROUND_Y);
 for(const phase of ['transition','lobby','countdown']){
  s=advanceRopeHandoff(s,{phase,dt:1,hasPlayers:true,ready:false});assert.equal(s.stage,'ground');
 }
 s=advanceRopeHandoff(s,{phase:'countdown',dt:.325,hasPlayers:true,ready:true});assert.equal(s.stage,'reach');assert.equal(s.height,ROPE_GROUND_Y);assert.ok(s.crouch>0);
 s=advanceRopeHandoff(s,{phase:'countdown',dt:.5,hasPlayers:true,ready:true});assert.equal(s.stage,'lift');assert.ok(s.height>ROPE_GROUND_Y);
 s=advanceRopeHandoff(s,{phase:'countdown',dt:1,hasPlayers:true,ready:true});assert.equal(s.stage,'held');assert.equal(s.height,ROPE_HELD_Y);
});

test('phase changes do not restart pickup; pause freezes and reduced motion snaps safely',()=>{
 let s=advanceRopeHandoff(null,{phase:'lobby',dt:.4,ready:true,hasPlayers:true});
 const paused=advanceRopeHandoff(s,{phase:'countdown',dt:9,paused:true});assert.deepEqual(paused,s);
 s=advanceRopeHandoff(s,{phase:'countdown',dt:.4,ready:true,hasPlayers:true});assert.equal(s.stage,'lift');
 assert.equal(advanceRopeHandoff(s,{phase:'result',reducedMotion:true}).height,ROPE_GROUND_Y);
 assert.equal(advanceRopeHandoff(null,{phase:'countdown',ready:true,hasPlayers:true,reducedMotion:true}).height,ROPE_HELD_Y);
 assert.equal(advanceRopeHandoff(s,{phase:'pull',dt:0}).stage,'held','short custom timers still start pull at playing height');
 assert.equal(advanceRopeHandoff(s,{phase:'waiting'}).stage,'ground');
 assert.equal(advanceRopeHandoff(s,{phase:'lobby',dt:1,ready:false,hasPlayers:false}).stage,'ground');
});

test('a newly created PvE bot can arrive and help lift before the default three-second start',()=>{
 const target={x:.95,y:0,z:1.2};
 const route=makeRoute([{x:11.5,y:0,z:-4.6},{x:target.x,y:0,z:-.55},target],{speed:10});
 let s=null;
 for(let i=0;i<180;i++){
  const travel=advanceRoute(route,1/60);
  s=advanceRopeHandoff(s,{phase:'countdown',dt:1/60,ready:travel.done,hasPlayers:true});
  if(!travel.done)assert.equal(s.height,ROPE_GROUND_Y);
 }
 assert.equal(s.stage,'held');assert.equal(s.height,ROPE_HELD_Y);
});

test('shared lift has continuous height and keeps actual IK hands on the rope for both teams',()=>{
 for(const sign of [-1,1]){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.scale.setScalar(.76);
  const arms=[],elbows=[],hands=[];
  for(const sx of [-1,1]){
   const arm=new THREE.Bone(),elbow=new THREE.Bone(),hand=new THREE.Group();
   arm.position.set(sx*.33,1.04,.04);elbow.position.y=-.32;hand.position.y=-.34;
   elbow.add(hand);arm.add(elbow);body.add(arm);arms.push(arm);elbows.push(elbow);hands.push(hand);
  }
  const c={root,body,arms,elbows};let s=null,lastY=ROPE_GROUND_Y,samples=0;
  for(let i=0;i<150;i++){
   s=advanceRopeHandoff(s,{phase:i<30?'lobby':'countdown',dt:1/60,ready:true,hasPlayers:true});
   assert.ok(Math.abs(s.height-lastY)<.02);lastY=s.height;
   const p=ropePickupPose(s),pitch=p.bodyPitch;
   root.position.set(sign*3,.76*(.27-p.bodyDrop),1.2);
   body.rotation.set(pitch,0,0);body.position.set(0,.38*(1-Math.cos(pitch)),-.38*Math.sin(pitch));
   gripRope(c,s.height,1.48,{reach:s.reach,still:true});root.updateMatrixWorld(true);
   if(s.reach===1)for(const hand of hands){
    const actual=hand.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(actual.y-(s.height+.04))<1e-5,`${s.stage}: hand height ${actual.y}, rope ${s.height}`);
    assert.ok(Math.abs(actual.z-1.58)<1e-5);samples++;
   }
  }
  assert.ok(samples>50);
 }
});
