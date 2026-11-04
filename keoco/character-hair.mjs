// +Z is the face. Each silhouette is one shared, light-reactive hair mesh:
// a continuous scalp cap plus sculpted locks, curls or attached braids.
export const HAIRSTYLES = Object.freeze(['bob', 'side-swept', 'spiky', 'twin-buns', 'middle-part', 'quiff', 'curly', 'ponytail', 'braids', 'mohawk', 'kha-banh', 'mullet-layer', 'side-part-73', 'textured-crop', 'two-block', 'slick-undercut']);
export const HAIRSTYLE_LABELS=Object.freeze({bob:'Úp bát','side-swept':'Mái lệch',spiky:'Vuốt nhọn','twin-buns':'Hai búi','middle-part':'Hai mái',quiff:'Vuốt phồng',curly:'Xoăn',ponytail:'Đuôi ngựa',braids:'Hai bím',mohawk:'Mohawk','kha-banh':'Khá Bảnh','mullet-layer':'Mullet layer','side-part-73':'Side part 7/3','textured-crop':'Crop mái ngắn','two-block':'Two block rủ','slick-undercut':'Undercut vuốt ngược'});
export const STREET_HAIRSTYLES=Object.freeze(['kha-banh','mullet-layer','side-part-73','textured-crop','two-block','slick-undercut']);
export function hairstyleForUser(userId) {
  if (userId == null || userId === '') return HAIRSTYLES[0];
  let hash = 2166136261;
  for (const char of String(userId)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return HAIRSTYLES[(hash >>> 0) % HAIRSTYLES.length];
}
// Shuffle in batches so a short lineup actually shows the new street cuts.
// Cache by viewer identity: team changes and rig promotion keep the same hair.
export function createHairstylePicker(random=Math.random){
 const assigned=new Map();let bag=[];
 const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 return userId=>{
  const key=String(userId??'anonymous');if(assigned.has(key))return assigned.get(key);
  if(!bag.length)bag=[...shuffle(STREET_HAIRSTYLES),...shuffle(HAIRSTYLES.filter(x=>!STREET_HAIRSTYLES.includes(x)))];
  const style=bag.shift();assigned.set(key,style);return style;
 };
}
const geometryCache = new WeakMap();
const fadeCache=new WeakMap();
function scalpFade(T,longNape){
 let cache=fadeCache.get(T);if(!cache){cache=new Map();fadeCache.set(T,cache);}if(cache.has(longNape))return cache.get(longNape);
 const positions=[],normals=[],colors=[],uv=[],indices=[],rows=16,columns=48;
 const spans=longNape?[[.78,2.42],[Math.PI*2-2.42,Math.PI*2-.78]]:[[.78,Math.PI*2-.78]];
 const skin=new T.Color(0xf3f1ee),stubble=new T.Color(0x414147),color=new T.Color();
 for(const [start,end] of spans){const offset=positions.length/3;
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
   const t=j/rows,theta=.88+t*.85,phi=start+(end-start)*i/columns;
   const x=.542*Math.sin(theta)*Math.sin(phi),y=.485*Math.cos(theta),z=.451*Math.sin(theta)*Math.cos(phi);
   positions.push(x,y,z);const n=new T.Vector3(x/(.542*.542),y/(.485*.485),z/(.451*.451)).normalize();normals.push(n.x,n.y,n.z);uv.push(i/columns,t);
   const edgeBlend=T.MathUtils.smoothstep(Math.min(phi-start,end-phi),0,.24);
   color.copy(skin).lerp(stubble,(1-T.MathUtils.smoothstep(t,.12,1))*edgeBlend);colors.push(color.r,color.g,color.b);
   if(j<rows&&i<columns){const a=offset+j*(columns+1)+i,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
 }
 const geometry=new T.BufferGeometry();for(const [name,data,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',uv,2]])geometry.setAttribute(name,new T.Float32BufferAttribute(data,size));geometry.setIndex(indices);
 const material=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1});
 const result={geometry,material};cache.set(longNape,result);return result;
}
function hairLock(T,points,radius,steps=24,taper=false){
 const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
 const g=new T.TubeGeometry(curve,steps,1,10,false),frames=curve.computeFrenetFrames(steps,false),p=g.attributes.position;
 for(let i=0;i<=steps;i++){
  const t=i/steps,center=curve.getPointAt(t),r=radius*Math.pow(Math.sin(Math.PI*t),.45)*(taper?1-.85*t:1)+.001;
  for(let j=0;j<=10;j++){const a=j/10*Math.PI*2,v=center.clone().addScaledVector(frames.normals[i],-r*Math.cos(a)).addScaledVector(frames.binormals[i],r*Math.sin(a));p.setXYZ(i*11+j,v.x,v.y,v.z);}
 }
 g.computeVertexNormals();return g;
}
function mergeHair(T,parts){
 const output=new T.BufferGeometry();
 const flat=parts.map(g=>g.index?g.toNonIndexed():g);
 for(const name of ['position','normal','uv']){
  const data=new Float32Array(flat.reduce((n,g)=>n+g.attributes[name].array.length,0));let offset=0;
  for(const g of flat){data.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
  output.setAttribute(name,new T.BufferAttribute(data,name==='uv'?2:3));
 }
 for(const g of new Set([...parts,...flat]))g.dispose();return output;
}
function mulletNape(T,layered){
 const positions=[],uv=[],indices=[],columns=24,rows=20;
 for(let side=0;side<2;side++)for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
  const t=j/rows,u=i/columns*2-1,width=(layered?.34:.30)*(1-.20*t);
  positions.push(u*width,.02-.63*t+.012*Math.cos(u*Math.PI*5)*Math.pow(t,8),-.49+.23*t*t+.15*u*u+.006*Math.cos(u*Math.PI*9)*Math.sin(t*Math.PI)+(side?.04:0));uv.push(i/columns,t);
 }
 const count=(rows+1)*(columns+1);
 for(let side=0;side<2;side++)for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
  const a=side*count+j*(columns+1)+i,b=a+columns+1;
  if(side)indices.push(a,b,a+1,b,b+1,a+1);else indices.push(a,a+1,b,b,a+1,b+1);
 }
 const bridge=(a,b)=>indices.push(a,b,a+count,b,b+count,a+count);
 for(let j=0;j<rows;j++){bridge(j*(columns+1),(j+1)*(columns+1));bridge((j+1)*(columns+1)+columns,j*(columns+1)+columns);}
 for(let i=0;i<columns;i++){bridge(i+1,i);bridge(rows*(columns+1)+i,rows*(columns+1)+i+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function crown(THREE, style) {
  let cache = geometryCache.get(THREE);
  if (!cache) { cache = new Map(); geometryCache.set(THREE, cache); }
  if (cache.has(style)) return cache.get(style);
  const positions=[], indices=[], uv=[], columns=48, rows=18;
  for(let j=0;j<=rows;j++) for(let i=0;i<=columns;i++) {
    const phi=i/columns*Math.PI*2, front=Math.max(0,Math.cos(phi));
    // Full nape at the back, open forehead in front, gently scalloped temples.
    let edge=1.88-.57*front;
    if(style==='side-swept') edge+=.24*Math.sin(phi)*front;
    if(style==='spiky') edge-=.16*front;
    if(style==='twin-buns') edge-=.08*front;
    if(style==='middle-part') edge+=front*(-.18+.37*Math.abs(Math.sin(phi)));
    if(style==='quiff') edge-=.18*front;
    if(style==='curly') edge+=.055*Math.sin(phi*11);
    if(style==='ponytail'||style==='braids') edge-=.12*front;
    if(style==='mohawk') edge-=.23*front;
    const street=STREET_HAIRSTYLES.includes(style),back=Math.max(0,-Math.cos(phi));
    if(street){
     const frontBand=1-THREE.MathUtils.smoothstep(Math.acos(Math.cos(phi)),.72,1.16);
     edge=1.0+.22*front;
     if(style==='kha-banh')edge=1.0+.32*frontBand+1.38*Math.pow(back,7);
     if(style==='mullet-layer')edge=.98+.28*front+.22*Math.abs(Math.sin(phi))*front+1.36*Math.pow(back,6);
     if(style==='side-part-73')edge=1.01+.16*front+.21*Math.sin(phi)*front+.20*back;
     if(style==='textured-crop')edge=1.01+.23*frontBand+.20*back+.012*Math.sin(phi*19)*front;
     if(style==='two-block')edge=1.17+front*(-.04+.28*Math.abs(Math.sin(phi)))+.28*back;
     if(style==='slick-undercut')edge=1.0+.06*front+.23*back;
    }
    const theta=j/rows*edge;
    const top=Math.max(0,Math.cos(theta));
    const crest=style==='curly'?.012:0;
    const swell=style==='side-swept'?.075*top*Math.sin(theta):0;
    const x=(.565+crest)*Math.sin(theta)*Math.sin(phi)+swell;
    let y=(.515+crest)*Math.cos(theta)+.025;
    if(style==='quiff')y+=.15*front*Math.sin(theta)*top;
    if(style==='middle-part')y+=.035*Math.abs(Math.sin(phi))*Math.sin(theta)*top;
    if(style==='side-part-73'||style==='slick-undercut')y+=.075*Math.sin(theta)*top;
    if(style==='mullet-layer')y+=.025*Math.pow(Math.sin(phi*6),2)*Math.sin(theta)*top;
    if(style==='kha-banh'||style==='textured-crop')y+=.008*Math.sin(phi*16+theta*6)*Math.sin(theta)*top*front;
    // A little clearance over the skull prevents white scalp peeking through
    // the continuous cap when the head turns toward a broadcast camera.
    const z=(.49+crest*.5)*Math.sin(theta)*Math.cos(phi)-.008;
    positions.push(x,y,z);uv.push(i/columns,1-j/rows);
    if(j<rows&&i<columns){const a=j*(columns+1)+i,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);
  // Analytic ellipsoid normals keep the UV seam and shared crown pole smooth.
  const normals=[];for(let i=0;i<positions.length;i+=3){const n=new THREE.Vector3(positions[i]/(.565*.565),(positions[i+1]-.025)/(.515*.515),(positions[i+2]+.008)/(.49*.49)).normalize();normals.push(n.x,n.y,n.z);}
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  const parts=[geo];
  if(STREET_HAIRSTYLES.includes(style)){
   // Close the cap's cut edge onto the scalp: shaved temples must not leave
   // a floating helmet or daylight between the hair and the head.
   const rimPositions=[],rimUV=[],rimIndices=[],offset=rows*(columns+1)*3;
   for(let inner=0;inner<2;inner++)for(let i=0;i<=columns;i++){
    const x=positions[offset+i*3],y=positions[offset+i*3+1],z=positions[offset+i*3+2];
    const scale=inner?1.008/Math.sqrt(x*x/(.539*.539)+y*y/(.482*.482)+z*z/(.448*.448)):1;
    rimPositions.push(x*scale,y*scale,z*scale);rimUV.push(i/columns,inner);
   }
   for(let i=0;i<columns;i++)rimIndices.push(i,i+columns+1,i+1,i+columns+1,i+columns+2,i+1);
   const rim=new THREE.BufferGeometry();rim.setAttribute('position',new THREE.Float32BufferAttribute(rimPositions,3));rim.setAttribute('uv',new THREE.Float32BufferAttribute(rimUV,2));rim.setIndex(rimIndices);rim.computeVertexNormals();parts.push(rim);
  }
  const ball=(x,y,z,rx,ry,rz,segments=20)=>{const g=new THREE.SphereGeometry(1,segments,Math.max(8,Math.round(segments*.7)));g.scale(rx,ry,rz);g.translate(x,y,z);parts.push(g);};
  const lock=(points,r,steps,taper)=>parts.push(hairLock(THREE,points,r,steps,taper));
  if(style==='twin-buns')for(const s of [-1,1])ball(s*.47,.43,-.09,.19,.18,.19);
  if(style==='middle-part')for(const s of [-1,1])lock([[s*.04,.43,.23],[s*.17,.34,.35],[s*.30,.18,.40],[s*.36,.08,.34]],.065);
  if(style==='spiky')for(const x of [-.36,-.18,0,.18,.36])lock([[x,.31,.04],[x,.48,.08],[x*1.16,.72-Math.abs(x)*.3,.02]],.105,16,true);
  if(style==='quiff')lock([[-.29,.29,.32],[-.18,.51,.29],[.08,.59,.20],[.25,.43,.08]],.11);
  if(style==='curly')for(const [row,theta,count] of [[0,.40,7],[1,.82,11],[2,1.23,15],[3,1.65,17]])for(let i=0;i<count;i++){
   const phi=(i+row*.4)/count*Math.PI*2;if(row===3&&Math.cos(phi)>.12)continue;
   ball(.565*Math.sin(theta)*Math.sin(phi),.515*Math.cos(theta)+.025,.49*Math.sin(theta)*Math.cos(phi)-.008,.115,.105,.115,12);
  }
  if(style==='ponytail')lock([[0,.30,-.32],[0,.52,-.46],[.09,.35,-.64],[.14,.04,-.69],[.12,-.30,-.58]],.15,32);
  if(style==='braids')for(const s of [-1,1])for(const phase of [0,Math.PI]){
   const points=Array.from({length:25},(_,i)=>{const t=i/24,a=t*Math.PI*6+phase;return [s*(.51+.035*Math.sin(a)),.14-t*.66,-.06+.035*Math.cos(a)];});
   lock(points,.05,48);
  }
  if(style==='mohawk')ball(0,.47,-.025,.11,.25,.43);
  if(style==='kha-banh'||style==='mullet-layer'){
   const layered=style==='mullet-layer';
   parts.push(mulletNape(THREE,layered));
   if(layered)for(const s of [-1,1])lock([[s*.04,.43,.24],[s*.19,.31,.40],[s*.32,.15,.40],[s*.39,.035,.32]],.065);
  }
  if(style==='side-part-73')for(let i=0;i<3;i++)lock([[.27-i*.065,.38,.25],[-.02-i*.05,.44,.34],[-.26-i*.025,.25,.375],[-.35,.12+i*.025,.31]],.048,24);
  if(style==='two-block')for(const s of [-1,1])lock([[s*.035,.43,.23],[s*.18,.33,.38],[s*.31,.16,.405],[s*.38,.055,.33]],.075);
  if(style==='slick-undercut')for(let i=-3;i<=3;i++){const x=i*.075;lock([[x,.31,.39],[x,.52,.18],[x,.51,-.12],[x,.32,-.385]],.035,24);}
  const result=parts.length===1?geo:mergeHair(THREE,parts);
  result.userData.continuousCrown=true;cache.set(style,result);return result;
}
export function addCharacterHair(head,{THREE,material,userId,style=hairstyleForUser(userId),shadow=false}={}) {
  if(!THREE||!head?.add)throw new TypeError('A THREE namespace and head group are required');
  if(!HAIRSTYLES.includes(style))throw new RangeError(`Unknown hairstyle: ${style}`);
  const group=new THREE.Group();group.name='character-hair';group.userData.hairstyle=style;
  const hairMaterial=material??new THREE.MeshStandardMaterial({color:0x17161d,roughness:.72});
  const cap=new THREE.Mesh(crown(THREE,style),hairMaterial);cap.castShadow=cap.receiveShadow=shadow;group.add(cap);
  if(STREET_HAIRSTYLES.includes(style)){
   const fade=scalpFade(THREE,style==='kha-banh'||style==='mullet-layer'),scalp=new THREE.Mesh(fade.geometry,fade.material);
   scalp.name='hair-scalp-fade';scalp.userData.scalpFade=true;scalp.userData.skipOutline=true;scalp.receiveShadow=shadow;group.add(scalp);
  }
  // One mesh and one shadow draw even for twin buns and braided silhouettes.
  group.scale.set(1.15,1.1,.96);
  head.add(group);return group;
}

// Procedural garments, not imported third-party character rigs.
export const OUTFITS=Object.freeze(['tee-shorts','hoodie-pants','open-overshirt','sweater','dungarees','sports-set']);
export function outfitForUser(id){let hash=0;for(const c of String(id??''))hash=(Math.imul(hash,31)+c.codePointAt(0))>>>0;return hash%OUTFITS.length;}
const garmentCache=new WeakMap();
const formCache=new WeakMap();
// Tailored volumes are surfaces of revolution with an elliptical cross-section.
// The sampled spline makes shoulders, hems and cuffs flow into each other.
export function characterFormGeometry(T){
 if(formCache.has(T))return formCache.get(T);
 const volume=(profile,depth,folds=false)=>{
  const curve=new T.CatmullRomCurve3(profile.map(([r,y])=>new T.Vector3(r,y,0)));
  const points=curve.getPoints(32).map(p=>new T.Vector2(Math.max(0,p.x),p.y));
  const g=new T.LatheGeometry(points,32),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),angle=Math.atan2(x,z);
   const crease=folds ? .012*Math.sin(angle*5+y*31)*Math.exp(-Math.pow((y+.24)/.095,2)) + .006*Math.sin(angle*7-y*23)*Math.exp(-Math.pow((y-.12)/.13,2)) : 0;
   const radius=Math.hypot(x,z),factor=radius>.025?1+crease/radius:1;
   p.setXYZ(i,x*factor,y,z*factor*depth);
  }
  g.computeVertexNormals();return g;
 };
 const result={
  torso:volume([[0,-.33],[.24,-.33],[.335,-.30],[.345,-.25],[.326,-.05],[.34,.16],[.30,.25],[.18,.31],[0,.31]],.73,true),
  hips:volume([[0,-.085],[.24,-.085],[.31,-.06],[.323,0],[.313,.065],[.26,.08],[0,.08]],.74),
  sleeve:volume([[0,-.19],[.135,-.19],[.153,-.17],[.16,-.09],[.151,.015],[.12,.075],[0,.085]],.95),
  shortLeg:volume([[0,-.145],[.142,-.145],[.154,-.125],[.158,-.025],[.148,.10],[0,.105]],1.38,true),
  trouser:volume([[0,-.17],[.12,-.17],[.135,-.14],[.14,-.025],[.14,.13],[.12,.17],[0,.17]],1.18),
 };
 formCache.set(T,result);return result;
}
// Rounded rectangles with real depth. Dimensions include the bevel so pieces
// can meet at the existing rig pivots without changing animation lengths.
export function roundedGarmentBox(T,w,h,d,r=Math.min(w,h)*.13){
 const bevel=Math.min(r*.4,d*.24),hw=w/2-bevel,hh=h/2-bevel;
 const radius=Math.min(r,hw*.8,hh*.8),s=new T.Shape();
 s.moveTo(-hw+radius,-hh);s.lineTo(hw-radius,-hh);
 s.quadraticCurveTo(hw,-hh,hw,-hh+radius);s.lineTo(hw,hh-radius);
 s.quadraticCurveTo(hw,hh,hw-radius,hh);s.lineTo(-hw+radius,hh);
 s.quadraticCurveTo(-hw,hh,-hw,hh-radius);s.lineTo(-hw,-hh+radius);
 s.quadraticCurveTo(-hw,-hh,-hw+radius,-hh);s.closePath();
 const g=new T.ExtrudeGeometry(s,{depth:d-2*bevel,steps:1,curveSegments:6,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3});
 g.translate(0,0,-d/2+bevel);return g;
}
export function garmentGeometry(T,index,{crowd=false}={}){
 let cache=garmentCache.get(T);if(!cache){cache=new Map();garmentCache.set(T,cache);}const key=`${index}:${crowd}`;if(cache.has(key))return cache.get(key);
 if(!Number.isInteger(index)||index<0||index>=6)throw new RangeError('Unknown outfit');
 const parts={color:[],trim:[]};
 const add=(key,g,x,y,z)=>{g.translate(x,y,z);parts[key].push(g);};
 const box=(key,x,y,z,w,h,d)=>{
  const curved=z>.18&&d<.1;
  const g=curved?new T.BoxGeometry(w,h,d,crowd?2:Math.max(2,Math.ceil(w/.035)),crowd?2:Math.max(2,Math.ceil(h/.045)),1):crowd?new T.BoxGeometry(w,h,d):roundedGarmentBox(T,w,h,d);
  if(curved){const p=g.attributes.position,r=Math.min(w,h)*.12;for(let i=0;i<p.count;i++){const py=p.getY(i),corner=Math.max(0,Math.abs(py)-(h/2-r)),halfWidth=w/2-r+Math.sqrt(Math.max(0,r*r-corner*corner));p.setX(i,p.getX(i)*halfWidth/(w/2));}}
  g.translate(x,y,z);
  // Front panels follow the barrel of the shirt, including its side curvature.
  if(curved){const p=g.attributes.position;for(let i=0;i<p.count;i++){const px=p.getX(i);p.setZ(i,p.getZ(i)-.245*(1-Math.sqrt(Math.max(.035,1-px*px/(.36*.36)))));}g.computeVertexNormals();}
  parts[key].push(g);
 };
 const ring=(key,x,y,z,r,tube)=>add(key,new T.TorusGeometry(r,tube,crowd?4:6,crowd?12:24),x,y,z);
 const horizontalRing=(key,x,y,z,r,tube,sx=1,sz=1)=>{const g=new T.TorusGeometry(r,tube,crowd?4:8,crowd?12:40);g.rotateX(Math.PI/2);g.scale(sx,1,sz);add(key,g,x,y,z);};
 if(index===0){horizontalRing('color',0,1.14,0,.165,.022,1,.8);box('trim',.24,.575,.252,.045,.026,.012);}
 if(index===1){horizontalRing('color',0,1.135,-.055,.205,.065,1.15,1.1);box('color',0,.72,.253,.43,.21,.04);for(const x of [-.09,.09]){box('trim',x,1.00,.248,.014,.23,.014);ring('trim',x,.88,.254,.015,.007);}horizontalRing('color',0,.55,0,.325,.025,1,.73);}
 if(index===2){box('trim',0,.855,.282,.34,.59,.025);for(const s of [-1,1]){box('color',s*.245,.86,.282,.20,.57,.055);const c=roundedGarmentBox(T,.14,.19,.04);c.rotateZ(s*.38);add('color',c,s*.14,1.065,.302);}for(let i=0;i<3;i++)box('trim',.18,.72+i*.12,.319,.022,.022,.012);box('color',-.235,.94,.305,.13,.12,.018);}
 if(index===3){horizontalRing('color',0,1.14,0,.168,.032,1,.8);horizontalRing('color',0,.55,0,.325,.025,1,.73);for(const x of [-.22,-.11,0,.11,.22])box('color',x,.86,.243,.008,.39,.012);box('trim',.23,.575,.263,.04,.025,.012);}
 if(index===4){box('color',0,.70,.284,.64,.38,.035);box('color',0,.91,.282,.46,.36,.04);for(const s of [-1,1]){box('color',s*.19,1.08,.273,.075,.30,.035);ring('trim',s*.19,1.035,.306,.025,.01);}box('color',0,.865,.312,.29,.15,.025);box('trim',0,.895,.328,.13,.045,.012);}
 if(index===5){box('color',0,1.04,.267,.11,.22,.025);box('trim',0,1.04,.285,.014,.17,.012);for(const s of [-1,1]){box('color',s*.265,1.035,.241,.15,.19,.025);}horizontalRing('color',0,1.14,0,.168,.022,1,.8);box('trim',.23,.575,.263,.04,.025,.012);}
 const crowdExtras=[];
 if([1,2,3].includes(index))for(const side of [-1,1]){const sleeve=new T.CapsuleGeometry(.11,.31,3,8);sleeve.translate(side*.39,.85,.02);crowdExtras.push(sleeve);}
 if([1,3].includes(index))for(const side of [-1,1]){const leg=new T.CapsuleGeometry(.105,.32,3,8);leg.translate(side*.15,.34,0);crowdExtras.push(leg);}
 parts.crowdColor=[...parts.color,...crowdExtras];
 const result={};for(const [partKey,list] of Object.entries(parts)){const flat=list.map(g=>g.index?g.toNonIndexed():g),merged=new T.BufferGeometry();for(const attr of ['position','normal','uv']){const array=new Float32Array(flat.reduce((n,g)=>n+g.attributes[attr].array.length,0));let offset=0;for(const g of flat){array.set(g.attributes[attr].array,offset);offset+=g.attributes[attr].array.length;}merged.setAttribute(attr,new T.BufferAttribute(array,attr==='uv'?2:3));}result[partKey]=merged;for(const g of new Set([...list,...flat]))g.dispose();}cache.set(key,result);return result;
}

// Shared inverted hulls: one extra solid pass per part; no postprocess or lights.
const outlineCache=new WeakMap();
export function cartoonOutlineMaterial(THREE,width=.035){
 let cache=outlineCache.get(THREE);if(!cache){cache=new Map();outlineCache.set(THREE,cache);}if(cache.has(width))return cache.get(width);
 const m=new THREE.MeshBasicMaterial({color:0x111111,side:THREE.BackSide});
 m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed += normal * ${width.toFixed(5)};`);};
 m.customProgramCacheKey=()=>`meme-outline-${width}`;cache.set(width,m);return m;
}
export function addCharacterOutline(root,{THREE,width=.035}={}){
 const sources=[];root.traverse(o=>{if(o.isMesh&&!o.material.transparent&&!o.userData.cartoonOutline&&!o.userData.skipOutline)sources.push(o);});
 for(const source of sources){const hull=new THREE.Mesh(source.geometry,cartoonOutlineMaterial(THREE,source.userData.outlineWidth??width));hull.name='cartoon-outline';hull.userData.cartoonOutline=true;hull.castShadow=false;hull.receiveShadow=false;source.add(hull);}
 return root;
}
