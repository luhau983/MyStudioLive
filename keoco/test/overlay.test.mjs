import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {SQUAD_SIZE,nextSquad} from '../lineup-flow.mjs';
import { GameEngine } from '../engine.mjs';

function overlay() {
  class Element {
    constructor() { this.children=[]; this.className=''; this.style={}; this.textContent=''; }
    append(...nodes) { for (const node of nodes) { if(node.parentNode) node.remove(); this.children.push(node); node.parentNode=this; } }
    insertBefore(node, before) { if(node.parentNode) node.remove(); const i=before ? this.children.indexOf(before) : -1; this.children.splice(i<0?this.children.length:i,0,node); node.parentNode=this; }
    querySelector(selector) { return this.children.find(n=>selector === '.'+n.className) || null; }
    remove() { if(this.parentNode) { const a=this.parentNode.children; a.splice(a.indexOf(this),1); this.parentNode=null; } }
    replaceChildren(...nodes) { for(const n of this.children) n.parentNode=null; this.children=[]; this.append(...nodes); }
  }
  const elements=new Map(); const document={createElement:()=>new Element(),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
  const context={document,innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},setTimeout(){},clearTimeout(){},location:{protocol:'http:',host:'localhost'},WebSocket:class {}};
  vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),context);
  return {render:state=>context.render({phase:'waiting',score:{},...state}), red:document.getElementById('red-players')};
}
const player=(id,extra={})=>({uniqueId:id,nickname:id,team:'red',...extra});
test('new avatar enters once and survives repeated broadcasts and reprioritization',()=>{
  const {render,red}=overlay();
  render({players:[player('a')]}); const item=red.children[0], avatar=item.children[0];
  assert.match(avatar.className,/\bjoin-drop\b/);
  render({players:[player('a'),player('b')]});
  assert.equal(red.children[0],item);
  render({players:[player('a',{lineupRank:2}),player('b',{lineupRank:1})]});
  assert.equal(red.children[1],item);
  render({players:[]}); render({players:[player('a')]});
  assert.doesNotMatch(red.children[0].children[0].className,/\bjoin-drop\b/);
});

test('overflow joins only on first visibility and names remain text',()=>{
  const {render,red}=overlay();
  const players=Array.from({length:13},(_,i)=>player('p'+i));
  players[12].nickname='<img src=x onerror=alert(1)>';
  render({players}); assert.equal(red.children.length,6); assert.equal(red.children[5].textContent,'+8');
  players[12].lineupRank=1; render({players});
  assert.match(red.children[0].children[0].className,/\bjoin-drop\b/);
  assert.equal(red.children[0].children[1].textContent,players[12].nickname);
  players[12].lineupRank=0; render({players}); players[12].lineupRank=1; render({players});
  assert.doesNotMatch(red.children[0].children[0].className,/\bjoin-drop\b/);
});

test('engine snapshots keep fallback and 3D overflow locked until the next round',()=>{
  let now=0;
  const game=new GameEngine({now:()=>now,config:{pvpThreshold:1,countdownSeconds:1,earlyWinMinSeconds:1000,idleSeconds:3600}});
  for(let i=0;i<14;i++) for(const [team,prefix] of [['do','r'],['xanh','b']]) game.comment({uniqueId:prefix+i,comment:team});
  game.start(); now=1000; game.tick();
  const {render,red}=overlay();
  const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
  const context={SQUAD_SIZE,nextSquad}; vm.runInNewContext(source.slice(source.indexOf('function dancePose'),source.indexOf('const host=')),context);
  const check=(first,waiting)=>{
    const state=game.snapshot(); render(state);
    const line=context.selectLineup(state.players.filter(p=>p.team==='red'));
    assert.equal(red.children[0].children[1].textContent,first);
    assert.equal(line.active[0].uniqueId,first);
    const queue=state.players.filter(p=>p.team==='red'&&p.lineupRank>SQUAD_SIZE);
    assert.deepEqual(new Set(Array.from(line.waiting,p=>p.uniqueId)),new Set(queue.map(p=>p.uniqueId)));
    assert.deepEqual(Array.from(line.waiting.slice(0,state.upNext.red.length),p=>p.uniqueId),state.upNext.red);
    assert.equal(line.active.length,SQUAD_SIZE);
  };
  check('r0',['r12','r13']);
  game.gift({uniqueId:'r13',diamondCount:25}); game.like({uniqueId:'r13',likeCount:1}); check('r0',['r12','r13']);
  now=46000; game.tick(); assert.equal(game.phase,'result'); check('r0',['r12','r13']);
  now=61000; game.tick(); assert.equal(game.phase,'lobby'); check('r13',['r11','r12']);
  game.start(); now=62000; game.tick(); check('r13',['r11','r12']);
  assert.match(red.children[0].title,/Ưu tiên: 25 kim cương · Vòng này: 0/);
});

test('transition phase has a distinct viewer label',()=>{ const {render}=overlay(); const html=readFileSync(new URL('../overlay.js',import.meta.url),'utf8'); assert.match(html,/transition:'CHUYỂN VÒNG'/); });
