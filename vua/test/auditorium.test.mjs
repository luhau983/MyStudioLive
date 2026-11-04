import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SEATS,STANDING,CLASS_CAPACITY,CAMERA,quadMatrix,CENTRE_AISLE_X} from '../auditorium-layout.mjs';
import * as THREE from 'three';

test('lecture theatre has 30 unique tiered seats and a clear central aisle',()=>{
  assert.equal(SEATS.length,30);assert.equal(new Set(SEATS.map(s=>s.home.join(','))).size,30);
  for(const s of SEATS){assert.ok(Math.abs(s.x-CENTRE_AISLE_X)>.84);assert.equal(s.home[1],s.row*.2);}
  assert.ok(SEATS.at(-1).y>SEATS[0].y);
});
test('board projection maps all four content corners to the physical board',()=>{
  const width=600,height=300,corners=[{x:60,y:100},{x:560,y:140},{x:510,y:390},{x:95,y:350}];
  const m=quadMatrix(width,height,corners),source=[[0,0],[width,0],[width,height],[0,height]];
  source.forEach(([x,y],i)=>{const w=m[3]*x+m[7]*y+m[15],u=(m[0]*x+m[4]*y+m[12])/w,v=(m[1]*x+m[5]*y+m[13])/w;assert.ok(Math.abs(u-corners[i].x)<1e-6);assert.ok(Math.abs(v-corners[i].y)<1e-6);});
});

test('standing room sits outside the railings, inside the walls, and on screen',()=>{
  assert.equal(CLASS_CAPACITY,SEATS.length+STANDING.length);assert.ok(STANDING.length>=5);
  assert.equal(new Set(STANDING.map(s=>s.home.join(','))).size,STANDING.length);
  // Same camera as classroom.js.
  const camera=new THREE.PerspectiveCamera(CAMERA.fov,9/16,.1,150);camera.position.set(...CAMERA.position);camera.lookAt(...CAMERA.target);camera.updateMatrixWorld();
  for(const spot of STANDING){
    assert.ok(Math.abs(spot.x)>8.3&&Math.abs(spot.x)<11.5,'between railing and wall');
    const head=new THREE.Vector3(spot.x,spot.home[1]+1.8,spot.z).project(camera),feet=new THREE.Vector3(...spot.home).project(camera);
    const x=(head.x+1)/2,y=(1-feet.y)/2;
    assert.ok(x>.06&&x<.94,`spot ${spot.x},${spot.z} off screen horizontally (${x.toFixed(2)})`);assert.ok(y<.76,'above the ranking panel');
  }
});
