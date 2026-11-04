import test from 'node:test';
import assert from 'node:assert/strict';
import { crowdPose, spectatorShirtColor } from '../stand-crowd.mjs';
import { characterJointAnchors } from '../stage-character-poses.mjs';
test('anatomical joint anchors use limb-local pivots', () => {
 const j=characterJointAnchors();
 assert.deepEqual(j.elbow,[0,0,0]);
 assert.deepEqual(j.knee,[0,0,0]);
 assert.deepEqual(j.shoulder,[0,0,0]);
 assert.deepEqual(j.hip,[0,0,0]);
 assert.ok(j.neck[1]>1.1 && j.neck[1]<1.3);
});
test('spectator shirts are stable and varied independently of team side', () => {
 const first=Array.from({length:30},(_,i)=>spectatorShirtColor(i));
 assert.deepEqual(first,Array.from({length:30},(_,i)=>spectatorShirtColor(i)));
 assert.ok(new Set(first).size>=8);
 assert.ok(first.slice(0,15).some(c=>![0xc73339,0x2868ba].includes(c)));
});
test('spectators move independently and freeze for pause or reduced motion', () => {
 const a=crowdPose(1,0,'pull',false), b=crowdPose(1,1,'pull',false);
 assert.notDeepEqual(a,b);
 assert.notDeepEqual(a,crowdPose(2,0,'pull',false));
 assert.deepEqual(crowdPose(1,0,'pull',true),crowdPose(2,0,'pull',true));
 assert.ok(crowdPose(1,0,'pull',false).energy>crowdPose(1,0,'lobby',false).energy);
});
