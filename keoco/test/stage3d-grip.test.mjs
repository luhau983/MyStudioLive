import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gripRope } from '../stage3d-grip.mjs';
import { characterPose } from '../stage-character-poses.mjs';

test('both articulated hands remain on the moving rope through team poses',()=>{
 for(const sign of [-1,1]) for(const phase of ['countdown','pull']) for(const elapsed of [0,.15,.3,.6,2]) for(const reducedMotion of [false,true]) for(const shift of [-1.1,0,1.1]) {
  const pose=characterPose({phase,pullElapsed:elapsed,time:elapsed,reducedMotion});
  const lean=-sign*pose.leanBack;
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.position.set(sign*3+shift,.76*(.27-pose.bodyDrop),1.2);root.scale.setScalar(.76);root.rotation.y=-sign*pose.turn;
  body.rotation.z=lean;body.position.set(.38*Math.sin(lean),.38*(1-Math.cos(lean)),0);
  const arms=[],elbows=[],hands=[];
  for(const sx of [-1,1]){const a=new THREE.Group(),e=new THREE.Group(),h=new THREE.Group();a.position.set(sx*.33,1.04,.04);e.position.y=-.32;h.position.y=-.34;e.add(h);a.add(e);body.add(a);arms.push(a);elbows.push(e);hands.push(h);}
  gripRope({root,body,arms,elbows},.66,1.48);
  root.updateMatrixWorld(true);
  for(const hand of hands){const p=hand.getWorldPosition(new THREE.Vector3());const distance=Math.hypot(p.y-.66,p.z-1.48);assert.ok(Math.abs(distance-Math.hypot(.04,.10))<1e-6,`hand misses rope: ${p.toArray()}`); assert.ok(p.z > 1.48+.095, `hand hidden behind rope: ${p.toArray()}`);}
 }
});
