import {DEFAULT_YOUTUBE_URL,youtubeVideoId} from './music-state.mjs';
import {CLASS_CAPACITY} from './auditorium-layout.mjs';
export {CLASS_CAPACITY};
export function normalizeAnswer(value, ignoreAccents = true) {
  let s = String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('vi');
  if (ignoreAccents) s = s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
  return s.replace(/[\s\p{P}]+/gu, '');
}
export const DIFFICULTIES=['mixed','normal','hard'];
export const questionLevel=q=>q?.difficulty==='hard'?'hard':'normal';
export function validateConfig(input) {
  const bounds = {roundSeconds:[10,300], resultSeconds:[2,30], points:[10,1000],audioVolume:[0,100],musicVolume:[0,100]};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Cấu hình không hợp lệ');
  for (const [k,v] of Object.entries(input)) {
    if (bounds[k]) { if (!Number.isInteger(v) || v < bounds[k][0] || v > bounds[k][1]) throw Error(`Giá trị không hợp lệ: ${k}`); }
    else if(k==='difficulty'){if(!DIFFICULTIES.includes(v))throw Error('Độ khó không hợp lệ');}
    else if(k==='youtubeMusicUrl'){if(typeof v!=='string'||v.length>300||(v!==''&&!youtubeVideoId(v)))throw Error('Link nhạc YouTube không hợp lệ');}
    else if (!['autoNext','ignoreAccents','teacherAudio','musicEnabled','showNames'].includes(k) || typeof v !== 'boolean') throw Error(`Cấu hình không hợp lệ: ${k}`);
  }
  return input;
}
export class WordGame {
  constructor({questions, config={}, scores=[], now=Date.now, random=Math.random, onScore=()=>{}}) {
    if (!Array.isArray(questions) || !questions.length || questions.some(q=>!q.answer?.trim() || !q.hint?.trim())) throw Error('Ngân hàng câu hỏi không hợp lệ');
    this.questions=questions; this.config={roundSeconds:45,resultSeconds:6,points:100,autoNext:true,ignoreAccents:true,teacherAudio:true,audioVolume:70,musicEnabled:true,musicVolume:16,youtubeMusicUrl:DEFAULT_YOUTUBE_URL,difficulty:'mixed',showNames:true,...validateConfig(config)};
    this.scores=new Map(scores.map(p=>[p.id,p])); this.participants=new Map(); this.overflow=new Set(); this.now=now; this.random=random; this.onScore=onScore;
    this.roundCorrect=new Map();this.classStopped=false;this.resultAt=null;this.activityLog=[];this.activityVersion=0;this.bubbles=[];this.highlight=null;this.phase='idle'; this.round=0; this.index=-1; this.bag=[]; this.paused=false; this.comments=[]; this.hints=0;
  }
  start() {
    // Rebuild the bag when it runs out or the host switched difficulty; the new level applies from this question.
    if (!this.bag.length||this.bagDifficulty!==this.config.difficulty) { this.bag=this.pool(); this.bagDifficulty=this.config.difficulty; for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];} if(this.bag.length>1 && this.bag.at(-1)===this.index) [this.bag[0],this.bag[this.bag.length-1]]=[this.bag.at(-1),this.bag[0]]; }
    this.index=this.bag.pop(); this.round++; this.phase='playing'; this.paused=false;this.classStopped=false;this.roundCorrect.clear();this.resultAt=null; this.hints=0; this.winner=null; this.reason=null; this.comments=[];this.bubbles=[];
    this.started=this.now(); this.deadline=this.started+this.config.roundSeconds*1000; this.duration=this.config.roundSeconds;
    const original=Array.from(this.questions[this.index].answer.replace(/\s/g,'')); this.tiles=[...original];
    for(let i=this.tiles.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.tiles[i],this.tiles[j]]=[this.tiles[j],this.tiles[i]];}
    if(this.tiles.join('')===original.join('')) this.tiles.push(this.tiles.shift());
  }
  finish(reason='reveal') { if(this.phase!=='playing')return; this.phase='result'; this.reason=this.winner?'correct':reason;this.resultAt=this.now(); this.deadline=this.now()+this.config.resultSeconds*1000; }
  tick() { if(this.paused)return; if(this.phase==='playing' && this.now()>=this.deadline)this.finish('timeout'); else if(this.phase==='result' && this.config.autoNext && this.now()>=this.deadline)this.start(); }
  pause() { this.tick(); if(!this.paused && this.phase!=='idle'){this.paused=true;this.pausedAt=this.now();} }
  resume() {this.classStopped=false;if(this.phase==='idle'){this.paused=false;return;}if(this.paused){this.deadline+=this.now()-this.pausedAt;this.started+=this.now()-this.pausedAt;this.paused=false;} }
  stopClass(){this.pause();if(!this.paused){this.pausedAt=this.now();this.paused=true;}this.classStopped=true;this.record('stop',{nickname:'Host'});}
  pool(){const level=this.config.difficulty,all=this.questions.map((_,i)=>i);if(level==='mixed')return all;const picked=all.filter(i=>questionLevel(this.questions[i])===level);return picked.length?picked:all;}
  record(type,data={}) {const event={seq:++this.activityVersion,type,at:this.now(),round:this.round,...data};this.activityLog.unshift(event);this.activityLog=this.activityLog.slice(0,250);return event;}
  clearActivity(){this.activityLog=[];this.activityVersion++;}
  join({id,nickname,simulated=false}) {
    if(typeof id!=='string'||!id.trim()||id.length>128)return 'invalid';
    const key=(simulated?'demo:':'live:')+id;
    nickname=String(nickname||id).replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,40)||id;
    if(this.participants.has(key)){this.participants.get(key).nickname=nickname;return 'existing';}
    // No seat or standing spot left: the viewer can still answer and score, just without a character.
    if(this.participants.size>=CLASS_CAPACITY){if(!this.overflow.has(key)){this.overflow.add(key);this.record('full',{userId:id,nickname,simulated});}return 'full';}
    this.participants.set(key,{id:key,nickname,simulated});this.record('join',{userId:id,nickname,simulated});return 'joined';
  }
  hint() { if(this.phase==='playing'&&!this.paused)this.hints=Math.min(this.hints+1,this.questions[this.index].answer.replace(/\s/g,'').length-1); }
  comment({id,nickname,text,simulated=false}) {
    if(typeof id!=='string'||!id.trim()||id.length>128||typeof text!=='string'||text.length>200)return false;
    nickname=String(nickname||id).replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,40)||id;
    text=text.replace(/[\p{Cc}\p{Cf}]/gu,'').trim();if(!text)return false;
    this.tick();const key=(simulated?'demo:':'live:')+id,joined=this.join({id,nickname,simulated});
    if(normalizeAnswer(text)==='vitri'){
      const event=this.record('position',{userId:id,nickname,text,simulated,outcome:joined==='full'?'full':'highlighted'});
      if(joined!=='full')this.highlight={id:key,nickname,seq:event.seq,until:this.now()+7000};
      return false;
    }
    const active=this.phase==='playing'&&!this.paused;
    const q=this.questions[this.index],matches=active&&[q.answer,...(q.aliases||[])].some(a=>normalizeAnswer(a,this.config.ignoreAccents)===normalizeAnswer(text,this.config.ignoreAccents));
    const correct=!!matches&&!this.roundCorrect.has(key),mvp=correct&&!this.winner;
    const points=correct?Math.max(10,this.config.points-this.hints*20):0;
    const event=this.record('comment',{userId:id,nickname,text,simulated,outcome:correct?'correct':matches?'duplicate':active?'wrong':'ignored',points,mvp});
    const comment={id,nickname,text,correct:!!matches,simulated,seq:event.seq,at:this.now()};
    this.comments.unshift(comment);this.comments=this.comments.slice(0,6);
    this.bubbles=this.bubbles.filter(c=>c.id!==id||c.simulated!==simulated);this.bubbles.unshift(comment);this.bubbles=this.bubbles.slice(0,CLASS_CAPACITY);
    if(!correct)return false;
    const p=this.scores.get(key)||{id:key,nickname,score:0,wins:0,simulated};p.nickname=nickname;p.score+=points;p.wins++;this.scores.set(key,p);
    this.roundCorrect.set(key,{id:key,nickname,points,simulated});
    if(mvp){p.mvpCount=(p.mvpCount||0)+1;this.winner={...p,points,at:this.now(),seconds:Math.max(0,(this.now()-this.started)/1000)};}
    this.onScore(this.leaderboard());return true;
  }
  leaderboard() { return [...this.scores.values()].sort((a,b)=>b.score-a.score||b.wins-a.wins||a.id.localeCompare(b.id)); }
  replaceQuestionBank(questions){
    const oldLength=this.questions.length;this.questions=questions;
    if(this.phase!=='idle'){
      const level=this.bagDifficulty;for(let i=oldLength;i<questions.length;i++)if(level==='mixed'||questionLevel(questions[i])===level)this.bag.push(i);
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
    }
  }
  reset() {this.roundCorrect.clear();this.classStopped=false;this.resultAt=null;this.phase='idle';this.round=0;this.index=-1;this.bag=[];this.tiles=[];this.hints=0;this.reason=null;this.paused=false;this.winner=null;this.comments=[];this.bubbles=[];this.highlight=null;this.scores.clear();this.participants.clear();this.overflow.clear();this.onScore([]);this.record('reset',{nickname:'Host'});}
  snapshot(control=false) {
    const q=this.questions[this.index]; const answer=q?.answer||'';let n=0;
    return {phase:this.phase,round:this.round,paused:this.paused,classStopped:this.classStopped,correctCount:this.roundCorrect.size,correctPlayers:[...this.roundCorrect.values()],resultAt:this.resultAt,remaining:this.phase==='idle'?0:Math.max(0,((this.paused?this.pausedAt:this.now())-this.deadline)*-1/1000),duration:this.duration||this.config.roundSeconds,
      question:q?{category:q.category||'Đoán chữ',hint:q.hint,tiles:this.tiles,mask:Array.from(answer).map(c=>c===' '?' ':n++<this.hints?c:'_'),...(control||this.phase==='result'?{answer}:{})}:null,
      winner:this.winner,reason:this.reason,comments:this.comments,bubbles:this.bubbles.map(c=>({...c,remaining:Math.max(0,8000-(this.now()-c.at))})).filter(c=>c.remaining>0),highlight:this.highlight&&this.highlight.until>this.now()?{...this.highlight,remaining:this.highlight.until-this.now()}:null,...(control?{activityLog:this.activityLog,activityVersion:this.activityVersion}:{}),participants:[...this.participants.values()],leaderboard:this.leaderboard().slice(0,10),players:this.scores.size,config:this.config,totalQuestions:this.questions.length,questionLevels:this.questions.reduce((n,q)=>(n[questionLevel(q)]++,n),{normal:0,hard:0}),hints:this.hints};
  }
}
