import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeRigidParts} from '../rigid-parts.mjs';

const skin=new THREE.MeshStandardMaterial();
const beadGeo=new THREE.SphereGeometry(.1,6,4), boxGeo=new THREE.BoxGeometry(.2,.1,.08);
// Triangle centroids in world space: equality proves the merge baked every local
// transform instead of nudging a surface.
function worldTriangles(mesh){
 mesh.updateWorldMatrix(true,false);
 const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,p=g.attributes.position,v=new THREE.Vector3(),out=[];
 for(let i=0;i<p.count;i+=3){
  const c=new THREE.Vector3();
  for(let k=0;k<3;k++)c.add(v.fromBufferAttribute(p,i+k).applyMatrix4(mesh.matrixWorld));
  out.push(c.divideScalar(3).toArray().map(n=>n.toFixed(5)).join(' '));
 }
 if(g!==mesh.geometry)g.dispose();
 return out;
}
const meshesOf=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
const surfaceOf=root=>meshesOf(root).flatMap(worldTriangles).sort();
function part(parent,geometry,material,position,userData={}){
 const m=new THREE.Mesh(geometry,material);m.position.set(...position);Object.assign(m.userData,userData);parent.add(m);return m;
}
// A trimmed down character: one posed bone carrying the palm and thumb beads.
function rig(){
 const root=new THREE.Group(),elbow=new THREE.Bone();
 elbow.position.set(.33,1.04,.04);elbow.rotation.z=.4;root.add(elbow);
 const palm=part(elbow,beadGeo,skin,[0,-.34,.015]);palm.scale.set(1.04,1.08,.9);
 part(elbow,beadGeo,skin,[-.083,-.29,.085]).scale.set(.62,.82,.65);
 root.position.set(-3.1,.42,1.2);root.scale.setScalar(.76);
 return {root,elbow,palm};
}

test('rigid siblings on one bone become a single draw call without moving a surface',()=>{
 const {root,elbow}=rig(), before=surfaceOf(root);
 assert.equal(meshesOf(root).length,2);
 mergeRigidParts(root,THREE);
 const after=meshesOf(root);
 assert.equal(after.length,1,'two beads, one draw call');
 assert.equal(after[0].parent,elbow,'the merged bead still follows the animated bone');
 assert.deepEqual(surfaceOf(root),before);
});

test('anything animated, unique or explicitly kept stays its own mesh',()=>{
 const root=new THREE.Group(),bone=new THREE.Bone();root.add(bone);
 const kept=part(bone,beadGeo,skin,[0,0,0]);
 const parent=part(bone,beadGeo,skin,[.1,0,0]);part(parent,beadGeo,skin,[0,.1,0]);
 const hidden=part(bone,beadGeo,skin,[.2,0,0]);hidden.visible=false;
 const glass=part(bone,beadGeo,new THREE.MeshStandardMaterial({transparent:true}),[.3,0,0]);
 const twoTone=part(bone,boxGeo,[skin,skin],[.4,0,0]);
 const lone=part(bone,boxGeo,new THREE.MeshStandardMaterial(),[.5,0,0]);
 const skinned=new THREE.SkinnedMesh(beadGeo,skin);bone.add(skinned);
 const pair=[part(bone,beadGeo,skin,[.6,0,0]),part(bone,beadGeo,skin,[.7,0,0])];
 const before=meshesOf(root).length;
 mergeRigidParts(root,THREE,{keep:[kept]});
 const left=meshesOf(root);
 for(const [name,mesh] of [['kept',kept],['child bearing',parent],['hidden',hidden],['transparent',glass],['multi material',twoTone],['single',lone],['skinned',skinned]])
  assert.ok(left.includes(mesh),`the ${name} mesh must survive untouched`);
 assert.equal(left.length,before-1,'only the matching pair collapses');
 for(const m of pair)assert.ok(!left.includes(m));
});

test('the merged part carries the LOD, silhouette and shadow flags it replaced',()=>{
 const root=new THREE.Group();
 part(root,beadGeo,skin,[0,0,0],{farDetail:true}).castShadow=true;
 part(root,beadGeo,skin,[.2,0,0],{farDetail:true,mainSilhouette:true}).receiveShadow=true;
 part(root,beadGeo,skin,[.4,0,0],{smallDetail:true});
 part(root,beadGeo,skin,[.6,0,0],{smallDetail:true});
 mergeRigidParts(root,THREE);
 const [far,small]=meshesOf(root);
 assert.equal(meshesOf(root).length,2,'the two LOD bands never merge into each other');
 assert.equal(far.userData.farDetail,true);assert.ok(!far.userData.smallDetail);
 assert.equal(far.userData.mainSilhouette,true,'the outline still finds the silhouette');
 assert.equal(far.castShadow,true);assert.equal(far.receiveShadow,true);
 assert.equal(small.userData.smallDetail,true);assert.ok(!small.userData.farDetail);
 assert.ok(!small.userData.mainSilhouette);assert.equal(small.castShadow,false);
});

test('identical rigs share one merged buffer and a different pose builds its own',()=>{
 const first=rig(),second=rig();
 mergeRigidParts(first.root,THREE);mergeRigidParts(second.root,THREE);
 assert.equal(meshesOf(first.root)[0].geometry,meshesOf(second.root)[0].geometry,'every viewer reuses one buffer');
 const posed=rig();posed.palm.position.y=-.30;
 mergeRigidParts(posed.root,THREE);
 assert.notEqual(meshesOf(posed.root)[0].geometry,meshesOf(first.root)[0].geometry);
});
