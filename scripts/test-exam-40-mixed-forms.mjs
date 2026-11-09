import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pipeline=fs.readFileSync('src/01_PipelineQuizzes.gs','utf8');
const direct=fs.readFileSync('src/20_CreacionDirectaRecursos.gs','utf8');
let created=0,batched=0,trashed=0,stored=[],http=200,body='{}',transportError=false;
const form={
  getId:()=> 'synthetic_form',
  supportsAdvancedResponderPermissions:()=>true,
  isPublished:()=>false,
  getItems:()=>stored.map(x=>({getTitle:()=>x.title})),
  setDescription(){return this;},setIsQuiz(){return this;},
  setCollectEmail(){return this;},setShuffleQuestions(){return this;},
  setLimitOneResponsePerUser(){return this;},
  setShowLinkToRespondAgain(){return this;},setPublishingSummary(){return this;}
};
const ctx={
  console:{error() {},warn() {}},Date,
  clean_:v=>String(v??'').trim(),quizDescription_:v=>v,
  yes_:v=>String(v).toUpperCase()==='SÍ',configureVerifiedEmail_:()=>{throw Error('Exam must skip separate email precheck');},
  ScriptApp:{getOAuthToken:()=> 'TOKEN_SYNTHETIC'},
  FormApp:{create:(_title,published)=>{assert.equal(published,false);created++;return form;}},
  DriveApp:{getFileById:()=>({setTrashed:value=>{if(value)trashed++;}})},
  UrlFetchApp:{fetch:(_url,args)=>{
    batched++;assert.equal(args.muteHttpExceptions,true);
    if(transportError)throw Error('Service timed out');
    const requests=JSON.parse(args.payload).requests;
    const settings=requests.shift().updateSettings;
    assert.equal(settings.updateMask,'emailCollectionType');
    assert.equal(settings.settings.emailCollectionType,'VERIFIED');
    if(http===200){
      assert.equal(requests.length,40,'Forty items must be one batch');
      stored=requests.map(x=>x.createItem.item);
      const radio=requests.filter(x=>x.createItem.item.questionItem.question.choiceQuestion.type==='RADIO');
      const checks=requests.filter(x=>x.createItem.item.questionItem.question.choiceQuestion.type==='CHECKBOX');
      assert.equal(radio.length,24);assert.equal(checks.length,16);
      for(const item of checks)assert.equal(item.createItem.item.questionItem.question.grading.correctAnswers.answers.length,2);
    }
    return {getResponseCode:()=>http,getContentText:()=>body};
  }}
};
vm.createContext(ctx);
vm.runInContext(pipeline+'\n'+direct,ctx);
const questions=Array.from({length:40},(_,i)=>{
  const multi=i>=24;
  return {
    tipo:multi?'CASILLAS':'OPCION_MULTIPLE',pregunta:'Situación técnica '+i,
    opciones:['Opción A '+i,'Opción B '+i,'Opción C '+i,'Opción D '+i],
    respuestaCorrecta:multi?['Opción A '+i,'Opción C '+i]:'Opción A '+i,
    puntos:multi?(i%2===0?3:2):(i%2===0?3:2),
    obligatoria:true
  };
});
const normalized=ctx.normalizarPreguntasDirectas_(questions);
assert.equal(normalized.reduce((s,x)=>s+x.data.Puntos,0),100);
const quiz={'Título':'PRUEBA Examen U2','Tipo instrumento':'EXAMEN',
  'Política retroalimentación':'SIN_RETROALIMENTACION',
  'Barajar preguntas':'NO',Instrucciones:'PRUEBA'};
assert.equal(ctx.buildQuizForm_(quiz,normalized),form);
assert.equal(created,1);assert.equal(batched,1);assert.equal(trashed,0);
let invalid=questions.map(x=>({...x}));
invalid[25]={...invalid[25],respuestaCorrecta:['Opción A 25']};
assert.throws(()=>ctx.buildQuizForm_(quiz,ctx.normalizarPreguntasDirectas_(invalid)),/EXAMEN_RESPUESTA_INVALIDA_PREGUNTA_26/);
assert.equal(created,1,'Validation must happen before creating form');
http=403;body=JSON.stringify({error:{code:403,status:'PERMISSION_DENIED',message:'Sensitive opaque message'}});
assert.throws(()=>ctx.buildQuizForm_(quiz,normalized),/FORMS_BATCHUPDATE_HTTP_403_PERMISSION_DENIED_UNKNOWN/);
assert.equal(trashed,1);
transportError=true;
assert.throws(()=>ctx.buildQuizForm_(quiz,normalized),/FORMS_BATCHUPDATE_TIMEOUT/);
assert.equal(trashed,2);
console.log('PASS: 40 mixed questions, 100 points, one Forms batch, fail-closed cleanup, and safe provider diagnostics.');
