import * as THREE from '/three.module.js';

const sphere = new THREE.SphereGeometry(1, 16, 12);
const capsule = new THREE.CapsuleGeometry(.5, 1, 4, 12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const faceGeometry = new THREE.PlaneGeometry(.59, .59);
const materials = new Map(), faces = new Map();

function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({color, roughness:.78}));
  return materials.get(color);
}
function part(parent, geometry, color, position, scale) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position); mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}
const oval = (p,c,x,y,z,w,h,d) => part(p,sphere,c,[x,y,z],[w,h,d]);
const soft = (p,c,x,y,z,w,h,d) => part(p,capsule,c,[x,y,z],[w,h/2,d]);

function faceMaterial(style, expression) {
  const key = style+':'+expression;
  if (faces.has(key)) return faces.get(key);
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=256;
  const c=canvas.getContext('2d');
  // Features sit over the rounded skin mesh; transparent margins preserve its silhouette.
  c.fillStyle='rgba(223,120,114,.28)';
  for(const x of [60,196]){c.beginPath();c.ellipse(x,161,19,10,0,0,Math.PI*2);c.fill();}
  for(const x of [82,174]){
    c.strokeStyle='#45352e';c.lineWidth=7;c.lineCap='round';c.beginPath();c.moveTo(x-17,79);c.quadraticCurveTo(x,70,x+16,78);c.stroke();
    if(expression==='blink') {c.lineWidth=5;c.beginPath();c.moveTo(x-16,118);c.quadraticCurveTo(x,128,x+16,118);c.stroke();}
    else {
      c.fillStyle='#fffdf5';c.beginPath();c.ellipse(x,116,20,24,0,0,Math.PI*2);c.fill();
      c.fillStyle=style%2?'#704a35':'#394a3a';c.beginPath();c.ellipse(x+2,119,11,16,0,0,Math.PI*2);c.fill();
      c.fillStyle='#252b2c';c.beginPath();c.ellipse(x+3,120,6,10,0,0,Math.PI*2);c.fill();
      c.fillStyle='#fff';c.beginPath();c.arc(x-2,111,4,0,Math.PI*2);c.fill();
      if(style===0){c.strokeStyle='#433630';c.lineWidth=4;c.beginPath();c.moveTo(x-18,106);c.lineTo(x-24,101);c.stroke();}
    }
  }
  c.strokeStyle='#bc846d';c.lineWidth=3;c.beginPath();c.moveTo(127,133);c.quadraticCurveTo(119,149,131,150);c.stroke();
  if(expression==='talk') {c.fillStyle='#793f42';c.beginPath();c.ellipse(128,183,17,14,0,0,Math.PI*2);c.fill();c.fillStyle='#f7d7cf';c.fillRect(117,171,22,5);}
  else {c.strokeStyle='#9e5352';c.lineWidth=5;c.beginPath();c.moveTo(109,177);c.quadraticCurveTo(128,192,147,177);c.stroke();}
  if(style===0){c.strokeStyle='#b5935a';c.lineWidth=4;for(const x of [82,174]){c.beginPath();c.ellipse(x,116,29,29,0,0,Math.PI*2);c.stroke();}c.beginPath();c.moveTo(111,113);c.quadraticCurveTo(128,105,145,113);c.stroke();}
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.9,polygonOffset:true,polygonOffsetFactor:-1});
  faces.set(key,m);return m;
}

function collar(parent,color,y) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.22,y,.218,-.035,y-.16,.254,-.025,y+.035,.225,.22,y,.218,.025,y+.035,.225,.035,y-.16,.254],3));
  geometry.computeVertexNormals();const m=new THREE.Mesh(geometry,material(color));parent.add(m);
}

