import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../stage3d.js', import.meta.url), 'utf8');
function pose(time, options = {}) {
 const prefix = source.slice(source.indexOf('function dancePose'), source.indexOf('const host='));
 return vm.runInNewContext(`${prefix}\ndancePose(${time}, ${JSON.stringify(options)})`);
}
test('lobby dance alternates limbs and sways while reduced motion stays still', () => {
 const a=pose(0), b=pose(Math.PI/2);
 assert.notEqual(a.arms[0], b.arms[0]);
 assert.notEqual(a.legs[0], b.legs[0]);
 assert.notEqual(a.hips, b.hips);
 assert.notEqual(a.head, b.head);
 assert.deepEqual(JSON.parse(JSON.stringify(pose(0,{still:true}))), JSON.parse(JSON.stringify(pose(1,{still:true}))));
});

test('renderer leans torsos about the hip and points team limbs with the shared sign convention', () => {
 assert.match(source, /const HIP=\.38/);
 assert.match(source, /leg\.position\.set\(sx\*\.17,HIP,0\)/);
 assert.match(source, /c\.body\.position\.set\(HIP\*Math\.sin\(lean\),HIP\*\(1-Math\.cos\(lean\)\),0\)/);
 assert.match(source, /-sign\*pose\.leanBack/);
 assert.match(source, /else leg\.rotation\.set\(0,0,-sign\*pose\.thighReach\)/);
 assert.match(source, /aim\(leg,pose\.legPitch\?\.\[j\]\|\|0,0,pose\.legs\[j\],jointBlend\)/);
});
