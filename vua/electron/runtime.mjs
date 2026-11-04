import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';

export function dataPaths({appData,localAppData,override}){
  const dataDir=override?resolve(override):join(appData,'VuaTiengViet');
  return {dataDir,questionsPath:join(dataDir,'questions.json'),sessionDir:override?join(dataDir,'Chromium'):join(localAppData||appData,'VuaTiengViet','Chromium'),logsDir:join(dataDir,'logs')};
}
export async function initializeData(paths,bundledQuestions){
  await mkdir(paths.dataDir,{recursive:true});await mkdir(paths.logsDir,{recursive:true});
  try{await copyFile(bundledQuestions,paths.questionsPath,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
  for(const [name,value] of [['config.json',{}],['scores.json',[]]]){
    try{await writeFile(join(paths.dataDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  // Fail visibly for damaged user data; never replace it with a blank profile.
  for(const file of ['config.json','scores.json','questions.json'])JSON.parse(await readFile(join(paths.dataDir,file),'utf8'));
  return paths;
}
// Overlay renders at exactly 1080 x 1920 physical pixels so LIVE Studio Window Capture never upscales (which blurs).
// The window may be taller than the screen; it is pinned to the top of the work area and centred horizontally.
export function overlaySize(workArea,scaleFactor=1){
  const width=Math.round(1080/scaleFactor),height=Math.round(1920/scaleFactor);
  return {width,height,x:Math.round(workArea.x+Math.max(0,(workArea.width-width)/2)),y:workArea.y};
}
export function trustedControlRequest({senderId,mainFrame,frameURL},controlId,baseURL){
  if(senderId!==controlId||!mainFrame)return false;
  try{const url=new URL(frameURL);return url.origin===baseURL&&['/','/control.html'].includes(url.pathname);}catch{return false;}
}
