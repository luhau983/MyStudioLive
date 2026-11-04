import test from 'node:test';
import assert from 'node:assert/strict';
import {syncCrowd} from '../crowd-ui.js';
test('match reactions fire once at phase, buff and tension transitions',()=>{
 const played=[],audio={setPulling(){},setPaused(){},stopCues(){},playCue(url){played.push(url);}};
 const state={phase:'countdown',endsAt:5000};syncCrowd(audio,state,true,1000);syncCrowd(audio,state,true,1200);
 assert.equal(played.length,1);
 const pull={phase:'pull',endsAt:60000,score:{red:0,blue:0},mana:{red:{buffUntil:null},blue:{buffUntil:null}}};
 syncCrowd(audio,pull,true,10000);assert.equal(played.length,3);
 pull.mana.red.buffUntil=20000;syncCrowd(audio,pull,true,15000);syncCrowd(audio,pull,true,15100);assert.equal(played.length,4);
 syncCrowd(audio,pull,true,46000);syncCrowd(audio,pull,true,47000);assert.equal(played.length,5);
 syncCrowd(audio,{...pull,phase:'result',score:{red:100,blue:80}},true,60000);assert.equal(played.length,8);
 syncCrowd(audio,{...pull,phase:'result',score:{red:100,blue:80}},true,60100);assert.equal(played.length,8);
});

test('countdown follows the deadline once per number, skips missed numbers, pauses and resets',()=>{
 const played=[],audio={setPulling(){},setPaused(){},stopCues(){},playCue(url,opts){played.push({url,opts});}};
 const state={phase:'countdown',endsAt:5000};
 for(const now of [2000,2100,3000,3100,4000,4100])syncCrowd(audio,state,true,now);
 assert.deepEqual(played.filter(p=>p.url.includes('count-')).map(p=>p.url),['./assets/count-3.mp3','./assets/count-2.mp3','./assets/count-1.mp3']);
 assert.deepEqual(played.filter(p=>p.url.includes('count-')).map(p=>p.opts.expiresAt),[3000,4000,5000]);
 const before=played.length;syncCrowd(audio,{...state,paused:true},true,4200);syncCrowd(audio,state,false,4200);assert.equal(played.length,before);
 syncCrowd(audio,{phase:'pull'},true,5000);assert.equal(played.filter(p=>p.url.includes('whistle')).length,1);
 syncCrowd(audio,{...state,endsAt:10000},true,8500);
 assert.equal(played.at(-1).url,'./assets/count-2.mp3');
});
test('disconnection and pause cancel reactions; a draw does not play a victory roar',()=>{
 let stops=0;const played=[],audio={setPulling(){},setPaused(){},stopCues(){stops++;},playCue(url){played.push(url);}};
 syncCrowd(audio,{phase:'result',score:{red:1,blue:0}},false,0);assert.equal(played.length,0);assert.ok(stops);
 syncCrowd(audio,{phase:'result',paused:true,score:{red:1,blue:0}},true,0);assert.equal(played.length,0);
 syncCrowd(audio,{phase:'result',score:{red:1,blue:1}},true,0);assert.equal(played.length,1);assert.match(played[0],/05\.mp3$/);
});
