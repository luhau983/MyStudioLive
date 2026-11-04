import test from 'node:test';
import assert from 'node:assert/strict';
import { characterPose, DANCE_STYLES, LEG_SEGMENT,blendCharacterPose } from '../stage-character-poses.mjs';

test('active competitors stand still throughout countdown', () => {
  assert.deepEqual(characterPose({ phase: 'countdown', time: 1 }), characterPose({ phase: 'countdown', time: 20 }));
  assert.equal(characterPose({ phase: 'countdown' }).crouch, 0);
});


test('pull posture transitions smoothly from standing to low leaning crouch', () => {
  const start = characterPose({ phase: 'pull', pullElapsed: 0 });
  const middle = characterPose({ phase: 'pull', pullElapsed: 0.3 });
  const end = characterPose({ phase: 'pull', pullElapsed: 2 });
  assert.equal(start.crouch, 0);
  assert.ok(middle.crouch > 0 && middle.crouch < end.crouch);
  assert.ok(end.crouch > 0.5 && end.leanBack > 0 && end.kneeBend > 0 && end.elbowBend > 0);
  assert.ok(end.handReach > 0);
});

test('waiting dancers have stable identities and distinct animated moves', () => {
  const pose = (id, time) => characterPose({ waiting: true, id, time });
  assert.deepEqual(pose('one', 1), pose('one', 1));
  assert.notDeepEqual(pose('one', 1), pose('one', 2));
  assert.notDeepEqual(pose('one', 1), pose('two', 1));
});

test('reduced motion freezes waiting dancers and immediately sets pull posture', () => {
  const pose = (time) => characterPose({ waiting: true, id: 'one', time, reducedMotion: true });
  assert.deepEqual(pose(1), pose(20));
  assert.equal(characterPose({ phase: 'pull', pullElapsed: 0, reducedMotion: true }).crouch, 1);
});

test('active lobby and result use neutral standing pose', () => {
  for (const phase of ['lobby', 'waiting', 'result', undefined]) {
    assert.equal(characterPose({ phase, time: 10 }).crouch, 0);
    assert.equal(characterPose({ phase, time: 10 }).leanBack, 0);
  }
});

test('countdown holds the rope upright and identically every frame', () => {
  const a = characterPose({ phase: 'countdown', time: 0 }), b = characterPose({ phase: 'countdown', time: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.handReach > 0 && a.leanBack === 0 && a.bodyDrop === 0 && a.thighReach === 0);
});

test('pull brace keeps feet planted: hip drop matches leg geometry and feet reach ahead', () => {
  const end = characterPose({ phase: 'pull', pullElapsed: 5 });
  const shin = end.thighReach - end.kneeBend;
  assert.ok(Math.abs(end.bodyDrop - LEG_SEGMENT * (2 - Math.cos(end.thighReach) - Math.cos(shin))) < 1e-9);
  assert.ok(end.thighReach > end.kneeBend, 'shin still angles toward center, so feet brace ahead of hips');
  assert.ok(end.leanBack >= 0.6 && end.leanBack <= 0.9, 'clearly leaning back without lying flat');
  assert.ok(end.handReach > 1 && end.handReach < Math.PI / 2 + 0.2, 'arms reach forward near rope height');
});

test('waiting crowd freestyles: many styles at once and each dancer changes moves over time', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `red:sim_${i + 1}`);
  const styles = new Set(ids.map(id => characterPose({ waiting: true, id, time: 3 }).style));
  assert.ok(styles.size >= 4, `only ${[...styles]} in use`);
  for (const s of DANCE_STYLES.filter(s=>s!=='fan-dance')) assert.ok(ids.some(id => Array.from({ length: 10 }, (_, k) => characterPose({ waiting: true, id, time: k * 6 }).style).includes(s)), s);
  const over = new Set(Array.from({ length: 10 }, (_, k) => characterPose({ waiting: true, id: ids[0], time: k * 6 }).style));
  assert.ok(over.size >= 2);
  for (const id of ids) for (const t of [0, 1.3, 9.7]) {
    const p = characterPose({ waiting: true, id, time: t });
    for (const v of [...p.arms, ...p.elbows, ...p.legs, ...p.knees, p.hips, p.head, p.bounce, p.step]) assert.ok(Number.isFinite(v));
  }
});

