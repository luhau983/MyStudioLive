import {characterFormGeometry, roundedGarmentBox} from './character-hair.mjs';

export const STREET_OUTFITS=Object.freeze([
 {id:'street-polo',label:'Polo boy phố',longSleeve:false,pants:true,shoes:'sneakers'},
 {id:'street-plaid',label:'Sơ mi caro',longSleeve:false,pants:true,shoes:'loafers'},
 {id:'street-gold',label:'Họa tiết vàng',longSleeve:false,pants:true,shoes:'sneakers'},
 {id:'street-leather',label:'Áo da',longSleeve:true,pants:true,shoes:'boots'},
 {id:'street-bomber',label:'Bomber',longSleeve:true,pants:true,shoes:'sneakers'},
 {id:'street-summer',label:'Đi chơi hè',longSleeve:false,pants:false,shoes:'slides'},
].map(Object.freeze));
export function streetOutfitForUser(id){let hash=0;for(const c of String(id??''))hash=(Math.imul(hash,31)+c.codePointAt(0))>>>0;return hash%STREET_OUTFITS.length;}

const geometryCache=new WeakMap();
const badgeCache=new WeakMap();
export function addTeamBadge(parent,{THREE:T,side,outfitIndex=0}){
 if(!['red','blue'].includes(side))throw new RangeError('Unknown badge team');
 let badge=badgeCache.get(T);
 if(!badge){
  const shape=new T.Shape();shape.moveTo(-.08,.075);shape.lineTo(.08,.075);shape.lineTo(.073,-.02);shape.quadraticCurveTo(.05,-.065,0,-.095);shape.quadraticCurveTo(-.05,-.065,-.073,-.02);shape.closePath();
  const shield=new T.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2,steps:1});
  const star=new T.Shape();for(let i=0;i<10;i++){const angle=Math.PI/2+i*Math.PI/5,r=i%2?.011:.025,x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?star.lineTo(x,y):star.moveTo(x,y);}star.closePath();
  badge={shield,star:new T.ShapeGeometry(star),border:new T.MeshStandardMaterial({color:0xf0ede4,roughness:.55,metalness:.12}),red:new T.MeshStandardMaterial({color:0xe8423f,roughness:.65}),blue:new T.MeshStandardMaterial({color:0x2f7fe8,roughness:.65})};badgeCache.set(T,badge);
 }
 const group=new T.Group();group.name='character-team-badge';group.userData.team=side;
 group.position.set(-.20,.94,[.215,.269,.215,.276,.215,.215][outfitIndex]??.215);group.rotation.y=-.48;
 const border=new T.Mesh(badge.shield,badge.border),fill=new T.Mesh(badge.shield,badge[side]),star=new T.Mesh(badge.star,badge.border);
 fill.scale.set(.80,.80,.65);fill.position.z=.010;star.position.set(0,.002,.024);
 for(const part of [border,fill,star]){part.userData.skipOutline=true;group.add(part);}parent.add(group);return group;
}
function mergePieces(T,pieces){
 const buckets=new Map();for(const piece of pieces){if(!buckets.has(piece.role))buckets.set(piece.role,[]);buckets.get(piece.role).push(piece.geometry);}
 return [...buckets].map(([role,geometries])=>{
  if(geometries.length===1)return {role,geometry:geometries[0]};
  const flat=geometries.map(g=>g.index?g.toNonIndexed():g),geometry=new T.BufferGeometry();
  for(const name of ['position','normal','uv']){
   const data=new Float32Array(flat.reduce((n,g)=>n+g.attributes[name].array.length,0));let offset=0;
   for(const g of flat){data.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
   geometry.setAttribute(name,new T.BufferAttribute(data,name==='uv'?2:3));
  }
  for(const g of new Set([...geometries,...flat]))g.dispose();return {role,geometry};
 });
}
function ripped(T,source,{shorts=false}={}){
 const original=source.index?source.toNonIndexed():source.clone(),p=original.attributes.position,keep=[];
 for(let i=0;i<p.count;i+=3){
  const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
  if(!(Math.abs(x)<.092&&y>(shorts?-.11:-.13)&&y<(shorts?-.05:-.065)&&z>(shorts?.15:.105)))keep.push(i,i+1,i+2);
 }
 const result=new T.BufferGeometry();for(const name of ['position','normal','uv']){const attr=original.attributes[name],data=new Float32Array(keep.length*attr.itemSize);keep.forEach((index,i)=>data.set(attr.array.subarray(index*attr.itemSize,(index+1)*attr.itemSize),i*attr.itemSize));result.setAttribute(name,new T.BufferAttribute(data,attr.itemSize));}
 original.dispose();return result;
}
export function streetOutfitGeometry(T,index){
 if(!Number.isInteger(index)||!STREET_OUTFITS[index])throw new RangeError('Unknown street outfit');
 let cache=geometryCache.get(T);if(!cache){cache=new Map();geometryCache.set(T,cache);}if(cache.has(index))return cache.get(index);
 const forms=characterFormGeometry(T),body=[],leg=[],head=[],foot=[];
 const add=(target,geometry,role)=>{target.push({geometry,role});return geometry;};
 const box=(target,role,x,y,z,w,h,d)=>{
  const g=target===foot?roundedGarmentBox(T,w,h,d):new T.BoxGeometry(w,h,d,Math.max(2,Math.ceil(w/.035)),Math.max(2,Math.ceil(h/.045)),1),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const px=p.getX(i)+x;let pz=p.getZ(i)+z;if(target===body&&z>.18)pz-=.245*(1-Math.sqrt(Math.max(.04,1-px*px/(.36*.36))));p.setXYZ(i,px,p.getY(i)+y,pz);}
  g.computeVertexNormals();return add(target,g,role);
 };
 const tube=(target,role,points,r=.007)=>add(target,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,r,6,false),role);
 const ring=(target,role,x,y,z,r,tubeRadius=.015,sx=1,sz=1)=>{const g=new T.TorusGeometry(r,tubeRadius,8,32);g.rotateX(Math.PI/2);g.scale(sx,1,sz);g.translate(x,y,z);return add(target,g,role);};
 const ball=(target,role,x,y,z,rx,ry,rz)=>{const g=new T.SphereGeometry(1,20,14);g.scale(rx,ry,rz);g.translate(x,y,z);return add(target,g,role);};
 const collar=()=>{
  for(const s of [-1,1]){
   const shape=new T.Shape();shape.moveTo(s*.025,1.16);shape.lineTo(s*.16,1.135);shape.lineTo(s*.12,1.015);shape.lineTo(s*.035,1.07);shape.closePath();
   const g=new T.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.007,bevelThickness:.006,bevelSegments:2,steps:1});g.translate(0,0,.226);add(body,g,'collar');
  }
 };
 const buttons=()=>{for(let i=0;i<4;i++)ball(body,'metal',.018,.69+i*.105,.27,.012,.012,.008);};
 const chain=(gold=false)=>{
  tube(body,gold?'gold':'metal',[[-.16,1.13,.19],[-.115,1.01,.245],[0,.955,.267],[.115,1.01,.245],[.16,1.13,.19]],.008);
  ball(body,gold?'gold':'metal',0,.932,.278,.022,.031,.008);
 };
 const belt=()=>{
  ring(body,'leather',0,.475,0,.315,.018,1,.74);
  const g=new T.TorusGeometry(.043,.009,6,4);g.rotateZ(Math.PI/4);g.scale(1.5,.9,1);g.translate(0,.475,.255);add(body,g,index===2?'gold':'metal');
  for(const x of [-.22,.22])box(body,'pants',x,.475,.19,.025,.07,.025);
 };
 if(index===0){collar();box(body,'collar',0,1.035,.256,.038,.18,.018);buttons();chain();}
 if(index===1){collar();box(body,'shirt',0,.845,.265,.04,.53,.015);buttons();box(body,'shirt',-.19,.955,.29,.15,.14,.018);chain();}
 if(index===2){ring(body,'shirt',0,1.14,0,.165,.022,1,.8);chain(true);}
 if(index===3){
  box(body,'lining',0,.85,.278,.31,.58,.018);
  for(const s of [-1,1]){
   box(body,'shirt',s*.235,.855,.29,.20,.58,.03);
   const shape=new T.Shape();shape.moveTo(s*.04,1.15);shape.lineTo(s*.24,1.095);shape.lineTo(s*.16,.96);shape.lineTo(s*.085,1.02);shape.closePath();
   const g=new T.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelSize:.008,bevelThickness:.007,bevelSegments:2,steps:1});g.translate(0,0,.26);add(body,g,'shirt');
   tube(body,'metal',[[s*.15,.69,.26],[s*.27,.78,.21]],.005);
  }
  tube(body,'metal',[[.125,.58,.29],[.135,.83,.285],[.055,1.07,.29]],.005);chain();
 }
 if(index===4){
  ring(body,'rib',0,1.14,0,.168,.03,1,.8);ring(body,'rib',0,.545,0,.328,.025,1,.73);
  box(body,'metal',0,.85,.257,.009,.56,.009);
  for(const s of [-1,1])tube(body,'rib',[[s*.18,.68,.24],[s*.285,.76,.17]],.009);
  tube(body,'leather',[[-.25,1.14,.18],[-.08,.99,.27],[.11,.79,.28],[.24,.59,.20]],.025);
  const bag=roundedGarmentBox(T,.245,.26,.095,.035);bag.translate(.19,.74,.28);add(body,bag,'leather');
  box(body,'metal',.19,.80,.337,.17,.009,.009);ball(body,'metal',.27,.775,.342,.009,.023,.008);
 }
 if(index===5){
  ring(body,'rib',0,1.14,0,.168,.021,1,.8);chain();
  for(const s of [-1,1]){
   const lens=roundedGarmentBox(T,.205,.12,.028,.027);lens.rotateY(s*.22);lens.translate(s*.15,.035,.426);add(head,lens,'glasses');
   tube(head,'leather',[[s*.25,.04,.41],[s*.39,.035,.33],[s*.52,.025,.17]],.012);
  }
  tube(head,'metal',[[-.05,.055,.435],[0,.063,.445],[.05,.055,.435]],.008);
 }
 if(index!==4)belt();else for(const x of [-.05,.05])tube(body,'rib',[[x,.48,.25],[x,.36,.25]],.009);
 if(index<3||index===5){
  const short=index===5,y=short?-.11:-.24,z=short?.207:.158;
  for(let i=0;i<3;i++)tube(leg,'thread',[[-.085,y+i*.011,z-.022],[0,y+i*.009,z],[.085,y+i*.012,z-.022]],.0025);
 }
 // These pieces live in each knee group, so the complete shoe follows the shin.
 if(STREET_OUTFITS[index].shoes==='sneakers'){
  ball(foot,'shoe',0,-.265,.11,.18,.09,.25);
  const g=roundedGarmentBox(T,.365,.048,.52,.06);g.translate(0,-.35,.115);add(foot,g,'sole');
  for(let i=0;i<3;i++){
   const z=.09+i*.045,surface=(x,z)=>-.265+.09*Math.sqrt(Math.max(0,1-x*x/(.18*.18)-(z-.11)*(z-.11)/(.25*.25)))+.006;
   tube(foot,'laces',[[-.085,surface(-.085,z),z],[0,surface(0,z+.01),z+.01],[.085,surface(.085,z),z]],.004);
   for(const x of [-.085,.085])ball(foot,'metal',x,surface(x,z)-.002,z,.008,.004,.008);
  }
  box(foot,'rib',0,-.27,-.105,.20,.07,.025);
 }else if(STREET_OUTFITS[index].shoes==='loafers'){
  ball(foot,'shoe',0,-.285,.11,.18,.09,.245);
  box(foot,'leather',0,-.35,.11,.36,.04,.51);box(foot,'leather',0,-.215,.16,.27,.022,.065);box(foot,'gold',0,-.20,.16,.075,.014,.025);
 }else if(STREET_OUTFITS[index].shoes==='boots'){
  const shaft=roundedGarmentBox(T,.29,.21,.31,.055);shaft.translate(0,-.205,.025);add(foot,shaft,'shoe');
  ball(foot,'shoe',0,-.285,.12,.18,.10,.25);box(foot,'leather',0,-.35,.12,.37,.05,.54);box(foot,'metal',0,-.20,.185,.009,.15,.008);
 }else{
  const sole=roundedGarmentBox(T,.36,.05,.52,.055);sole.translate(0,-.35,.11);add(foot,sole,'leather');
  ball(foot,'skin',0,-.295,.11,.16,.065,.23);
  const strap=new T.TorusGeometry(.16,.035,8,28,Math.PI);strap.scale(1,.5,2.2);strap.translate(0,-.30,.14);add(foot,strap,'leather');
  for(let i=-1;i<=1;i++)box(foot,'sole',i*.045,-.208,.14,.014,.008,.11);
 }
 const skinny=forms.trouser.clone();skinny.scale(.90,1,.96);
 const result={body:mergePieces(T,body),leg:mergePieces(T,leg),head:mergePieces(T,head),foot:mergePieces(T,foot),thigh:index<3?ripped(T,skinny):skinny,shin:skinny,shorts:index===5?ripped(T,forms.shortLeg,{shorts:true}):forms.shortLeg};
 cache.set(index,result);return result;
}