function makeHair(head,color,style,teacher) {
  // A hemispherical cap leaves the face open and gives each haircut a distinct back view.
  const cap=new THREE.Mesh(new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.51),material(color));
  cap.position.set(0,.035,-.035);cap.scale.set(.35,.405,.32);cap.castShadow=true;head.add(cap);
  oval(head,color,0,-.035,-.19,.32,.30,.16);
  const fringe=oval(head,color,-.09,.25,.18,.23,.10,.17);fringe.rotation.z=-.24;
  if(teacher||style===1||style===4){
    for(const side of [-1,1])soft(head,color,side*.285,-.12,-.075,.14,teacher?.71:.46,.22);
    soft(head,color,0,-.21,-.235,.53,teacher?.80:.50,.14);
  }
  if(style===2||teacher){
    oval(head,color,0,-.02,-.36,.14,.15,.15);
    const tail=soft(head,color,.04,-.33,-.39,.19,.54,.19);tail.rotation.x=-.25;
    oval(head,teacher?'#d5aa6c':'#ac6e71',0,-.11,-.36,.145,.055,.15);
  }
  if(style===3){for(const side of [-1,1]){oval(head,color,side*.32,-.06,-.13,.15,.17,.16);soft(head,color,side*.36,-.32,-.13,.14,.35,.15);oval(head,'#ce9d67',side*.36,-.19,-.13,.145,.045,.15);}}
  if(style===5){for(let i=0;i<5;i++)oval(head,color,Math.cos(i*1.2)*.22,.31+Math.sin(i)*.055,Math.sin(i*1.2)*.20,.14,.12,.14);}
  if(style===0){soft(head,color,-.29,.01,-.04,.09,.26,.19);soft(head,color,.29,.01,-.04,.09,.26,.19);}
}

function arm(parent,side,color,skin,y) {
  const shoulder=new THREE.Group();shoulder.position.set(side*.32,y,0);parent.add(shoulder);
  soft(shoulder,color,0,-.16,0,.19,.37,.20);
  const elbow=new THREE.Group();elbow.position.y=-.34;shoulder.add(elbow);
  soft(elbow,skin,0,-.15,0,.13,.34,.14);
  const hand=new THREE.Group();hand.position.y=-.32;elbow.add(hand);
  soft(hand,skin,0,-.04,.005,.14,.19,.09);
  oval(hand,skin,-side*.07,-.025,.025,.036,.065,.035);
  return {shoulder,elbow,hand};
}

export function createCharacter({teacher=false,variant=0,shirt='#a8bcd0',skin='#e4b996',hair='#302b29'}={}) {
  const group=new THREE.Group(),body=new THREE.Group();group.userData.animated=true;group.add(body);
  const legs=[];
  if(teacher){
    for(const x of [-.16,.16]){soft(body,'#f1e4ce',x,.64,0,.21,1.12,.22);oval(body,'#433b36',x,.11,.10,.12,.08,.23);}
    soft(body,'#a54760',0,1.75,0,.59,.73,.37);
    for(const start of [-Math.PI/2,Math.PI/2]){
      const panel=new THREE.Mesh(new THREE.CylinderGeometry(.245,.43,1.40,18,1,true,start,Math.PI*.93),material('#a54760'));
      panel.position.y=1.03;panel.castShadow=true;body.add(panel);
    }
    part(body,cylinder,'#973850',[0,2.075,0],[.145,.10,.145]);
    // Small embroidered blossoms and a diagonal gold seam on the áo dài.
    for(let i=0;i<4;i++){
      const x=.12+Math.sin(i*.8)*.045,y=1.8-i*.16,z=.20+i*.015;
      oval(body,'#d6b87e',x,y,z,.018,.09,.012);
      for(let j=0;j<4;j++){const a=j*Math.PI/2;oval(body,'#efd9ad',x+Math.cos(a)*.035,y+Math.sin(a)*.035,z+.014,.024,.027,.009);}
      oval(body,'#c78f62',x,y,z+.023,.018,.018,.008);
    }
  }else{
    soft(body,shirt,0,1.16,0,.65,.72,.40);soft(body,'#526779',0,.79,0,.53,.28,.38);
    collar(body,'#f7f0df',1.47);
    // The back collar remains visible from the classroom camera.
    soft(body,'#eee7d7',0,1.48,-.17,.28,.075,.08);
    for(const side of [-1,1]){
      const thigh=new THREE.Group();thigh.position.set(side*.17,.81,0);body.add(thigh);
      soft(thigh,'#526779',0,-.20,0,.23,.44,.25);
      const knee=new THREE.Group();knee.position.y=-.39;thigh.add(knee);
      soft(knee,'#526779',0,-.21,0,.19,.47,.21);
      oval(knee,'#e5e6de',0,-.45,.085,.12,.09,.22);soft(knee,'#82988e',0,-.49,.09,.23,.055,.38);
      thigh.rotation.x=-1.38;knee.rotation.x=1.38;legs.push({thigh,knee});
    }
  }
  soft(body,skin,0,teacher?2.15:1.59,0,.20,.22,.20);
  const head=new THREE.Group();head.position.y=teacher?2.48:1.96;body.add(head);
  oval(head,skin,0,0,0,.325,.375,.30);
  for(const side of [-1,1]){oval(head,skin,side*.32,-.025,-.015,.065,.105,.07);if(teacher)oval(head,'#d9b573',side*.34,-.13,.015,.028,.044,.025);}
  const style=teacher?2:variant%6;makeHair(head,hair,style,teacher);
  const face=new THREE.Mesh(faceGeometry,faceMaterial(teacher?0:1+variant%3,'smile'));face.position.set(0,-.025,.303);head.add(face);
  const arms=[-1,1].map(side=>arm(body,side,teacher?'#a54760':shirt,skin,teacher?2:1.46));
  if(teacher){
    const pointer=part(arms[0].hand,cylinder,'#d8be88',[0,-.57,.015],[.017,1.04,.017]);pointer.castShadow=false;
    arms[0].shoulder.rotation.z=-1.35;arms[0].elbow.rotation.z=-.20;
  }else{for(const a of arms){a.shoulder.rotation.x=-1.08;a.elbow.rotation.x=-.45;}}
  return {group,body,head,face,arms,legs,teacher,variant,pose:0};
}

