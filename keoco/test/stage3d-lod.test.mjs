import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
const ctx={}; vm.runInNewContext(prefix,ctx);
const puller=side=>({side,role:'active',index:0});
const stands=(side,count)=>Array.from({length:count},(_,index)=>({side,role:'stands',index}));

test('the stand budget only pays for what the court already owns',()=>{
 assert.equal(ctx.standBudget([]),84);
 const court=Array.from({length:10},()=>puller('red'));
 assert.equal(ctx.standBudget(court),74);
 assert.equal(ctx.standBudget([...court,...stands('blue',30)]),74,'seated fans are the budget, not a cost');
 assert.equal(ctx.standBudget([...court,{side:'red',role:'stands',index:0,leavingCourt:true}]),73,'the squad walking off is still on the court');
 assert.equal(ctx.standBudget(Array.from({length:200},()=>puller('red'))),0,'never negative');
});

test('stands thin out alternately and never hide a puller, a donor or the filmed face',()=>{
 const budget=5;
 assert.deepEqual(stands('red',4).map(c=>ctx.standVisible(c,budget)),[true,true,true,false]);
 assert.deepEqual(stands('blue',4).map(c=>ctx.standVisible(c,budget)),[true,true,false,false]);
 const dropped=stands('red',4)[3];
 assert.equal(ctx.standVisible(dropped,budget,true),true,'the camera subject stays');
 assert.equal(ctx.standVisible(dropped,budget,false,true),true,'a donor stays');
 assert.equal(ctx.standVisible({...dropped,leavingCourt:true},budget),true,'the squad walking off stays');
 for(const donating of [undefined,false,0])assert.equal(ctx.standVisible(dropped,budget,false,donating),false);
 for(const role of ['active','ready','departing'])assert.equal(ctx.standVisible({side:'blue',role,index:9},0),true,`${role} ignores the budget`);
});

test('detail bands drop the stitched accessories before the merged rigid parts',()=>{
 const accessory={smallDetail:true},rigid={farDetail:true},both={smallDetail:true,farDetail:true},silhouette={};
 for(const [distance,accessoryOn,rigidOn] of [[0,true,true],[9.9,true,true],[10,false,true],[11.9,false,true],[12,false,false],[30,false,false]]){
  const {detailOn,farOn}=ctx.detailBands(distance*distance);
  assert.equal(ctx.detailVisible(accessory,detailOn,farOn),accessoryOn,`accessory at ${distance}`);
  assert.equal(ctx.detailVisible(rigid,detailOn,farOn),rigidOn,`rigid part at ${distance}`);
  assert.equal(ctx.detailVisible(both,detailOn,farOn),accessoryOn&&rigidOn,`merged accessory at ${distance}`);
  assert.equal(ctx.detailVisible(silhouette,detailOn,farOn),true,'the silhouette never drops');
  assert.ok(farOn||!detailOn,'accessories never outlive the larger parts');
 }
});

test('one character is built per frame and the old squad walks off before it is freed',()=>{
 assert.match(source,/if\(built>=1\)\{pendingBuilds=true;return;\}/,'builds are throttled to one per update');
 assert.match(source,/if\(pendingBuilds&&state\)update\(state\)/,'the next frame picks up the remainder');
 assert.match(source,/c\.retiring=true;c\.role='departing'/);
 assert.match(source,/if\(c\.retiring&&\(!c\.route\|\|travel\?\.done\)\)\{characters\.delete\(c\.id\);disposeCharacter\(c\);/,'a departing character is freed only at the end of its route');
 assert.match(source,/if\(!c\.root\.visible\)\{setStyle\(c\.tag,'visibility','hidden'\);continue;\}/,'a hidden character costs no tag');
});
