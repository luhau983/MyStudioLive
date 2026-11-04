// 6 rows x 5 = 30 seats: fewer, larger students that read clearly on a phone.
export const ROWS=6;
export const COLUMNS=[-5,-2.7,.65,3,5.3];
export const ROW_STEP=1.7;
export const TIER_RISE=.20;
export const AISLE_X=-6.65;
export const CENTRE_AISLE_X=-1.05;
export const ENTRY_Z=-.3+(ROWS-1)*1.7+2.3;
export const rowZ=row=>-.3+row*ROW_STEP;
export const rowHeight=row=>row*TIER_RISE;
// Shared by classroom.js and the layout tests.
export const CAMERA={fov:76,position:[1.5,14,20],target:[0,4,-2]};
export const SEATS=Array.from({length:ROWS},(_,row)=>COLUMNS.map((x,col)=>({row,col,x,y:rowHeight(row),z:rowZ(row),home:[x,rowHeight(row),rowZ(row)+.2]}))).flat();

// Map a flat HTML rectangle onto four projected corners of the physical board.
export function quadMatrix(width,height,corners){
  const source=[[0,0],[width,0],[width,height],[0,height]],a=[];
  for(let i=0;i<4;i++){
    const [x,y]=source[i],{x:u,y:v}=corners[i];
    a.push([x,y,1,0,0,0,-u*x,-u*y,u]);
    a.push([0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for(let col=0;col<8;col++){
    let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    [a[pivot],a[col]]=[a[col],a[pivot]];
    if(Math.abs(a[col][col])<1e-10)throw Error('Invalid projected board');
    const divisor=a[col][col];for(let j=col;j<9;j++)a[col][j]/=divisor;
    for(let row=0;row<8;row++)if(row!==col){const factor=a[row][col];for(let j=col;j<9;j++)a[row][j]-=factor*a[col][j];}
  }
  const h=a.map(row=>row[8]);return [h[0],h[3],0,h[6],h[1],h[4],0,h[7],0,0,1,0,h[2],h[5],0,1];
}

// Standing room outside the side railings, used once every seat is taken.
// The camera sits right of centre, so the right side shows more floor; spots are
// limited to points that stay on screen (≈7–93% wide, above the ranking panel).
export const FLOOR_Y=-.1;
export const SIDE_LANE_X=10.6;
// With the closer 30-seat camera only a strip near the front stays in frame.
const standingColumns=[
  {x:8.45,z:[-.9,.2,1.3]},
  {x:-8.7,z:[-.9]},{x:-8.45,z:[.3]}
];
export const STANDING=standingColumns.flatMap(({x,z})=>z.map(zz=>({x,z:zz,home:[x,FLOOR_Y,zz],heading:Math.atan2(-x*.4,-(zz+10))})));
export const CLASS_CAPACITY=SEATS.length+STANDING.length;

// Stage spots for viewers who answer correctly but have no seat or standing spot.
// They flank the teacher on the right: the caption and result card cover the left/centre.
export const STAGE_Y=.55;
export const GUEST_SPOTS=[[4.1,-4.3],[9.1,-4.3],[5.5,-5.5],[10.2,-5.5]].map(([x,z])=>({x,z,home:[x,STAGE_Y,z]}));
