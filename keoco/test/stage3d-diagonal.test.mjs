import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
test('active heads glance partially toward the camera instead of facing it rigidly',()=>{
 const yaw=vm.runInNewContext(`${prefix}\nfaceYaw({x:14,z:26},{x:0,z:1},.2)`);
 assert.ok(Math.abs(yaw-(Math.atan2(14,25)-.2)*.45)<1e-9);
});

test('head turns stay inside neck limits and wrap around the body angle',()=>{
 const {yaw,pitch}=vm.runInNewContext(`${prefix}\n({yaw:faceYaw,pitch:facePitch})`);
 for(const angle of [-Math.PI*3,-3,-1,0,1,3,Math.PI*3]){
  assert.ok(Math.abs(yaw({x:4,z:2},{x:0,z:0},angle))<=.48);
 }
 const a=yaw({x:0,z:-10},{x:0,z:0},Math.PI-.05);
 const b=yaw({x:0,z:-10},{x:0,z:0},-Math.PI-.05);
 assert.ok(Math.abs(a-b)<1e-9,'the same body orientation has the same head target');
 assert.ok(pitch({x:0,y:20,z:1},{x:0,y:1,z:0})<0,'a high camera gets a gentle upward glance');
 assert.ok(Math.abs(pitch({x:0,y:20,z:1},{x:0,y:1,z:0}))<=.13);
});

test('head easing is gradual, frame independent and static under reduced motion',()=>{
 const ease=vm.runInNewContext(`${prefix}\neaseHeadAngle`);
 const once=ease(0,.4,.1,false),twice=ease(ease(0,.4,.05,false),.4,.05,false);
 assert.ok(once>0&&once<.4);assert.ok(Math.abs(once-twice)<1e-9);
 assert.equal(ease(0,.4,.01,true),.4);
 assert.equal(ease(.1,.4,0,false),.1);
});
