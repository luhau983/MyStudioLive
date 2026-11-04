import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../overlay.js',import.meta.url),'utf8');
const fn=src.slice(src.indexOf('function updateResultBanner'),src.indexOf('function updateManaDisplay'));
function banner(state){
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
 vm.runInNewContext(`${fn};updateResultBanner(state);`,{$,state});
 return Object.fromEntries(elements);
}
test('result names the authoritative winning team and handles machine, draw and pause',()=>{
 for(const [red,blue,mode,label,call,side] of [[10,5,'pvp','ĐỘI ĐỎ CHIẾN THẮNG','KO!','red'],[5,10,'pvp','ĐỘI XANH CHIẾN THẮNG','KO!','blue'],[5,10,'pve','ĐỘI MÁY CHIẾN THẮNG','KO!','blue'],[5,5,'pvp','HAI ĐỘI NGANG TÀI','HÒA!','draw']]){
  const b=banner({phase:'result',mode,score:{red,blue}});
  assert.equal(b['result-team'].textContent,label);assert.equal(b['result-call'].textContent,call);
  assert.equal(b['result-banner'].hidden,false);assert.equal(b['result-banner'].className,`result-banner ${side}`);
  assert.ok(b['result-score'].textContent.includes(String(red)));
 }
 for(const phase of ['pull','countdown','lobby'])assert.equal(banner({phase})['result-banner'].hidden,true);
 assert.equal(banner({phase:'result',paused:true})['result-banner'].hidden,true);
});
