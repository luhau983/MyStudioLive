import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {SQUAD_SIZE,nextSquad} from '../lineup-flow.mjs';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
function lineup(players) {
 const code=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
 return vm.runInNewContext(`${code}\nselectLineup(${JSON.stringify(players)})`,{SQUAD_SIZE,nextSquad});
}
test('priority order places overflow into a bounded waiting area',()=>{
 const players=Array.from({length:50},(_,i)=>({uniqueId:`p${i}`,lineupRank:i===49?1:i+2}));
 const result=lineup(players);
 assert.equal(result.active.length,5);
 assert.equal(result.active[0].uniqueId,'p49');
 assert.equal(result.waiting.length,30);
 assert.equal(result.hidden,15);
 assert.equal(new Set([...result.active,...result.waiting].map(p=>p.uniqueId)).size,35);
});
