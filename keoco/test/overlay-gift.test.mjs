import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('overlay displays gift nickname as text and hides it after five seconds', () => {
 const nodes=new Map(); const get=id=>{if(!nodes.has(id)) nodes.set(id,{style:{},hidden:true,textContent:''});return nodes.get(id);};
 let socket, hide; class WS { constructor(){socket=this;} }
 const context={document:{getElementById:get}, WebSocket:WS, location:{protocol:'http:',host:'localhost'}, innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},clearTimeout(){},setTimeout(fn){hide=fn;return 1;}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),context);
 socket.onmessage({data:JSON.stringify({type:'gift',nickname:'<img src=x>',team:'red'})});
 assert.equal(get('gift-notice').textContent,'<img src=x> đã tặng quà cho Đội Đỏ'); assert.equal(get('gift-notice').hidden,false); hide(); assert.equal(get('gift-notice').hidden,true);
});

test('team and mode come from the gift itself; unknown remains neutral',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id)) nodes.set(id,{style:{},hidden:true,textContent:''});return nodes.get(id);};
 let socket, next; class WS{constructor(){socket=this;}}
 const ctx={document:{getElementById:get},WebSocket:WS,location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},clearTimeout(){},setTimeout(fn){next=fn;}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),ctx);
 for(const [team,mode,expected] of [['blue','pvp',' cho Đội Xanh'],['blue','pve',' cho Đội Xanh'],['invalid','pve','']]){
  socket.onmessage({data:JSON.stringify({type:'gift',nickname:'Linh',team,mode})});
  assert.equal(get('gift-notice').textContent,`Linh đã tặng quà${expected}`); next();
 }
 socket.onmessage({data:JSON.stringify({type:'gift',nickname:'A\nB',team:'red',simulated:true})});
 assert.equal(get('gift-notice').textContent,'[Giả lập] A B đã tặng quà cho Đội Đỏ');
});

test('overlapping gifts play in order without overwriting the visible notice',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id)) nodes.set(id,{style:{},hidden:true,textContent:''});return nodes.get(id);};
 let socket; const timers=[]; class WS{constructor(){socket=this;}}
 const ctx={document:{getElementById:get},WebSocket:WS,location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},clearTimeout(){},setTimeout(fn){timers.push(fn);return timers.length;}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),ctx);
 socket.onmessage({data:JSON.stringify({type:'gift',nickname:'A',team:'red'})});
 socket.onmessage({data:JSON.stringify({type:'gift',nickname:'B',team:'blue'})});
 assert.match(get('gift-notice').textContent,/^A /); timers.shift()();
 assert.match(get('gift-notice').textContent,/^B /); timers.shift()(); assert.equal(get('gift-notice').hidden,true);
});

test('gift metadata is rendered as safe text and queue overflow is summarized',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id)) nodes.set(id,{style:{},hidden:true,textContent:''});return nodes.get(id);};
 let socket; const timers=[]; class WS{constructor(){socket=this;}}
 const ctx={document:{getElementById:get},WebSocket:WS,location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},clearTimeout(){},setTimeout(fn){timers.push(fn);return timers.length;}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),ctx);
 const send=data=>socket.onmessage({data:JSON.stringify(data)});
 send({type:'gift',nickname:'<b>A</b>',team:'red',giftName:'Rose\n<script>',giftCount:3});
 assert.equal(get('gift-notice').textContent,'<b>A</b> đã tặng Rose <script> ×3 cho Đội Đỏ');
 for(let i=0;i<35;i++) send({type:'gift',nickname:`N${i}`,team:'blue'});
 timers.shift()();
 assert.equal(get('gift-notice').textContent,'Có thêm 35 lượt tặng quà');
 timers.shift()(); assert.equal(get('gift-notice').hidden,true);
});

 test('gift bursts are summarized rather than queued for minutes',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id)) nodes.set(id,{style:{},hidden:true,textContent:''});return nodes.get(id);};
 let socket; const timers=[]; class WS{constructor(){socket=this;}}
 const ctx={document:{getElementById:get},WebSocket:WS,location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},clearTimeout(){},setTimeout(fn){timers.push(fn);}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),ctx);
 for(let i=0;i<20;i++) socket.onmessage({data:JSON.stringify({type:'gift',nickname:`N${i}`,team:'red'})});
 timers.shift()(); assert.equal(get('gift-notice').textContent,'Có thêm 19 lượt tặng quà');
 timers.shift()(); assert.equal(get('gift-notice').hidden,true);
 });
