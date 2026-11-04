// Pure animation parameters. Angles are radians; crouch is normalized 0..1.
// Pull elapsed is seconds since entering pull, not the round's absolute clock.
// All "toward/away" magnitudes are positive and relative to rope center; the
// renderer applies the team sign. leanBack tilts the torso (about the hip) away
// from center. thighReach swings thighs toward center so feet brace ahead of the
// hips; kneeBend flexes the shin back from the thigh. handReach is the absolute
// upper-arm angle from hanging toward center (PI/2 = horizontal); elbowBend lifts
// the forearm further. bodyDrop is how far the hip sinks (character-local units)
// so feet stay planted. turn is a yaw toward center for a 3/4 broadcast read.
// Dance rotations are in the renderer's local Z plane; spin is yaw; step is a
// local x side-step.
export const LEG_SEGMENT = 0.28; // thigh and shin length in buildCharacter
export function blendCharacterPose(current,target,dt,{snap=false,plantFeet=false,plantDanceFeet=false}={}){
 if(!current||snap)return Object.fromEntries(Object.entries(target).map(([key,value])=>[key,Array.isArray(value)?value.slice():value]));
 const alpha=1-Math.exp(-9*Math.max(0,Math.min(.1,dt))),result={...target};
 for(const [key,value] of Object.entries(target)){
  if(Array.isArray(value))result[key]=value.map((angle,i)=>{const previous=current[key]?.[i]??angle,delta=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));return previous+delta*alpha;});
  else if(typeof value==='number'){
   const previous=current[key]??value,delta=key==='spin'?Math.atan2(Math.sin(value-previous),Math.cos(value-previous)):value-previous;
   result[key]=previous+delta*alpha;
  }
 }
 if(plantFeet)result.bodyDrop=LEG_SEGMENT*(2-Math.cos(result.thighReach)-Math.cos(result.thighReach-result.kneeBend));
 if(plantDanceFeet)result.bodyDrop=danceBodyDrop(result);
 return result;
}
// Local attachment points keep the rounded connectors on the animated pivots.
export function characterJointAnchors() {
  return {neck:[0,1.2,0],shoulder:[0,0,0],elbow:[0,0,0],hip:[0,0,0],knee:[0,0,0]};
}

const neutral = () => ({ crouch: 0, bodyDrop: 0, leanBack: 0, thighReach: 0, kneeBend: 0,
  elbowBend: 0, handReach: 0, headTilt: 0, turn: 0, bounce: 0, hips: 0, head: 0, spin: 0, step: 0, bodyPitch:0,
  arms: [0, 0], elbows: [0, 0], legs: [0, 0], knees: [0, 0],legPitch:[0,0],kneePitch:[0,0],armPitch:[0,0],armYaw:[0,0],elbowPitch:[0,0],elbowTwist:[0,0],headNod:0 });

// Benched for silence: sit on the stand seat, hands on knees, dozing. Thighs are
// level and shins vertical, so the hip sinks onto a seat one shin-length high.
export function seatedPose({ id = '', time = 0, reducedMotion = false } = {}) {
  const pose = neutral(), thigh = 1.5, seed = hashId(id), t = Number.isFinite(time) ? time : 0;
  Object.assign(pose, { style: 'seated', legPitch: [-thigh, -thigh], kneePitch: [thigh, thigh], legs: [-0.07, 0.07],
    bodyDrop: LEG_SEGMENT * (1 - Math.cos(thigh)), bodyPitch: 0.1,
    armPitch: [-0.5, -0.5], elbowPitch: [-0.55, -0.55], arms: [-0.12, 0.12] });
  pose.headNod = 0.26 + (reducedMotion ? 0 : 0.06 * Math.sin(t * 1.2 + (seed % 628) / 100));
  return pose;
}

