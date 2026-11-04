// Selected study 04: source proportions, bevelled pear head and A-line dungarees.
// Merge by material before instancing: five solid draws regardless of crowd size.
export function createPearSpectatorGeometry(T) {
 const parts={body:[],skin:[],hair:[],shoes:[],trim:[]}, scale=.34;
 const add=(key,g,x=0,y=0,z=0)=>{g.translate(x,y,z);parts[key].push(g);};
 const ball=(key,x,y,z,rx,ry,rz)=>{const g=new T.SphereGeometry(1,12,8);g.scale(rx,ry,rz);add(key,g,x,y,z);};
 const box=(key,x,y,z,w,h,d)=>add(key,new T.BoxGeometry(w,h,d),x,y,z);
 const link=(key,a,b,r)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),v=end.clone().sub(start);const g=new T.CapsuleGeometry(r,Math.max(.01,v.length()-2*r),3,8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));add(key,g,...start.add(end).multiplyScalar(.5).toArray());};
 const x=1.095,headY=2.235;
 // Same 64-point pear outline as the approved prototype, never a chibi sphere.
 const outline=new T.Shape();for(let i=0;i<32;i++){const a=i/32*Math.PI*2,px=Math.cos(a)*.69,py=Math.sin(a)*.64;i?outline.lineTo(px,py):outline.moveTo(px,py);}outline.closePath();
 const head=new T.ExtrudeGeometry(outline,{depth:.29,bevelEnabled:true,bevelThickness:.1,bevelSize:.07,bevelSegments:2,steps:1});head.translate(0,0,-.145);add('skin',head,0,headY,0);
 const body=new T.Shape();body.moveTo(-.84*.48,-.95/2);body.lineTo(.84*.48,-.95/2);body.quadraticCurveTo(.84*.47,0,.84*.3,.95/2);body.lineTo(-.84*.3,.95/2);body.quadraticCurveTo(-.84*.47,0,-.84*.48,-.95/2);
 const torso=new T.ExtrudeGeometry(body,{depth:.4,bevelEnabled:true,bevelSegments:3,bevelSize:.09,bevelThickness:.08,steps:1});torso.translate(0,0,-.2);add('body',torso,0,x,0);
 for(const side of [-1,1]){
  const leg=side*.84*.235;link('skin',[leg,.19,0],[leg,.77,0],.13);
  box('shoes',leg,.14,.065,.3,.22,.46);box('trim',leg,.065,.065,.31,.065,.47);
  const a=[side*.84*.43,x+.95*.29,0],b=[side*.84*.65,x-.02,.015],c=[side*.84*.67,x-.95*.37,.1];
  link('trim',a,b,.135);ball('trim',...b,.135,.135,.135);link('trim',b,c,.123);ball('skin',...c,.128,.142,.128);

 }
 link('skin',[0,x+.95*.3,0],[0,headY-1.27*.35,0],.16);

 const bowl=new T.Shape();bowl.moveTo(-.74,-.03);bowl.bezierCurveTo(-.81,.83,.81,.83,.74,-.03);bowl.lineTo(.56,-.08);bowl.lineTo(.54,.24);bowl.quadraticCurveTo(0,.34,-.54,.24);bowl.lineTo(-.56,-.08);bowl.closePath();const cap=new T.ExtrudeGeometry(bowl,{depth:.18,bevelEnabled:false,steps:1});add('hair',cap,0,headY+.03,.13);
 const result={};for(const [key,list] of Object.entries(parts)){
  const flat=list.map(g=>g.index?g.toNonIndexed():g),merged=new T.BufferGeometry();
  for(const attr of ['position','normal','uv']){const arrays=flat.map(g=>g.attributes[attr].array),data=new Float32Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){data.set(a,offset);offset+=a.length;}merged.setAttribute(attr,new T.BufferAttribute(data,attr==='uv'?2:3));}
  merged.scale(scale,scale,scale);result[key]=merged;for(const g of new Set([...list,...flat]))g.dispose();
 }
 result.face=new T.PlaneGeometry(1.13*scale,1.04*scale);result.face.translate(0,(headY-.11)*scale,.254*scale);
 return result;
}
// Deterministic varied clothing for decorative spectators; never tied to team side.
const SHIRT_COLORS=[0xf1a53c,0x55a77a,0x9a69be,0xe66b85,0x55a7b4,0xe4d379,0xa57b60,0x7486c4,0xe8a879,0x8eac50,0xd26b55];
export function spectatorShirtColor(index) {
 const i=index>>>0;
 return SHIRT_COLORS[(i*7+Math.floor(i/11)*3)%SHIRT_COLORS.length];
}
export function crowdEmotion(state,side,previous='neutral') {
 if(state?.phase==='result'){
  const red=Number(state.score?.red)||0,blue=Number(state.score?.blue)||0;
  if(red===blue)return 'neutral';
  return (red>blue?'red':'blue')===side?'cheer':'sad';
 }
 if(state?.phase!=='pull')return 'neutral';
 const red=Math.max(0,Number(state.score?.red)||0),blue=Math.max(0,Number(state.score?.blue)||0);
 const advantage=Number.isFinite(state.position)?state.position:(red-blue)/Math.max(1,red+blue);
 const disadvantage=advantage*(side==='red'?-1:1);
 return disadvantage>(previous==='worried'?.38:.58)?'worried':'cheer';
}
export function spectatorFaceIndex(index,emotion='neutral') {
 const choices=emotion==='sad'?[5]:emotion==='worried'?[1,4]:emotion==='cheer'?[0,2,3,7]:[0,2,7];
 const i=index>>>0;return choices[((Math.imul(i,7)+Math.floor(i/13))>>>0)%choices.length];
}
// Decorative spectators, not connected viewers. Stable individual phases avoid a synchronized crowd.
export function crowdPose(time, index, phase, still) {
 if(still)return {energy:0,hop:0,lean:0,arm:0};
 const energy=phase==='pull'?1:phase==='result'?1.1:.4;
 const wave=time*(3.5+(index%5)*.25)+index*2.399;
 return {energy, hop:energy*Math.max(0,Math.sin(wave))*.14, lean:energy*Math.sin(wave*.63)*.18, arm:energy*Math.sin(wave)*.35};
}
