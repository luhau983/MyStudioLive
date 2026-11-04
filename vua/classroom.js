import * as THREE from '/three.module.js';
import {createCharacter,animateCharacter} from '/characters.js';
import {entranceRoute,standingRoute,guestRoute,sampleRoute,entranceTiming} from '/entrance.mjs';
import {buildAuditorium} from '/auditorium.js';
import {SEATS,STANDING,GUEST_SPOTS,CAMERA,quadMatrix} from '/auditorium-layout.mjs';

export function createClassroom(){
  const canvas=document.getElementById('classroom'),container=document.getElementById('stage'),labels=document.getElementById('student-labels');
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){document.getElementById('scene-fallback').hidden=false;console.warn('Classroom WebGL unavailable',e);return {update(){},speaking(){}};}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e1d4b9');scene.fog=new THREE.Fog('#d5d7c8',80,150);
  const camera=new THREE.PerspectiveCamera(CAMERA.fov,9/16,.1,150);camera.position.set(...CAMERA.position);camera.lookAt(...CAMERA.target);
  scene.add(new THREE.HemisphereLight('#fff2dc','#877a5b',2.0));const sun=new THREE.DirectionalLight('#fff1d4',3.0);sun.position.set(-8,22,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-18;sun.shadow.normalBias=.04;scene.add(sun);
  const materials=new Map();const mat=(color,extra={})=>{const k=JSON.stringify([color,extra]);if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({color,roughness:.8,...extra}));return materials.get(k);};
  const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,16,12),cylGeo=new THREE.CylinderGeometry(1,1,1,12);
  function mesh(parent,geo,color,x,y,z,sx,sy,sz,extra){const m=new THREE.Mesh(geo,mat(color,extra));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(p,c,x,y,z,w,h,d,extra)=>mesh(p,boxGeo,c,x,y,z,w,h,d,extra);
  const ball=(p,c,x,y,z,rx,ry=rx,rz=rx)=>mesh(p,sphereGeo,c,x,y,z,rx,ry,rz);
  function rod(p,c,a,b,r=.06){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b);const m=mesh(p,cylGeo,c,...A.clone().add(B).multiplyScalar(.5).toArray(),r,A.distanceTo(B),r);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.sub(A).normalize());return m;}
  const {board,teacherPosition}=buildAuditorium(scene,{box,ball,rod});
  const teacher=createCharacter({teacher:true});teacher.group.position.set(...teacherPosition);teacher.group.scale.setScalar(1.5);teacher.group.rotation.y=-.25;scene.add(teacher.group);
  const studentScale=.67,columns=5;
  const students=[],colors=['#a5bcd4','#d2bb94','#adc2a4','#d8a5a0','#c0b0d4','#86adb4'];
  function addStudent({variant,skinIndex,home,heading,standing,guest=false}){
    const [x,y,z]=home;
    const pupil=createCharacter({variant,shirt:colors[variant%colors.length],skin:['#dfb38b','#d6a17d','#f0c9a4'][skinIndex%3],hair:skinIndex%2?'#45322b':'#262c2d'});pupil.group.position.set(...home);pupil.group.scale.setScalar(studentScale);pupil.group.rotation.y=heading;pupil.group.visible=false;scene.add(pupil.group);
    const label=document.createElement('div');label.className='student-name';label.hidden=true;labels.append(label);const bubble=document.createElement('div');bubble.className='student-bubble';bubble.hidden=true;const bubbleName=document.createElement('small'),bubbleText=document.createElement('strong');bubble.append(bubbleName,bubbleText);labels.append(bubble);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.56*studentScale,.045,8,32),new THREE.MeshBasicMaterial({color:'#ffe18e'}));halo.userData.animated=true;halo.rotation.x=Math.PI/2;halo.position.set(x,y+.1,z);halo.visible=false;scene.add(halo);
    students.push({...pupil,label,bubble,bubbleName,bubbleText,halo,home,seatHeading:heading,baseY:y,standing,guest,id:null,lastComment:'',expires:0,motion:null});
  }
  for(const {row,col,x,y:level,z,home} of SEATS){
    const desk=new THREE.Group();desk.position.set(x,level,z);desk.scale.set(studentScale,studentScale,.40);scene.add(desk);
    box(desk,'#b38b57',0,1.23,-.5,2.45,.14,1.1);box(desk,'#cca76d',0,1.32,-.5,2.5,.06,1.12);
    for(const dx of [-1,1])for(const dz of [-.87,-.15])rod(desk,'#4f6664',[dx,0,dz],[dx,1.2,dz],.055);
    box(desk,'#315b5a',0,.58,.68,1,.14,.85);box(desk,'#315b5a',0,1.08,1.02,1,.78,.1);for(const dx of [-.38,.38])for(const dz of [.36,1])rod(desk,'#4b6060',[dx,0,dz],[dx,.6,dz],.04);
    ball(desk,'#3d6e69',0,1.1,1.02,.48,.37,.12);
    const book=box(desk,'#f8efd5',-.3,1.39,-.54,.6,.045,.45);book.rotation.y=.12;box(desk,'#6c947c',-.3,1.42,-.54,.035,.01,.45);rod(desk,'#c27a52',[.3,1.39,-.6],[.55,1.39,-.3],.018);
    addStudent({variant:row*columns+col,skinIndex:col,home:[x,level,z+.2],heading:Math.PI+(col-2)*.05,standing:false});
  }
  // Standing room fills only after every seat is taken (seats come first in `students`).
  STANDING.forEach(({home,heading},i)=>addStudent({variant:SEATS.length+i,skinIndex:i,home,heading,standing:true}));
  // Guests are never seated: they appear only for correct answers from viewers without a spot.
  GUEST_SPOTS.forEach(({home},i)=>addStudent({variant:SEATS.length+STANDING.length+i,skinIndex:i+1,home,heading:Math.PI,standing:true,guest:true}));
  canvas.dataset.seats=String(students.length);
  // Furniture and room parts stay still: draw matching parts in batches.
  scene.updateMatrixWorld(true);const batches=new Map(),staticMeshes=[];
  scene.traverse(object=>{if(!object.isMesh)return;for(let p=object;p;p=p.parent)if(p.userData.animated)return;const key=object.geometry.uuid+':'+object.material.uuid;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(object);staticMeshes.push(object);});
  for(const group of batches.values()){const batch=new THREE.InstancedMesh(group[0].geometry,group[0].material,group.length);group.forEach((object,i)=>batch.setMatrixAt(i,object.matrixWorld));batch.castShadow=true;batch.receiveShadow=true;scene.add(batch);}
  for(const object of staticMeshes)object.removeFromParent();
  // Membership reserves an empty seat immediately; only its model moves through the room.
  let currentRound=0,wasIdle=true,speaking=false,winnerId=null,lastWidth=0,lastHeight=0;
  let showNames=true,topIds=new Set(),correctIds=new Set(),mvpId=null,hydrated=false,nextEntryAt=0,locatedId=null,locatedUntil=0,celebrationKey='',stopAt=null,stoppedDuration=0;
  const motionNow=()=> (stopAt??performance.now())-stoppedDuration;const seats=new Map(),guests=new Map(),GUEST_DANCE_MS=2000;
  function clearStudent(p){p.label.classList.remove('guest-correct');p.id=null;p.motion=null;p.danceUntil=null;p.group.visible=false;p.group.position.set(...p.home);p.label.hidden=true;p.bubble.hidden=true;p.halo.visible=false;p.expires=0;p.joinExpires=0;p.label.dataset.motion='empty';delete p.label.dataset.memberId;delete p.label.dataset.segment;}
  function assign(id,nickname){
    if(!id)return null;let p=seats.get(id);
    if(!p){
      p=students.find(s=>!s.id&&!s.guest);if(!p)return null;p.id=id;seats.set(id,p);
      nextEntryAt=enter(p,p.standing?standingRoute:entranceRoute,nextEntryAt);
      p.joinExpires=hydrated?performance.now()+4500:0;
    }
    p.displayName=nickname;p.label.textContent=nickname;p.label.dataset.memberId=id;return p;
  }
  // Walk in along `routeFor`, or appear in place on first load / reduced motion. Returns the start time.
  function enter(p,routeFor,after){
    p.pose=0;p.walk=0;
    if(hydrated&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const route=routeFor(p.home),{startAt,speed}=entranceTiming(route,motionNow(),after);
      p.motion={route,startAt,speed,state:'queued'};p.group.position.set(...route[0]);p.group.visible=false;p.label.dataset.motion='queued';return startAt;
    }
    p.group.position.set(...p.home);p.group.rotation.y=p.seatHeading;p.group.visible=true;p.label.dataset.motion='seated';return after;
  }
  // Green tick on the guest's name tag shows they answered correctly.
  function showCorrect(p){p.label.classList.add('guest-correct');}
  function clearGuests(){for(const p of students)if(p.guest)clearStudent(p);guests.clear();}
  // After a short dance the guest runs back out the way they came, freeing the spot.
  function leave(p,mt){
    p.danceUntil=null;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){clearStudent(p);return;}
    const route=guestRoute(p.home).reverse(),{startAt,speed}=entranceTiming(route,mt,0);
    p.motion={route,startAt,speed,state:'queued',exit:true};
  }
  // Correct answers from viewers with no seat or standing spot: run onto the stage and dance.
  function syncGuests(players){
    for(const c of players){
      if(seats.has(c.id)||guests.has(c.id))continue; // guests stays keyed for the round so a guest dances once
      const p=students.find(s=>s.guest&&!s.id);if(!p)return;
      p.id=c.id;guests.set(c.id,p);p.displayName=(c.simulated?'[Thử] ':'')+c.nickname;p.label.dataset.memberId=c.id;
      enter(p,guestRoute,0);if(!p.motion){p.danceUntil=motionNow()+GUEST_DANCE_MS;showCorrect(p);}
    }
  }
  function update(s){
    if(s.classStopped&&stopAt===null)stopAt=performance.now();else if(!s.classStopped&&stopAt!==null){stoppedDuration+=performance.now()-stopAt;stopAt=null;}
    if(s.phase==='idle'&&!wasIdle){seats.clear();guests.clear();for(const p of students)clearStudent(p);nextEntryAt=0;}wasIdle=s.phase==='idle';
    if(s.round!==currentRound){currentRound=s.round;clearGuests();for(const p of students){p.bubble.hidden=true;p.lastComment='';p.expires=0;}}
    const roster=s.participants||s.leaderboard.slice(0,10),rosterIds=new Set(roster.map(p=>p.id));
    for(const [id,p] of seats)if(!rosterIds.has(id)){seats.delete(id);clearStudent(p);}
    if(!roster.length)nextEntryAt=0;
    for(const p of roster)assign(p.id,(p.simulated?'[Thử] ':'')+p.nickname);
    for(const c of [...(s.bubbles||s.comments)].reverse()){
      if(c.remaining!=null&&c.remaining<=0)continue;
      const p=seats.get((c.simulated?'demo:':'live:')+c.id),key=String(c.seq??s.round+':'+c.text);
      if(p&&p.lastComment!==key){p.lastComment=key;p.bubbleName.textContent=(c.simulated?'[Thử] ':'')+c.nickname;p.bubbleText.textContent=c.text;p.bubble.classList.toggle('correct',c.correct);p.bubble.classList.remove('position');p.bubble.style.zIndex=c.correct?'45':'20';p.expires=performance.now()+(c.remaining??8000);p.answerAt=motionNow();}
    }
    showNames=s.config?.showNames!==false;container.classList.toggle('show-all-names',showNames);mvpId=s.winner?.id||null;correctIds=new Set((s.correctPlayers||[]).map(p=>p.id));syncGuests(s.correctPlayers||[]);winnerId=s.phase==='result'?s.winner?.id:null;topIds=new Set(s.leaderboard.slice(0,3).map(p=>p.id));
    locatedId=s.highlight?.id||null;locatedUntil=performance.now()+(s.highlight?.remaining||0);
    if(s.highlight){const p=seats.get(s.highlight.id);if(p&&p.locateSeq!==s.highlight.seq){p.locateSeq=s.highlight.seq;p.bubbleName.textContent=s.highlight.nickname;p.bubbleText.textContent='📍 Bạn đang ở đây';p.bubble.classList.add('position');p.bubble.classList.remove('correct');p.expires=locatedUntil;p.bubble.style.zIndex='40';}}
    const celebration=s.winner?s.round+':'+s.winner.id:'';
    if(winnerId&&celebration!==celebrationKey){celebrationKey=celebration;const p=seats.get(winnerId);if(p)p.celebrateStart=motionNow()-Math.max(0,Date.now()-(s.resultAt||Date.now()));}
    for(const p of students){p.label.classList.toggle('winner',p.id===mvpId&&!!mvpId);p.label.classList.toggle('correct-answer',correctIds.has(p.id));p.label.classList.toggle('located',p.id===locatedId);p.label.textContent=(p.id===mvpId?'♛ MVP · ':'')+(p.displayName||'');if(p.id&&p.expires>performance.now())p.bubbleName.textContent=(p.id===mvpId?'♛ MVP · ':'')+(p.displayName||'');}
    canvas.dataset.occupied=String(seats.size);hydrated=true;
  }
  const v=new THREE.Vector3();function project(x,y,z){v.set(x,y,z).project(camera);return {x:(v.x+1)*lastWidth/2,y:(1-v.y)*lastHeight/2};}
  const boardElement=document.querySelector('.puzzle-card');
  function resize(){
    const w=container.clientWidth,h=container.clientHeight;if(w===lastWidth&&h===lastHeight)return;
    lastWidth=w;lastHeight=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const corners=[project(-board.w/2,board.y+board.h/2,board.z),project(board.w/2,board.y+board.h/2,board.z),project(board.w/2,board.y-board.h/2,board.z),project(-board.w/2,board.y-board.h/2,board.z)];
    const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const width=(length(corners[0],corners[1])+length(corners[3],corners[2]))/2,height=(length(corners[0],corners[3])+length(corners[1],corners[2]))/2;
    Object.assign(boardElement.style,{left:'0px',top:'0px',width:width+'px',height:height+'px',transformOrigin:'0 0',transform:'matrix3d('+quadMatrix(width,height,corners).join(',')+')'});
    canvas.dataset.camera='perspective';
  }

  // Cap at 60fps; carrying the remainder keeps pacing even on 120/144Hz displays.
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),FRAME_MS=1000/60;let lastFrame=0;
  function frame(t){requestAnimationFrame(frame);const elapsed=t-lastFrame;if(document.hidden||elapsed<FRAME_MS-1)return;lastFrame=t-Math.min(Math.max(0,elapsed-FRAME_MS),FRAME_MS/2);resize();const mt=(stopAt??t)-stoppedDuration,phase=reduced.matches?0:mt*.001;
    animateCharacter(teacher,{time:phase,speaking,reduced:reduced.matches});
    let moving=0;
    for(const p of students){
      if(!p.id)continue;
      if(p.motion){
        const motion=p.motion;
        if(reduced.matches){p.group.position.set(...p.home);p.group.rotation.y=p.seatHeading;p.motion=null;p.group.visible=true;}
        else if(mt<motion.startAt){moving++;continue;}
        else{
          p.group.visible=true;const sample=sampleRoute(motion.route,(mt-motion.startAt)*motion.speed/1000);p.label.dataset.segment=String(sample.segment);
          p.group.position.set(...sample.position);
          const heading=sample.done?p.seatHeading:sample.heading;
          p.group.rotation.y+=Math.atan2(Math.sin(heading-p.group.rotation.y),Math.cos(heading-p.group.rotation.y))*.35;
          if(sample.done){
            if(motion.state!=='settling'){motion.state='settling';motion.settleUntil=mt+150;p.joinExpires=t+3500;}
            if(mt>=motion.settleUntil){if(motion.exit){clearStudent(p);continue;}if(p.guest){p.danceUntil=mt+GUEST_DANCE_MS;showCorrect(p);}p.motion=null;p.group.rotation.y=p.seatHeading;if(p.id===winnerId)p.celebrateStart=mt;if(p.expires>t)p.answerAt=mt;}
          }else motion.state='running';
        }
      }
      if(p.guest&&!p.motion&&p.danceUntil!=null&&mt>=p.danceUntil)leave(p,mt);
      const dancing=p.guest&&!p.motion&&p.danceUntil!=null;
      const walking=!!p.motion&&p.motion.state==='running',win=(dancing||!!winnerId&&p.id===winnerId&&!p.guest)&&!p.motion;
      p.label.dataset.motion=p.motion?.state||'seated';if(p.motion)moving++;
      animateCharacter(p,{time:phase,winner:win,walking,standing:p.standing,dancing,reduced:reduced.matches,celebrateTime:p.celebrateStart==null?-1:(mt-p.celebrateStart)/1000,answerTime:p.answerAt==null?-1:(mt-p.answerAt)/1000});const located=p.id===locatedId&&t<locatedUntil;const correct=correctIds.has(p.id);p.halo.visible=(correct||located)&&p.group.visible;p.halo.material.color.set(correct?'#ffe18e':'#5ae5ff');p.halo.position.set(p.group.position.x,p.group.position.y+.06,p.group.position.z);p.halo.scale.setScalar(1+(located?Math.sin(t*.009)*.16:0));
      const spot=project(p.group.position.x,p.group.position.y+studentScale*(2.7+p.body.position.y),p.group.position.z);
      p.label.hidden=!p.group.visible||!(showNames||correct||located||p.motion||topIds.has(p.id)||t<=p.expires||t<=p.joinExpires);
      p.label.style.left=spot.x+'px';p.label.style.top=spot.y+'px';p.bubble.hidden=!p.group.visible||t>p.expires;
      if(!p.bubble.hidden){const bubbleX=Math.max(lastWidth*.19,Math.min(lastWidth*.81,spot.x));p.bubble.style.left=bubbleX+'px';p.bubble.style.top=Math.max(lastHeight*.40,spot.y-lastWidth*.018)+'px';p.bubble.style.setProperty('--tail-x',Math.max(8,Math.min(92,50+(spot.x-bubbleX)/(lastWidth*.35)*100))+'%');p.label.hidden=true;}
    }
    canvas.dataset.moving=String(moving);
    renderer.render(scene,camera);
  }requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();document.getElementById('scene-fallback').hidden=false;});
  return {update,speaking:value=>{speaking=value;container.classList.toggle('teacher-speaking',value);}};
}
