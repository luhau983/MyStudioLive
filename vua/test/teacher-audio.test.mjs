import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTeacherAudio} from '../teacher-audio.js';
test('teacher narrates classroom events once, volume and disabled setting work',async()=>{
  const previousDocument=globalThis.document,previousAudio=globalThis.Audio;
  const elements=Object.fromEntries(['enable-teacher-audio','teacher-caption'].map(id=>[id,{classList:{toggle(){}},textContent:'',hidden:false}]));
  const plays=[];let speaking=false;
  globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
  globalThis.Audio=class {pause(){}play(){plays.push({src:this.src,volume:this.volume});return Promise.resolve();}};
  try{
    const teacher=createTeacherAudio({speaking:value=>speaking=value});
    let s={phase:'idle',round:0,paused:false,hints:0,remaining:45,config:{teacherAudio:true,audioVolume:35}};
    teacher.update(s);await Promise.resolve();assert.ok(plays.at(-1).src.includes('welcome'));assert.equal(plays.at(-1).volume,.35);assert.equal(speaking,true);
    s={...s,phase:'playing',round:1};teacher.update(s);assert.ok(plays.at(-1).src.includes('next-1'));const count=plays.length;teacher.update({...s});assert.equal(plays.length,count);
    s={...s,remaining:9};teacher.update(s);assert.ok(plays.at(-1).src.includes('hurry'));teacher.update({...s,remaining:8});assert.equal(plays.length,count+1);
    s={...s,phase:'result',winner:{nickname:'An'}};teacher.update(s);assert.ok(plays.at(-1).src.includes('correct-1'));
    s={...s,phase:'playing',round:2,winner:null};teacher.update(s);assert.ok(plays.at(-1).src.includes('next-2'));
    s={...s,hints:1};teacher.update(s);assert.ok(plays.at(-1).src.includes('hint'));
    s={...s,paused:true};teacher.update(s);assert.ok(plays.at(-1).src.includes('pause'));
    s={...s,paused:false};teacher.update(s);assert.ok(plays.at(-1).src.includes('resume'));
    const before=plays.length;teacher.update({...s,config:{teacherAudio:false,musicEnabled:false,audioVolume:0}});assert.equal(plays.length,before);assert.equal(speaking,false);assert.equal(elements['enable-teacher-audio'].hidden,true);
  }finally{globalThis.document=previousDocument;globalThis.Audio=previousAudio;}
});

test('gift thank-you plays, waits for current narration, and respects mute/disabled', async () => {
  const previousDocument = globalThis.document, previousAudio = globalThis.Audio;
  const elements = Object.fromEntries(['enable-teacher-audio', 'teacher-caption'].map(id => [id, {classList: {toggle() {}}, textContent: '', hidden: false}]));
  const plays = []; let audio;
  globalThis.document = {getElementById: id => elements[id], addEventListener() {}};
  globalThis.Audio = class { constructor() { audio = this; } pause() {} play() { plays.push(this.src); return Promise.resolve(); } };
  try {
    const teacher = createTeacherAudio({speaking() {}});
    const s = {phase: 'idle', round: 0, paused: false, hints: 0, remaining: 45, config: {teacherAudio: true, audioVolume: 50}};
    teacher.update(s); await Promise.resolve();
    assert.ok(plays.at(-1).includes('welcome'));
    teacher.thank();
    assert.ok(plays.at(-1).includes('welcome'), 'thank-you must not cut off narration');
    audio.onended(); await Promise.resolve();
    assert.ok(plays.at(-1).includes('gift-1'));
    audio.onended();
    teacher.thank(); await Promise.resolve();
    assert.ok(plays.at(-1).includes('gift-2'));
    audio.onended();
    const count = plays.length;
    teacher.update({...s, config: {teacherAudio: false}});
    teacher.thank();
    assert.equal(plays.length, count);
  } finally { globalThis.document = previousDocument; globalThis.Audio = previousAudio; }
});
