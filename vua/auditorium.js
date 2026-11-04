import * as THREE from '/three.module.js';
import {ROWS,rowZ,rowHeight,ROW_STEP,AISLE_X,CENTRE_AISLE_X,ENTRY_Z} from '/auditorium-layout.mjs';

export function buildAuditorium(scene,{box,ball,rod}){
  // Cutaway lecture theatre: the camera sees the room's interior, not a flat backdrop.
  box(scene,'#a28b70',0,-.35,4,25,.5,38);
  for(let z=-13;z<23;z+=1.05)box(scene,'#8b765e',0,-.085,z,24,.02,.025);
  box(scene,'#e3dbc9',0,9.5,-11.1,25,20,.4);
  for(const side of [-1,1]){
    box(scene,'#d9d5c8',side*12.3,7.4,4,.35,16,31);
    box(scene,'#53635e',side*12.06,1.8,4,.12,3.6,31);
    for(const z of [-7,-.5,6,12.5,19]){
      box(scene,'#4c655f',side*11.99,7.5,z,.13,6.7,4.1);
      box(scene,'#b7d3d0',side*11.89,7.5,z,.10,6.3,3.7,{emissive:'#b8d6d5',emissiveIntensity:.24});
      for(const dy of [-3.2,0,3.2])box(scene,'#eee6cd',side*11.80,7.5+dy,z,.16,.11,3.9);
      for(const dz of [-1.9,0,1.9])box(scene,'#eee6cd',side*11.78,7.5,z+dz,.18,6.5,.10);
    }
    for(let z=-9;z<22;z+=3.8)box(scene,'#b8b7a9',side*11.92,7,z,.35,14,.28);
  }
  // Timber acoustic wall, structural beams and suspended lighting establish depth.
  for(let x=-11.8;x<=12;x+=.48)box(scene,x<0?'#a88660':'#ad8d67',x,2,-10.82,.20,4,.15);
  box(scene,'#4a6058',0,14.5,-10.8,24,.28,.20);
  // The roof is cut away above the camera; retain only the front structural beam.
  for(const z of [-8]){
    box(scene,'#637269',0,15.3,z,24,.32,.35);
    for(const x of [-10.6,10.6]){
      rod(scene,'#5c6861',[x,15.2,z],[x,13.7,z],.035);
      box(scene,'#5c6861',x,13.65,z,2.6,.12,.6);
      box(scene,'#fff3cc',x,13.56,z,2.4,.06,.48,{emissive:'#ffe5a5',emissiveIntensity:.7});
    }
  }
  const board={x:0,y:10.25,z:-10.62,w:19.2,h:13.5};
  box(scene,'#494f43',0,10.25,-10.85,20,14.3,.36);
  box(scene,'#b79565',0,10.25,-10.63,19.7,14,.15);
  box(scene,'#173d31',0,10.25,-10.48,19.2,13.5,.10);
  // Front face used for DOM projection must match the rendered chalk surface.
  board.z=-10.415;
  box(scene,'#ad8c5a',0,3.25,-10.35,20,.18,.5);
  box(scene,'#d2bb8e',4,3.43,-10.25,.8,.20,.3);
  for(let i=0;i<4;i++)box(scene,'#f3e7bf',-1+i*.3,3.39,-10.2,.22,.08,.1);
  // Deep teaching stage with two steps, a lectern and a side planter.
  box(scene,'#76563e',0,.12,-7,23,.65,6.2);
  box(scene,'#b39569',0,.47,-7,23.1,.12,6.3);
  for(let i=0;i<2;i++)box(scene,'#967552',0,.10+i*.14,-3.45-i*.38,23.6,.17,.48);
  box(scene,'#744f36',-8.3,1.42,-6.2,1.8,1.8,1.05);
  box(scene,'#b48e5c',-8.3,2.36,-6.2,2.2,.14,1.25);
  box(scene,'#e6dcc0',-8.4,2.46,-6.3,.8,.05,.55);
  rod(scene,'#374944',[-7.7,2.4,-6.2],[-7.7,3,-6.3],.035);
  rod(scene,'#374944',[-7.7,3,-6.3],[-8,3.13,-6.25],.035);
  for(const side of [-1,1]){
    const x=side*10.5;box(scene,'#79624b',x,.95,-7,1,1,1);
    for(let i=0;i<6;i++){const a=i*2.4;rod(scene,'#577a55',[x,1.4,-7],[x+Math.sin(a)*.55,2.7+i*.1,-7+Math.cos(a)*.4],.035);const leaf=ball(scene,'#65865b',x+Math.sin(a)*.55,2.7+i*.1,-7+Math.cos(a)*.4,.23,.5,.14);leaf.rotation.z=Math.sin(a)*.6;}
  }
  // Two banks rise toward the rear, separated by a broad central staircase.
  for(let row=0;row<ROWS;row++){
    const y=rowHeight(row),z=rowZ(row)+.43;
    for(const [x,width] of [[-3.85,4.65],[2.95,7.05]]){
      box(scene,'#6e746a',x,(y-.12)/2,z,width,y+.12,ROW_STEP);
      box(scene,'#899085',x,y-.015,z,width,.055,ROW_STEP-.04);
      box(scene,'#c6ae80',x,y-.045,z-ROW_STEP/2,width,.065,.065);
      // Long writing benches are characteristic of a lecture theatre.
      box(scene,'#bd9b69',x,y+.885,rowZ(row)-.20,width,.07,.46);
    }
    for(const aisle of [AISLE_X,CENTRE_AISLE_X,7.1]){
      box(scene,'#7a6350',aisle,y-.1,z,.95,.20,ROW_STEP);
      box(scene,'#d7bf84',aisle,y+.008,z-.78,.85,.025,.07,{emissive:'#e6c990',emissiveIntensity:.16});
    }
  }
  for(const side of [-1,1]){
    const x=side*7.75;
    for(const row of [0,Math.floor((ROWS-1)/2),ROWS-1])rod(scene,'#52635d',[x,rowHeight(row),rowZ(row)],[x,rowHeight(row)+1,rowZ(row)],.045);
    rod(scene,'#72837a',[x,1,rowZ(0)],[x,rowHeight(ROWS-1)+1,rowZ(ROWS-1)],.055);
  }
  const backHeight=rowHeight(ROWS-1);
  box(scene,'#7c8173',0,backHeight/2,ENTRY_Z,17,backHeight+.05,2.2);
  box(scene,'#3a4b44',-7.5,backHeight+1.45,ENTRY_Z+.3,1.7,2.9,.12);
  for(const x of [-8.42,-6.58])box(scene,'#b59468',x,backHeight+1.45,ENTRY_Z+.28,.15,3,.2);
  box(scene,'#b59468',-7.5,backHeight+2.98,ENTRY_Z+.28,2,.15,.2);
  const door=box(scene,'#93734f',-8.4,backHeight+1.45,ENTRY_Z+.95,.12,2.8,1.4);door.rotation.y=-.15;
  return {board,teacherPosition:[7.3,.55,-4.4]};
}