test('reduced motion waiting pose has no spin, step or bounce', () => {
  const p = characterPose({ waiting: true, id: 'x', time: 4, reducedMotion: true });
  assert.equal(p.spin, 0); assert.equal(p.step, 0); assert.equal(p.bounce, 0);
});

test('some winning users perform a continuous fan dance; losers never do',()=>{
 const ids=Array.from({length:30},(_,i)=>`red:review-${i}`),fans=ids.filter(id=>characterPose({phase:'result',outcome:'win',id,time:2}).style==='fan-dance');
 assert.ok(fans.length>0&&fans.length<ids.length);
 for(const id of fans){
  const a=characterPose({phase:'result',outcome:'win',id,time:2}),b=characterPose({phase:'result',outcome:'win',id,time:2.001});
  for(let j=0;j<2;j++)assert.ok(Math.abs(a.arms[j]-b.arms[j])<.02);
  assert.notEqual(characterPose({phase:'result',outcome:'lose',id,time:2}).style,'fan-dance');
  assert.notEqual(characterPose({phase:'lobby',waiting:true,id,time:2}).style,'fan-dance');
 }
});
test('pose blending softens transitions and retains planted leg geometry',()=>{
 const from=characterPose({phase:'lobby'}),to=characterPose({phase:'pull',pullElapsed:2});
 const blend=blendCharacterPose(from,to,1/60,{plantFeet:true});
 assert.ok(blend.thighReach>0&&blend.thighReach<to.thighReach);
 assert.ok(Math.abs(blend.bodyDrop-LEG_SEGMENT*(2-Math.cos(blend.thighReach)-Math.cos(blend.thighReach-blend.kneeBend)))<1e-9);
 assert.deepEqual(blendCharacterPose(from,to,.01,{snap:true}),to);
});


test('winners keep bounded travel, one routine and result-local timing',()=>{
 const styles=new Set();
 for(let i=0;i<40;i++){
  const id=`winner-${i}`,first=characterPose({phase:'result',outcome:'win',id,resultElapsed:1});styles.add(first.style);
  for(let elapsed=0;elapsed<10;elapsed+=.037){
   const p=characterPose({phase:'result',outcome:'win',id,time:999,resultElapsed:elapsed});
   assert.ok(Math.abs(p.spin)<=.17);assert.ok(Math.abs(p.step)<=.11);assert.equal(p.style,first.style);
   assert.ok(p.bodyDrop>=0&&p.bodyDrop<.25);
   assert.deepEqual(p,characterPose({phase:'result',outcome:'win',id,time:20,resultElapsed:elapsed}));
  }
 }
 assert.equal(styles.size,4);
});

test('a benched fan sits on the stand seat: level thighs, vertical shins, hip one shin above the floor', async () => {
  const { seatedPose, LEG_SEGMENT } = await import('../stage-character-poses.mjs');
  const p = seatedPose({ id: 'x', time: 3 });
  assert.equal(p.style, 'seated');
  assert.ok(Math.abs(p.legPitch[0] + p.kneePitch[0]) < 1e-9, 'shin returns to vertical');
  const hipHeight = 2 * LEG_SEGMENT - p.bodyDrop;
  assert.ok(Math.abs(hipHeight - LEG_SEGMENT) < 0.03, 'seat height ~ one shin (stand seats are 0.26 high)');
  assert.equal(seatedPose({ id: 'x', time: 3, reducedMotion: true }).headNod, seatedPose({ id: 'x', time: 9, reducedMotion: true }).headNod);
});
