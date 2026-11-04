import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resultWinner, ropeTarget, resultView} from '../presentation.mjs';
import {characterPose} from '../stage-character-poses.mjs';
test('finish only reflects an authoritative result, never an early ratio',()=>{
 assert.ok(ropeTarget({phase:'pull',position:1}) > -2);
 assert.ok(ropeTarget({phase:'pull',position:-1}) < 2);
 assert.equal(ropeTarget({phase:'result',score:{red:8,blue:2}}),-2);
 assert.equal(ropeTarget({phase:'result',score:{red:2,blue:8}}),2);
 assert.equal(ropeTarget({phase:'result',score:{red:2,blue:2}}),0);
});
test('result camera follows actual winner and draw remains neutral',()=>{
 for(const side of ['red','blue']) {const s={phase:'result',score:{red:side==='red'?4:1,blue:side==='blue'?4:1}};assert.equal(resultWinner(s),side);assert.equal(resultView(s),side);}
 assert.equal(resultView({phase:'result',score:{red:2,blue:2}}),'court');
 assert.equal(resultWinner({phase:'pull',score:{red:4,blue:1}}),null);
});
test('winner dances with individual timing, loser crouches and reduced motion is static',()=>{
 const pose=(id,time,reducedMotion=false)=>characterPose({phase:'result',outcome:'win',id,time,reducedMotion});
 assert.notDeepEqual(pose('red:a',1),pose('red:a',2));
 assert.notDeepEqual(pose('red:a',1),pose('red:b',1));
 assert.deepEqual(pose('red:a',1,true),pose('red:a',3,true));
 assert.ok(characterPose({phase:'result',outcome:'lose'}).bodyDrop>0);
 assert.equal(characterPose({phase:'result',outcome:'draw'}).bodyDrop,0);
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('overlay flame uses the same authoritative result and interior pull range, never mana',()=>{
 const src=readFileSync(new URL('../overlay.js',import.meta.url),'utf8');
 const fn=src.match(/function overlayTugPercent\(state\)\{[^}]+\}/)[0];
 const calc=vm.runInNewContext(`(${fn})`);
 assert.equal(calc({phase:'pull',position:1,mana:{red:{value:0}}}),-17);
 assert.equal(calc({phase:'result',score:{red:1,blue:2}}),20);
 assert.equal(calc({phase:'result',score:{red:1,blue:1}}),0);
});

test('result camera delay uses elapsed time even when frames are slow',()=>{
 const src=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
 const timer=src.match(/if\(phase==='result'\)\{if\(!state\?\.paused\)resultElapsed\+=.*?\}else resultElapsed=0;/)[0];
 const elapsed=vm.runInNewContext(`let resultElapsed=0, dt=2, phase='result', state={paused:false}; ${timer} resultElapsed`);
 assert.ok(elapsed>1.2, `slow frame counted only ${elapsed}s`);
});