export function animateCharacter(p,{time=0,speaking=false,winner=false,walking=false,standing=false,dancing=false,reduced=false,celebrateTime=-1,answerTime=-1}) {
  const t=reduced?0:time,seed=p.variant*.79;
  if(p.born==null)p.born=t;
  p.pose+=(Number(winner)-p.pose)*(reduced?1:.16);
  const pose=p.pose;
  p.walk=(p.walk||0)+(Number(walking)-(p.walk||0))*(reduced?1:.22);
  const walk=p.walk;
  let jump=0;
  if(winner&&!reduced&&celebrateTime>=0&&celebrateTime<2.4){const hop=Math.floor(celebrateTime/.8),phase=(celebrateTime%.8)/.8;jump=Math.sin(phase*Math.PI)*(1.15-hop*.25);}
  const beat=t*5+seed;if(dancing&&!reduced)jump=Math.max(jump,Math.abs(Math.sin(beat))*.16);
  p.body.position.y=(standing?1:pose+walk)*.22+jump+walk*Math.abs(Math.sin(t*10+seed))*.045+(reduced?0:Math.sin(t*1.6+seed)*.012);
  p.body.rotation.y=pose*Math.PI*.84;
  p.head.rotation.y=Math.sin(t*.55+seed)*.065+pose*.15;
  p.head.rotation.x=p.teacher?(speaking?Math.sin(t*6)*.025:Math.sin(t*.7)*.015):-.025+Math.sin(t*.9+seed)*.025;
  const expression=!reduced&&(t+seed)%5.3<.13?'blink':speaking&&Math.sin(t*15)>.1?'talk':'smile';
  p.face.material=faceMaterial(p.teacher?0:1+p.variant%3,expression);
  if(p.teacher){
    p.arms[0].shoulder.rotation.z=-1.35+Math.sin(t*(speaking?2.5:.65))*(speaking?.13:.035);
    p.arms[0].elbow.rotation.z=-.20+Math.sin(t*1.8)*.035;
    p.arms[1].shoulder.rotation.x=speaking?-.30+Math.sin(t*2)*.09:-.1;
    p.arms[1].elbow.rotation.x=speaking?-.45:-.12;
    p.body.rotation.y=Math.sin(t*.45)*.035;
    if(!reduced&&t-p.born<2.2){p.arms[1].shoulder.rotation.z=2.2;p.arms[1].elbow.rotation.z=Math.sin(t*7)*.3;}
    else{p.arms[1].shoulder.rotation.z=speaking?.22:0;p.arms[1].elbow.rotation.z=0;}
  }else{
    const left=p.arms[0],right=p.arms[1];
    // Seated arms rest forward on the desk; standing arms hang by the sides.
    const rest=standing?-.12:-1.08,bend=standing?-.15:-.45,knee=standing?0:1.38;
    left.shoulder.rotation.x=rest+Math.sin(t*.8+seed)*.025;left.shoulder.rotation.z=0;left.elbow.rotation.x=bend;left.elbow.rotation.z=0;left.hand.rotation.z=0;p.body.rotation.z=0;
    right.shoulder.rotation.x=rest*(1-pose);right.shoulder.rotation.z=pose*2.9;
    right.elbow.rotation.x=bend*(1-pose);right.elbow.rotation.z=pose*(.18+Math.sin(t*5)*.10);
    right.hand.rotation.z=pose*Math.sin(t*6)*.15;
    for(const leg of p.legs){leg.thigh.rotation.x=-knee*(1-pose);leg.knee.rotation.x=knee*(1-pose);}
    if(!walking&&!winner&&!reduced){
      p.head.rotation.x=-.13+Math.sin(t*.8+seed)*.035;
      p.head.rotation.y+=Math.max(0,Math.sin(t*.35+seed)-.8)*1.3;
      right.hand.rotation.z=Math.sin(t*3+seed)*.065;
      right.elbow.rotation.x+=Math.sin(t*2+seed)*.025;
      if(answerTime>=0&&answerTime<1.4){const lift=Math.sin(Math.min(1,answerTime/.25)*Math.PI/2)*Math.min(1,(1.4-answerTime)/.3);right.shoulder.rotation.x=-1.08*(1-lift);right.shoulder.rotation.z=lift*2.7;right.elbow.rotation.x=-.1;right.elbow.rotation.z=.15*lift;p.head.rotation.x=0;}
    }
    // Guest fan dance on stage: arms out, forearms up, hands twirling in alternating circles, knees bouncing.
    if(dancing&&!reduced){
      const spin=beat*2.4,bounce=Math.abs(Math.sin(beat));
      [left,right].forEach((a,i)=>{const side=i?1:-1,ph=spin+i*Math.PI;
        a.shoulder.rotation.x=(-.45+Math.sin(ph)*.4)*pose;a.shoulder.rotation.z=side*(1.2+Math.cos(ph)*.3)*pose;
        a.elbow.rotation.x=0;a.elbow.rotation.z=side*(1.3+Math.sin(ph)*.35)*pose;a.hand.rotation.z=side*spin*2*pose;});
      for(const leg of p.legs){leg.thigh.rotation.x=-.35*bounce*pose;leg.knee.rotation.x=.7*bounce*pose;}
      p.body.rotation.z=Math.sin(beat)*.08*pose;
    }
    if(walk>.001){
      const stride=Math.sin(t*10+seed);
      for(let i=0;i<p.legs.length;i++){const leg=p.legs[i],step=stride*(i===0?1:-1);leg.thigh.rotation.x=leg.thigh.rotation.x*(1-walk)+step*.58*walk;leg.knee.rotation.x=leg.knee.rotation.x*(1-walk)+Math.max(0,-step)*.80*walk;}
      for(let i=0;i<p.arms.length;i++){const a=p.arms[i];a.shoulder.rotation.x=a.shoulder.rotation.x*(1-walk)+stride*(i===0?-1:1)*.5*walk;a.shoulder.rotation.z*=1-walk;a.elbow.rotation.x=a.elbow.rotation.x*(1-walk)-.8*walk;}
      p.body.rotation.x=-.08*walk;
    }else p.body.rotation.x=0;
  }
}
