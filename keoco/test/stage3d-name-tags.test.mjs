import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
const ctx={}; vm.runInNewContext(prefix+";this.TAG_ROW=TAG_ROW;this.CAPTAIN_ARROW=CAPTAIN_ARROW;",ctx);
// Copy results out of the vm realm so deepStrictEqual compares plain values.
const plain=v=>JSON.parse(JSON.stringify(v?.constructor?.name==='Map'?[...v]:v));

test('tag names are the real display name, stripped of spoofing characters and kept concise',()=>{
 assert.equal(ctx.tagName({uniqueId:'h_123',nickname:'Lan Anh'}),'Lan Anh');
 assert.equal(ctx.tagName({uniqueId:'h_123',nickname:''}),'h_123','falls back to the handle');
 assert.equal(ctx.tagName({}),'Người chơi');
 assert.equal(ctx.tagName({nickname:'evil‮gnp.exe'}),'evilgnp.exe','bidi override removed');
 assert.equal(ctx.tagName({nickname:'a​b\u0000c\n d'}),'abc d','zero-width/control removed, whitespace collapsed');
 assert.equal(ctx.tagName({nickname:'<img src=x onerror=1>'}),'<img src=x…','markup is just text, truncated to 12 graphemes (no dangling space)');
 assert.equal(ctx.tagName({nickname:'Nguyễn Thị Phương Thảo'}),'Nguyễn Thị…');
 assert.equal(ctx.tagName({nickname:'👨‍👩‍👧‍👦'.repeat(13)}),'👨‍👩‍👧‍👦'.repeat(11)+'…','emoji clusters are not split');
 assert.equal(ctx.tagName({nickname:'Hải Yến',isBot:true}),'Hải Yến','bots show only their player-like name');
 assert.equal(ctx.tagName({nickname:'Captain Long Name Here'},18),'Captain Long Name…');
});

test('tag order puts donors first, then pullers by rank, then a capped waiting crowd; the lead uses the captain card',()=>{
 const entries=[
  ...Array.from({length:12},(_,i)=>({id:`r${i}`,side:'red',waiting:false,index:i,donor:0})),
  ...Array.from({length:30},(_,i)=>({id:`w${i}`,side:'red',waiting:true,index:i,donor:0})),
  ...Array.from({length:3},(_,i)=>({id:`b${i}`,side:'blue',waiting:false,index:i,donor:0})),
 ];
 entries.find(e=>e.id==='w25').donor=1200; entries.find(e=>e.id==='r7').donor=4800;
 const order=plain(ctx.tagOrder(entries,10)).map(e=>e.id);
 assert.deepEqual(order.slice(0,2),['r7','w25'],'most recent donor first; a donor deep in the crowd bypasses the cap');
 assert.ok(!order.includes('r0')&&!order.includes('b0'));
 assert.deepEqual(order.slice(2,5),['b1','r1','b2']);
 assert.equal(order.filter(id=>id.startsWith('w')).length,11,'ten waiting labels plus the donor');
 assert.ok(order.indexOf('r11')<order.indexOf('w0'),'pullers outrank the waiting crowd');
});

test('declutter keeps tags off each other, the referee box, the rope and the viewport edge',()=>{
 const view={width:400,height:300};
 const tag=(id,x,y,w=60,h=20)=>({id,x,y,w,h});
 // Two tags on the same anchor: the second steps up one row instead of overlapping.
 let out=plain(ctx.layoutTags([tag('a',100,100),tag('b',110,100)],view));
 assert.deepEqual(out.map(([id])=>id),['a','b']);
 assert.equal(out[1][1].y,100-20-20-3);
 // A third tag at the same spot has nowhere to go and is hidden.
 out=plain(ctx.layoutTags([tag('a',100,100),tag('b',110,100),tag('c',105,100)],view));
 assert.deepEqual(out.map(([id])=>id),['a','b']);
 // Referee box blocks both candidate rows.
 out=plain(ctx.layoutTags([tag('a',200,100)],{...view,boxes:[{x:150,y:40,w:100,h:80}]}));
 assert.deepEqual(out,[]);
 // A box owned by the tag itself (its own head) does not block it.
 out=plain(ctx.layoutTags([tag('a',200,100)],{...view,boxes:[{x:150,y:40,w:100,h:80,owner:'a'}]}));
 assert.equal(out.length,1);
 // The rope segment crossing the anchor row forces the tag up, a fully crossing rope hides it.
 out=plain(ctx.layoutTags([tag('a',200,100)],{...view,segments:[{a:[0,90],b:[400,90],pad:4}]}));
 assert.equal(out[0][1].y,57);
 out=plain(ctx.layoutTags([tag('a',200,100)],{...view,segments:[{a:[200,0],b:[200,300]}]}));
 assert.deepEqual(out,[]);
 // Off-screen tags are not drawn half-clipped: an on-screen anchor slides the tag inward, an off-screen one hides it.
 assert.deepEqual(plain(ctx.layoutTags([tag('a',10,100),tag('b',200,10),tag('c',-5,100)],view)),[['a',{x:0,y:80,w:60,h:20}]]);
});

