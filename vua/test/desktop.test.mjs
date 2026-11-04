import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dataPaths,initializeData,overlaySize,trustedControlRequest} from '../electron/runtime.mjs';

test('desktop data lives outside installation, with cache in local app data',()=>{
  const paths=dataPaths({appData:join('profile','Roaming'),localAppData:join('profile','Local')});
  assert.equal(paths.dataDir,join('profile','Roaming','VuaTiengViet'));
  assert.equal(paths.sessionDir,join('profile','Local','VuaTiengViet','Chromium'));
  const linux=dataPaths({appData:'/home/user/.config'});
  assert.equal(linux.dataDir,join('/home/user/.config','VuaTiengViet'));
});
test('first launch seeds data; later launches preserve imports and scores; corrupt data is retained',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vtv-desktop-'));
  try{
    const bank=join(dir,'bundled.json');await writeFile(bank,'[{"answer":"MỚI","hint":"Gợi ý"}]');
    const paths=dataPaths({override:join(dir,'profile')});
    await initializeData(paths,bank);
    assert.equal(JSON.parse(await readFile(paths.questionsPath,'utf8')).length,1);
    await writeFile(paths.questionsPath,'[{"answer":"ĐÃ IMPORT","hint":"Câu của user"}]');
    await writeFile(join(paths.dataDir,'scores.json'),'[{"id":"alice","score":100}]');
    await initializeData(paths,bank);
    assert.equal(JSON.parse(await readFile(paths.questionsPath,'utf8'))[0].answer,'ĐÃ IMPORT');
    assert.equal(JSON.parse(await readFile(join(paths.dataDir,'scores.json'),'utf8'))[0].score,100);
    await writeFile(join(paths.dataDir,'config.json'),'broken');
    await assert.rejects(initializeData(paths,bank),SyntaxError);
    assert.equal(await readFile(join(paths.dataDir,'config.json'),'utf8'),'broken');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('native LIVE window is 1080 x 1920 physical pixels at any display scaling, pinned to the work area top',()=>{
  for(const [work,scale] of [[{x:0,y:0,width:2560,height:1392},1],[{x:-1366,y:0,width:1366,height:728},1],[{x:1920,y:50,width:1536,height:824},1.25],[{x:0,y:0,width:1280,height:680},1.5]]){
    const size=overlaySize(work,scale);assert.equal(Math.round(size.width*scale),1080);assert.equal(Math.round(size.height*scale),1920);
    assert.equal(size.y,work.y);assert.ok(size.x>=work.x);
  }
});
test('desktop bridge accepts only the control window main frame on its local server',()=>{
  const base='http://127.0.0.1:3001',request={senderId:4,mainFrame:true,frameURL:base+'/control.html'};
  assert.equal(trustedControlRequest(request,4,base),true);
  for(const changes of [{senderId:5},{mainFrame:false},{frameURL:base+'/overlay.html'},{frameURL:'https://example.com/control.html'},{frameURL:'http://127.0.0.1:3002/control.html'},{frameURL:'invalid'}])assert.equal(trustedControlRequest({...request,...changes},4,base),false);
});
