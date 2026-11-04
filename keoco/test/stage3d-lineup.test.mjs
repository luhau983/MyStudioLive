import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
const prefix=source.slice(source.indexOf('function dancePose'),source.indexOf('const host='));
test('active opponents form two single-file lines along the same rope',()=>{
 const positions=vm.runInNewContext(`${prefix}\n['red','blue'].map(side=>Array.from({length:5},(_,i)=>tugPosition(side,i)))`);
 for(const team of positions){assert.equal(new Set(team.map(p=>p.z)).size,1); for(let i=1;i<team.length;i++) assert.ok(Math.abs(team[i].x)>Math.abs(team[i-1].x));}
 assert.equal(positions[0][0].z,positions[1][0].z);
 assert.ok(positions[0].every(p=>p.x<0)); assert.ok(positions[1].every(p=>p.x>0));
});