test('the captain card sits a tier above the name-tag row so the next puller keeps its own tag row',()=>{
 const view={width:1080,height:1000};
 for(const side of ['red','blue']){
  const out=side==='red'?-1:1, lead={x:540,y:400}, card=ctx.captainRect(lead,[200,40],side);
  // The arrow tip (88% / 12% across) points down at the lead and clears a full tag row.
  assert.equal(card.x+(side==='red'?.88:.12)*card.w,lead.x);
  assert.ok(card.y+card.h+ctx.CAPTAIN_ARROW<=lead.y-ctx.TAG_ROW,'card and arrow stay above the tag row');
  // The card reaches outward over the adjacent puller, whose tag still sits at its anchor.
  const box={...card,h:card.h+ctx.CAPTAIN_ARROW}, neighbour={id:'n',x:lead.x+out*120,y:lead.y,w:120,h:ctx.TAG_ROW};
  assert.ok(neighbour.x-neighbour.w/2<box.x+box.w&&box.x<neighbour.x+neighbour.w/2,'card spans the neighbour column');
  const placed=plain(ctx.layoutTags([neighbour],{...view,boxes:[box]}));
  assert.equal(placed.length,1);
  assert.equal(placed[0][1].y,lead.y-ctx.TAG_ROW,'not lifted into a stack above the card');
 }
 assert.match(source,/const p=project\(\.\.\.c\.anchor\), size=sizeOf\(cap\.el\)/,'card follows the rest-pose tag anchor, not the bouncing body');
 assert.match(source,/const r=captainRect\(p,size,side,3,sizeOf\(c\.tag\)\?\.\[1\]\|\|TAG_ROW\);/,'the card clears the measured tag height');
 {const tall=ctx.captainRect({x:540,y:400},[200,40],'red',3,48);assert.ok(tall.y+tall.h+ctx.CAPTAIN_ARROW<=400-48,'a taller tag row lifts the card');}
 assert.match(source,/if\(refereeBox&&rectsOverlap\(refereeBox,r,3\)\)\{setStyle\(referee\.tag,'visibility','hidden'\)/,'referee label yields to a captain card');
});

test('segment/rect intersection handles slanted, parallel and distant segments',()=>{
 const r={x:10,y:10,w:10,h:10};
 assert.equal(ctx.segmentHitsRect({a:[0,0],b:[30,30]},r),true);
 assert.equal(ctx.segmentHitsRect({a:[0,0],b:[30,0]},r),false);
 assert.equal(ctx.segmentHitsRect({a:[0,8],b:[30,8],pad:3},r),true);
 assert.equal(ctx.segmentHitsRect({a:[0,0],b:[5,5]},r),false);
 assert.equal(ctx.segmentHitsRect({a:[15,0],b:[15,9]},r),false);
});

test('donor glow lasts until expiry, fades at the end, and never oscillates under reduced motion',()=>{
 assert.equal(ctx.glowLevel(0,1,false),0); assert.equal(ctx.glowLevel(-5,1,true),0); assert.equal(ctx.glowLevel(NaN,1,true),0);
 const still=Array.from({length:40},(_,i)=>ctx.glowLevel(4000,i*.05,true));
 assert.ok(still.every(v=>v===1),'reduced motion: constant, no pulse');
 assert.equal(ctx.glowLevel(300,0,true),.5,'fade is a level change, not a flash');
 const moving=Array.from({length:200},(_,i)=>ctx.glowLevel(4000,i/100,false));
 assert.ok(Math.min(...moving)>=.6&&Math.max(...moving)<=1,'breathes gently and never blacks out');
 let peaks=0; for(let i=1;i<moving.length-1;i++) if(moving[i]>moving[i-1]&&moving[i]>=moving[i+1]) peaks++;
 assert.ok(peaks<=3*2,'well under three flashes per second');
});

test('renderer wiring: tags are textContent only, glow keys on uniqueId, bots and anonymous never glow',()=>{
 assert.doesNotMatch(source,/innerHTML/);
 assert.match(source,/c\.uid=!p\.isBot&&p\.uniqueId\?String\(p\.uniqueId\):null/);
 assert.match(source,/const left=remaining\(c\.uid\)/);
 assert.match(source,/remaining=id=>id&&glowApi\?glowApi\.remaining\(id,nowMs\):0/);
 assert.match(source,/const MAX_HALOS=8/);
 assert.match(source,/function disposeCharacter\(c\)\{scene\.remove\(c\.root\);c\.tag\?\.remove\(\);/,'tags leave the DOM with their character before GPU resource cleanup');
 assert.match(source,/g\.emissiveIntensity=still\?\.6:/,'reduced motion holds a steady emissive glow');
});

test("pullers stay named: a blocked puller slides sideways, then over heads, never onto another tag",()=>{
 const view={width:400,height:300};
 const tag=(id,x,y,extra={})=>({id,x,y,w:60,h:20,...extra});
 // Three tags on one anchor: without must the third vanishes; with must it slides sideways.
 let out=plain(ctx.layoutTags([tag("a",200,100),tag("b",200,100),tag("c",200,100,{must:true})],view));
 assert.deepEqual(out.map(([id])=>id),["a","b","c"]);
 const rects=out.map(([,r])=>r);
 assert.ok(rects.every((r,i)=>rects.every((q,j)=>i===j||!ctx.rectsOverlap(r,q))),"no tag sits on another");
 // A neighbouring head box blocks every row: a puller still gets named over it.
 const head={x:0,y:0,w:400,h:110,owner:"other"};
 assert.deepEqual(plain(ctx.layoutTags([tag("p",200,100)],{...view,boxes:[head]})),[]);
 assert.equal(plain(ctx.layoutTags([tag("p",200,100,{must:true})],{...view,boxes:[head]})).length,1);
 // Even a captain card or referee box yields to a puller as a last resort.
 assert.equal(plain(ctx.layoutTags([tag("p",200,100,{must:true})],{...view,boxes:[{x:0,y:0,w:400,h:110}]})).length,1);
});

test("the lead gets a name tag whenever the captain card is not on screen",()=>{
 const lead={id:"r0",side:"red",waiting:false,index:0,donor:0};
 assert.deepEqual(plain(ctx.tagOrder([lead])),[]);
 assert.deepEqual(plain(ctx.tagOrder([{...lead,captained:true}])),[]);
 assert.deepEqual(plain(ctx.tagOrder([{...lead,captained:false}])).map(e=>e.id),["r0"]);
});

test("puller names take turns two per team, cycling through the whole squad",()=>{
 const squad=side=>Array.from({length:5},(_,i)=>({id:side+i,side,role:"active",waiting:false,index:i,donor:0}));
 const entries=[...squad("red"),...squad("blue"),{id:"w0",side:"red",role:"stands",waiting:true,index:0,donor:0}];
 const at=t=>plain(ctx.rotateTags(entries,t)).map(e=>e.id);
 const first=at(0);
 assert.equal(first.filter(id=>id.startsWith("red")).length,2);
 assert.equal(first.filter(id=>id.startsWith("blue")).length,2);
 assert.ok(first.includes("w0"),"waiting crowd is not rotated");
 const seen=new Set();for(let k=0;k<5;k++)at(k*2.5).forEach(id=>seen.add(id));
 for(let i=1;i<5;i++)assert.ok(seen.has("red"+i)&&seen.has("blue"+i),"every puller below the captain gets a turn");
 assert.notDeepEqual(at(0),at(2.5));
 // Donors and kept entries (the filmed face) never wait for their turn.
 const donor=entries.map(e=>e.id==="red4"?{...e,donor:900}:e);
 assert.ok(plain(ctx.rotateTags(donor,0)).some(e=>e.id==="red4"));
 assert.ok(plain(ctx.rotateTags(entries,0,{keep:e=>e.id==="blue3"})).some(e=>e.id==="blue3"));
 // The captained lead is named by its card, so it never uses up a rotation slot.
 for(let k=0;k<6;k++)assert.equal(plain(ctx.tagOrder(ctx.rotateTags(entries,k*2.5))).filter(e=>e.side==="red"&&!e.waiting).length,2);
 // A small squad shows every non-captain puller at once.
 assert.equal(plain(ctx.rotateTags(squad("red").slice(1,3),7)).length,2);
});
