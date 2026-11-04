import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Runs overlay.js against a minimal DOM with a controllable clock.
function overlay() {
 class Element {
  constructor(){this.children=[];this.className='';this.style={};this.textContent='';this.hidden=false;}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.remove();this.children.push(n);n.parentNode=this;}}
  insertBefore(n,before){if(n.parentNode)n.remove();const i=before?this.children.indexOf(before):-1;this.children.splice(i<0?this.children.length:i,0,n);n.parentNode=this;}
  querySelector(sel){return this.children.find(n=>sel==='.'+n.className)||null;}
  remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}}
 }
 const elements=new Map(), clock={now:1e12};
 let socket; class WS {constructor(){socket=this;} close(){}}
 const context={document:{createElement:()=>new Element(),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}},
  WebSocket:WS,location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},setTimeout(){return 1;},clearTimeout(){},
  Date:{now:()=>clock.now}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),context);
 const send=data=>socket.onmessage({data:JSON.stringify(data)});
 const g=context.donorGlow;
 return {glow:{remaining:g.remaining,ids:()=>[...g.ids()]},send,socket:()=>socket,clock,red:elements.get('red-players')??context.document.getElementById('red-players')};
}

test('donor message highlights by uniqueId for five seconds; a repeat gift extends instead of stacking',()=>{
 const {glow,send,clock}=overlay();
 send({type:'donor',uniqueId:'alice'});
 assert.equal(glow.remaining('alice',clock.now),5000);
 clock.now+=3000; send({type:'donor',uniqueId:'alice'});
 assert.equal(glow.remaining('alice',clock.now),5000);
 assert.deepEqual(glow.ids(),['alice']);
 assert.equal(glow.remaining('alice',clock.now+4999),1);
 assert.equal(glow.remaining('alice',clock.now+5000),0);
 assert.deepEqual(glow.ids(),[],'expired entries are dropped');
});

test('overlapping donors expire independently and the registry stays bounded',()=>{
 const {glow,send,clock}=overlay();
 send({type:'donor',uniqueId:'a'}); clock.now+=2000; send({type:'donor',uniqueId:'b'});
 clock.now+=3500;
 assert.equal(glow.remaining('a',clock.now),0); assert.equal(glow.remaining('b',clock.now),1500);
 for(let i=0;i<50;i++){clock.now+=1;send({type:'donor',uniqueId:`u${i}`});}
 assert.equal(glow.ids().length,32);
 assert.equal(glow.remaining('u49',clock.now),5000,'newest donor survives eviction');
 assert.equal(glow.remaining('b',clock.now),0,'soonest expiry is evicted first');
});

test('malformed donor payloads are ignored; nicknames are never used as keys',()=>{
 const {glow,send}=overlay();
 for(const uniqueId of [undefined,null,42,{},['x'],'', 'x'.repeat(129)]) send({type:'donor',uniqueId});
 send({type:'donor',nickname:'Alice'});
 assert.deepEqual(glow.ids(),[]);
});

test('source clear and socket reconnect drop every active highlight',()=>{
 const {glow,send,socket}=overlay();
 send({type:'donor',uniqueId:'a'}); send({type:'donor-clear'});
 assert.deepEqual(glow.ids(),[]);
 send({type:'donor',uniqueId:'b'}); socket().onopen();
 assert.deepEqual(glow.ids(),[]);
});

test('fallback roster highlights only the donor uniqueId, not a same-nickname player or a bot',()=>{
 const ctx=overlay();
 const players=[{uniqueId:'twin_a',nickname:'Twin',team:'red',lineupRank:1},{uniqueId:'twin_b',nickname:'Twin',team:'red',lineupRank:2},{uniqueId:'bot-1',nickname:'Bot 1',team:'blue'}];
 ctx.send({type:'donor',uniqueId:'twin_b'}); ctx.send({type:'donor',uniqueId:'bot-1'});
 ctx.send({type:'state',state:{phase:'pull',mode:'pve',score:{},players:players.slice(0,2),bots:[{uniqueId:'bot-1',nickname:'Bot 1'}]}});
 const red=ctx.red;
 assert.deepEqual(red.children.map(n=>n.className),['player','player donor']);
 ctx.clock.now+=5000;
 ctx.send({type:'state',state:{phase:'pull',mode:'pve',score:{},players:players.slice(0,2)}});
 assert.deepEqual(red.children.map(n=>n.className),['player','player']);
});