export function createStreetWardrobe(T,{canvasTexture,clothBump}){
 const standard=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.9,...extra});
 const texture=draw=>canvasTexture(512,512,draw);
 const plaid=texture((g,w,h)=>{
  g.fillStyle='#cfb88f';g.fillRect(0,0,w,h);
  for(let i=0;i<w;i+=128){g.fillStyle='#22252a';g.fillRect(i+42,0,30,h);g.fillRect(0,i+42,w,30);g.fillStyle='#ffffff90';g.fillRect(i+82,0,14,h);g.fillRect(0,i+82,w,14);g.fillStyle='#9f3839';g.fillRect(i+103,0,3,h);g.fillRect(0,i+103,w,3);}
 });
 const baroque=texture((g,w,h)=>{
  g.fillStyle='#151619';g.fillRect(0,0,w,h);g.strokeStyle='#d7af56';g.lineWidth=3;
  for(let y=-64;y<h+64;y+=128)for(let x=-64;x<w+64;x+=128){
   g.save();g.translate(x+64,y+64);for(let k=0;k<4;k++){g.rotate(Math.PI/2);g.beginPath();g.moveTo(0,0);g.bezierCurveTo(67,-9,55,-69,18,-48);g.bezierCurveTo(-5,-33,35,-15,32,-41);g.stroke();g.beginPath();g.ellipse(13,-21,7,19,-.7,0,Math.PI*2);g.stroke();}g.restore();
  }
 });
 const denim=color=>texture((g,w,h)=>{
  g.fillStyle=color;g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=64){const fade=g.createLinearGradient(x,0,x+50,0);fade.addColorStop(0,'#ffffff00');fade.addColorStop(.5,'#ffffff22');fade.addColorStop(1,'#ffffff00');g.fillStyle=fade;g.fillRect(x,0,50,h);}
  g.lineWidth=1;for(let i=-h;i<w;i+=5){g.strokeStyle='#ffffff12';g.beginPath();g.moveTo(i,0);g.lineTo(i+h,h);g.stroke();}
 });
 const blackDenim=denim('#252830'),blueDenim=denim('#486887'),grayDenim=denim('#51545b');
 const graphic=texture((g,w,h)=>{
  g.fillStyle='#e6e2d8';g.fillRect(0,0,w,h);
  for(const center of [0,512]){g.save();g.translate(center,245);g.scale(1.3,1.4);g.fillStyle='#24272b';g.beginPath();g.moveTo(-38,-70);g.lineTo(20,-70);g.lineTo(-5,-7);g.lineTo(37,-7);g.lineTo(-25,83);g.lineTo(-8,15);g.lineTo(-40,15);g.closePath();g.fill();g.font='bold 37px Arial';g.textAlign='center';g.fillText('PHỐ',0,134);g.restore();}
 });
 const common={metal:standard(0xc6ccd2,{metalness:.75,roughness:.3}),gold:standard(0xd5ae50,{metalness:.7,roughness:.32}),leather:standard(0x191b1f,{roughness:.48}),lining:standard(0xf1eee6),skin:standard(0xf3f1ee),sole:standard(0xf5f1e7),laces:standard(0xb9bfc6),thread:standard(0xc7c3b8),glasses:standard(0x101820,{roughness:.22,metalness:.25})};
 const fabric=(color,map=null)=>standard(color,{map,bumpMap:clothBump,bumpScale:.002});
 const materials=[
  {...common,shirt:fabric(0x1b1f25),pants:fabric(0xffffff,blackDenim),collar:fabric(0xe8e4db),rib:fabric(0x25282b),shoe:standard(0xf3f1e9)},
  {...common,shirt:fabric(0xffffff,plaid),pants:fabric(0xffffff,blueDenim),collar:fabric(0xffffff,plaid),rib:fabric(0x2b2a29),shoe:standard(0x29221e,{roughness:.42})},
  {...common,shirt:fabric(0xffffff,baroque),pants:fabric(0xffffff,grayDenim),collar:fabric(0x1b1c20),rib:fabric(0x24262a),shoe:standard(0xf3f1e9)},
  {...common,shirt:standard(0x202226,{roughness:.43}),pants:fabric(0xffffff,blackDenim),collar:standard(0x202226,{roughness:.43}),rib:fabric(0x22252a),shoe:standard(0x202126,{roughness:.4})},
  {...common,shirt:fabric(0x38463c),pants:fabric(0x292d32),collar:fabric(0x202723),rib:fabric(0x222b26),shoe:standard(0xf3f1e9)},
  {...common,shirt:fabric(0xffffff,graphic),pants:fabric(0xffffff,blueDenim),collar:fabric(0x25272b),rib:fabric(0x25272b),shoe:common.leather},
 ];
 function addPieces(parent,list,index,shadow){
  for(const {geometry,role} of list){const part=new T.Mesh(geometry,materials[index][role]);part.castShadow=shadow&&!['metal','gold','laces','thread'].includes(role);part.receiveShadow=shadow;part.userData.skipOutline=true;part.userData.smallDetail=['metal','gold','laces','thread'].includes(role);parent.add(part);}
 }
 return {materials,geometry:index=>streetOutfitGeometry(T,index),body:(parent,index,shadow)=>addPieces(parent,streetOutfitGeometry(T,index).body,index,shadow),leg:(parent,index,shadow)=>addPieces(parent,streetOutfitGeometry(T,index).leg,index,shadow),head:(parent,index)=>addPieces(parent,streetOutfitGeometry(T,index).head,index,false),foot:(parent,index,shadow)=>addPieces(parent,streetOutfitGeometry(T,index).foot,index,shadow)};
}
