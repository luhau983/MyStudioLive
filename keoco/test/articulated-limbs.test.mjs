import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addLimbSkin} from '../articulated-limbs.mjs';
test('continuous limb skin follows the exact hand endpoint through both animated bones',()=>{
 const root=new THREE.Group(),upper=new THREE.Bone(),joint=new THREE.Bone();upper.position.set(.33,1.04,.04);joint.position.y=-.32;upper.add(joint);root.add(upper);
 const skin=addLimbSkin(upper,{THREE,rootBone:upper,jointBone:joint,material:new THREE.MeshStandardMaterial()});
 const p=skin.geometry.attributes.position,weights=skin.geometry.attributes.skinWeight;
 let end=-1;for(let i=0;i<p.count;i++){if(Math.abs(p.getY(i)+.66)<1e-6&&Math.hypot(p.getX(i),p.getZ(i))<1e-6)end=i;assert.ok(Math.abs(weights.getX(i)+weights.getY(i)-1)<1e-6);}
 assert.ok(end>=0);assert.ok([...Array(p.count).keys()].some(i=>weights.getX(i)>.1&&weights.getX(i)<.9),'the elbow is a blended surface');
 for(const angle of [0,.5,1.2,2]){
  upper.rotation.set(.2,.1,angle*.5);joint.rotation.z=-angle;root.position.set(2,.3,-1);root.scale.setScalar(.76);root.updateMatrixWorld(true);skin.skeleton.update();
  const actual=skin.localToWorld(skin.getVertexPosition(end,new THREE.Vector3())),expected=joint.localToWorld(new THREE.Vector3(0,-.34,0));
  assert.ok(actual.distanceTo(expected)<1e-5,`${actual.toArray()} != ${expected.toArray()}`);
 }
});
