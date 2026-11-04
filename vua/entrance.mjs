// World-space route: outside doorway → side aisle → row aisle → side of chair.
import {ROWS,AISLE_X,CENTRE_AISLE_X,ENTRY_Z,rowZ,rowHeight,ROW_STEP,SIDE_LANE_X,FLOOR_Y,STAGE_Y} from './auditorium-layout.mjs';
export function entranceRoute(home) {
  const [x,y,z]=home,row=Math.max(0,Math.min(ROWS-1,Math.round((z-.2+.3)/ROW_STEP))),aisle=x<0?AISLE_X:CENTRE_AISLE_X,back=rowHeight(ROWS-1);
  const route=[[-10.5,back,ENTRY_Z],[AISLE_X,back,ENTRY_Z]];
  if(aisle!==AISLE_X)route.push([aisle,back,ENTRY_Z]);
  for(let r=ROWS-1;r>=row;r--)route.push([aisle,rowHeight(r),rowZ(r)+.83]);
  route.push([x-.68,y,rowZ(row)+.83],[x-.68,y,z],[x,y,z]);
  return route;
}

// Standing room: walk in from off-screen along the side wall, then step to the spot.
export function standingRoute(home) {
  const [x,y,z]=home,lane=Math.sign(x)*SIDE_LANE_X;
  return [[lane,FLOOR_Y,23],[lane,FLOOR_Y,z],[x,y,z]];
}

// Guest: run in along the right wall, climb the stage steps, cross in front of the teacher.
export function guestRoute(home) {
  const [x,y,z]=home,front=-3.95;
  return [[SIDE_LANE_X,FLOOR_Y,23],[SIDE_LANE_X,FLOOR_Y,-2.4],[SIDE_LANE_X,STAGE_Y,front],[x,STAGE_Y,front],[x,y,z]];
}

export function sampleRoute(points,distance) {
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(...b.map((v,j)=>v-a[j]));
    if(distance<=length&&length>0){const f=Math.max(0,distance/length);return {position:a.map((v,j)=>v+(b[j]-v)*f),heading:Math.atan2(b[0]-a[0],b[2]-a[2]),segment:i,done:false};}
    distance-=length;
  }
  const end=points.at(-1),before=points.at(-2);
  return {position:[...end],heading:Math.atan2(end[0]-before[0],end[2]-before[2]),segment:points.length-1,done:true};
}

export function entranceTiming(route,now,previousStart=0){
  const length=route.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-route[i][j])),0);
  return {startAt:Math.max(now,previousStart)+60,speed:Math.max(9,length/1.6)};
}
