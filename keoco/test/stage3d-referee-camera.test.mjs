import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
const evaluate=expr=>JSON.parse(JSON.stringify(vm.runInNewContext(`${prefix}\n${expr}`)));
const near=(a,b,eps=.05)=>Math.abs(a-b)<eps;

test('countdown cuts to the full court so the referee start signal is visible',()=>{
 assert.equal(evaluate("broadcastView('countdown',0,false)"),'court');
 assert.equal(evaluate("broadcastView('countdown',8,false)"),'court');
 assert.equal(evaluate("broadcastView('waiting',8,false)"),'blue');
 assert.equal(evaluate("broadcastView('result',3,true)"),'court');
});

test('diagonal court camera and team cuts frame the same arena',()=>{
 const [red,blue,court]=evaluate("['red','blue','court'].map(cameraShot)");
 assert.ok(court.position[0]>10 && court.position[1]>8);
 assert.equal(court.target[0],0);
 assert.ok(red.target[0]<0 && blue.target[0]>0);
 for(const shot of [red,blue,court]) assert.ok(shot.position[2]>shot.target[2]+5);
 assert.notDeepEqual(red.position,blue.position);
});

test('camera tag names the active feed, including the machine team in PvE',()=>{
 assert.equal(evaluate("cameraLabel('red','pvp')"),'CAM ĐỎ');
 assert.equal(evaluate("cameraLabel('blue','pvp')"),'CAM XANH');
 assert.equal(evaluate("cameraLabel('blue','pve')"),'CAM ĐỘI MÁY');
 assert.equal(evaluate("cameraLabel('court','pve')"),'TOÀN SÂN');
});

test('referee watches the pull, idles in lobby and treats bad scores as a draw',()=>{
 assert.equal(evaluate("refereePose('pull',{red:1,blue:9})"),'watch');
 assert.equal(evaluate("refereePose('lobby',{})"),'idle');
 assert.equal(evaluate("refereePose('waiting',undefined)"),'idle');
 assert.equal(evaluate("refereePose('result',undefined)"),'neutral');
 assert.equal(evaluate("refereePose('result',{red:'7',blue:3})"),'red');
 assert.equal(evaluate("refereePose('result',{red:'x',blue:'y'})"),'neutral');
});

test('referee arms point at the winner, spread evenly for a draw and rise for the start',()=>{
 // Arm rotation.z = PI/2 points along world +x (blue side), -PI/2 along -x (red side).
 const red=evaluate("refereeArms('red',0,true)"), blue=evaluate("refereeArms('blue',0,true)"), neutral=evaluate("refereeArms('neutral',0,true)"), start=evaluate("refereeArms('start',0,true)");
 assert.ok(red.some(a=>near(a,-Math.PI/2,.2)) && red.every(a=>a<.5));
 assert.ok(blue.some(a=>near(a,Math.PI/2,.2)) && blue.every(a=>a>-.5));
 assert.ok(near(neutral[0],-neutral[1],1e-9) && Math.abs(neutral[0])>1);
 assert.ok(start.some(a=>Math.abs(a)>2.5));
});

test('referee holds still under reduced motion but animates the start signal otherwise',()=>{
 assert.deepEqual(evaluate("refereeArms('start',0,true)"),evaluate("refereeArms('start',1.3,true)"));
 assert.notDeepEqual(evaluate("refereeArms('start',0,false)"),evaluate("refereeArms('start',.4,false)"));
 assert.deepEqual(evaluate("refereeArms('watch',0,true)"),evaluate("refereeArms('watch',2,true)"));
});

test('team cameras bring active pullers substantially closer than the master',()=>{
 const [red,blue,court]=evaluate("['red','blue','court'].map(cameraShot)");
 const apparent=shot=>1/(Math.hypot(shot.position[0]-shot.target[0],shot.position[1]-shot.target[1],shot.position[2]-shot.target[2])*Math.tan(shot.fov*Math.PI/360));
 assert.ok(apparent(red)>apparent(court)*1.5);
 assert.ok(apparent(blue)>apparent(court)*1.5);
});
