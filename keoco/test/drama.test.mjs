import {test} from 'node:test';
import assert from 'node:assert/strict';
import { finalTension, teamStrain, smoothRope } from '../presentation.mjs';

test('final 15-second tension uses real deadline only during connected, unpaused regulation pull',()=>{
 const s={phase:'pull',endsAt:20000};
 assert.equal(finalTension(s,true,4999),false);
 assert.equal(finalTension(s,true,5000),true);
 assert.equal(finalTension(s,true,20000),false);
 assert.equal(finalTension({...s,overtime:true},true,15000),false);
 assert.equal(finalTension({...s,paused:true},true,15000),false);
 assert.equal(finalTension(s,false,15000),false);
 assert.equal(finalTension({...s,endsAt:null},true,15000),false);
});
test('strain responds to relative scores and rope eases toward position',()=>{
 assert.ok(teamStrain({red:10,blue:2},'blue')>teamStrain({red:10,blue:2},'red'));
 assert.equal(teamStrain({red:0,blue:0},'red'),teamStrain({red:0,blue:0},'blue'));
 assert.ok(smoothRope(0,1,0.1,false)>0 && smoothRope(0,1,0.1,false)<1);
 assert.equal(smoothRope(0,1,0.1,true),1);
});
