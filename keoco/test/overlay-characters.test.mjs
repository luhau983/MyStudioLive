import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('character state reflects pulling, bot opponent and pause', () => {
 const nodes=new Map();
 const create=()=>({style:{},children:[],append(...items){for(const item of items){if(item.parentNode)item.remove(); this.children.push(item);item.parentNode=this}},insertBefore(item,before){if(item.parentNode)item.remove();const i=before?this.children.indexOf(before):-1;this.children.splice(i<0?this.children.length:i,0,item);item.parentNode=this},querySelector(selector){return this.children.find(item=>'.'+item.className===selector)||null},replaceChildren(){this.children=[]},remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null}}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,create());return nodes.get(id)};
 let socket; class WS {constructor(){socket=this}}
 const context={document:{getElementById:get,createElement:create},WebSocket:WS,location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},clearTimeout(){},setTimeout(){}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),context);
 const send=state=>socket.onmessage({data:JSON.stringify({type:'state',state})});
 send({phase:'pull',mode:'pve',paused:false});
 assert.match(get('stage').className,/\bpull\b/);
 assert.match(get('stage').className,/\bpve\b/);
 send({phase:'pull',mode:'pve',paused:true});
 assert.match(get('stage').className,/\bpaused\b/);
 const players=Array.from({length:13},(_,i)=>({team:'red',nickname:'P'+i,lineupRank:i===12?1:i===11?1:i+2}));
 send({phase:'pull',mode:'pvp',players});
 assert.deepEqual(get('red-players').children.slice(0,2).map(p=>p.children[1].textContent),['P11','P12']);
 assert.equal(get('red-players').children.length,6); // five avatars and overflow
 assert.match(get('red-players').children[0].children[0].innerHTML, /meme-body/); // each player is a full-body character
 send({phase:'result',mode:'pvp',score:{red:10,blue:2}});
 assert.match(get('stage').className,/\bred-wins\b/);
 send({phase:'result',mode:'pvp',score:{red:2,blue:10}});
 assert.match(get('stage').className,/\bblue-wins\b/);
 send({phase:'result',mode:'pvp',score:{red:2,blue:2}});
 assert.doesNotMatch(get('stage').className,/\b(?:red|blue)-wins\b/);
 assert.doesNotMatch(get('stage').className,/\bpve\b|\bpaused\b/);
});

test('characters use the supplied expression image assets', () => {
 const js=readFileSync(new URL('../overlay.js',import.meta.url),'utf8');
 for (const expression of ['happy','pull','cry','victory']) {
  assert.match(js,new RegExp(`assets/face-${expression}\\.png`));
  const png=readFileSync(new URL(`../assets/face-${expression}.png`,import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }
});
