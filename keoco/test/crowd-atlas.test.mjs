import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {createApp} from '../server.mjs';
const stage=readFileSync(new URL('../stage3d.js',import.meta.url),'utf8');
test('spectator atlas uses per-instance tile UVs and stateful side emotions, never the player face override',()=>{
 assert.match(stage,/crowd-faces\/atlas\.png/);
 assert.match(stage,/InstancedBufferAttribute/);
 assert.match(stage,/attribute float faceTile/);
 assert.match(stage,/crowdEmotion\(state,side,fanEmotions\[side\]\)/);
 assert.match(stage,/spectatorFaceIndex\(i,fanEmotions/);
 assert.doesNotMatch(stage,/faces\.material\.map=textures\.happy/);
});
test('the exact atlas is served as PNG without opening arbitrary asset paths',async t=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const dataDir=mkdtempSync(join(tmpdir(),'keoco-atlas-'));
 const app=await createApp({port,dataDir});t.after(async()=>{await app.close();rmSync(dataDir,{recursive:true,force:true});});
 const response=await fetch(`http://127.0.0.1:${port}/assets/crowd-faces/atlas.png`);
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
 const served=Buffer.from(await response.arrayBuffer());assert.deepEqual(served,readFileSync(new URL('../assets/crowd-faces/atlas.png',import.meta.url)));
 assert.equal((await fetch(`http://127.0.0.1:${port}/assets/crowd-faces/not-allowed.png`)).status,404);
});
