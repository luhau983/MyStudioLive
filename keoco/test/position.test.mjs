import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine} from '../engine.mjs';
import {positionNotice} from '../server.mjs';
test('position request does not enroll during locked pull',()=>{const e=new GameEngine(); e.phase='pull'; e.endsAt=Date.now()+10000; e.mode='pvp'; e.comment({uniqueId:'x',comment:' VỊ TRÍ '}); assert.equal(e.players.size,0);});
test('position matches rendered team ordering and waiting queue',()=>{const players=Array.from({length:14},(_,i)=>({uniqueId:`p${i}`,nickname:`N${i}`,team:'red',lineupRank:i+1})); const state={players}; assert.deepEqual(positionNotice(state,{uniqueId:'p0'}),{type:'position',nickname:'N0',team:'red',area:'active',position:1}); assert.equal(positionNotice(state,{uniqueId:'p5'}).position,1); assert.equal(positionNotice(state,{uniqueId:'p5'}).area,'waiting'); assert.equal(positionNotice(state,{uniqueId:'none',nickname:'X'}).area,'unjoined');});
test('blue waiting, hidden, PvE and full roster use actual sorted display order',()=>{
 const e=new GameEngine({maxPlayers:45}); for(let i=0;i<45;i++) e.comment({uniqueId:`id${i}`,nickname:`Name ${i}`,comment:'xanh'});
 e.phase='pull'; e.mode='pvp'; e.endsAt=Date.now()+20000;
 assert.equal(positionNotice(e.snapshot(),{uniqueId:'id5'}).position,1);
 assert.deepEqual({...positionNotice(e.snapshot(),{uniqueId:'id35'}),nickname:''},{type:'position',nickname:'',team:'blue',area:'waiting',position:31,offscreen:true});
 e.comment({uniqueId:'new',comment:'vi tri'}); assert.equal(e.players.size,45);
 assert.equal(positionNotice(e.snapshot(),{uniqueId:'new'}).area,'unjoined');
 e.mode='pve'; e.bots=[{uniqueId:'bot-1',team:'blue'}]; assert.equal(positionNotice(e.snapshot(),{uniqueId:'id0'}).position,1);
});
test('accent and case accepted without changing locked roster',()=>{
 const e=new GameEngine(); e.phase='countdown'; e.endsAt=Date.now()+5000;
 for(const comment of [' VỊ TRÍ ',' vi tri ']) e.comment({uniqueId:'stranger',comment});
 assert.equal(e.players.size,0);
});
