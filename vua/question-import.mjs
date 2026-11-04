import {writeFile,rename,unlink} from 'node:fs/promises';
import {normalizeAnswer} from './engine.mjs';

function text(value,limit,label){
  if(typeof value!=='string')throw Error(label+' phải là chuỗi chữ');
  const clean=value.normalize('NFC').replace(/\s+/g,' ').trim();
  if(!clean||Array.from(clean).length>limit||/[\p{Cc}\p{Cf}]/u.test(clean))throw Error(label+' trống hoặc vượt '+limit+' ký tự');
  return clean;
}
function answer(value,label){
  const s=text(value,48,label).toLocaleUpperCase('vi');
  if(!/^[\p{L}\p{M}\s'-]+$/u.test(s)||Array.from(s.replace(/\s/g,'')).length>24)throw Error(label+' chỉ gồm chữ, tối đa 24 chữ không tính khoảng trắng');
  return s;
}
export function prepareQuestionImport(existing,input){
  const rows=Array.isArray(input)?input:input?.questions;
  if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error('File cần chứa từ 1 đến 1000 câu hỏi trong một mảng JSON');
  const seen=new Set(existing.flatMap(q=>[q.answer,...(q.aliases||[])].map(a=>normalizeAnswer(a))));
  const added=[];let duplicates=0;
  for(let i=0;i<rows.length;i++){
    const row=rows[i],label='Câu '+(i+1);
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error(label+' không hợp lệ');
    const q={answer:answer(row.answer,label+' / đáp án'),hint:text(row.hint,140,label+' / gợi ý'),category:row.category==null?'Đoán chữ':text(row.category,40,label+' / chủ đề')};
    if(row.difficulty!=null){if(row.difficulty!=='hard'&&row.difficulty!=='normal')throw Error(label+' / difficulty phải là "normal" hoặc "hard"');if(row.difficulty==='hard')q.difficulty='hard';}
    if(row.aliases!=null){
      if(!Array.isArray(row.aliases)||row.aliases.length>10)throw Error(label+' / aliases cần là mảng tối đa 10 đáp án');
      q.aliases=[...new Set(row.aliases.map(a=>answer(a,label+' / đáp án khác')))];
    }
    const keys=[q.answer,...(q.aliases||[])].map(a=>normalizeAnswer(a));
    if(keys.some(k=>seen.has(k))){duplicates++;continue;}
    keys.forEach(k=>seen.add(k));added.push(q);
  }
  if(existing.length+added.length>5000)throw Error('Ngân hàng câu hỏi tối đa 5000 câu');
  return {questions:[...existing,...added],added:added.length,duplicates,total:existing.length+added.length};
}
export async function saveImportedQuestions(path,existing,input){
  const result=prepareQuestionImport(existing,input);
  if(!result.added)return result;
  const temporary=path+'.import.tmp';
  try{await writeFile(temporary,JSON.stringify(result.questions,null,2)+'\n',{mode:0o600});await rename(temporary,path);}
  catch(error){await unlink(temporary).catch(()=>{});throw Error('Không lưu được bộ câu hỏi: '+error.message);}
  return result;
}
