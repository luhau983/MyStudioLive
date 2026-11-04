import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {commentNotice} from '../server.mjs';

function overlay(){
 const nodes=new Map();let socket;
 const ctx={document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},hidden:false,textContent:''});return nodes.get(id);}},location:{protocol:'http:',host:'localhost'},innerWidth:1080,innerHeight:1920,WebSocket:class{constructor(){socket=this;}},addEventListener(){},setInterval(){},setTimeout(){},clearTimeout(){}};
 vm.runInNewContext(readFileSync(new URL('../overlay.js',import.meta.url),'utf8'),ctx);
 return {ctx,socket};
}

test('comment notices use stable roster identity and only bounded public display fields',()=>{
 const state={players:[{uniqueId:'a',nickname:'Linh',team:'red'},{uniqueId:'b',nickname:'Linh',team:'blue'}]};
 const a=commentNotice(state,{uniqueId:'a',nickname:'spoof',comment:'<b>Xin chào</b>',avatar:'private',msgId:'private'});
 assert.deepEqual(a,{type:'comment',uniqueId:'a',nickname:'Linh',text:'<b>Xin chào</b>',team:'red'});
 assert.equal(commentNotice(state,{uniqueId:'b',comment:'Chào'}).team,'blue');
 assert.equal(commentNotice(state,{uniqueId:'x',comment:'hello'}),null);
 assert.equal(commentNotice({...state,paused:true},{uniqueId:'a',comment:'hello'}),null);
 assert.equal(commentNotice(state,{uniqueId:'a',comment:'  '}),null);
 const long=commentNotice(state,{uniqueId:'a',comment:'😀'.repeat(250)+'\u202e'});assert.equal(Array.from(long.text).length,180);assert.ok(!long.text.includes('\u202e'));
});

test('a new comment replaces its speaker immediately, expires in seven seconds and cannot grow a backlog',()=>{
 const {ctx}=overlay(),send=(id,text,now)=>ctx.showComment({uniqueId:id,nickname:'Trùng tên',text,team:'red'},now);
 send('a','Một',0);send('b','Hai',0);send('a','Mới nhất',1000);
 let entries=ctx.characterComments.entries(1001);
 assert.equal(entries.length,2);assert.equal(entries[0].uniqueId,'a');assert.equal(entries[0].text,'Mới nhất');
 entries=ctx.characterComments.entries(7001);assert.equal(entries.length,1);assert.equal(entries[0].uniqueId,'a');
 assert.equal(ctx.characterComments.entries(8000).length,0);
 for(let i=0;i<1000;i++)send(String(i),'hello',9000);
 assert.equal(ctx.characterComments.entries(9001).length,24);assert.equal(ctx.characterComments.entries(9001)[0].uniqueId,'999');
});

test('socket comments appear immediately and source changes/disconnects clear them',()=>{
 const {ctx,socket}=overlay();
 const message={type:'comment',uniqueId:'speaker',nickname:'Tên',text:'<img src=x onerror=1>',team:'blue'};
 socket.onmessage({data:JSON.stringify(message)});
 assert.equal(ctx.characterComments.entries()[0].text,message.text);
 socket.onmessage({data:JSON.stringify({type:'donor-clear'})});assert.equal(ctx.characterComments.entries().length,0);
 socket.onmessage({data:JSON.stringify(message)});socket.onclose();assert.equal(ctx.characterComments.entries().length,0);
});

test('rendered cards are visible above the actual speaker and dock if the speaker is off camera',()=>{
 const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
 const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
 const block=source.slice(source.indexOf('  const chatEntries='),source.indexOf('  // ---------- Name tags + donor glow'));
 const host={children:[],append(el){this.children.push(el);el.remove=()=>this.children.splice(this.children.indexOf(el),1);}};
 const nodes=new Map(),characters=new Map([['red:bot',{commentId:'bot',root:{visible:true,scale:{x:1}},headGroup:{getWorldPosition(v){Object.assign(v,{x:250,y:350,z:0});}}}]]);
 let entries=[{uniqueId:'bot',nickname:'Bot Đỏ 1',text:'<b>Kéo nào!</b>',team:'red'}];
 const ctx={window:{characterComments:{entries:()=>entries}},nowMs:0,phase:'pull',viewW:500,viewH:650,chatCover:190,boxes:[],segments:[],commentNodes:nodes,commentHead:{},characters,host,
  document:{createElement:()=>({style:{},append(...children){this.children=children;}})},
  project:(x,y)=>({x,y,off:false}),sizeOf:()=>[206,80],setStyle:(el,key,value)=>{el.style[key]=value;}};
 vm.runInNewContext(prefix,ctx);vm.runInNewContext(`{${block}}`,ctx);
 const node=nodes.get('bot');assert.equal(node.el.style.visibility,'visible');assert.equal(node.name.textContent,'Bot Đỏ 1');assert.equal(node.body.textContent,'<b>Kéo nào!</b>');assert.ok(!node.el.className.includes('detached'));
 characters.clear();vm.runInNewContext(`{${block}}`,ctx);assert.equal(node.el.style.visibility,'visible');assert.match(node.el.className,/detached/);assert.match(node.el.style.transform,/,356\.0px\)$/);
 entries=[];vm.runInNewContext(`{${block}}`,ctx);assert.equal(nodes.size,0);assert.equal(host.children.length,0);
});

