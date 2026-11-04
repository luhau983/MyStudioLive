import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine} from '../engine.mjs';

test('accepted likes charge mana and gifts also score directly', () => {
 let now=0; const g=new GameEngine({random:()=>0,now:()=>now,config:{pvpThreshold:1,likesPerSecond:1000}});
 g.comment({uniqueId:'a',comment:'do'}); g.start(); now=3000; g.tick();
 g.like({uniqueId:'a',likeCount:50});
 assert.equal(g.snapshot().mana.red.value,0.5);
 assert.equal(g.score.red,50);
 assert.equal(g.gift({uniqueId:'a',diamondCount:10,repeatCount:2}), 'credited');
 assert.equal(g.snapshot().mana.red.value,20.5);
 assert.equal(g.score.red,1050);
 assert.equal(g.players.get('a').points,1050);
});

function match() {
 let t=0; const g=new GameEngine({random:()=>0,now:()=>t,config:{pvpThreshold:1,likesPerSecond:1000,earlyWinMinSeconds:1000}});
 g.comment({uniqueId:'r',comment:'do'}); g.comment({uniqueId:'b',comment:'xanh'}); g.start(); t=3000; g.tick();
 return {g, advance(ms){t+=ms;g.tick()}, clock(){return t}};
}
test('both teams charge separately and every real heart counts, keeping the fractional mana',()=>{
 const {g,advance}=match(); g.like({uniqueId:'r',likeCount:25}); advance(1); g.like({uniqueId:'r',likeCount:99});
 assert.equal(g.score.red,124); assert.equal(g.mana.red.value,1.24); assert.equal(g.mana.blue.value,0);
 g.gift({uniqueId:'b',diamondCount:3,repeatCount:2}); assert.equal(g.mana.blue.value,6); assert.equal(g.score.blue,300);
});
test('buff expires exactly and full meter queues only one capped buff',()=>{
 const {g,advance,clock}=match(); g.gift({uniqueId:'r',diamondCount:150}); assert.equal(g.mana.red.value,0); assert.equal(g.mana.red.buffUntil,clock()+5000);
 g.gift({uniqueId:'r',diamondCount:200}); assert.equal(g.mana.red.value,100);
 g.like({uniqueId:'r',likeCount:1}); assert.equal(g.score.red,17502);
 advance(5000); assert.equal(g.mana.red.value,0); assert.equal(g.mana.red.buffUntil,clock()+5000);
 g.like({uniqueId:'r',likeCount:1}); assert.equal(g.score.red,17504);
 advance(5000); g.like({uniqueId:'r',likeCount:1}); assert.equal(g.score.red,17505); assert.equal(g.mana.red.buffUntil,null);
});
test('paused buff preserves duration; finish cancels it and next round clears meter',()=>{
 const {g,advance}=match(); g.gift({uniqueId:'r',diamondCount:100}); advance(2000); g.pause(); const before=g.mana.red.buffUntil; advance(20000); g.resume(); assert.equal(g.mana.red.buffUntil,before+20000); advance(2999); assert.ok(g.mana.red.buffUntil); advance(1); assert.equal(g.mana.red.buffUntil,null);
 g.gift({uniqueId:'r',diamondCount:110}); g.finish(g.now()); assert.equal(g.mana.red.buffUntil,null); g.start(); assert.equal(g.mana.red.value,0);
});
test('final ten seconds and mana never stack above double; MVP uses awarded points',()=>{
 const {g,advance}=match(); advance(35000); g.gift({uniqueId:'r',diamondCount:100}); g.like({uniqueId:'r',likeCount:10}); assert.equal(g.score.red,5020); g.finish(g.now()); assert.equal(g.mvp.red.points,5020);
});
test('tied overtime permits mana buffs and never applies regulation double alone',()=>{
 const {g,advance}=match(); advance(45000); assert.equal(g.overtime,true); g.like({uniqueId:'r',likeCount:2}); assert.equal(g.score.red,2); g.gift({uniqueId:'r',diamondCount:100}); advance(1000); g.like({uniqueId:'r',likeCount:2}); assert.equal(g.score.red,5006);
});


test('gift alone scores with configured rate, contributes to MVP and triggers early victory',()=>{
 let t=0; const g=new GameEngine({now:()=>t,random:()=>0,config:{giftMultiplier:25,earlyWinMinSeconds:1}});
 g.comment({uniqueId:'donor',comment:'do'}); g.start(); t=4000; g.tick();
 assert.equal(g.gift({uniqueId:'donor',diamondCount:5,repeatCount:2}),'credited');
 assert.equal(g.score.red,250); assert.equal(g.phase,'result');
 assert.equal(g.mvp.red.uniqueId,'donor'); assert.equal(g.mvp.red.points,250);
});
