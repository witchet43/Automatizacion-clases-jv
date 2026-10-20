import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pipeline=fs.readFileSync('src/01_PipelineQuizzes.gs','utf8');
const direct=fs.readFileSync('src/20_CreacionDirectaRecursos.gs','utf8');
let createCount=0, batchCount=0, trashed=0;
let items=[];
let failBatch=false;
const form={
 getId:()=> 'synthetic_exam_form_id',
 supportsAdvancedResponderPermissions:()=>true,
 isPublished:()=>false,
 getItems:()=>items.map(x=>({getTitle:()=>x.title})),
 setDescription(){return this;},setIsQuiz(){return this;},
 setCollectEmail(){return this;},setShuffleQuestions(){return this;},
 setLimitOneResponsePerUser(){return this;},
 setShowLinkToRespondAgain(){return this;},setPublishingSummary(){return this;}
};
const ctx={
 Date,console:{warn(){}},
 clean_:v=>String(v===undefined||v===null?'':v).trim(),
 quizDescription_:v=>v,
 yes_:v=>String(v).trim().toUpperCase()==='SÍ',
 configureVerifiedEmail_:()=>{},
 FormApp:{create:(title,published)=>{
   createCount++;assert.equal(published,false);return form;
 }},
 ScriptApp:{getOAuthToken:()=> 'fake_token'},
 UrlFetchApp:{fetch:(url,options)=>{
   batchCount++;
   assert.match(url,/^https:\/\/forms\.googleapis\.com\/v1\/forms\/synthetic_exam_form_id:batchUpdate$/);
   assert.equal(options.method,'post');
   const data=JSON.parse(options.payload);
   assert.equal(data.requests.length,25,'Must have exactly one batch for 25 items');
   data.requests.forEach((r,i)=>{
     const c=r.createItem;assert.equal(c.location.index,i);
     const q=c.item.questionItem.question;
     assert.equal(q.choiceQuestion.type,'RADIO');
     assert.equal(q.choiceQuestion.options.length,4);
     assert.equal(q.grading.pointValue,4);
     assert.equal(q.grading.correctAnswers.answers.length,1);
     assert.equal(q.grading.correctAnswers.answers[0].value,q.choiceQuestion.options[0].value);
     assert.equal(q.required,true);
   });
   if(!failBatch) items=data.requests.map(x=>x.createItem.item);
   return {getResponseCode:()=>failBatch?400:200,getContentText:()=>'ERR_TEST_BATCH'};
 }},
 DriveApp:{getFileById:()=>({setTrashed:v=>{if(v)trashed++}})}
};
vm.createContext(ctx);
vm.runInContext(pipeline+'\n'+direct,ctx);
const raw=Array.from({length:25},(_,i)=>({
 tipo:'OPCION_MULTIPLE',pregunta:'Pregunta '+(i+1),
 opciones:['Opción correcta '+i,'Distractor A '+i,'Distractor B '+i,'Distractor C '+i],
 respuestaCorrecta:'Opción correcta '+i,puntos:4,obligatoria:true
}));
const normalized=ctx.normalizarPreguntasDirectas_(raw);
assert.equal(normalized.reduce((n,x)=>n+x.data.Puntos,0),100);
assert.ok(normalized.every(x=>x.data['Respuesta correcta']==='A'));
const metadata={'Título':'PRUEBA Examen - 25 preguntas',
 'Tipo instrumento':'EXAMEN','Política retroalimentación':'SIN_RETROALIMENTACION',
 'Barajar preguntas':'NO',Instrucciones:'PRUEBA'};
const built=ctx.buildQuizForm_(metadata,normalized);
assert.equal(built,form);
assert.equal(createCount,1);
assert.equal(batchCount,1,'Do not issue 25 separate FormApp operations');
assert.equal(items.length,25);
assert.equal(trashed,0);

const bad=ctx.normalizarPreguntasDirectas_(raw.map((r,i)=>i===12?{
 ...r,respuestaCorrecta:'respuesta inexistente'
}:r));
assert.throws(()=>ctx.buildQuizForm_(metadata,bad),/EXAMEN_RESPUESTA_INVALIDA_PREGUNTA_13/);
assert.equal(createCount,1,'Validate all 25 questions before opening a new Google Form');

items=[];failBatch=true;
assert.throws(()=>ctx.buildQuizForm_(metadata,normalized),/Forms.*400|400|ERR_TEST_BATCH/);
assert.equal(createCount,2);
assert.equal(batchCount,2);
assert.equal(trashed,1,'Roll back partially-created Form on batch API failure');
console.log('PASS: real 25-question builder batches one Forms API request, preserves grades and DRAFT, validates before create and cleans up on failure.');
