import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCrowd } from '../crowd-ui.js';
test('crowd is audible only for a connected, unpaused pull',()=>{
 const calls=[]; const audio={setPulling:v=>calls.push(['pull',v]),setPaused:v=>calls.push(['pause',v])};
 syncCrowd(audio,{phase:'pull',paused:false},true); assert.deepEqual(calls.splice(0),[['pull',true],['pause',false]]);
 syncCrowd(audio,{phase:'pull',paused:true},true); assert.deepEqual(calls.splice(0),[['pull',true],['pause',true]]);
 syncCrowd(audio,{phase:'pull'},false); assert.deepEqual(calls.splice(0),[['pull',true],['pause',true]]);
 syncCrowd(audio,{phase:'lobby'},true); assert.deepEqual(calls.splice(0),[['pull',false],['pause',false]]);
});