function hashId(id) {
  let hash = 2166136261;
  for (const ch of String(id)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return hash >>> 0;
}

export const DANCE_STYLES = ['wave', 'disco', 'shuffle', 'robot', 'clap', 'spin', 'fan-dance'];
const STYLE_SECONDS = 6;

// Each move returns limb rotations for one beat phase t (radians of the beat).
const moves = {
  // Múa quạt: circular forearm sweeps fold across the chest then open outward.
  // Opposite depth offsets let hands pass naturally without crossing the torso.
  'fan-dance':t=>({arms:[-.45-.85*Math.sin(t),.45+.85*Math.sin(t+.5)],elbows:[1.8+.35*Math.cos(t),-1.8-.35*Math.cos(t+.5)],armPitch:[-.25,-.25],armYaw:[.18*Math.sin(t+.6),-.18*Math.sin(t+.6)],elbowPitch:[1.0+.12*Math.cos(t),1.0-.12*Math.cos(t)],elbowTwist:[.3*Math.sin(t),-.3*Math.sin(t+.5)],hips:Math.sin(t*.5)*.075,head:-Math.sin(t*.5)*.05,legs:[-.055+Math.sin(t)*.045,.055+Math.sin(t)*.045],knees:[.10+.06*Math.sin(t),-.10+.06*Math.sin(t)],bounce:(1-Math.cos(t*2))*.012,step:Math.sin(t*.5)*.055}),
  // Arms ripple overhead, hips sway.
  wave: (t) => ({ arms: [-2.4 + Math.sin(t) * 0.5, 2.4 + Math.sin(t + 1.2) * 0.5], elbows: [Math.sin(t + 0.6) * 0.6, Math.sin(t + 1.8) * 0.6],
    hips: Math.sin(t) * 0.16, legs: [0.1, -0.1], knees: [0, 0], bounce: Math.abs(Math.sin(t)) * 0.06 }),
  // Point up across the body, then down: classic disco.
  disco: (t) => { const up = Math.sin(t) > 0; return { arms: up ? [-2.7, 0.3] : [-0.3, 0.9], elbows: [0, up ? 0 : -0.5],
    hips: (up ? 1 : -1) * 0.18, legs: up ? [0.25, 0] : [0, -0.25], knees: up ? [-0.4, 0] : [0, 0.4], bounce: Math.abs(Math.sin(t)) * 0.08 }; },
  // Fast feet, arms pumping low.
  shuffle: (t) => ({ arms: [-0.5 - Math.sin(t * 2) * 0.4, 0.5 - Math.sin(t * 2) * 0.4], elbows: [-1.2, 1.2],
    hips: Math.sin(t * 2) * 0.08, legs: [Math.sin(t * 2) * 0.4, -Math.sin(t * 2) * 0.4], knees: [-Math.max(0, Math.sin(t * 2)) * 0.6, Math.max(0, -Math.sin(t * 2)) * 0.6],
    bounce: Math.abs(Math.sin(t * 2)) * 0.1, step: Math.sin(t) * 0.18 }),
  // Stepped 90-degree arm hits.
  robot: (t) => { const k = Math.floor((((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4;
    return { arms: [[-1.57, -0.2, -1.57, -2.9][k], [0.2, 1.57, 2.9, 1.57][k]], elbows: [[-1.57, 0, 0, 1.57][k], [0, 1.57, -1.57, 0][k]],
      hips: 0, head: [0.2, -0.2, 0.2, -0.2][k], legs: [0, 0], knees: [0, 0], bounce: 0 }; },
  // Clap overhead on the beat with a jump.
  clap: (t) => { const c = (Math.sin(t * 2) + 1) / 2; return { arms: [-2.2 - c * 0.7, 2.2 + c * 0.7], elbows: [-0.4 * (1 - c), 0.4 * (1 - c)],
    hips: 0, legs: [-0.12, 0.12], knees: [0, 0], bounce: Math.max(0, Math.sin(t * 2)) * 0.18 }; },
  // Pirouette with arms out.
  spin: (t) => ({ arms: [-1.45, 1.45], elbows: [Math.sin(t) * 0.3, Math.sin(t) * 0.3], hips: 0, legs: [0.08, -0.08], knees: [0, 0],
    bounce: Math.abs(Math.sin(t)) * 0.05, spin: t * 0.5 }),
};

// Bounded travel and yaw keep every dancer in their own lineup slot.
export const WIN_DANCE_STYLES = ['fan-dance','shuffle','victory-jump','cheeky-point'];
export const LOSS_STYLES = ['sad','cry','speechless'];
// Vertical reach of the two-bone legs (Euler XYZ), including depth kicks.
// The longest leg touches the floor; the other foot can lift during a step.
export function danceBodyDrop(pose){
 const reach=pose.legs.map((z,j)=>{
  const x=pose.legPitch[j],kx=pose.kneePitch[j],kz=pose.knees[j];
  return Math.cos(x)*Math.cos(z)+Math.cos(x)*Math.cos(z)*Math.cos(kx)*Math.cos(kz)
   -Math.cos(x)*Math.sin(z)*Math.sin(kz)-Math.sin(x)*Math.sin(kx)*Math.cos(kz);
 });
 return LEG_SEGMENT*(2-Math.max(...reach));
}
function celebration(style,seconds,seed){
 const beat=Math.max(0,seconds)*2+(seed%4)*.12,t=beat*Math.PI;
 const pulse=Math.sin(t),sway=Math.sin(t*.5),cycle=(beat/2)%1;
 // Compress before launch and on landing, with a ballistic arc in between.
 const flight=Math.max(0,Math.min(1,(cycle-.18)/.64));
 const air=4*flight*(1-flight),dip=cycle<.18?Math.sin(cycle/.18*Math.PI):cycle>.82?Math.sin((cycle-.82)/.18*Math.PI):0;
 const jump=style==='victory-jump',bend=.10+.32*dip+.12*air;
 const p={...neutral(),style,legs:[-.08-bend,.08+bend],knees:[bend*2,-bend*2],
  hips:.14*sway,head:-.12*Math.sin(t*.5-.3),headNod:.07*Math.sin(t-.35),
  spin:.16*sway,step:.07*sway,bounce:air*(jump?.38:.10)};
 if(style==='fan-dance'){
  // Open, scoop across the chest, roll the wrists, then sweep outward again.
  p.arms=[-.9-.65*pulse,.9+.65*Math.sin(t+.7)];
  p.elbows=[1.35+.65*Math.cos(t),-1.35-.65*Math.cos(t+.7)];
  p.armPitch=[-.65-.3*Math.cos(t),-.65+.3*Math.cos(t+.7)];
  p.armYaw=[.28*Math.sin(t+.5),-.28*Math.sin(t+1.2)];
  p.elbowPitch=[.85+.35*pulse,.85-.35*pulse];
  p.elbowTwist=[.65*Math.sin(t+.8),-.65*Math.sin(t+1.5)];
 }else if(style==='shuffle'){
  p.legPitch=[.55*pulse,-.55*pulse];p.kneePitch=[-.65*Math.max(0,pulse),-.65*Math.max(0,-pulse)];
  p.legs=[-.12-.12*pulse,.12-.12*pulse];p.knees=[.2,-.2];
  p.arms=[-.55-.55*pulse,.55-.55*pulse];p.elbows=[-.85, .85];
  p.armPitch=[-.3+.4*pulse,-.3-.4*pulse];p.step=.10*sway;p.bounce=air*.07;
 }else if(jump){
  p.arms=[-.55-air*2.1,.55+air*2.1];p.elbows=[-.4*(1-air),.4*(1-air)];
  p.armPitch=[-.25,-.25];p.legPitch=[.18*air,-.18*air];
 }else{
  const point=(1+Math.sin(t*.5))*.5;
  p.arms=[-.5-1.95*point,.5+1.95*(1-point)];p.elbows=[-.7*(1-point),.7*point];
  p.armPitch=[-.25,-.25];p.elbowTwist=[.3*pulse,-.3*pulse];p.hips=.20*sway;
 }
 p.bodyDrop=danceBodyDrop(p);
 return p;
}

function defeat(style,seconds){
 const t=Math.max(0,seconds),breath=Math.sin(t*2.4),sob=Math.sin(t*9);
 const p={...neutral(),style,expression:style,legs:[-.18,.18],knees:[.30,-.30],headNod:.28};
 if(style==='cry'){
  p.arms=[-.28,.28];p.armPitch=[-1.05,-1.05];p.elbowPitch=[-1.15,-1.15];
  p.elbows=[-.12,.12];p.elbowTwist=[.12*sob,-.12*sob];
  p.hips=.025*sob;p.headNod=.24+.045*sob;
 }else if(style==='sad'){
  p.arms=[-.12,.12];p.armPitch=[.12,.12];p.elbows=[-.08,.08];
  p.headNod=.40+.035*breath;p.head=.08;p.hips=.035*breath;
 }else{
  p.arms=[-.22,.22];p.elbows=[-.18,.18];p.headNod=.04;
  // A long blank stare, with only a tiny delayed head shake.
  p.head=t>2?.035*Math.sin((t-2)*1.5):0;
 }
 p.bodyDrop=danceBodyDrop(p);
 return p;
}

/**
 * Inputs: phase (lobby/waiting/countdown/pull/result), waiting (spectator),
 * id (stable unique participant ID), time (seconds), pullElapsed (seconds
 * since pull began), reducedMotion. Waiting takes precedence over phase.
 * Countdown: active players stand upright with hands on the rope.
 * Pull: smooth 0.6s drop into a low, back-leaning brace (feet ahead of hips).
 * Other active phases stand neutral; renderer may layer a result expression.
 * Reduced motion freezes dancers at neutral and immediately selects the final
 * static pull pose.
 */
export function characterPose({ phase, waiting = false, id = '', time = 0,
  pullElapsed = 0, reducedMotion = false, outcome = 'draw', resultElapsed = time } = {}) {
  const pose = neutral();
  const elapsed=Number.isFinite(resultElapsed)?Math.max(0,resultElapsed):0;
  if (phase === 'result' && !waiting && outcome === 'lose') {
    const style=LOSS_STYLES[hashId(id)%LOSS_STYLES.length];
    Object.assign(pose,defeat(style,reducedMotion?1:elapsed));
    return pose;
  }
  if(phase==='result'&&!waiting&&outcome==='win'){
    if(reducedMotion)return pose;
    const seed=hashId(id),style=seed%3===0?'fan-dance':WIN_DANCE_STYLES[1+Math.floor(seed/3)%3];
    Object.assign(pose,celebration(style,elapsed,seed));
    // Release the rope and gather before the first hit, rather than popping into dance.
    const intro=Math.min(1,elapsed/.55),ease=intro*intro*(3-2*intro);
    for(const [key,value] of Object.entries(pose)){
      if(Array.isArray(value))pose[key]=value.map(x=>x*ease);
      else if(typeof value==='number')pose[key]=value*ease;
    }
    return pose;
  }
  if (waiting) {
    if (reducedMotion) return pose;
    const seed = hashId(id), now = Number.isFinite(time) ? time : 0;
    // Each dancer changes move every few seconds, offset so the crowd never switches in unison.
    const slot = Math.floor((now + (seed % 600) / 100) / STYLE_SECONDS);
    const winner=phase==='result'&&!waiting&&outcome==='win';
    const style = winner&&seed%3===0?'fan-dance':DANCE_STYLES[(seed+slot*5)%6];
    const beat = now * (2.6 + (seed % 7) * 0.15) + (seed % 997) / 997 * Math.PI * 2;
    const m = moves[style](beat);
    Object.assign(pose, m);
    pose.head = (m.head ?? -pose.hips * 0.7) + Math.sin(beat * 2) * 0.05;
    pose.style = style;
    return pose;
  }
  if (phase === 'countdown') Object.assign(pose, { handReach: 0.55, elbowBend: 0.2 });
  if (phase === 'pull') {
    const x = reducedMotion ? 1 : Math.min(1, Math.max(0, (Number.isFinite(pullElapsed) ? pullElapsed : 0) / 0.6));
    const p = x * x * (3 - 2 * x);
    const thighReach = 1.2 * p, kneeBend = 0.95 * p;
    Object.assign(pose, { crouch: p, leanBack: 0.72 * p, thighReach, kneeBend,
      bodyDrop: LEG_SEGMENT * (2 - Math.cos(thighReach) - Math.cos(thighReach - kneeBend)),
      handReach: 0.55 + 0.8 * p, elbowBend: 0.2 + 0.15 * p, headTilt: 0.45 * p, turn: 0.38 * p });
  }
  return pose;
}
