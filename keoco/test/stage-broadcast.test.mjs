import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
const evaluate=expr=>vm.runInNewContext(`${prefix}\n${expr}`);
test('shared broadcast alternates sides and uses full court on result',()=>{
 assert.equal(evaluate("broadcastView('pull',0,false)"),'red');
 assert.equal(evaluate("broadcastView('pull',8,false)"),'blue');
 assert.equal(evaluate("broadcastView('lobby',16,false)"),'red');
 assert.equal(evaluate("broadcastView('result',8,false)"),'court');
 assert.equal(evaluate("broadcastView('pull',8,true)"),'court'); // reduced motion: one neutral, static shot (no side bias)
});
test('referee signals countdown and the correct winning side or neutral draw',()=>{
 assert.equal(evaluate("refereePose('countdown',{red:0,blue:0})"),'start');
 assert.equal(evaluate("refereePose('result',{red:3,blue:2})"),'red');
 assert.equal(evaluate("refereePose('result',{red:1,blue:2})"),'blue');
 assert.equal(evaluate("refereePose('result',{red:2,blue:2})"),'neutral');
});
