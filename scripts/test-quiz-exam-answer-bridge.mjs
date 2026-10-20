import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const direct=fs.readFileSync('src/20_CreacionDirectaRecursos.gs','utf8');
const pipeline=fs.readFileSync('src/01_PipelineQuizzes.gs','utf8');
let trashCount=0,createCount=0;
const form={
 getId:()=> 'fake_form_id',
 supportsAdvancedResponderPermissions:()=>true,
 isPublished:()=>false,
 setDescription(){return this;}, setIsQuiz(){return this;},
 setCollectEmail(){return this;},setShuffleQuestions(){return this;},
 setLimitOneResponsePerUser(){return this;},
 setShowLinkToRespondAgain(){return this;},setPublishingSummary(){return this;}
};
const ctx={
 console:{warn(){}},
 FormApp:{create:(title,published)=>{
   assert.equal(published,false);createCount++;return form;
 }},
 DriveApp:{getFileById:()=>({setTrashed:v=>{if(v)trashCount++;}})},
 clean_:v=>String(v===undefined||v===null?'':v).trim(),
 quizDescription_:s=>s,
 configureVerifiedEmail_:()=>{},
 yes_:v=>String(v).toUpperCase()==='SÍ'
};
vm.createContext(ctx);
vm.runInContext(pipeline+'\n'+direct,ctx);
const raw=(answer,opts=['Listo','Bloqueado','Terminado','Nuevo'],type='OPCION_MULTIPLE')=>[
 {pregunta:'¿En qué estado?',opciones:opts,respuestaCorrecta:answer,puntos:5,tipo:type,
 retroalimentacionCorrecta:'Correcto',retroalimentacionIncorrecta:'Inténtalo de nuevo'}
];
const normalize=questions=>ctx.normalizarPreguntasDirectas_(questions)[0].data['Respuesta correcta'];
assert.equal(normalize(raw('Listo')),'A');
assert.equal(normalize(raw('Bloqueado')),'B');
assert.equal(normalize(raw('A')),'A');
assert.equal(normalize(raw('A,B',undefined,'CASILLAS')),'A,B');
assert.equal(normalize(raw(['Listo','Terminado'],undefined,'CASILLAS')),'A,C');
assert.equal(normalize(raw('Esperando CPU',['Esperando CPU','Terminado','Nuevo','Ejecutando E/S'])),'A');
assert.equal(normalize(raw('Texto de respuesta',['Opción 1','Opción 2'],'RESPUESTA_CORTA')),'Texto de respuesta');
assert.equal(normalize(raw('Listo',['Listo','Listo','Nuevo','Terminado'])),'Listo',
  'Ambiguous option labels must not be guessed');

const questions=Array.from({length:25},(_,i)=>({...raw('Esperando CPU',['Esperando CPU','Terminado','Nuevo','Ejecutando E/S'])[0],pregunta:'Pregunta '+(i+1),puntos:4}));
const transformed=ctx.normalizarPreguntasDirectas_(questions);
assert.equal(transformed.length,25);
assert.equal(transformed.reduce((sum,r)=>sum+r.data.Puntos,0),100);
assert.ok(transformed.every(r=>r.data['Respuesta correcta']==='A'));

const invalid=ctx.normalizarPreguntasDirectas_(raw('Respuesta que no existe'));
assert.throws(()=>ctx.buildQuizForm_({
 'Título':'PRUEBA QUIZ','Tipo instrumento':'QUIZ','Política retroalimentación':'CON_RETROALIMENTACION',
 'Barajar preguntas':'NO',Instrucciones:'PRUEBA'
},invalid),/Respuesta invalida en pregunta 1/);
assert.equal(createCount,1);
assert.equal(trashCount,1,'Form must be trashed if builder fails before returning it');
console.log('PASS: exact option labels -> letters for quiz/exam; duplicate labels rejected; incomplete Forms trashed.');
