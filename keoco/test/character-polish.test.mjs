import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const stage=await readFile(new URL('../stage3d.js',import.meta.url),'utf8');
test('curved meme face uses source atlas and is parented to animated head',()=>{
 assert.match(stage,/faceGeo=new THREE\.PlaneGeometry/);
 assert.match(stage,/headGroup\.add\(face\)/);
 assert.match(stage,/faceTexture\.clone\(\)/);
 assert.match(stage,/happy:2,pull:1,victory:3,cry:5/);
});
test('uniform has connected sleeves and mittens retain the rig hand endpoint',()=>{
 assert.match(stage,/sleeve/);
 assert.match(stage,/grip-shell/);
 assert.match(stage,/position\.y=-\.34/);
});
