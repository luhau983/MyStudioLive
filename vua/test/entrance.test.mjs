import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entranceRoute,standingRoute,guestRoute,sampleRoute} from '../entrance.mjs';
import {SEATS,STANDING,GUEST_SPOTS,STAGE_Y,AISLE_X,SIDE_LANE_X} from '../auditorium-layout.mjs';

test('all 30 entrance routes start outside, use aisles, and reach the reserved seat',()=>{
  const desks=SEATS;
  for(const seat of desks){
    const home=[seat.x,seat.y,seat.z+.2],route=entranceRoute(home);
    assert.ok(route[0][0]<-7);assert.equal(route[1][0],AISLE_X);
    assert.deepEqual(sampleRoute(route,1e6).position,home);assert.equal(sampleRoute(route,1e6).done,true);
    const length=route.slice(1).reduce((n,p,i)=>n+Math.hypot(...p.map((v,j)=>v-route[i][j])),0);
    for(let d=0;d<length;d+=.12){
      const [x,,z]=sampleRoute(route,d).position;
      for(const desk of desks)assert.ok(!(Math.abs(x-desk.x)<.82&&z>desk.z-.42&&z<desk.z+.02),'route crosses desk');
    }
  }
});
test('routes descend the actual tiers and avoid the continuous writing benches',()=>{
  for(const seat of SEATS){
    const route=entranceRoute(seat.home);
    for(let i=1;i<route.length;i++)assert.ok(route[i][1]<=route[i-1][1]+1e-6);
    const length=route.slice(1).reduce((n,p,i)=>n+Math.hypot(...p.map((v,j)=>v-route[i][j])),0);
    for(let d=0;d<length;d+=.15){const [x,,z]=sampleRoute(route,d).position;
      for(let row=0;row<SEATS.length/5;row++)for(const [cx,width] of [[-3.85,4.65],[2.95,7.05]]){
        const rz=SEATS[row*5].z;assert.ok(!(Math.abs(x-cx)<width/2&&z>rz-.43&&z<rz+.03));
      }
    }
  }
});
test('path interpolation is deterministic and does not overshoot',()=>{
  const route=[[0,0,0],[3,0,0],[3,0,4]];
  assert.deepEqual(sampleRoute(route,1.5).position,[1.5,0,0]);
  assert.deepEqual(sampleRoute(route,5).position,[3,0,2]);
  assert.deepEqual(sampleRoute(route,99).position,[3,0,4]);
});

test('standing routes enter from off-screen along the side wall and stop at their spot',()=>{
  for(const spot of STANDING){
    const route=standingRoute(spot.home),side=Math.sign(spot.x);
    assert.equal(route[0][0],side*SIDE_LANE_X);assert.ok(route[0][2]>20,'starts behind the camera view');
    assert.deepEqual(sampleRoute(route,1e6).position,spot.home);
  }
});

test('guest routes run in off-screen, climb onto the stage and end at a stage spot',()=>{
  assert.ok(GUEST_SPOTS.length>=4);
  for(const spot of GUEST_SPOTS){
    const route=guestRoute(spot.home);
    assert.ok(route[0][2]>20);assert.equal(route.at(-2)[1],STAGE_Y);
    assert.deepEqual(sampleRoute(route,1e6).position,spot.home);
    assert.ok(spot.z<-3.9&&spot.z>-6.5&&Math.abs(spot.x)<11,'on the stage platform');
  }
});
