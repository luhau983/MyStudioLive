// Shared by the authoritative queue and its 3D presentation.
export const SQUAD_SIZE=5;
// Players benched as away (quiet, maybe gone) never stand in the next-squad area.
export function nextSquad(players){
 return players.filter(p=>Number(p.lineupRank)>SQUAD_SIZE&&!p.away)
  .sort((a,b)=>(Number(b.giftDiamonds)||0)-(Number(a.giftDiamonds)||0)||(a.queueOrder??(Number(a.lineupRank)||0))-(b.queueOrder??(Number(b.lineupRank)||0)))
  .slice(0,SQUAD_SIZE);
}
export function readyPosition(side,index){
 const sign=side==='red'?-1:1,row=Math.floor(index/SQUAD_SIZE),col=index%SQUAD_SIZE;
 return {x:sign*(2.5+col*.96),y:0,z:-1.65-row*1.1};
}
// Arc-length sampling makes running speed stable across long and short legs.
export function makeRoute(points,{delay=0,speed=7}={}){
 const lengths=[];let length=0;
 for(let i=1;i<points.length;i++){length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z);lengths.push(length);}
 return {points,lengths,length,elapsed:0,delay,speed};
}
export function advanceRoute(route,dt){
 route.elapsed+=Math.max(0,Math.min(.1,dt));
 const distance=Math.min(route.length,Math.max(0,route.elapsed-route.delay)*route.speed);
 let i=route.lengths.findIndex(n=>n>=distance);if(i<0)i=route.points.length-2;
 const a=route.points[i],b=route.points[i+1],start=i?route.lengths[i-1]:0;
 const f=Math.max(0,Math.min(1,(distance-start)/Math.max(1e-6,route.lengths[i]-start)));
 return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f,
  yaw:Math.atan2(b.x-a.x,b.z-a.z),moving:distance>0&&distance<route.length,done:distance>=route.length};
}
export function runPose(time){
 const swing=Math.sin(time*12);
 return {arms:[-.22,.22],elbows:[-.7,.7],armPitch:[swing*.65,-swing*.65],armYaw:[0,0],elbowPitch:[-.45,-.45],elbowTwist:[0,0],
  legs:[0,0],knees:[0,0],legPitch:[-swing*.6,swing*.6],kneePitch:[Math.max(0,swing)*.85,Math.max(0,-swing)*.85],
  bounce:Math.abs(swing)*.035,bodyDrop:0,hips:0,head:0,headNod:.04,spin:0,step:0,handReach:0,leanBack:0,crouch:0,thighReach:0,kneeBend:0,headTilt:0,turn:0};
}
