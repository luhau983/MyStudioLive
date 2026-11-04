import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const nodes=new Map(),timers=new Map();let token=0,socket;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{style:{},hidden:true,textContent:''});return nodes.get(id);};
 const ctx={document:{getElementById:get},WebSocket:class{constructor(){socket=this;}},location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,addEventListener(){},setInterval(){},setTimeout(fn){timers.set(++token,fn);return token;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),ctx);
 return {ctx,get,socket,send:players=>ctx.announceArrivals({players}),next(ticker=false){const [id,fn]=[...timers.entries()].find(([,fn])=>(fn.name==='runTicker')===ticker);timers.delete(id);fn();}};
}
const p=(i,extra={})=>({uniqueId:`p${i}`,nickname:`Tên ${i}`,team:'red',lineupRank:i+1,...extra});
test('arrival notice includes nickname, team and active slot; unchanged snapshots stay silent',()=>{
 const h=setup();h.send([]);h.send([p(0,{nickname:'<b>Linh</b>'})]);
 const el=h.get('join-notice');assert.equal(el.hidden,false);assert.equal(el.textContent,'⚡ <b>Linh</b> vào sân Đội Đỏ · vị trí #1');assert.equal(el.className,'join-notice red');
 h.send([p(0,{nickname:'Đổi tên'})]);h.next();assert.equal(el.hidden,true);
});
test('queue entry and promotion use actual ordered slots and stable IDs',()=>{
 const h=setup(),players=Array.from({length:5},(_,i)=>p(i));h.send(players);
 const queued=p(5,{nickname:'Minh'});h.send([...players,queued]);assert.equal(h.get('join-notice').textContent,'⏳ Minh đã vào hàng chờ Đội Đỏ');h.next();
 h.send([...players.slice(1),queued]);assert.equal(h.get('join-notice').textContent,'⚡ Minh vào sân Đội Đỏ · vị trí #5');
 h.next();h.send([...players.slice(1),{...queued,lineupRank:2}]);assert.equal(h.get('join-notice').hidden,true);
});
test('reconnect and source reset do not replay existing participants; bots never announce',()=>{
 const h=setup();h.send([p(0)]);assert.equal(h.get('join-notice').hidden,true);
 h.send([p(0),p(1,{bot:true})]);assert.equal(h.get('join-notice').hidden,true);
 h.socket.onopen();h.send([p(0),p(2)]);assert.equal(h.get('join-notice').hidden,true);
 h.socket.onmessage({data:JSON.stringify({type:'donor-clear'})});h.send([p(3)]);assert.match(h.get('join-notice').textContent,/Tên 3 vào sân/);h.next();
 h.send([p(3),p(4,{team:'blue'})]);assert.match(h.get('join-notice').textContent,/Tên 4 vào sân Đội Xanh/);
});
test('large bursts are grouped with named users and counts, not an unbounded timer queue',()=>{
 const h=setup();h.send([]);h.send(Array.from({length:1000},(_,i)=>p(i)));
 assert.match(h.get('join-notice').textContent,/Tên 0, Tên 1, Tên 2 và 2 người nữa vào sân/);
 h.next();assert.match(h.get('join-notice').textContent,/Tên 5, Tên 6, Tên 7 và 992 người nữa đã vào hàng chờ/);
 h.next();assert.equal(h.get('join-notice').hidden,true);
});

test('join feed adds one comment-style row per arrival or switch, keeps five and expires each',()=>{
 const h=setup(),feed=h.get('join-feed');feed.children=[];feed.append=el=>{feed.children.push(el);el.remove=()=>feed.children.splice(feed.children.indexOf(el),1);};
 h.ctx.document.createElement=()=>({className:'',textContent:'',children:[],append(...c){this.children.push(...c);}});
 const text=row=>row.children.map(c=>c.textContent).join('');
 h.send([]);h.send([p(0,{nickname:'Linh'})]);
 assert.equal(feed.children.length,1);assert.equal(text(feed.children[0]),'Linh vừa vào Đội Đỏ ⚡');assert.equal(feed.children[0].className,'join-row red');
 h.ctx.announceSwitch({nickname:'Linh',team:'blue'});assert.equal(text(feed.children[1]),'Linh sẽ sang Đội Xanh từ trận sau 🔁');
 h.send([p(0,{nickname:'Linh'}),...Array.from({length:6},(_,i)=>p(i+1,{team:'blue',lineupRank:i+1}))]);
 assert.equal(feed.children.length,5);
 h.socket.onclose();assert.equal(feed.children.length,0);
});
