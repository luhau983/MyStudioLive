import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHairstylePicker, addCharacterHair, hairstyleForUser, HAIRSTYLES, STREET_HAIRSTYLES } from '../character-hair.mjs';

test('hairstyle assignment is stable and covers the expanded collection', () => {
  assert.equal(HAIRSTYLES.length, 16);
  assert.equal(hairstyleForUser('alice'), hairstyleForUser('alice'));
  assert.equal(new Set(Array.from({length: 200}, (_, i) => hairstyleForUser(`user-${i}`))).size, HAIRSTYLES.length);
  assert.equal(hairstyleForUser(), HAIRSTYLES[0]);
});

test('each style adds black volumetric hair to the supplied head only', () => {
  const signatures = new Set();
  for (const style of HAIRSTYLES) {
    const head = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({color: 0x17161d});
    const hair = addCharacterHair(head, { THREE, material, style });
    assert.equal(hair.parent, head);
    assert.ok(hair.children.length >= 1);
    assert.equal(hair.children[0].geometry.userData.continuousCrown, true);
    assert.ok(hair.children.every(p => p.geometry.type !== 'CylinderGeometry'), 'no rigid cylindrical fringe bands');
    assert.ok(hair.children.length <= 3, 'sculpted silhouette instead of assembled plastic locks');
    assert.ok(hair.children.every(part => part.isMesh && (part.material === material || part.userData.scalpFade)));
    signatures.add(JSON.stringify(hair.children.map(p => [p.position.toArray(), p.scale.toArray(), Array.from(p.geometry.attributes.position.array)])));
  }
  assert.equal(signatures.size, HAIRSTYLES.length);
});

test('Vietnamese street cuts expose a shaded scalp and mullets keep a long nape',()=>{
 for(const style of STREET_HAIRSTYLES){
  const hair=addCharacterHair(new THREE.Group(),{THREE,style});
  const fade=hair.getObjectByName('hair-scalp-fade');
  assert.ok(fade?.geometry.attributes.color,'shaved sides have a smooth scalp fade');
  assert.equal(fade.userData.skipOutline,true,'no black contour across the shaved scalp');
  assert.ok(fade.geometry.attributes.position.array.every(Number.isFinite));
 }
 for(const style of ['kha-banh','mullet-layer']){
  const hair=addCharacterHair(new THREE.Group(),{THREE,style}),box=new THREE.Box3().setFromObject(hair);
  assert.ok(box.min.y<-.60,'long mullet nape reaches below the jaw');
 }
});

test('the same user gets the same static geometry with a black default material', () => {
  const one = addCharacterHair(new THREE.Group(), {THREE, userId: 'alice'});
  const two = addCharacterHair(new THREE.Group(), {THREE, userId: 'alice'});
  assert.equal(one.userData.hairstyle, two.userData.hairstyle);
  assert.deepEqual(one.children.map(p => [p.position.toArray(), p.scale.toArray()]), two.children.map(p => [p.position.toArray(), p.scale.toArray()]));
  assert.equal(one.children[0].material.color.getHex(), 0x17161d);
});

test("scene integrates deterministic hairstyles and serves the module", async () => {
  const {readFile} = await import("node:fs/promises");
  const stage = await readFile(new URL("../stage3d.js", import.meta.url), "utf8");
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(stage, /addCharacterHair\(headGroup,\s*\{[^}]*userId/s);
  assert.match(stage, /buildCharacter\(side,\s*!!p\.isBot,\s*!waiting,\s*p\.uniqueId\)/);
  assert.match(server, /['"]\/character-hair\.mjs['"]\s*:/);
});

test("only the cap casts a shadow to preserve the scene budget", () => {
  for (const style of HAIRSTYLES) {
    const hair = addCharacterHair(new THREE.Group(), {THREE, style, shadow:true});
    assert.equal(hair.children.filter(part => part.castShadow).length, 1);
  }
});

test('raised, wide and long styles have real volume and share geometry across viewers',()=>{
 const bounds=style=>{
  const a=addCharacterHair(new THREE.Group(),{THREE,style});
  const b=addCharacterHair(new THREE.Group(),{THREE,style});
  assert.equal(a.children[0].geometry,b.children[0].geometry);
  assert.ok(a.children[0].geometry.attributes.position.array.every(Number.isFinite));
  return new THREE.Box3().setFromObject(a);
 };
 const bob=bounds('bob');
 assert.ok(bounds('spiky').max.y>bob.max.y+.1,'spikes rise above the bowl cap');
 assert.ok(bounds('twin-buns').max.x>bob.max.x+.08,'buns extend the silhouette');
 assert.ok(bounds('ponytail').min.z<bob.min.z-.12,'tail extends behind the skull');
 assert.ok(bounds('braids').min.y<bob.min.y-.25,'braids fall below the hairline');
});


test('session hair picker shows new street cuts first and keeps each viewer hair stable',()=>{
 const pick=createHairstylePicker(()=>.37),first=Array.from({length:6},(_,i)=>pick(`viewer-${i}`));
 assert.deepEqual(new Set(first),new Set(STREET_HAIRSTYLES));
 const all=[...first,...Array.from({length:10},(_,i)=>pick(`viewer-${i+6}`))];
 assert.deepEqual(new Set(all),new Set(HAIRSTYLES));
 assert.equal(pick('viewer-0'),first[0]);
 const other=createHairstylePicker(()=>.81);
 assert.notDeepEqual(Array.from({length:6},(_,i)=>other(`viewer-${i}`)),first);
});
