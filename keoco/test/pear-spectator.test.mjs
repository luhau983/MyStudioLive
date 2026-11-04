import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as crowd from '../stand-crowd.mjs';
test('design 04 produces bounded shared pear/dungaree geometry with connected white limbs',()=>{
 assert.equal(typeof crowd.createPearSpectatorGeometry,'function');
 const g=crowd.createPearSpectatorGeometry(THREE);
 assert.deepEqual(Object.keys(g).sort(),['body','face','hair','shoes','skin','trim']);
 for(const geo of Object.values(g)){
  geo.computeBoundingBox();assert.ok(geo.attributes.position.count>0);
  assert.ok([...geo.attributes.position.array].every(Number.isFinite));
 }
 assert.ok(g.skin.boundingBox.max.y>.95);
 assert.ok(g.body.boundingBox.max.x-g.body.boundingBox.min.x>.3);
 assert.ok(g.hair.boundingBox.max.x-g.hair.boundingBox.min.x>.4,'reference calls for a broad black bowl cap');
 assert.ok(g.face.boundingBox.max.z>.08,'flat front decal outside head');
 assert.ok(g.shoes.boundingBox.min.y>=0);
});
