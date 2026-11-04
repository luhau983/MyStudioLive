import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STREET_OUTFITS,streetOutfitForUser,streetOutfitGeometry,createStreetWardrobe,addTeamBadge} from '../street-outfits.mjs';

test('all six complete street looks are assigned deterministically',()=>{
 assert.equal(STREET_OUTFITS.length,6);
 assert.equal(new Set(STREET_OUTFITS.map(o=>o.id)).size,6);
 assert.equal(new Set(Array.from({length:100},(_,i)=>streetOutfitForUser(`viewer-${i}`))).size,6);
 assert.equal(streetOutfitForUser('alice'),streetOutfitForUser('alice'));
 assert.deepEqual(STREET_OUTFITS.map(o=>o.shoes),['sneakers','loafers','sneakers','boots','sneakers','slides']);
});

test('wardrobe resolves every material and attaches shoes, accessories and clothing to the rig',()=>{
 const wardrobe=createStreetWardrobe(THREE,{canvasTexture:()=>new THREE.Texture(),clothBump:new THREE.Texture()});
 for(let i=0;i<6;i++){
  const g=streetOutfitGeometry(THREE,i);assert.equal(g,streetOutfitGeometry(THREE,i));
  for(const list of [g.body,g.leg,g.head,g.foot])for(const part of list){
   assert.ok(wardrobe.materials[i][part.role]?.isMeshStandardMaterial,part.role);
   assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));
  }
  const body=new THREE.Group(),knee=new THREE.Group(),head=new THREE.Group(),leg=new THREE.Group();
  wardrobe.body(body,i,true);wardrobe.foot(knee,i,true);wardrobe.head(head,i);wardrobe.leg(leg,i,true);
  assert.ok(body.children.length>0&&knee.children.length>0);
  assert.ok(knee.children.every(mesh=>mesh.parent===knee));
  knee.rotation.z=.9;knee.updateMatrixWorld(true);
  assert.ok(new THREE.Box3().setFromObject(knee).getSize(new THREE.Vector3()).length()>.3);
 }
});

test('ripped jeans and denim shorts contain actual openings, and summer glasses attach to the head',()=>{
 for(let i=0;i<3;i++){
  const g=streetOutfitGeometry(THREE,i),full=g.shin.index?g.shin.index.count:g.shin.attributes.position.count;
  assert.ok(g.thigh.attributes.position.count<full,'front triangles are removed rather than painted white');
  assert.ok(g.leg.some(piece=>piece.role==='thread'));
 }
 const summer=streetOutfitGeometry(THREE,5);
 assert.ok(summer.head.some(piece=>piece.role==='glasses'));
 assert.ok(summer.foot.some(piece=>piece.role==='skin'),'open slides show the foot');
 const bomber=streetOutfitGeometry(THREE,4);
 assert.ok(bomber.body.some(piece=>piece.role==='leather'),'bomber includes a crossbody bag and strap');
});

test('every outfit carries the correct raised team shield on the animated shirt',()=>{
 for(let outfitIndex=0;outfitIndex<6;outfitIndex++)for(const side of ['red','blue']){
  const body=new THREE.Group(),badge=addTeamBadge(body,{THREE,side,outfitIndex});
  assert.equal(badge.parent,body);assert.equal(badge.userData.team,side);
  assert.equal(badge.children[1].material.color.getHex(),side==='red'?0xe8423f:0x2f7fe8);
  assert.ok(badge.position.y>.85&&badge.position.y<1.1);
  assert.ok(badge.children.every(p=>p.userData.skipOutline));
  body.rotation.z=.7;body.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(badge);
  assert.ok(box.getSize(new THREE.Vector3()).z>.015,'badge has physical thickness');
 }
});
