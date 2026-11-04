import test from 'node:test';
import assert from 'node:assert/strict';
import {crowdEmotion,spectatorFaceIndex} from '../stand-crowd.mjs';
test('crowd worries only at a substantial disadvantage with hysteresis, not mana or tiny leads',()=>{
 assert.equal(crowdEmotion({phase:'pull',position:.1,mana:{red:0,blue:100}},'blue'),'cheer');
 assert.equal(crowdEmotion({phase:'pull',position:.7},'blue'),'worried');
 assert.equal(crowdEmotion({phase:'pull',position:.7},'red'),'cheer');
 assert.equal(crowdEmotion({phase:'pull',position:.45},'blue','worried'),'worried');
 assert.equal(crowdEmotion({phase:'pull',position:.3},'blue','worried'),'cheer');
 assert.equal(crowdEmotion({phase:'pull',position:-.7},'red'),'worried');
});
test('only definitive result loss gives sad faces; winners cheer and draws are neutral',()=>{
 const s={phase:'result',score:{red:80,blue:20}};
 assert.equal(crowdEmotion(s,'red'),'cheer');assert.equal(crowdEmotion(s,'blue'),'sad');
 assert.equal(crowdEmotion({phase:'result',score:{red:20,blue:80}},'red'),'sad');
 assert.equal(crowdEmotion({phase:'result',score:{red:20,blue:20}},'blue'),'neutral');
});
test('atlas face variation is stable within an emotional group and stays inside eight tiles',()=>{
 for(const emotion of ['neutral','cheer','worried','sad']){
  const a=Array.from({length:100},(_,i)=>spectatorFaceIndex(i,emotion));
  assert.deepEqual(a,Array.from({length:100},(_,i)=>spectatorFaceIndex(i,emotion)));
  assert.ok(a.every(i=>Number.isInteger(i)&&i>=0&&i<8));
  if(emotion!=='sad')assert.ok(new Set(a).size>=2);
 }
 assert.equal(spectatorFaceIndex(7,'sad'),5);
});
