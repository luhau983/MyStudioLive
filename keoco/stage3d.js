import { teamStrain, ropeTarget, resultWinner, resultView } from './presentation.mjs';
import * as THREE from '/three.module.js';
import { characterPose, characterJointAnchors, blendCharacterPose, seatedPose } from '/stage-character-poses.mjs';
import { crowdPose, spectatorShirtColor, crowdEmotion, spectatorFaceIndex, createPearSpectatorGeometry } from '/stand-crowd.mjs';
import { gripRope } from '/stage3d-grip.mjs';
import { createHairstylePicker, addCharacterHair, addCharacterOutline, cartoonOutlineMaterial, garmentGeometry, characterFormGeometry, OUTFITS } from '/character-hair.mjs';
import {STREET_OUTFITS, streetOutfitForUser, createStreetWardrobe, addTeamBadge} from '/street-outfits.mjs';
import {addLimbSkin} from '/articulated-limbs.mjs';
import {mergeRigidParts} from '/rigid-parts.mjs';
import {createTugRope} from '/tug-rope.mjs';
import {SQUAD_SIZE,nextSquad,readyPosition,makeRoute,advanceRoute,runPose} from '/lineup-flow.mjs';
import {advanceRopeHandoff,ropePickupPose,ROPE_HELD_Y,ROPE_GROUND_Y} from '/rope-handoff.mjs';
import {ropeHeave,springRope,teamDrag,pullExpression,sweatLevel,sweatDrop,PULL_FACES,resultExpression} from '/pull-drama.mjs';
function dancePose(t,{still=false}={}) {
 const s=still?0:Math.sin(t), c=still?0:Math.cos(t);
 return {arms:[-.95-s*.7, 1.75-s*.7],legs:[-.28+s*.36,.28+s*.36],hips:s*.16,head:-s*.18,bounce:still?0:(1-c)*.055};
}
function selectLineup(players,nextIds){
 const sorted=players.slice().sort((a,b)=>(Number(a.lineupRank)||Infinity)-(Number(b.lineupRank)||Infinity));
 const queued=sorted.slice(SQUAD_SIZE),ids=nextIds||nextSquad(sorted).map(p=>p.uniqueId),ready=new Set(ids);
 const waiting=[...ids.map(id=>queued.find(p=>p.uniqueId===id)).filter(Boolean),...queued.filter(p=>!ready.has(p.uniqueId))].slice(0,30);
 return {active:sorted.slice(0,SQUAD_SIZE),waiting,hidden:Math.max(0,sorted.length-SQUAD_SIZE-30),ready};
}
// Spacing matches the head width so twelve pullers read as a line, not a pile.
function tugPosition(side,index){return {x:(side==='red'?-1:1)*(.95+index*.8),z:1.2};}
// Waiting players stand on the first three stand tiers, ten per row, on their own team's side.
function waitingSlot(side,index){const row=Math.floor(index/10), col=index%10;return {x:(side==='red'?-1:1)*(2.2+col*.98+(row%2)*.3),row};}
// One shared stream: cut between team cameras every 8s; countdown/result and reduced motion use the neutral court shot.
function broadcastView(phase,seconds,still){
 if(still||phase==='countdown'||phase==='result')return 'court';
 return Math.floor(seconds/8)%2?'blue':'red';
}
// Keep the master for referee signals; team cuts favour the front pullers rather
// than pretending that every member of a long lineup fits in one close shot.
function cameraShot(view){
 if(view==='court')return {position:[14,9.5,26],target:[0,1,0],fov:58};
 const shift=view==='red'?-2:2;
 return {position:[shift+4,4.5,10.5],target:[shift*.3,1.3,0],fov:46};
}
// A match-relative edit: establish the court, show effort on both sides, then
// intercut actual players' expressions and an overhead view of both teams.
function cinematicPlan({phase,elapsed=0,remaining=45,resultElapsed=0,winner=null,still=false,buffs={}}){
 if(still)return {kind:'court',view:'court',progress:0};
 if(phase==='countdown')return {kind:'start',view:'court',progress:Math.max(0,Math.min(1,1-remaining/3))};
 if(phase==='result'){
  if(!winner||resultElapsed<1.2)return {kind:'finish',view:'court',progress:0};
  if(resultElapsed<3.2)return {kind:'celebrate',view:winner,progress:(resultElapsed-1.2)/2};
  if(resultElapsed<5.6)return {kind:'face',view:winner,subject:'mvp',progress:(resultElapsed-3.2)/2.4};
  if(resultElapsed<7.4)return {kind:'face',view:winner==='red'?'blue':'red',subject:'reaction',progress:(resultElapsed-5.6)/1.8};
  return {kind:'celebrate',view:winner,progress:Math.min(1,(resultElapsed-7.4)/2.6)};
 }
 if(phase==='transition')return {kind:'handoff',view:'court',progress:0};
 // Briefly preview each waiting team, then return to the active court.
 if(phase==='lobby'&&elapsed>=1.2&&elapsed<2.8)return {kind:'queue',view:elapsed<2?'red':'blue',progress:0};
 if(phase!=='pull')return {kind:'team',view:Math.floor(elapsed/7)%2?'blue':'red',progress:(elapsed%7)/7};
 if(elapsed<2)return {kind:'opening',view:'court',progress:elapsed/2};
 if(remaining<=5)return {kind:'duel',view:'court',progress:1-Math.max(0,remaining)/5};
 const powered=['red','blue'].find(side=>buffs[side]>3&&buffs[side]<=5);
 if(powered)return {kind:'team',view:powered,progress:(5-buffs[powered])/2,powered:true};
 // Hold a near-vertical view for three seconds each sixteen-second cycle.
 // Keep the last five seconds on the decisive rope/duel shot above.
 if(elapsed%16>=12&&elapsed%16<15)return {kind:'overhead',view:'court',progress:(elapsed%16-12)/3};
 const tense=remaining<=15,cycle=tense?9:12,beat=elapsed%cycle,index=Math.floor(elapsed/cycle)%3;
 const segments=tense?[[2,'team','red'],[3.5,'face','red'],[5.5,'team','blue'],[7,'face','blue'],[9,'rope','court']]:[[3,'team','red'],[4.8,'face','red'],[7.8,'team','blue'],[9.6,'face','blue'],[12,'duel','court']];
 let start=0;for(const [end,kind,view] of segments){if(beat<end)return {kind,view,index,progress:(beat-start)/(end-start),tense};start=end;}
 return {kind:'duel',view:'court',progress:0};
}
function cinematicShot(plan,{ropeX=0,time=0,head=null}={}){
 const p=Math.max(0,Math.min(1,plan.progress||0)),side=plan.view==='red'?-1:1;
 if(plan.kind==='handoff')return {position:[4,7.6,17],target:[0,1,-1.8],fov:57};
 if(plan.kind==='queue')return {position:[side*8.8,3.4,-.05],target:[side*4.8,1.0,-2.4],fov:60};
 if(plan.kind==='court')return cameraShot('court');
 if(plan.kind==='overhead')return {position:[ropeX*.25,20,3.6],target:[ropeX*.25,.7,1.2],fov:48};
 if(plan.kind==='start')return {position:[12-p,8-p*.8,24-p*2],target:[0,1.2,1.2],fov:56-p*2};
 if(plan.kind==='opening')return {position:[6.7-p*.5,3.8-p*.5,14-p],target:[ropeX*.5,1.15,1.2],fov:51-p*2};
 if(plan.kind==='finish')return {position:[5.8,3.6,13],target:[0,1.15,1.2],fov:51};
 if(plan.kind==='face'&&head)return {position:[head.x+side*.45,head.y+.24,head.z+3.8-p*.10],target:[head.x,head.y-.10,head.z],fov:38};
 if(plan.kind==='rope')return {position:[ropeX+.45,1.5,6.0-p*.18],target:[ropeX,.86,1.2],fov:40-p};
 if(plan.kind==='duel')return {position:[ropeX*.4+.8,2.15-p*.15,8.0-p*.6],target:[ropeX*.75,1.08,1.2],fov:45-p*3};
 if(plan.kind==='celebrate')return {position:[side*3.1+Math.sin(time*.35)*.18,2.6,8.3-p*.5],target:[side*2.45+ropeX*.45,1.25,1.2],fov:43-p};
 return {position:[side*(3.6-p*.15)+ropeX*.7,1.95-p*.12,7.8-p*.35],target:[side*2.05+ropeX,1.06,1.2],fov:44-p*(plan.powered?4:2)};
}
// The neck only makes a small glance toward the broadcast camera. Wrapping the
// angle before limiting it prevents head flips when a body crosses +/- PI.
function faceYaw(camera,player,bodyYaw){
 const delta=Math.atan2(camera.x-player.x,camera.z-player.z)-bodyYaw;
 return Math.max(-.48,Math.min(.48,Math.atan2(Math.sin(delta),Math.cos(delta))*.45));
}
function facePitch(camera,head){
 const distance=Math.hypot(camera.x-head.x,camera.z-head.z);
 return Math.max(-.13,Math.min(.13,-Math.atan2(camera.y-head.y,distance)*.18));
}
function easeHeadAngle(current,target,dt,still){
 return still?target:current+(target-current)*(1-Math.exp(-9*Math.max(0,Math.min(.1,dt))));
}
function cameraLabel(view,mode){return view==='red'?'CAM ĐỎ':view==='blue'?(mode==='pve'?'CAM ĐỘI MÁY':'CAM XANH'):'TOÀN SÂN';}
function refereePose(phase,score){
 if(phase==='countdown')return 'start';
 if(phase==='pull')return 'watch';
 if(phase!=='result')return 'idle';
 const red=Number(score?.red)||0, blue=Number(score?.blue)||0;
 return red>blue?'red':blue>red?'blue':'neutral';
}
// [arm on -x (red flag), arm on +x (blue flag)] as rotation.z; PI/2 points along +x.
function refereeArms(pose,t,still){
 const wave=still?0:Math.sin(t*6)*.25, pump=still?0:Math.sin(t*4)*.08;
 if(pose==='start')return [-2.75-wave,2.75+wave];
 if(pose==='red')return [-Math.PI/2+pump,.12];
 if(pose==='blue')return [-.12,Math.PI/2-pump];
 if(pose==='neutral')return [-1.45,1.45];
 if(pose==='watch')return [-.42,.42];
 return [-.12,.12];
}
// ---------- Name tags (pure; tested in node) ----------
// Strip controls, bidi overrides and invisible characters so a nickname cannot spoof
// or reorder neighbouring text; ZWJ stays so emoji sequences survive. Output is
// only ever assigned via textContent.
const UNSAFE_TEXT=/[\u0000-\u001f\u007f-\u009f­؜᠎​‌‎‏‪-‮⁠-⁯﻿￹-￻]/g;
let graphemes=null;
function tagName(p,max=12){
 let name=String(p?.nickname||p?.uniqueId||'').replace(UNSAFE_TEXT,'').replace(/\s+/g,' ').trim()||'Người chơi';
 graphemes??=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter(undefined,{granularity:'grapheme'}):false;
 const parts=graphemes?Array.from(graphemes.segment(name),g=>g.segment):Array.from(name);
 if(parts.length>max)name=parts.slice(0,max-1).join('').trimEnd()+'…';
 return name;
}
// Labels drawn: donors first (most recent first), then pullers by rank, then the
// front of each waiting crowd. The lead puller is named by the captain card instead,
// unless that card is off this shot (captained:false), when the lead gets a tag too.
function tagOrder(entries,maxWaiting=10){
 return entries.filter(e=>!(!e.waiting&&e.index===0&&e.captained!==false)&&(e.donor>0||!e.waiting||e.role==='ready'||e.index<maxWaiting))
  .sort((a,b)=>(b.donor>0)-(a.donor>0)||b.donor-a.donor||a.waiting-b.waiting||a.index-b.index||(a.side<b.side?-1:a.side>b.side?1:0));
}
// Pullers' names take turns: perSide at a time per team, advancing every period
// seconds through the squad. Donors, the waiting crowd and keep(e) always show.
function rotateTags(entries,time,{perSide=2,period=2.5,keep=()=>false}={}){
 const turn=Math.floor(Math.max(0,Number(time)||0)/period),shown=new Set();
 for(const side of ['red','blue']){
  const squad=entries.filter(e=>e.side===side&&!e.waiting&&e.role==='active'&&!(e.donor>0)&&!keep(e)&&!(e.index===0&&e.captained!==false)).sort((a,b)=>a.index-b.index);
  const start=squad.length>perSide?(turn*perSide)%squad.length:0;
  for(let j=0;j<Math.min(perSide,squad.length);j++)shown.add(squad[(start+j)%squad.length]);
 }
 return entries.filter(e=>e.waiting||e.role!=='active'||e.donor>0||keep(e)||shown.has(e));
}
function rectsOverlap(a,b,gap=0){return a.x<b.x+b.w+gap&&b.x<a.x+a.w+gap&&a.y<b.y+b.h+gap&&b.y<a.y+a.h+gap;}
// Liang-Barsky: does segment a->b cross the rect grown by pad?
function segmentHitsRect({a,b,pad=0},r){
 const dx=b[0]-a[0], dy=b[1]-a[1];let t0=0,t1=1;
 for(const [p,q] of [[-dx,a[0]-(r.x-pad)],[dx,r.x+r.w+pad-a[0]],[-dy,a[1]-(r.y-pad)],[dy,r.y+r.h+pad-a[1]]]){
  if(p===0){if(q<0)return false;continue;}
  const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}
 }
 return true;
}
// Greedy screen-space declutter. Each item {id,x,y,w,h} is anchored bottom-centre at
// (x,y); it tries its anchor, then up to rows-1 steps higher, and is hidden when all collide
// with a placed tag, an obstacle box (referee, cards, heads; boxes skip their own owner: item.owner, else item.id)
// or a blocked segment (rope), or leave the viewport. A tag whose anchor is on screen slides inward
// instead of vanishing, so a puller at the frame edge stays named. Other items may also slide sideways by the
// given fractions of their width (comment bubbles over clustered heads).
// Items marked must (pullers) never vanish while a free spot exists: they also try
// sideways slots, then may cover other heads, then any obstacle; never another tag.
function layoutTags(items,{width,height,boxes=[],segments=[],gap=3,rows=2,shifts:sideways=[0]}){
 const placed=[], out=new Map();
 const blocked=(r,it,level)=>!(r.x>=0&&r.y>=0&&r.x+r.w<=width&&r.y+r.h<=height)||placed.some(b=>rectsOverlap(r,b,gap))
  ||level<2&&(boxes.some(b=>b.owner!==(it.owner??it.id)&&(level===0||!b.owner)&&rectsOverlap(r,b))||segments.some(sg=>segmentHitsRect(sg,r)));
 for(const it of items){
  const left=it.x>=0&&it.x<=width?Math.min(Math.max(it.x-it.w/2,0),width-it.w):it.x-it.w/2;
  const shifts=it.must?[0,-.55,.55,-1.1,1.1]:sideways;
  search:for(let level=0;level<(it.must?3:1);level++)for(const shift of shifts)for(let row=0;row<rows;row++){
   const x=Math.min(Math.max(left+shift*it.w,0),Math.max(0,width-it.w)),r={x:shift?x:left,y:it.y-it.h-row*(it.h+gap),w:it.w,h:it.h};
   if(blocked(r,it,level))continue;
   placed.push(r);out.set(it.id,r);break search;
  }
 }
 return out;
}
// The captain card owns the tier above the name-tag row: its arrow tip clears one
// tag row over the lead's anchor, so the card can reach outward over the next
// pullers while their tags keep their own head-height row instead of stacking on it. The row is the measured tag
// height (TAG_ROW is only the fallback), so a larger tag font never lets the card sit on the next puller's tag.
const TAG_ROW=36, CAPTAIN_ARROW=11;
function captainRect(p,[w,h],side,gap=3,row=TAG_ROW){return {x:p.x-(side==='red'?.88:.12)*w,y:p.y-row-gap-CAPTAIN_ARROW-h,w,h};}
// Donor halo strength 0..1: fades out over the final 0.6s; a slow ~0.8Hz breathe
// (far below the 3Hz flash threshold) only when motion is allowed.
function glowLevel(remainingMs,t,still){
 if(!(remainingMs>0))return 0;
 const fade=Math.min(1,remainingMs/600);
 return fade*(still?1:.8+.2*Math.sin(t*Math.PI*1.6));
}
// A packed stand costs more than the match itself: always keep the pullers, the
// squad walking off, the filmed face and any donor, then fill the remaining
// slots alternating teams so both sides thin out evenly.
const STAND_BUDGET=84;
function standBudget(characters){let foreground=0;for(const c of characters)if(c.role!=='stands'||c.leavingCourt)foreground++;return Math.max(0,STAND_BUDGET-foreground);}
function standVisible(c,budget,focused=false,donating=false){return c.role!=='stands'||!!c.leavingCourt||c.index*2+(c.side==='blue'?1:0)<budget||focused||!!donating;}
// Two squared distance bands: stitched-on accessories go at ten units, the
// merged cuffs, bands and joint beads at twelve. Both are past reading distance.
function detailBands(distance2){return {detailOn:distance2<100,farOn:distance2<144};}
function detailVisible(userData,detailOn,farOn){return (!userData.smallDetail||detailOn)&&(!userData.farDetail||farOn);}
const host=document.getElementById('webgl-stage'), fallback=document.getElementById('webgl-fallback');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
try {
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(host.clientWidth,host.clientHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.95; host.append(renderer.domElement); fallback.hidden=true;
 const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(44,host.clientWidth/host.clientHeight,.1,120);
 const lookTarget=new THREE.Vector3(); let currentView=null;
 const cameraTag=document.createElement('div');cameraTag.className='camera-tag';const liveDot=document.createElement('span');liveDot.className='live-dot';liveDot.textContent='LIVE';const cameraName=document.createElement('span');cameraTag.append(liveDot,cameraName);host.append(cameraTag);
 const maxAniso=renderer.capabilities.getMaxAnisotropy();
 const mat=(color,roughness=.75,extra={})=>new THREE.MeshStandardMaterial({color,roughness,...extra});
 const basic=(color,extra={})=>new THREE.MeshBasicMaterial({color,...extra});
 function mesh(geometry,material,x=0,y=0,z=0,shadow=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=shadow;return m;}
 function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=maxAniso;t.userData.redraw=fn=>{g.clearRect(0,0,w,h);fn(g,w,h);t.needsUpdate=true;};return t;}
 const FONT='"Be Vietnam Pro","Nunito","Montserrat","Segoe UI","Noto Sans",Arial,sans-serif';
 const RED=0xe8423f, BLUE=0x2f7fe8, RED_DARK=0x8f1f22, BLUE_DARK=0x173f8a;

 // ---------- Lighting: warm key over the court, cool rim from the stands. ----------
 scene.background=new THREE.Color(0x0f1830); scene.fog=new THREE.Fog(0x0f1830,34,70);
 scene.add(new THREE.HemisphereLight(0xdfeaff,0x2a2f4a,1.55));
 const key=new THREE.DirectionalLight(0xfff3df,2.6); key.position.set(-5,16,11); key.castShadow=true; key.shadow.mapSize.set(2048,1024); key.shadow.bias=-.0005; Object.assign(key.shadow.camera,{left:-12,right:12,top:5,bottom:-5,near:4,far:40}); scene.add(key);
 const rim=new THREE.DirectionalLight(0x9cc4ff,.9); rim.position.set(6,9,-12); scene.add(rim);

 // ---------- Court: one canvas texture carries lines, team zones and the centre logo (1 draw call). ----------
 scene.add(mesh(new THREE.BoxGeometry(60,.2,40),mat(0x1b5a96,.8),0,-.12,2,false));
 const courtTex=canvasTexture(2048,1024,(g,w,h)=>{
  g.fillStyle='#1f7fc9';g.fillRect(0,0,w,h);
  const plank=g.createLinearGradient(0,0,0,h);plank.addColorStop(0,'#2b8fd6');plank.addColorStop(1,'#1c78c2');g.fillStyle=plank;g.fillRect(40,40,w-80,h-80);
  for(let y=40;y<h-40;y+=32){g.fillStyle=y%64?'#ffffff07':'#00000008';g.fillRect(40,y,w-80,32);}
  g.fillStyle='#e8423f33';g.fillRect(40,40,300,h-80);g.fillStyle='#2f7fe833';g.fillRect(w-340,40,300,h-80);
  g.strokeStyle='#ffffff';g.lineWidth=10;g.strokeRect(40,40,w-80,h-80);
  g.beginPath();g.moveTo(w/2,40);g.lineTo(w/2,h-40);g.stroke();
  g.beginPath();g.arc(w/2,h/2,190,0,Math.PI*2);g.stroke();
  g.lineWidth=6;g.setLineDash([26,22]);for(const x of [w*.3,w*.7]){g.beginPath();g.moveTo(x,40);g.lineTo(x,h-40);g.stroke();}g.setLineDash([]);
  g.fillStyle='#ffe066';g.beginPath();g.arc(w/2,h/2,150,0,Math.PI*2);g.fill();
  g.fillStyle='#16233f';g.textAlign='center';g.textBaseline='middle';g.font=`900 92px ${FONT}`;g.fillText('KÉO CO',w/2,h/2-26);g.font=`900 50px ${FONT}`;g.fillStyle='#e8423f';g.fillText('ONLINE',w/2,h/2+50);
  // Near-side floor decals (canvas bottom = +z, toward the cameras) keep the foreground from reading as empty court.
  g.save();g.globalAlpha=.28;g.fillStyle='#fff';g.font=`900 84px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText('♥  THẢ TIM ĐỂ KÉO  ♥',w/2,h-150);g.restore();
  g.save();g.globalAlpha=.5;for(const [x,c] of [[w*.27,'#ff6a5c'],[w*.73,'#7fb8ff']]){g.fillStyle=c;g.beginPath();g.roundRect(x-330,h-96,660,22,11);g.fill();}g.restore();
  g.save();g.globalAlpha=.32;g.fillStyle='#fff';g.font=`900 120px ${FONT}`;g.translate(190,h/2);g.rotate(-Math.PI/2);g.fillText('ĐỎ',0,0);g.restore();
  g.save();g.globalAlpha=.32;g.fillStyle='#fff';g.font=`900 120px ${FONT}`;g.translate(w-190,h/2);g.rotate(Math.PI/2);g.fillText('XANH',0,0);g.restore();
 });
 const court=mesh(new THREE.PlaneGeometry(26,13),mat(0xffffff,.42,{map:courtTex}),0,.001,1.2,false);court.rotation.x=-Math.PI/2;court.receiveShadow=true;scene.add(court);

 // ---------- Tiered stands: instanced seats with colourful sections; front three tiers hold the waiting teams. ----------
 const TIERS=10, tierTop=r=>.42+r*.5, tierZ=r=>-5.4-r*.82;
 const concrete=mat(0x3b4766,.85);
 for(let r=0;r<TIERS;r++){const tier=mesh(new THREE.BoxGeometry(34,tierTop(r)+.12,.84),concrete,0,(tierTop(r)-.12)/2,tierZ(r),false);tier.receiveShadow=true;scene.add(tier);}
 scene.add(mesh(new THREE.BoxGeometry(60,30,.4),mat(0x141f3a,.95),0,8,tierZ(TIERS)-.6,false));
 const seatSpots=[];
 for(let r=0;r<TIERS;r++)for(let x=-16.2;x<=16.21;x+=.66)seatSpots.push({r,x});
 const sectionColor=(r,x)=>{const ax=Math.abs(x);if(r<3)return ax<1.6?0xffc93c:x<0?RED:BLUE;return (x<0?[0x9d4246,0xb55b58,0xd07b68]:[0x31588d,0x416da4,0x6287b2])[(Math.floor((x+16.5)/5.5)+r)%3];};
 const seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.26,.36),mat(0xffffff,.6),seatSpots.length), backs=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.36,.07),mat(0xffffff,.6),seatSpots.length);
 const dummy=new THREE.Object3D(), tint=new THREE.Color();
 seatSpots.forEach((s,i)=>{tint.setHex(sectionColor(s.r,s.x));dummy.position.set(s.x,tierTop(s.r)+.13,tierZ(s.r)+.05);dummy.updateMatrix();seats.setMatrixAt(i,dummy.matrix);seats.setColorAt(i,tint);dummy.position.set(s.x,tierTop(s.r)+.4,tierZ(s.r)-.24);dummy.updateMatrix();backs.setMatrixAt(i,dummy.matrix);backs.setColorAt(i,tint.multiplyScalar(.82));});
 scene.add(seats,backs);
 // Decorative stand fans share instanced geometries, not real viewer identities.
 const fanSpots=seatSpots.filter((s,i)=>(s.r>=3||Math.abs(s.x)>12.4||Math.abs(s.x)<1.4)&&((i*7919)%10)<7).map(s=>({...s,z:tierZ(s.r)-.02,top:tierTop(s.r)}));
 // Opposite sideline seating: lower terraces keep the near crowd from hiding the rope.
 // The rear stand remains the live queue; these coordinated seats frame the other sideline.
 const nearSpots=[];
 for(let r=0;r<4;r++){
  const z=9.2+r*.82, top=.3+r*.38;
  const tier=mesh(new THREE.BoxGeometry(32,top+.12,.8),concrete,0,(top-.12)/2,z,false);scene.add(tier);
  for(let x=-15.5;x<=15.5;x+=.7)nearSpots.push({x,z,top});
 }
 const nearSeats=new THREE.InstancedMesh(new THREE.BoxGeometry(.52,.25,.38),mat(0xffffff,.6),nearSpots.length);
 nearSpots.forEach((s,i)=>{dummy.position.set(s.x,s.top+.13,s.z);dummy.updateMatrix();nearSeats.setMatrixAt(i,dummy.matrix);nearSeats.setColorAt(i,tint.setHex(s.x<0?RED:BLUE));});
 scene.add(nearSeats);
 // Each batch covers both stands: shirt, skin, hair, sleeves/hands and occasional flags.
 const railSpots=Array.from({length:20},(_,i)=>({x:-7.6+i*.8+((i*37)%5)*.06,z:9.3+((i*53)%3)*.22,top:0}));
 const spectators=fanSpots.concat(nearSpots,railSpots);
 const batch=(geo,material=basic(0xffffff),count=spectators.length)=>{const m=new THREE.InstancedMesh(geo,material,count);m.frustumCulled=false;scene.add(m);return m;};
 const pear=createPearSpectatorGeometry(THREE);
 const bodies=batch(pear.body), heads=batch(pear.skin), hair=batch(pear.hair), shoes=batch(pear.shoes), cuffs=batch(pear.trim);
 const fanOutlines=[pear.body,pear.skin,pear.hair,pear.shoes,pear.trim].map(g=>batch(g,cartoonOutlineMaterial(THREE,.012)));
 const fanGarments=OUTFITS.map((name,index)=>{const count=spectators.filter((_,i)=>i%6===index).length,g=garmentGeometry(THREE,index,{crowd:true});const color=g.crowdColor.clone().scale(.45,.45,.45),trim=g.trim.clone().scale(.45,.45,.45);const meshes=[batch(color,basic(0xffffff),count),batch(trim,basic(0xffffff),count)];meshes.forEach(m=>m.name='spectator-outfit-'+name);return meshes;});
 bodies.name='spectator-dungarees';heads.name='spectator-pear-white';hair.name='spectator-tiny-tuft';
 const faceTexture=new THREE.TextureLoader().load('/assets/crowd-faces/atlas.png');faceTexture.colorSpace=THREE.SRGBColorSpace;
 // A single atlas draw for the entire crowd. Tile IDs change only on mood transitions.
 const fanEmotions={red:'neutral',blue:'neutral'};
 const faceTiles=new THREE.InstancedBufferAttribute(new Float32Array(spectators.length),1);
 const faces=new THREE.InstancedMesh(new THREE.PlaneGeometry(.36,.34),new THREE.MeshBasicMaterial({map:faceTexture,transparent:true,alphaTest:.04,depthWrite:false,side:THREE.DoubleSide}),spectators.length);faces.frustumCulled=false;scene.add(faces);
 faces.name='spectator-meme-atlas';
 faces.material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float faceTile; varying float vFaceTile;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvFaceTile=faceTile;');
  shader.fragmentShader='varying float vFaceTile;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
   vec2 tile=vec2(mod(vFaceTile,4.0),1.0-floor(vFaceTile/4.0));
   vec2 atlasUV=(clamp(vMapUv,vec2(0.008),vec2(0.992))+tile)/vec2(4.0,2.0);
   diffuseColor *= texture2D(map,atlasUV);
  #endif`);
 };
 faces.material.customProgramCacheKey=()=> 'spectator-atlas-v1';
 let lastFanMoodKey='';
 const flags=batch(new THREE.BoxGeometry(.35,.23,.025));
 const pole=batch(new THREE.CylinderGeometry(.014,.014,.6,5));
 spectators.forEach((s,i)=>{
  bodies.setColorAt(i,tint.setHex(spectatorShirtColor(i)));heads.setColorAt(i,tint.setHex(0xfaf9f4));
  hair.setColorAt(i,tint.setHex(0x25272c));shoes.setColorAt(i,tint.setHex(0x35373c));cuffs.setColorAt(i,tint.setHex(0xeee7d7));
  flags.setColorAt(i,tint.setHex(s.x<0?RED:BLUE));pole.setColorAt(i,tint.setHex(0xffe7bd));
  fanGarments[i%6][0].setColorAt(Math.floor(i/6),tint.setHex(spectatorShirtColor(i)));fanGarments[i%6][1].setColorAt(Math.floor(i/6),tint.setHex(0xffffff));
 });
 let shownCrowdCount=-1;
 function cullNearCrowd(){const count=camera.position.z<19?fanSpots.length:spectators.length;if(count===shownCrowdCount)return;shownCrowdCount=count;for(const m of fanBatches)m.count=count;for(let i=0;i<6;i++)for(const m of fanGarments[i])m.count=Math.max(0,Math.ceil((count-i)/6));flags.count=pole.count=count;}
 const fanBatches=[bodies,heads,hair,shoes,cuffs,faces,...fanOutlines],allFanBatches=[...fanBatches,...fanGarments.flat(),flags,pole];
 allFanBatches.forEach(m=>m.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
 function updateFans(t,phase,still){
  // With bots off the decorative crowd is hidden too: the stands show only real viewers waiting their turn.
  const crowdOn=state?.config?.botsEnabled!==0;
  if(allFanBatches[0].visible!==crowdOn)for(const m of allFanBatches)m.visible=crowdOn;
  if(!crowdOn)return;
  for(const side of ['red','blue'])fanEmotions[side]=crowdEmotion(state,side,fanEmotions[side]);
  const moodKey=fanEmotions.red+':'+fanEmotions.blue;
  if(moodKey!==lastFanMoodKey){
   spectators.forEach((s,i)=>faceTiles.setX(i,spectatorFaceIndex(i,fanEmotions[s.x<0?'red':'blue'])));
   faceTiles.needsUpdate=true;lastFanMoodKey=moodKey;
  }
  spectators.forEach((s,i)=>{
   const p=crowdPose(t,i,phase,still), size=.85+(i%5)*.075, lean=p.lean+((i%3)-1)*.035;
   // One transform for the whole coherent model: joints cannot detach during cheers.
   dummy.scale.setScalar(size);dummy.rotation.set(0,s.z>0?Math.PI:0,lean);dummy.position.set(s.x,s.top+.13+p.hop,s.z);dummy.updateMatrix();
   for(const m of fanBatches)m.setMatrixAt(i,dummy.matrix);
   for(const m of fanGarments[i%6])m.setMatrixAt(Math.floor(i/6),dummy.matrix);
   const show=i%17===0;dummy.scale.setScalar(show?1:0);dummy.rotation.set(0,0,p.arm*.25);dummy.position.set(s.x+.35,s.top+1.1+p.hop,s.z);dummy.updateMatrix();pole.setMatrixAt(i,dummy.matrix);dummy.position.x+=.17;dummy.position.y+=.19;dummy.updateMatrix();flags.setMatrixAt(i,dummy.matrix);
  });
  dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);for(const m of allFanBatches)m.instanceMatrix.needsUpdate=true;
 }

 // Fascia LED ribbon in front of the first tier scrolls the call to action.
 const ribbonTex=canvasTexture(4096,96,(g,w,h)=>{g.fillStyle='#0b1226';g.fillRect(0,0,w,h);g.font=`900 54px ${FONT}`;g.textBaseline='middle';const items=[['★ THẢ TIM ĐỂ KÉO','#ffe066'],['★ COMMENT ĐỎ / XANH ĐỂ VÀO ĐỘI','#ffffff'],['★ TẶNG HOA HỒNG LÊN HÀNG KÉO','#ff8fb1']];let x=20;for(let k=0;k<4;k++)for(const [text,color] of items){g.fillStyle=color;g.fillText(text,x,h/2+3);x+=g.measureText(text).width+60;}});
 ribbonTex.wrapS=THREE.RepeatWrapping;ribbonTex.repeat.set(1.9,1);
 scene.add(mesh(new THREE.PlaneGeometry(34,.42),basic(0xffffff,{map:ribbonTex,toneMapped:false}),0,.22,tierZ(0)+.43,false));
 // Hanging team banners and the arena logo board fill the upper frame.
 function drawBanner(text,bg){return (g,w,h)=>{g.fillStyle='#ffe8c8';g.fillRect(0,0,w,h);g.fillStyle=bg;g.fillRect(14,14,w-28,h-28);g.fillStyle='#ffffff22';for(let x=-h;x<w;x+=70){g.beginPath();g.moveTo(x,h);g.lineTo(x+h,0);g.lineTo(x+h+30,0);g.lineTo(x+30,h);g.fill();}g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';g.font=`900 150px ${FONT}`;g.shadowColor='#0007';g.shadowOffsetY=8;g.fillText(text,w/2,h/2+8);};}
 const banners={red:canvasTexture(1024,384,drawBanner('ĐỘI ĐỎ','#e8423f')),blue:canvasTexture(1024,384,drawBanner('ĐỘI XANH','#2f7fe8'))};let bannerMode='pvp';
 for(const side of ['red','blue'])scene.add(mesh(new THREE.PlaneGeometry(7.2,2.7),basic(0xffffff,{map:banners[side],toneMapped:false}),(side==='red'?-1:1)*7.6,8.3,tierZ(TIERS)-.3,false));
 const logoTex=canvasTexture(1024,512,(g,w,h)=>{const grad=g.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#ffd84a');grad.addColorStop(1,'#ff9f1c');g.fillStyle='#16233f';g.beginPath();g.roundRect(0,0,w,h,60);g.fill();g.fillStyle=grad;g.beginPath();g.roundRect(18,18,w-36,h-36,46);g.fill();g.fillStyle='#16233f';g.textAlign='center';g.textBaseline='middle';g.font=`900 170px ${FONT}`;g.fillText('KÉO CO',w/2,h/2-50);g.font=`900 78px ${FONT}`;g.fillStyle='#c62828';g.fillText('ĐẠI CHIẾN LIVE',w/2,h/2+100);});
 scene.add(mesh(new THREE.PlaneGeometry(5.6,2.8),basic(0xffffff,{map:logoTex,toneMapped:false,transparent:true}),0,8.6,tierZ(TIERS)-.25,false));
 // Roof rig: light bars and soft additive beams (no extra shadow-casting lights).
 const lightBar=basic(0xfff6d8,{toneMapped:false}), truss=mat(0x5a6683,.6,{metalness:.4});
 for(const x of [-9,-3,3,9]){scene.add(mesh(new THREE.BoxGeometry(2.4,.16,.4),lightBar,x,11.6,-1,false));scene.add(mesh(new THREE.BoxGeometry(.12,.12,22),truss,x,11.9,0,false));}
 const beamMat=basic(0xfff1c2,{transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 for(const x of [-6,0,6])scene.add(mesh(new THREE.CylinderGeometry(.5,3.6,11.4,24,1,true),beamMat,x,5.9,.6,false));

 // Coloured marshalling lanes: queue squads are physically beside the court.
 for(const side of ['red','blue']){const pad=mesh(new THREE.PlaneGeometry(6.8,2.6),basic(side==='red'?RED:BLUE,{transparent:true,opacity:.22,depthWrite:false}),(side==='red'?-1:1)*4.9,.015,-2.15,false);pad.rotation.x=-Math.PI/2;scene.add(pad);}
 // ---------- Rope with a twisted texture and a centre ribbon. ----------
 const ropeTex=canvasTexture(256,32,(g,w,h)=>{g.fillStyle='#d9a75a';g.fillRect(0,0,w,h);g.strokeStyle='#9b6a2c';g.lineWidth=7;for(let x=-h;x<w+h;x+=22){g.beginPath();g.moveTo(x,0);g.lineTo(x+h,h);g.stroke();}});
 ropeTex.wrapS=ropeTex.wrapT=THREE.RepeatWrapping;ropeTex.repeat.set(1,1);
 const ROPE_Y=ROPE_HELD_Y, ROPE_Z=1.48;
 const rope=new THREE.Group();rope.position.set(0,ROPE_Y,ROPE_Z);scene.add(rope);
 const ropeCable=createTugRope(THREE,{material:mat(0xffffff,.8,{map:ropeTex}),groundY:ROPE_GROUND_Y});rope.add(ropeCable.mesh);
 let ropeLeft=-(.95+(SQUAD_SIZE-1)*.8+.28),ropeRight=-ropeLeft;
 // Fixed floor finish lines and centre line; the ribbon travels with the rope.
 for(const [x,color] of [[-2,RED],[0,0xffffff],[2,BLUE]]) {
  scene.add(mesh(new THREE.BoxGeometry(x===0?.12:.22,.035,2.3),basic(color,{toneMapped:false}),x,.035,ROPE_Z,false));
  const post=mesh(new THREE.BoxGeometry(.1,.8,.1),basic(color,{toneMapped:false}),x,.42,ROPE_Z-.8,false);scene.add(post);
 }
 const knot=new THREE.Group();scene.add(knot);
 knot.add(mesh(new THREE.SphereGeometry(.16,16,12),mat(0xffd23f,.4)));
 const ribbon=mesh(new THREE.ConeGeometry(.2,.55,4),mat(0xff3b3b,.5),0,-.32,0);ribbon.rotation.x=Math.PI;knot.add(ribbon);

 // ---------- Characters ----------
 // Purpose-drawn expressions: crisp at broadcast size, no photographic face card.
 function drawChibiFace(expression){return canvasTexture(512,512,(g)=>{
  const ink='#262338';g.lineCap='round';g.lineJoin='round';
  for(const x of [112,400]){const blush=g.createRadialGradient(x,326,3,x,326,56);blush.addColorStop(0,'#ee8f8970');blush.addColorStop(1,'#ee8f8900');g.fillStyle=blush;g.beginPath();g.ellipse(x,326,56,37,0,0,Math.PI*2);g.fill();}
  for(const [x,side] of [[158,-1],[354,1]]){
   g.strokeStyle=ink;g.lineWidth=12;g.beginPath();g.moveTo(x-37,174+(expression==='pull'?side*13:0));g.quadraticCurveTo(x,157,x+35,174-(expression==='pull'?side*13:0));g.stroke();
   if(expression==='speechless'){g.lineWidth=10;g.beginPath();g.moveTo(x-28,251);g.lineTo(x+28,251);g.stroke();}
   else if(expression==='sad'){g.lineWidth=10;g.beginPath();g.moveTo(x-27,254);g.quadraticCurveTo(x,270,x+27,254);g.stroke();}
   else if(expression==='victory'){g.lineWidth=16;g.beginPath();g.moveTo(x-35,262);g.quadraticCurveTo(x,215,x+35,262);g.stroke();}
   else {g.fillStyle=ink;g.beginPath();g.ellipse(x,249,31,expression==='pull'?32:45,0,0,Math.PI*2);g.fill();g.fillStyle='#fffdf4';g.beginPath();g.ellipse(x-9,232,10,13,0,0,Math.PI*2);g.fill();g.beginPath();g.arc(x+12,265,5,0,Math.PI*2);g.fill();}
   if(expression==='cry'){g.fillStyle='#7fc9ee';g.beginPath();g.roundRect(x-17,281,34,96,16);g.fill();}
  }
  g.strokeStyle=ink;g.lineWidth=11;g.beginPath();
  if(expression==='pull'){g.fillStyle='#fffdf4';g.roundRect(211,330,90,41,17);g.fill();g.stroke();g.lineWidth=3;g.beginPath();g.moveTo(256,335);g.lineTo(256,366);g.stroke();}
  else if(expression==='cry'||expression==='sad'){g.moveTo(223,374);g.quadraticCurveTo(256,342,289,374);g.stroke();}
  else if(expression==='speechless'){g.moveTo(236,359);g.lineTo(276,359);g.stroke();}
  else {g.fillStyle='#5b3040';g.moveTo(212,330);g.quadraticCurveTo(256,348,300,330);g.quadraticCurveTo(256,407,212,330);g.fill();g.stroke();g.fillStyle='#f29299';g.beginPath();g.ellipse(256,369,24,9,0,0,Math.PI*2);g.fill();}
 });}
 const textures=Object.fromEntries(Object.entries({happy:2,pull:1,victory:3,cry:5,strain:6,shock:4,cool:7}).map(([name,tile])=>{const t=faceTexture.clone();t.repeat.set(.25,.5);t.offset.set((tile%4)/4,(1-Math.floor(tile/4))/2);t.needsUpdate=true;return [name,t];}));
 for(const expression of ['sad','speechless'])textures[expression]=drawChibiFace(expression);
 // Pull-only faces cut from the same supplied meme sheet; see assets/crowd-faces/README.md.
 const pullTexture=new THREE.TextureLoader().load('/assets/crowd-faces/pull-atlas.png');pullTexture.colorSpace=THREE.SRGBColorSpace;
 PULL_FACES.forEach((name,tile)=>{const t=pullTexture.clone();t.repeat.set(.25,.5);t.offset.set((tile%4)/4,(1-Math.floor(tile/4))/2);t.needsUpdate=true;textures[name]=t;});
 // Flat study-04 head front preserves the supplied atlas artwork without spherical distortion.
 const fanFace=pear.face;fanFace.setAttribute('faceTile',faceTiles);faces.geometry.dispose();faces.geometry=fanFace;
 // Faces share one material per expression; swapping material is cheaper than per-character textures.
 // Sweat drops share one geometry/material; fading is done by scale so the material stays shared.
 const sweatGeo=new THREE.SphereGeometry(1,10,8),sweatMat=new THREE.MeshStandardMaterial({color:0x8fd8ff,emissive:0x2f8fe0,emissiveIntensity:.6,roughness:.08,metalness:0,transparent:true,opacity:.9});
 const SWEAT_PATHS=[[.46,.2],[-.46,.14],[.2,.3]];
 const faceMats=Object.fromEntries(Object.entries(textures).map(([k,t])=>[k,new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.04,depthWrite:false,roughness:1})]));
 const stripeTexture=(color,bg='#fffaf2',step=32,width=14)=>{const t=canvasTexture(128,8,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);g.fillStyle=color;for(let x=0;x<w;x+=step)g.fillRect(x,0,width,h);});t.wrapS=THREE.RepeatWrapping;t.repeat.set(4,1);return t;};
 // Real light-reactive materials: every part has depth, surface normals and
 // receives arena shadows. Shared materials keep the articulated crowd cheap.
 function characterMaterial(color){
  return mat(color,.88);
 }
 const clothBump=canvasTexture(128,128,g=>{
  g.fillStyle='#808080';g.fillRect(0,0,128,128);
  for(let i=0;i<128;i+=4){g.fillStyle='#979797';g.fillRect(i,0,1,128);g.fillStyle='#6d6d6d';g.fillRect(0,i,128,1);}
 });clothBump.wrapS=clothBump.wrapT=THREE.RepeatWrapping;clothBump.repeat.set(3,3);clothBump.colorSpace=THREE.NoColorSpace;
 const fabric=color=>{const material=characterMaterial(color);material.bumpMap=clothBump;material.bumpScale=.002;return material;};
 const teamLook={red:{shirt:fabric(RED)},blue:{shirt:fabric(BLUE)}};
 const streetWardrobe=createStreetWardrobe(THREE,{canvasTexture,clothBump});
 const skin=characterMaterial(0xf3f1ee), hairMat=mat(0x181818,.69), shoe=mat(0x18191c,.76), white=skin;
 const sphere=new THREE.SphereGeometry(1,24,16), jointGeo=new THREE.SphereGeometry(1,16,12), limb=new THREE.CapsuleGeometry(.12,.44,6,12), hand=new THREE.SphereGeometry(.135,16,12);
 // Wrap the expression onto the actual ellipsoid instead of a floating card.
 const faceGeo=new THREE.PlaneGeometry(1.78,1.12,32,24), gripGeo=new THREE.TorusGeometry(.14,.052,8,20,Math.PI*1.7);
 // Latitude/longitude mapping keeps the entire patch on the same skull, even
 // at its corners. Features occupy more of the visible face without stretching
 // into a flat sticker when the head turns to profile.
 {const p=faceGeo.attributes.position;for(let i=0;i<p.count;i++){
  const longitude=p.getX(i)/.62,latitude=(p.getY(i)-.12)/.53;
  p.setXYZ(i,.624*Math.sin(longitude)*Math.cos(latitude),.534*Math.sin(latitude),.434*Math.cos(longitude)*Math.cos(latitude));
 }faceGeo.computeVertexNormals();}

 // Share the tailored shell and small components across all active players.
 const forms=characterFormGeometry(THREE),jerseyGeo=forms.torso,sleeveGeo=forms.sleeve;
 const waistbandGeo=forms.hips;
 const cuffGeo=new THREE.TorusGeometry(.148,.012,6,32);cuffGeo.rotateX(Math.PI/2);cuffGeo.scale(1,1,1.38);
 const wristCuffGeo=new THREE.TorusGeometry(.123,.018,8,24);wristCuffGeo.rotateX(Math.PI/2);
 const teamBandGeo=new THREE.TorusGeometry(.147,.013,6,24);teamBandGeo.rotateX(Math.PI/2);

 const antennaGeo=new THREE.CylinderGeometry(.025,.025,.36,6), bulbGeo=new THREE.SphereGeometry(.08,10,8), bulbMat=basic(0x7df9ff,{toneMapped:false});

 // Referee: striped shirt, high-vis cap and one flag per team so pointing reads at a glance.
 const referee=(()=>{
  const black=mat(0x15161c), yellow=mat(0xffd23f,.5), refSkin=mat(0xf0c39c);
  const root=new THREE.Group();root.position.set(0,.2,-.6);root.scale.setScalar(.82);scene.add(root);
  const spot=mesh(new THREE.CircleGeometry(1.15,40),basic(0xfff2b8,{transparent:true,opacity:.28,depthWrite:false}),0,-.19,0,false);spot.rotation.x=-Math.PI/2;root.add(spot);
  const body=new THREE.Group();root.add(body);
  const torso=mesh(sphere,mat(0xffffff,.7,{map:stripeTexture('#15161c','#ffffff',21,10)}),0,.82,0);torso.scale.set(.38,.5,.28);body.add(torso);
  const shorts=mesh(sphere,black,0,.42,0);shorts.scale.set(.39,.22,.28);body.add(shorts);
  const head=new THREE.Group();head.position.y=1.55;body.add(head);
  const skull=mesh(sphere,refSkin);skull.scale.set(.42,.44,.38);head.add(skull);
  const cap=mesh(new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.5),yellow,0,.1,0);cap.scale.set(.45,.34,.41);head.add(cap);
  head.add(mesh(new THREE.BoxGeometry(.5,.04,.3),yellow,0,.1,.38));
  for(const x of [-.14,.14])head.add(mesh(new THREE.SphereGeometry(.05,8,6),black,x,-.02,.35));
  const whistle=mesh(new THREE.CylinderGeometry(.05,.05,.14,10),mat(0xd8dde4,.25),0,-.2,.39);whistle.rotation.x=Math.PI/2;head.add(whistle);
  const arms=[];for(const [i,sign] of [-1,1].entries()){
   const a=new THREE.Group();a.position.set(sign*.37,1.08,.03);a.add(mesh(limb,refSkin,0,-.32,0));
   a.add(mesh(new THREE.CylinderGeometry(.025,.025,.6,6),black,0,-.92,0));
   const flag=mesh(new THREE.PlaneGeometry(.5,.36),new THREE.MeshStandardMaterial({color:i?BLUE:RED,side:THREE.DoubleSide,roughness:.7}),sign*.25,-1.08,0);a.add(flag);
   body.add(a);arms.push(a);
   const leg=new THREE.Group();leg.position.set(sign*.18,.38,0);leg.add(mesh(limb,refSkin,0,-.23,0));const s=mesh(sphere,black,0,-.55,.1);s.scale.set(.15,.09,.23);leg.add(s);root.add(leg);
  }
  const tag=document.createElement('div');tag.className='referee-tag';tag.textContent='TRỌNG TÀI';host.append(tag);
  return {root,body,head,arms,tag};
 })();

 // A continuous soft jersey silhouette overlaps neck, hips and sleeve pivots.
 const HIP=.38,SEAT_TOP=.26, HEAD_Y=1.65, jointAnchors=characterJointAnchors();
 const pickHairstyle=createHairstylePicker();
 function buildCharacter(side,isBot,detailed,userId){
  const shadow=detailed,outfit=streetOutfitForUser(userId),{longSleeve,pants}=STREET_OUTFITS[outfit],look={...streetWardrobe.materials[outfit],shorts:streetWardrobe.materials[outfit].pants},streetGeometry=streetWardrobe.geometry(outfit);
  const root=new THREE.Group(), body=new THREE.Group();root.add(body);
  const torso=mesh(jerseyGeo,look.shirt,0,.84,0,shadow);body.add(torso);
  streetWardrobe.body(body,outfit,shadow);for(const part of body.children)if(part!==torso)part.userData.farDetail=true;
  addTeamBadge(body,{THREE,side,outfitIndex:outfit});
  const shorts=mesh(waistbandGeo,look.shorts,0,.43,0,shadow);body.add(shorts);
  function joint(parent,anchor,material,radius){const part=mesh(jointGeo,material,...anchor,shadow);part.scale.setScalar(radius);part.userData.skipOutline=true;part.userData.farDetail=true;parent.add(part);}
  // The neck extends *into* both the jaw and the shirt, not a bead between them.
  const neck=mesh(sphere,skin,0,1.15,0,shadow);neck.scale.set(.16,.18,.16);body.add(neck);
  const collar=mesh(sphere,look.collar,0,1.12,.015,false);collar.scale.set(.195,.045,.175);body.add(collar);
  const headGroup=new THREE.Group();headGroup.position.y=HEAD_Y;body.add(headGroup);
  const head=mesh(sphere,skin,0,0,0,shadow);head.scale.set(.62,.53,.43);headGroup.add(head);
  for(const sx of [-1,1]){const ear=mesh(sphere,skin,sx*.59,-.035,0,false);ear.scale.set(.055,.08,.07);headGroup.add(ear);}
  addCharacterHair(headGroup,{THREE,material:hairMat,userId,style:pickHairstyle(userId),shadow});
  if(isBot){headGroup.add(mesh(antennaGeo,shoe,0,.68,0,false));headGroup.add(mesh(bulbGeo,bulbMat,0,.88,0,false));}
  const face=mesh(faceGeo,faceMats.happy,0,0,0,false);face.renderOrder=2;face.receiveShadow=shadow;headGroup.add(face);
  streetWardrobe.head(headGroup,outfit);
  const arms=[],legs=[],elbows=[],knees=[],grips=[];
  for(const sx of [-1,1]){
   const a=new THREE.Bone();a.position.set(sx*.33,1.04,.04);
   const sleeveMat=look.shirt;
   joint(a,jointAnchors.shoulder,sleeveMat,.14);
   const sleeve=mesh(sleeveGeo,sleeveMat,sx*.025,-.015,0,shadow);sleeve.userData.farDetail=true;sleeve.rotation.z=sx*.18;a.add(sleeve);
   const elbow=new THREE.Bone();elbow.position.y=-.32;
   if(longSleeve){const cuff=mesh(wristCuffGeo,look.rib,0,-.30,0,shadow);cuff.userData.farDetail=true;cuff.userData.skipOutline=true;elbow.add(cuff);}
   const teamBand=mesh(teamBandGeo,teamLook[side].shirt,longSleeve?0:sx*.025,longSleeve?-.265:-.15,0,false);teamBand.userData.farDetail=true;teamBand.userData.skipOutline=true;(longSleeve?elbow:a).add(teamBand);
   const palm=mesh(hand,skin,0,0,.015,shadow);palm.position.y=-.34;palm.scale.set(1.04,1.08,.90);elbow.add(palm);
   const thumb=mesh(sphere,skin,-sx*.083,-.29,.085,false);thumb.scale.set(.062,.082,.065);elbow.add(thumb);
   {
    const wrap=mesh(gripGeo,skin,0,0,0,false);wrap.name='grip-shell';wrap.rotation.y=Math.PI/2;wrap.visible=false;root.add(wrap);grips.push(wrap);}
   a.add(elbow);elbows.push(elbow);body.add(a);arms.push(a);
   addLimbSkin(a,{THREE,rootBone:a,jointBone:elbow,material:longSleeve?look.shirt:skin,radius:longSleeve?.14:.112,tipRadius:longSleeve?.121:.095,depth:longSleeve?1.04:1,shadow});
   const leg=new THREE.Bone();leg.position.set(sx*.17,HIP,0);
   // Separate short legs leave a real crotch opening; they follow the hips.
   if(!pants){leg.add(mesh(streetGeometry.shorts,look.shorts,0,-.025,0,shadow));leg.add(mesh(cuffGeo,look.shorts,0,-.13,0,false));}
   const knee=new THREE.Bone();knee.position.y=-.28;
   streetWardrobe.foot(knee,outfit,shadow);
   leg.add(knee);knees.push(knee);root.add(leg);legs.push(leg);
   const skinOptions={THREE,rootBone:leg,jointBone:knee,upper:.28,lower:.28,shadow};
   if(outfit<3)addLimbSkin(leg,{...skinOptions,material:skin,radius:.102,tipRadius:.098}).userData.farDetail=true;
   addLimbSkin(leg,{...skinOptions,material:pants?look.shorts:skin,radius:pants?.129:.113,tipRadius:pants?.112:.106,depth:pants?1.14:1,ripped:pants&&outfit<3});
   for(const piece of streetGeometry.leg)addLimbSkin(leg,{...skinOptions,material:look[piece.role],radius:pants?.129:.113,sourceGeometry:piece.geometry});
  }
  scene.add(root);
  head.userData.mainSilhouette=true;
  mergeRigidParts(root,THREE,{keep:[torso,shorts]});
  const parts=[];root.traverse(o=>{if(o.isMesh&&o!==face){o.userData.base=o.material;parts.push(o);}});
  // Silhouette outlines belong on the large forms, not every cuff and finger.
  root.traverse(o=>{if(o.isMesh&&o!==torso&&o!==shorts&&!o.userData.mainSilhouette&&!o.parent?.userData.hairstyle)o.userData.skipOutline=true;});
  addCharacterOutline(root,{THREE,width:.009});
  // Added after merge/outline/parts so drops stay separate, unoutlined and never glow-swapped.
  const sweat=SWEAT_PATHS.map(()=>{const d=mesh(sweatGeo,sweatMat,0,0,0,false);d.userData.skipOutline=true;d.visible=false;headGroup.add(d);return d;});
  const lodParts=[];root.traverse(o=>{if(o.userData.cartoonOutline&&!o.parent?.userData.mainSilhouette)o.userData.farDetail=true;if(o.isMesh&&(o.userData.smallDetail||o.userData.farDetail))lodParts.push(o);});
  return {root,body,headGroup,face,sweat,sweatSeed:(userId?String(userId).length*.37:0)%1,arms,legs,elbows,knees,grips,detailed,parts,lodParts,outfit:STREET_OUTFITS[outfit].id};
 }
 function disposeCharacter(c){scene.remove(c.root);c.tag?.remove();c.root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.dispose();if(o.userData.ownsGeometry)o.geometry.dispose();}});}

 // ---------- Donor glow: shared emissive clones (one per base material) plus a pooled halo/ring. ----------
 const MAX_HALOS=8, glowMats=new Map();
 function glowMaterial(m){let g=glowMats.get(m);if(!g){g=m.clone();if(g.emissive){g.emissive.setHex(0xffc23d);g.emissiveIntensity=.6;}else g.color.lerp(new THREE.Color(0xffc23d),.25);glowMats.set(m,g);}return g;}
 function setGlow(c,on){if(c.glowing===on)return;c.glowing=on;for(const o of c.parts)o.material=on?glowMaterial(o.userData.base):o.userData.base;}
 const haloTex=canvasTexture(128,128,(g,w,h)=>{const r=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);r.addColorStop(0,'#fff6c8');r.addColorStop(.4,'#ffd23fb0');r.addColorStop(1,'#ffb00000');g.fillStyle=r;g.fillRect(0,0,w,h);});
 const ringGeo=new THREE.RingGeometry(.62,.9,40);
 const halos=Array.from({length:MAX_HALOS},()=>{
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  const ring=new THREE.Mesh(ringGeo,basic(0xffd23f,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;
  sprite.visible=ring.visible=false;scene.add(sprite,ring);return {sprite,ring};
 });

 // ---------- DOM labels: rank bubbles for pullers, a captain card per team and waiting-area signs. ----------
 // Writes only on change and invalidates the cached layout size of the owning label.
 function setText(el,text,owner){if(el.textContent!==text){el.textContent=text;owner._size=null;}}
 const waitingSigns={};
 for(const side of ['red','blue']){const label=document.createElement('div');label.className=`waiting-sign ${side}`;const title=document.createElement('b'),next=document.createElement('small');label.append(title,next);host.append(label);waitingSigns[side]={label,title,next};}
 const captains={};
 for(const side of ['red','blue']){const el=document.createElement('div');el.className=`captain-tag ${side}`;const rank=document.createElement('span');rank.className='cap-rank';const name=document.createElement('b');const gift=document.createElement('small');el.append(rank,name,gift);el.hidden=true;host.append(el);captains[side]={el,rank,name,gift};}

 const commentNodes=new Map(),commentHead=new THREE.Vector3();
 const characters=new Map(), appeared=new Set(); let state=null, pullStarted=0,pendingBuilds=false;
 function update(s){
  let built=0;pendingBuilds=false;
  if(s.phase==='pull' && state?.phase!=='pull')pullStarted=performance.now();
  state=s;const players=Array.isArray(s.players)?s.players:[],bots=Array.isArray(s.bots)?s.bots.map((b,i)=>({...b,nickname:b.nickname||b.name||'Người chơi',isBot:true})):[];const seen=new Set();
  const mode=s.mode==='pve'?'pve':'pvp';if(mode!==bannerMode){bannerMode=mode;banners.blue.userData.redraw(drawBanner(mode==='pve'?'ĐỘI MÁY':'ĐỘI XANH',mode==='pve'?'#3a4a6b':'#2f7fe8'));}
  for(const side of ['red','blue']) {const lineup=selectLineup(players.filter(p=>p.team===side).concat(bots.filter(b=>b.team===side)),s.upNext?.[side]);const sign=waitingSigns[side];
   setText(sign.title,`ĐỘI KẾ TIẾP ${side==='red'?'ĐỎ':mode==='pve'?'MÁY':'XANH'} · ${lineup.ready.size}/${SQUAD_SIZE}`,sign.label);
   const nextUp=lineup.waiting[0];setText(sign.next,nextUp?`SẮP TỚI LƯỢT · ${tagName(nextUp,16)} · ${lineup.waiting.length+lineup.hidden} đang chờ`:'Comment để xếp hàng',sign.label);
   const cap=captains[side], lead=lineup.active[0];if(cap.el.hidden!==!lead){cap.el.hidden=!lead;cap.el._size=null;}
   cap.uid=lead&&!lead.isBot&&lead.uniqueId?String(lead.uniqueId):null;
   if(lead){setText(cap.rank,`#${lead.lineupRank||1}`,cap.el);setText(cap.name,tagName({...lead,isBot:false},18),cap.el);setText(cap.gift,`${Number(lead.giftDiamonds)||0} ◆`,cap.el);}
   [...lineup.active,...lineup.waiting].forEach((p,i)=>{const key=side+':'+(p.uniqueId||`anonymous-${i}`);seen.add(key);const waiting=i>=SQUAD_SIZE;let c=characters.get(key);
    // Keep the same rig and GPU resources when moving between queue and court.
    if(!c){if(built>=1){pendingBuilds=true;return;}built++;c=buildCharacter(side,!!p.isBot,!waiting,p.uniqueId);c.side=side;c.joined=performance.now();c.drop=false;appeared.add(key);characters.set(key,c);
     c.tag=document.createElement('div');c.tag.className=`name-tag ${side}${waiting?' waiting':''}`;c.tag.style.visibility='hidden';c.tagRank=document.createElement('i');c.tagText=document.createElement('span');c.tag.append(c.tagRank,c.tagText);host.append(c.tag);}
    c.retiring=false;c.id=key;c.commentId=p.uniqueId?String(p.uniqueId):null;c.uid=!p.isBot&&p.uniqueId?String(p.uniqueId):null;c.waiting=waiting;
    const role=!waiting?'active':lineup.ready.has(p.uniqueId)?'ready':'stands';
    const index=role==='ready'?[...lineup.ready].indexOf(p.uniqueId):role==='stands'?Math.max(0,i-SQUAD_SIZE-lineup.ready.size):i;
    const target=role==='active'?{...tugPosition(side,index),y:0}:role==='ready'?readyPosition(side,index):(()=>{const slot=waitingSlot(side,index);return {x:slot.x,y:tierTop(slot.row),z:tierZ(slot.row)+.18};})();
    if(c.role!==role||c.index!==index){
     const sign=side==='red'?-1:1,from=c.groundPosition?{...c.groundPosition,x:c.groundPosition.x+(c.role==='active'&&!c.route?rope.position.x:0)}:{x:sign*11.5,y:0,z:-4.6},out=c.role==='active'&&role!=='active';
     const entryX=sign*10.6,exitX=sign*11.9,readyAisle=index<6?-.65:-3.6;
     const points=out?[from,{x:from.x,y:0,z:3.7},{x:exitX,y:0,z:3.7},{x:exitX,y:0,z:-4.6},{x:exitX,y:target.y,z:target.z+.6},{x:target.x,y:target.y,z:target.z+.6},target]
       :role==='active'?[from,{x:target.x,y:0,z:-.55},target]
       :role==='ready'?[from,{x:entryX,y:from.y,z:-4.6},{x:entryX,y:0,z:readyAisle},{x:target.x,y:0,z:readyAisle},target]
       :[from,{x:exitX,y:0,z:-4.6},{x:exitX,y:target.y,z:target.z+.6},{x:target.x,y:target.y,z:target.z+.6},target];
     if(out&&role==='ready')points.splice(4,points.length-4,{x:exitX,y:.42,z:-5.2},{x:entryX,y:.42,z:-5.2},{x:entryX,y:0,z:readyAisle},{x:target.x,y:0,z:readyAisle},target);
     c.route=makeRoute(points,{speed:out||p.isBot?10:7,delay:role==='active'&&c.role?1.05:Math.min(index,11)*.035});c.destination=target;
     if(reduced.matches){c.groundPosition={...target};c.route=null;}
     c.leavingCourt=out;c.role=role;c.index=index;c.targetScale=role==='active'?.76:role==='ready'?.65:.56;
     c.root.traverse(o=>{if(o.isMesh&&!o.userData.cartoonOutline)o.castShadow=role==='active'&&o!==c.face&&!o.userData.skipOutline;});
    }
    if(!c.root.scale.x||!c.groundPosition)c.root.scale.setScalar(c.targetScale);
    // Names are re-derived only when the source changes; textContent keeps them inert.
    const raw=`${p.isBot?1:0}|${p.nickname??''}|${p.uniqueId??''}`;if(c.rawName!==raw){c.rawName=raw;setText(c.tagText,tagName(p),c.tag);}
    // Away players keep their place but sit out until they interact again.
    const away=role==='stands'&&p.away===true;if(c.away!==away){c.away=away;c.tag.classList.toggle('away',away);c.tag._size=null;}
    setText(c.tagRank,role==='ready'?`NEXT ${index+1}`:away?'CHỜ':waiting?'':String(i+1),c.tag);
   });
  }
  const rosterTeams=new Map(players.map(p=>[p.uniqueId,p.team]));let departingCount=0;
  for(const [key,c] of characters)if(!seen.has(key)){
   if(c.retiring){if(departingCount++<24)continue;}
   else if(c.role==='active'&&['transition','lobby'].includes(s.phase)&&rosterTeams.get(c.uid)===c.side&&departingCount<24){
    // Even a queue beyond the visible stand capacity must see the old squad leave.
    const sign=c.side==='red'?-1:1,from=c.groundPosition||c.destination;
    c.retiring=true;c.role='departing';c.waiting=true;c.targetScale=.56;
    c.destination={x:sign*11.9,y:.42,z:-5.2};
    c.route=makeRoute([from,{x:from.x,y:0,z:3.7},{x:sign*11.9,y:0,z:3.7},{x:sign*11.9,y:0,z:-4.6},c.destination],{speed:10});
    c.root.traverse(o=>{if(o.isMesh)o.castShadow=false;});departingCount++;continue;
   }
   disposeCharacter(c);characters.delete(key);
  }
 }
 window.updateStage3D=update;if(window.lastOverlayState)update(window.lastOverlayState);

 const vector=new THREE.Vector3();
 let viewW=host.clientWidth, viewH=host.clientHeight;
 // Docked comments stay above the strip of the arena that the platform comment feed covers.
 const chatCover=parseFloat(getComputedStyle(host).getPropertyValue("--arena-chat-cover"))||0;
 function project(x,y,z){vector.set(x,y,z).project(camera);return {x:(vector.x*.5+.5)*viewW,y:(-vector.y*.5+.5)*viewH,nx:vector.x,ny:vector.y,off:vector.z>1};}
 // Style writes are skipped when unchanged; sizes are measured once per text/class change.
 function setStyle(el,key,value){if(el['_'+key]!==value){el['_'+key]=value;el.style[key]=value;}}
 function sizeOf(el){if(!el._size&&!el.hidden&&el.offsetWidth)el._size=[el.offsetWidth,el.offsetHeight];return el._size;}
 // Returns the label's screen rect (for decluttering) or null when off screen.
 function place(el,x,y,z,ax=-50,ay=-50,edge=1.05){const p=project(x,y,z), off=p.off||Math.abs(p.nx)>edge||Math.abs(p.ny)>edge;setStyle(el,'visibility',off?'hidden':'');if(off)return null;setStyle(el,'transform',`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(${ax}%,${ay}%)`);const size=sizeOf(el);return size&&{x:p.x+ax/100*size[0],y:p.y+ay/100*size[1],w:size[0],h:size[1]};}
 function screenBounds(points){const ps=points.map(q=>project(...q));if(ps.some(q=>q.off))return null;const xs=ps.map(q=>q.x), ys=ps.map(q=>q.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
 let lastFans=-1e9, lastFrame=0, resultElapsed=0, cameraElapsed=0, cameraPhase=null, cameraKey='', lastCameraCut=-Infinity, donorShotUntil=0, donorSubject=null, activeCameraPlan=null;
 const filmedDonors=new Set(),cameraHead=new THREE.Vector3(),cameraPosition=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),limbQuaternion=new THREE.Quaternion(),limbEuler=new THREE.Euler(),gripPoint=new THREE.Vector3(),rootInverse=new THREE.Quaternion(),gripRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
 const perf={frames:0,cpuMs:0,lastCpuMs:0};
 let ropeHandoff=null,ropeSpring=null,ropeVelocity=0;
 function frame(now){requestAnimationFrame(frame);const cpuStart=performance.now();if(pendingBuilds&&state)update(state);const t=now/1000, phase=state?.phase, pos=Math.max(-1,Math.min(1,Number(state?.position)||0));
  const still=reduced.matches||!!state?.paused, moving=!still;
  const dt=lastFrame ? (now-lastFrame)/1000 : 0;lastFrame=now;
  if(phase!==cameraPhase){cameraElapsed=0;cameraPhase=phase;cameraKey='';donorSubject=null;donorShotUntil=0;if(phase==='pull')filmedDonors.clear();}
  if(!state?.paused)cameraElapsed+=Math.max(0,dt);
  if(phase==='result'){if(!state?.paused)resultElapsed+=Math.max(0,dt);}else resultElapsed=0;
  const activePullers=[...characters.values()].filter(c=>c.role==='active');
  const readyToLift=activePullers.length>0&&activePullers.every(c=>!c.route);
  ropeHandoff=advanceRopeHandoff(ropeHandoff,{phase,dt,ready:readyToLift,hasPlayers:activePullers.length>0,paused:!!state?.paused,reducedMotion:reduced.matches});
  const ropeY=ropeHandoff.height;
  // The authoritative lead sets the spring target; the heave only rocks the rope around it.
  if(!state?.paused){const heave=phase==='pull'&&ropeHandoff.stage==='held'&&!reduced.matches?ropeHeave(t,pos):0,previousX=rope.position.x;ropeSpring=springRope(ropeSpring??{x:rope.position.x,v:0},ropeTarget(state),dt,reduced.matches);rope.position.x=ropeSpring.x+heave;ropeVelocity=dt>0?(rope.position.x-previousX)/Math.min(dt,.1):0;}
  rope.position.y=ropeY;knot.position.set(rope.position.x,Math.max(.18,ropeY),ROPE_Z);
  const ribbonLift=Math.max(0,Math.min(1,(ropeY-ROPE_GROUND_Y)/(ROPE_Y-ROPE_GROUND_Y)));
  ribbon.position.set(0,-.32*ribbonLift,.32*(1-ribbonLift));ribbon.rotation.x=-Math.PI/2*(1-ribbonLift);ribbon.rotation.z=moving?Math.sin(t*5)*.12*ribbonLift:0;
  const clockNow=state?.paused?Number(state.pausedAt):Date.now(),secondsLeft=Math.max(0,(Number(state?.endsAt)-clockNow)/1000),buffs=Object.fromEntries(['red','blue'].map(side=>[side,Math.max(0,(Number(state?.mana?.[side]?.buffUntil)-clockNow)/1000)]));
  let plan=cinematicPlan({phase,elapsed:cameraElapsed,remaining:secondsLeft,resultElapsed,winner:resultWinner(state),still:reduced.matches,buffs});
  if(['reach','lift'].includes(ropeHandoff.stage))plan={kind:'handoff',view:'court',progress:0};
  if(phase==='pull'&&!still&&secondsLeft>5&&now-lastCameraCut>1800&&!['face','overhead'].includes(plan.kind)&&cameraElapsed>2){
   const id=window.donorGlow?.ids().slice().reverse().find(id=>!filmedDonors.has(id)&&window.donorGlow.remaining(id)>0&&activePullers.some(c=>c.uid===id));
   if(id){const person=[...characters.values()].find(c=>c.uid===id);if(person){filmedDonors.add(id);donorSubject=person;donorShotUntil=cameraElapsed+2;}}
  }
  if(phase==='pull'&&plan.kind!=='overhead'&&donorSubject&&cameraElapsed<donorShotUntil&&secondsLeft>5&&!reduced.matches)plan={kind:'face',view:donorSubject.side,subject:'donor',progress:1-(donorShotUntil-cameraElapsed)/2};
  let focusedCharacter=null;
  if(plan.kind==='face'){
   const candidates=[...characters.values()].filter(c=>c.side===plan.view&&!c.waiting).sort((a,b)=>a.index-b.index);
   focusedCharacter=plan.subject==='donor'?donorSubject:plan.subject==='mvp'?(candidates.find(c=>c.uid===state?.mvp?.[plan.view]?.uniqueId)||candidates[0]):candidates[plan.index||0]||candidates[0];
   if(!focusedCharacter)plan={kind:'duel',view:'court',progress:0};
  }
  const faceFocus=plan.kind==='face'&&focusedCharacter;
  if(faceFocus){focusedCharacter.root.updateMatrixWorld(true);focusedCharacter.headGroup.getWorldPosition(cameraHead);}
  const view=plan.view,shot=cinematicShot(plan,{ropeX:rope.position.x,time:t,head:faceFocus?cameraHead:null}),nextKey=`${phase}:${plan.kind}:${view}:${faceFocus?focusedCharacter.id:''}`,cut=nextKey!==cameraKey;
  cameraPosition.set(...shot.position);cameraTarget.set(...shot.target);
  const follow=1-Math.exp(-Math.max(0,Math.min(dt,.1))*(faceFocus?10:5));
  if(!state?.paused||!cameraKey){
   if(cut||reduced.matches){camera.position.copy(cameraPosition);lookTarget.copy(cameraTarget);camera.fov=shot.fov;}else{camera.position.lerp(cameraPosition,follow);lookTarget.lerp(cameraTarget,follow);camera.fov+=(shot.fov-camera.fov)*follow;}
   if(camera.fov!==camera._lastFov){camera.updateProjectionMatrix();camera._lastFov=camera.fov;}camera.lookAt(lookTarget);if(cut){cameraKey=nextKey;lastCameraCut=now;}
  }
  cullNearCrowd();
  activeCameraPlan={kind:plan.kind,view,subject:faceFocus?focusedCharacter.uid:null};
  const camText=faceFocus?`${plan.subject==='mvp'?'MVP':plan.subject==='donor'?'CẢM ƠN':'NGƯỜI CHƠI'} · ${focusedCharacter.tagText.textContent}`:plan.kind==='rope'?'ĐIỂM GIẰNG CO':plan.kind==='overhead'?'TRÊN CAO · NHÌN XUỐNG':plan.kind==='duel'?'HAI ĐỘI ĐỐI ĐẦU':plan.kind==='handoff'?'ĐỔI ĐỘI · NHÓM KẾ TIẾP VÀO SÂN':plan.kind==='queue'?'ĐỘI KẾ TIẾP · SẮP TỚI LƯỢT':cameraLabel(view,state?.mode);
  if(view!==currentView||cameraName.textContent!==camText){currentView=view;cameraName.textContent=camText;cameraTag.className=`camera-tag ${view}`;}
  if(moving)ribbonTex.offset.x=(t*.025)%1;
  const call=refereePose(phase,state?.score), winner=resultWinner(state), refArms=refereeArms(call,t,still);
  referee.arms.forEach((a,j)=>{a.rotation.z=refArms[j];});referee.root.rotation.y=winner?(winner==='red'?-.35:.35):0;referee.head.rotation.y=call==='watch'?rope.position.x*.3:0;referee.body.rotation.z=call==='watch'?-rope.position.x*.06:0;
  const boxes=[];
  let refereeBox=null;
  if(view==='court'){refereeBox=place(referee.tag,referee.root.position.x,2.4,referee.root.position.z);if(refereeBox)boxes.push(refereeBox);}else setStyle(referee.tag,'visibility','hidden');
  // Fans cheer harder while pulling and on the result; instance matrices update at ~30Hz.
  if(now-lastFans>33){lastFans=now;updateFans(t,phase,still);}
  // Low-angle pull shots project the waiting-area anchor onto the rope, so signs only show in lobby shots and the overhead.
  const showSigns=!faceFocus&&(phase!=='pull'||plan.kind==='overhead');
  for(const side of ['red','blue']){if(!showSigns){setStyle(waitingSigns[side].label,'visibility','hidden');continue;}const r=place(waitingSigns[side].label,(side==='red'?-1:1)*5.0,2.3,-3.5,-50,-50,.9);if(r)boxes.push(r);}
  const lead={},lastGrips={red:null,blue:null};
  const budget=standBudget(characters.values());
  for(const c of characters.values()){const i=c.index, side=c.side, sign=side==='red'?-1:1, s=c.root.scale.x;let baseY;
   if(reduced.matches&&c.route){c.groundPosition={...c.destination};c.route=null;}
   const travel=c.route?advanceRoute(c.route,state?.paused?0:dt):null;
   if(travel){c.groundPosition={x:travel.x,y:travel.y,z:travel.z};if(travel.done)c.route=null;}
   if(c.retiring&&(!c.route||travel?.done)){characters.delete(c.id);disposeCharacter(c);continue;}
   const travelling=!!c.route,ground=c.groundPosition||c.destination;
   if(!travelling)c.leavingCourt=false;
   c.root.visible=standVisible(c,budget,focusedCharacter===c,window.donorGlow?.remaining(c.uid)>0);
   if(!c.root.visible){setStyle(c.tag,'visibility','hidden');continue;}
   const scale=c.root.scale.x+(c.targetScale-c.root.scale.x)*(1-Math.exp(-8*Math.max(0,dt)));c.root.scale.setScalar(scale);
   c.floorY=ground.y;baseY=ground.y+scale*.27;
   c.root.position.set(ground.x+(c.role==='active'&&!travelling?rope.position.x:0),baseY,ground.z);
   if(!c.waiting&&i===0)lead[side]=c;
   const {detailOn,farOn}=detailBands(c.root.position.distanceToSquared(camera.position));
   if(c.detailOn!==detailOn||c.farOn!==farOn){for(const part of c.lodParts)part.visible=detailVisible(part.userData,detailOn,farOn);c.detailOn=detailOn;c.farOn=farOn;}
   // Tags anchor to the rest pose so dancing and bouncing never jitter the layout.
   c.anchor=[c.root.position.x,baseY+(HEAD_Y+.66)*s,c.root.position.z];
   const win=winner===side, lose=!!winner&&!win;
   const handlingRope=!travelling&&c.role==='active'&&((phase!=='result'&&phase!=='pull'&&['reach','lift','held'].includes(ropeHandoff.stage))||ropeHandoff.stage==='release');
   const targetPose=travelling?(travel.moving?runPose(t+(i%6)*.11):characterPose({phase:'lobby'})):handlingRope?ropePickupPose(ropeHandoff):c.role==='ready'?characterPose({phase:'lobby'}):c.waiting&&c.away?seatedPose({id:c.id,time:t,reducedMotion:reduced.matches}):characterPose({phase,waiting:c.waiting,id:c.id,time:t,pullElapsed:(now-pullStarted)/1000,reducedMotion:reduced.matches,outcome:win?'win':lose?'lose':'draw',resultElapsed});
   // Pickup already has an eased shared trajectory: keep body and rope in sync.
   const pose=state?.paused&&c.motionPose?c.motionPose:blendCharacterPose(c.motionPose,targetPose,dt,{snap:reduced.matches||handlingRope&&ropeHandoff.stage!=='release',plantFeet:!travelling&&!c.waiting&&(phase==='pull'||phase==='countdown'||handlingRope),plantDanceFeet:!handlingRope&&!travelling&&c.role==='active'&&(win||lose)});c.motionPose=pose;
   let y=(pose.bounce-pose.bodyDrop)*s;
   if(moving&&c.drop&&(c.waiting||pose.handReach===0))y+=Math.max(0,1-(now-c.joined)/700)*3;
   // Signs: +rotation.z swings a hanging limb toward +x and tips an upright torso toward -x.
   // "-sign*" therefore points limbs toward rope center and tips the torso away from it.
   c.root.position.y=baseY+y;c.root.rotation.z=0;
   // Stand fans are scaled down, so their shins are shorter than the seat: rest the seat of the shorts on the seat top (feet dangle).
   if(pose.style==='seated'&&c.waiting&&!travelling)c.root.position.y=c.floorY+SEAT_TOP-(HIP-.1)*s;
   if(travelling){c.root.rotation.y=travel.yaw;}else if(c.waiting||win){c.root.position.x+=pose.step*s;c.root.rotation.y=pose.spin;}else c.root.rotation.y=-sign*pose.turn;
   if(faceFocus&&c===focusedCharacter&&(c.waiting||win))c.root.rotation.y=0;
   const strain=phase==='pull' ? teamStrain(state?.score,side) : .5;
   const emoting=!handlingRope&&(travelling||c.waiting||win||lose);
   const drag=phase==='pull'&&!still?teamDrag(side,ropeVelocity):0;
   // Yanked toward the centre tips the torso forward; heaving home leans it further back.
   const lean=emoting?pose.hips:-sign*pose.leanBack-sign*(strain-.5)*.22*pose.crouch+sign*drag*.24*pose.crouch;
   // Pivot the torso about the hip so leaning back never detaches it from the legs.
   c.body.rotation.z=lean;c.body.position.set(HIP*Math.sin(lean),HIP*(1-Math.cos(lean)),0);
   const bodyPitch=pose.bodyPitch||0;c.body.rotation.x=bodyPitch;
   c.body.position.y=HIP*(1-Math.cos(bodyPitch)*Math.cos(lean));c.body.position.z=-HIP*Math.sin(bodyPitch)*Math.cos(lean);
   c.headGroup.rotation.z=emoting?pose.head:sign*pose.headTilt;
   const freeHead=emoting||handlingRope,headPosition={x:c.root.position.x,y:c.root.position.y+HEAD_Y*s,z:c.root.position.z};
   c.headGroup.rotation.y=easeHeadAngle(c.headGroup.rotation.y,freeHead?0:faceYaw(camera.position,c.root.position,c.root.rotation.y),dt,still);
   c.headGroup.rotation.x=easeHeadAngle(c.headGroup.rotation.x,freeHead?pose.headNod:facePitch(camera.position,headPosition),dt,still);
   // Result poses are already smoothed as one rig; a second limb filter dulls jumps.
   const grip=!travelling&&!c.waiting&&(phase==='pull'||handlingRope&&ropeHandoff.reach>0),jointBlend=state?.paused?0:(reduced.matches||win||lose||handlingRope)?1:1-Math.exp(-14*Math.max(0,Math.min(.1,dt)));
   const aim=(bone,x,y,z,alpha)=>{limbQuaternion.setFromEuler(limbEuler.set(x,y,z));bone.quaternion.slerp(limbQuaternion,alpha);};
   if(!grip){
    c.arms.forEach((arm,j)=>aim(arm,emoting?pose.armPitch[j]:0,emoting?pose.armYaw[j]:0,emoting?pose.arms[j]:0,jointBlend));
    c.elbows.forEach((elbow,j)=>aim(elbow,emoting?pose.elbowPitch[j]:0,emoting?pose.elbowTwist[j]:0,emoting?pose.elbows[j]:0,jointBlend));
   }
   if(grip)gripRope(c,ropeY,ROPE_Z,{dt:state?.paused?0:dt,still:reduced.matches,reach:handlingRope?ropeHandoff.reach:1});
   if(grip){c.root.updateMatrixWorld(true);c.root.getWorldQuaternion(rootInverse).invert();if(!lastGrips[side]||c.index>lastGrips[side].index)lastGrips[side]=c;}
   c.grips.forEach((wrap,j)=>{wrap.visible=grip;if(!grip)return;
    const shoulder=c.arms[j].getWorldPosition(gripPoint);
    wrap.visible=!handlingRope||ropeHandoff.reach>.95;wrap.position.copy(c.root.worldToLocal(shoulder.set(shoulder.x,ropeY,ROPE_Z)));
    wrap.quaternion.copy(rootInverse).multiply(gripRotation);
   });
   c.legs.forEach((leg,j)=>{if(emoting)aim(leg,pose.legPitch?.[j]||0,0,pose.legs[j],jointBlend);else leg.rotation.set(0,0,-sign*pose.thighReach);});
   c.knees.forEach((knee,j)=>{if(emoting)aim(knee,pose.kneePitch?.[j]||0,0,pose.knees[j],jointBlend);else knee.rotation.set(0,0,sign*pose.kneeBend);});
   if(phase==='pull'){c.pullFace=pullExpression(c.pullFace,{id:c.id,time:t,strain,drag,dt:state?.paused?0:dt,still:reduced.matches});}else c.pullFace=null;
   const sweating=phase==='pull'&&!c.waiting&&c.role==='active'?sweatLevel({pullElapsed:(now-pullStarted)/1000,strain,secondsLeft:state?.overtime?Infinity:secondsLeft}):0;
   c.sweat.forEach((d,k)=>{const drop=detailOn&&!reduced.matches?sweatDrop(k,{time:t,level:sweating,seed:c.sweatSeed}):null;d.visible=!!drop;if(!drop)return;const [x,y0]=SWEAT_PATHS[k],y=y0-.34*drop.fall,z=.43*Math.sqrt(Math.max(0,1-(x/.62)**2-(y/.53)**2))+.03,r=.07*drop.opacity;d.position.set(x,y,z);d.scale.set(r,r*1.45,r*.8);});
   // Benched for silence: dozing on the seat until they comment or tap again.
   const expression=c.waiting&&c.away&&!travelling?'squint':phase==='pull'?c.pullFace.expression:winner?resultExpression({id:c.id,time:resultElapsed,win,style:pose.expression}):'happy';if(c.face.material!==faceMats[expression])c.face.material=faceMats[expression];
   // Pullers' heads are obstacles so tags never sit on another puller's face.
   if(!c.waiting){const h=c.root.position, hy=h.y+HEAD_Y*s, r=.56*s, b=screenBounds([[h.x-r,hy-r,h.z],[h.x+r,hy+r,h.z]]);if(b)boxes.push({...b,owner:c.id});}
  }
  // The outer grip of each last puller is the end of the taut section.
  // After release, retain its last span while the shared clock lowers the rope.
  for(const side of ['red','blue']){const c=lastGrips[side];if(!c)continue;let edge=side==='red'?Infinity:-Infinity;
   for(const wrap of c.grips){wrap.getWorldPosition(gripPoint);edge=side==='red'?Math.min(edge,gripPoint.x):Math.max(edge,gripPoint.x);}
   if(Number.isFinite(edge)){if(side==='red')ropeLeft=edge-rope.position.x-.10;else ropeRight=edge-rope.position.x+.10;}
  }
  ropeCable.update({left:ropeLeft,right:ropeRight,height:ropeY});
  const nowMs=Date.now(), glowApi=window.donorGlow, remaining=id=>id&&glowApi?glowApi.remaining(id,nowMs):0;
  const captainShown={red:false,blue:false};
  for(const side of ['red','blue']){const c=lead[side], cap=captains[side];
   if(faceFocus){setStyle(cap.el,'visibility','hidden');continue;}
   const cls=`captain-tag ${side}${cap.uid&&remaining(cap.uid)>0?' donor':''}`;if(cap.el.className!==cls){cap.el.className=cls;cap.el._size=null;}
   if(c){const p=project(...c.anchor), size=sizeOf(cap.el), off=p.off||Math.abs(p.nx)>1.05||Math.abs(p.ny)>1.05||!size;setStyle(cap.el,'visibility',off?'hidden':'');captainShown[side]=!off&&!cap.el.hidden;
    if(!off){const r=captainRect(p,size,side,3,sizeOf(c.tag)?.[1]||TAG_ROW);setStyle(cap.el,'transform',`translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px)`);boxes.push({...r,h:r.h+CAPTAIN_ARROW});
     // The wide shot brings both cards down to the referee: the generic label yields.
     if(refereeBox&&rectsOverlap(refereeBox,r,3)){setStyle(referee.tag,'visibility','hidden');boxes.splice(boxes.indexOf(refereeBox),1);refereeBox=null;}}}}
  // Referee body (arms/flags included) and the rope stay readable under every tag.
  {const r=referee.root.position, b=screenBounds([[r.x-1,r.y-.2,r.z],[r.x+1,r.y+1.9,r.z]]);if(b)boxes.push(b);}
  const ropeLine=[[rope.position.x+ropeLeft,ropeY,ROPE_Z],[rope.position.x+ropeRight,ropeY,ROPE_Z]].map(q=>project(...q)), segments=ropeLine.some(q=>q.off)?[]:[{a:[ropeLine[0].x,ropeLine[0].y],b:[ropeLine[1].x,ropeLine[1].y],pad:8}];
  // Prioritize current speech over name tags. The card follows the animated head;
  // a small dock still shows speakers outside the camera or visible queue cap.
  const chatEntries=(window.characterComments?.entries(nowMs)||[]).slice(0,12),chatIds=new Set(chatEntries.map(e=>e.uniqueId)),chatItems=[],chatSpeakers=new Map();
  if(chatEntries.length)for(const c of characters.values())if(c.commentId&&!c.retiring&&c.root.visible)chatSpeakers.set(c.commentId,c);
  for(const [id,node] of commentNodes)if(!chatIds.has(id)){node.el.remove();commentNodes.delete(id);}
  for(const entry of chatEntries){
   let node=commentNodes.get(entry.uniqueId);
   if(!node){const el=document.createElement('div'),name=document.createElement('b'),body=document.createElement('span');el.className=`comment-bubble ${entry.team}`;el.append(name,body);host.append(el);node={el,name,body};commentNodes.set(entry.uniqueId,node);}
   const {el}=node,key=Number(entry.simulated)+entry.nickname+'\n'+entry.text;
   if(node.key!==key){node.name.textContent=(entry.simulated?'[Giả lập] ':'')+entry.nickname;node.body.textContent=entry.text;node.key=key;el._size=null;}
   node.team=entry.team;node.size=sizeOf(el);node.anchor=null;
   const speaker=chatSpeakers.get(entry.uniqueId);
   if(speaker&&node.size){speaker.headGroup.getWorldPosition(commentHead);commentHead.y+=.64*speaker.root.scale.x;const p=project(commentHead.x,commentHead.y,commentHead.z);
    if(!p.off&&p.x>0&&p.x<viewW&&p.y>0&&p.y<viewH){node.anchor=p;chatItems.push({id:entry.uniqueId,owner:speaker.id,x:p.x,y:p.y-10,w:node.size[0],h:node.size[1]});}
   }
  }
  // Bubbles climb over the captain cards like name tags do and lean sideways where heads overlap on screen,
  // so a speaker stays bubbled instead of docking aside.
  const chatLayout=layoutTags(chatItems,{width:viewW,height:viewH,boxes,segments,gap:6,rows:4,shifts:[0,-.5,.5]});let dockOffset=chatCover+(phase==='result'?230:24),docked=0;
  for(const entry of chatEntries){const node=commentNodes.get(entry.uniqueId);let rect=chatLayout.get(entry.uniqueId),detached=false;
   if(!rect&&node.size&&docked<3){const [w,h]=node.size,y=viewH-dockOffset-h;if(y>120){rect={x:Math.max(8,viewW-w-12),y,w,h};dockOffset+=h+12;docked++;detached=true;}}
   const cls=`comment-bubble ${node.team}${detached?' detached':''}`;if(node.el.className!==cls)node.el.className=cls;
   setStyle(node.el,'visibility',rect?'visible':'hidden');
   if(rect){setStyle(node.el,'transform',`translate(${rect.x.toFixed(1)}px,${rect.y.toFixed(1)}px)`);boxes.push(rect);}
  }
  // ---------- Name tags + donor glow (only the stable uniqueId is matched, never the nickname) ----------
  const entries=[], donors=[];
  for(const c of characters.values()){if(!c.root.visible){setGlow(c,false);continue;}const left=remaining(c.uid);setGlow(c,left>0);if(left>0)donors.push({c,left});
   const cls=`name-tag ${c.side}${c.waiting?' waiting':''}${c.role==='ready'?' ready':''}${left>0?' donor':''}`;if(c.tag.className!==cls){c.tag.className=cls;c.tag._size=null;}
   if(!c.retiring)entries.push({id:c.id,side:c.side,role:c.role,waiting:c.waiting,index:c.index,donor:left,captained:captainShown[c.side],c});}
  const items=[];
  // Close-ups still name pullers in frame; names rotate so every viewer's turns up.
  const shotEntries=faceFocus?entries.filter(e=>e.c===focusedCharacter||!e.waiting&&e.role==='active'):plan.kind==='queue'?entries.filter(e=>e.role==='ready'&&e.side===view):entries;
  for(const e of tagOrder(rotateTags(shotEntries,t,{keep:e=>e.c===focusedCharacter||e.index===0&&e.captained===false&&!e.waiting}))){const p=project(...e.c.anchor), size=sizeOf(e.c.tag);if(!p.off&&size)items.push({id:e.id,x:p.x,y:p.y,w:size[0],h:size[1],must:!e.waiting&&e.role==='active'||e.c===focusedCharacter});}
  // Close-ups pack heads under the signs and captain card; extra rows keep every puller named.
  const layout=layoutTags(items,{width:viewW,height:viewH,boxes,segments,rows:4});
  for(const c of characters.values()){const r=layout.get(c.id);setStyle(c.tag,'visibility',r?'':'hidden');if(r)setStyle(c.tag,'transform',`translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px)`);}
  for(const g of glowMats.values())g.emissiveIntensity=still?.6:.5+.15*Math.sin(t*Math.PI*1.6);
  donors.sort((a,b)=>b.left-a.left);
  halos.forEach((h,k)=>{const d=donors[k];h.sprite.visible=h.ring.visible=!!d;if(!d)return;const c=d.c, s=c.root.scale.x, level=glowLevel(d.left,t,still), p=c.root.position;
   h.sprite.position.set(p.x,p.y+.95*s,p.z-.3);h.sprite.scale.setScalar(3.6*s);h.sprite.material.opacity=level;
   h.ring.position.set(p.x,c.floorY+.03,p.z);h.ring.scale.setScalar(1.25*s);h.ring.material.opacity=.85*level;});
  renderer.render(scene,camera);perf.frames++;perf.lastCpuMs=performance.now()-cpuStart;perf.cpuMs+=perf.lastCpuMs;
 }
 requestAnimationFrame(frame);
 addEventListener('resize',()=>{viewW=host.clientWidth;viewH=host.clientHeight;renderer.setSize(viewW,viewH);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();});
 window.stage3dDebug={ropeProfile:ropeCable.profile,perf,renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER),scene,characters,renderInfo:renderer.info,
  ropeHandoff:()=>({...ropeHandoff}),
  cameraShot:()=>activeCameraPlan,
  glowing:()=>[...characters.values()].filter(c=>c.glowing).map(c=>c.uid), halos:()=>halos.filter(h=>h.sprite.visible).length,
  tags:()=>[...characters.values()].filter(c=>c.tag._visibility!=='hidden').map(c=>({id:c.uid,text:c.tag.textContent,donor:/\bdonor\b/.test(c.tag.className)}))};
} catch(error){fallback.hidden=false;console.error('WebGL unavailable:',error);}
