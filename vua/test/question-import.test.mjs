import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareQuestionImport,saveImportedQuestions} from '../question-import.mjs';
import {WordGame} from '../engine.mjs';
const original=[{answer:'TIẾNG VIỆT',hint:'Ngôn ngữ',category:'Học tập',aliases:['VIỆT NGỮ']}];
const fresh={answer:'HOA PHƯỢNG',hint:'Hoa đỏ sân trường',category:'Thiên nhiên'};

test('import normalizes text and skips existing, repeated and alias-conflicting answers',()=>{
  const result=prepareQuestionImport(original,{questions:[{...fresh,answer:'  hoa  phượng '},fresh,{answer:'tieng viet',hint:'Ngôn ngữ'},{answer:'việt ngữ',hint:'Ngôn ngữ'}]});
  assert.equal(result.added,1);assert.equal(result.duplicates,3);assert.equal(result.total,2);assert.equal(result.questions[1].answer,'HOA PHƯỢNG');assert.equal(original.length,1);
});
test('invalid rows reject the whole import and enforce field limits',()=>{
  for(const input of [[],null,[{answer:'X',hint:''}],[{answer:'A'.repeat(25),hint:'Dài'}],[{answer:'A',hint:'x'.repeat(141)}],[{answer:'A',hint:'a',aliases:'b'}],Array(1001).fill(fresh),[fresh,{answer:1,hint:'sai'}]])assert.throws(()=>prepareQuestionImport(original,input));
  assert.equal(original.length,1);
});
test('saved import survives reload and bad data leaves original file unchanged',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bank-import-')),file=join(dir,'questions.json');
  try{
    await writeFile(file,JSON.stringify(original));
    await assert.rejects(saveImportedQuestions(file,original,[fresh,{answer:'X',hint:''}]));
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),original);
    const result=await saveImportedQuestions(file,original,[fresh]);assert.equal(result.added,1);assert.equal(JSON.parse(await readFile(file,'utf8')).length,2);
    await assert.rejects(saveImportedQuestions(join(dir,'missing','questions.json'),original,[fresh]));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('active question, time and points survive import; new rows enter remaining shuffle',()=>{
  const game=new WordGame({questions:original,now:()=>1000});game.start();
  const before=game.snapshot(true),result=prepareQuestionImport(original,[fresh]);game.replaceQuestionBank(result.questions);
  const after=game.snapshot(true);assert.equal(after.question.answer,before.question.answer);assert.equal(after.remaining,before.remaining);assert.equal(after.phase,'playing');assert.equal(after.players,0);assert.deepEqual(game.bag,[1]);game.start();assert.equal(game.snapshot(true).question.answer,'HOA PHƯỢNG');
  game.reset();game.replaceQuestionBank([...result.questions,{answer:'HOA HỒNG',hint:'Hoa có gai'}]);assert.deepEqual(game.bag,[]);game.start();assert.equal(game.questions.length,3);
});
