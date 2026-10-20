import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {buildSignedAcademicDraft,submitSignedAcademicDraft,prepareAuthorizedAcademicDraft,buildAuthorizedSignedAcademicDraft} from '../site-bridge/direct-write-client.mjs';

const raw=fs.readFileSync('config/academic-context.json','utf8');
const manifest=JSON.parse(raw);
const secret='THIS_IS_ONLY_A_UNIT_TEST_SECRET_AND_NOT_REAL';
const config={
 manifest,manifestSha256:crypto.createHash('sha256').update(raw).digest('hex'),
 hmacSecret:secret,now:Date.now(),nonce:'another_random_nonce_1234'
};
const source={operation:'tarea',courseId:'871158466533',requestId:'write-draft-request-00001',params:{titulo:'Prueba',state:'DRAFT'}};
const signed=buildSignedAcademicDraft(source,config);
assert.equal(signed.action,'uaqExecutor');
assert.equal(signed.params.state,'DRAFT');
assert.equal(signed.params.resourceState,'DRAFT');
assert.equal(signed.params.courseWorkState,'DRAFT');
const unsigned={...signed};delete unsigned.auth;
assert.equal(signed.auth.signature,crypto.createHmac('sha256',secret).update(JSON.stringify(unsigned)).digest('hex'));

assert.throws(()=>buildSignedAcademicDraft({...source,courseId:'123456789'},config),/UNKNOWN_CANONICAL_COURSE/);
assert.throws(()=>buildSignedAcademicDraft({...source,operation:'eliminarDrafts'},config),/WRITE_OPERATION_NOT_ALLOWED/);
assert.throws(()=>buildSignedAcademicDraft({...source,requestId:'x'},config),/REQUEST_ID_REQUIRED/);
assert.throws(()=>buildSignedAcademicDraft({...source,params:{state:'PUBLISHED'}},config),/ACADEMIC_DRAFT_REQUIRED/);
assert.throws(()=>buildSignedAcademicDraft(source,{...config,hmacSecret:null}),/WRITE_SECRET_NOT_CONFIGURED/);


const namedTitle='Clase 19 - Sincronización: mutex y semáforos';
const authorized={
  confirmed:true,courseId:'875776451793',operation:'clase',
  requestId:'classroom-title-contract-01',title:namedTitle,state:'DRAFT'
};
const namedSource={
  operation:'clase',courseId:authorized.courseId,
  requestId:authorized.requestId,title:namedTitle,authorization:authorized,
  params:{
    resources:[{type:'actividad',params:{
      titulo:'Actividad - Ejemplo de mutex',state:'DRAFT',materia:'Sistemas Operativos',
      temaSubtema:'Sincronización: mutex y semáforos'}}],
    state:'DRAFT'
  }
};
const prepared=prepareAuthorizedAcademicDraft(namedSource);
assert.equal(prepared.params.title,namedTitle);
assert.equal(prepared.params.titulo,namedTitle);
assert.equal(prepared.params.resources[0].params.titulo,'Actividad - Ejemplo de mutex',
 'Child resource titles must remain independent of class package identity');
const signedNamed=buildAuthorizedSignedAcademicDraft(namedSource,config);
const signedViaDefault=buildSignedAcademicDraft(namedSource,config);
assert.equal(signedViaDefault.params.titulo,namedTitle);
assert.equal(signedViaDefault.params.title,namedTitle);
assert.equal(signedNamed.params.title,namedTitle);
assert.equal(signedNamed.params.titulo,namedTitle);
assert.equal(signedNamed.auth.signature,
 crypto.createHmac('sha256',secret).update(JSON.stringify(
  Object.fromEntries(Object.entries(signedNamed).filter(([key])=>key!=='auth'))
 )).digest('hex'));
for(const alias of ['title','titulo']) {
  assert.throws(()=>prepareAuthorizedAcademicDraft({
    ...namedSource,params:{...namedSource.params,[alias]:'Different unauthorized title'}
  }),/AUTHORIZED_TITLE_MISMATCH/);
}
assert.throws(()=>prepareAuthorizedAcademicDraft({
  ...namedSource,authorization:{...authorized,title:'Different title'}
}),/AUTHORIZED_TITLE_MISMATCH/);
assert.throws(()=>prepareAuthorizedAcademicDraft({
  ...namedSource,authorization:{...authorized,courseId:'123'}
}),/ACADEMIC_WRITE_OWNER_AUTHORIZATION_MISMATCH/);
assert.throws(()=>prepareAuthorizedAcademicDraft({
  ...namedSource,params:{resources:[]}
}),/CLASE_REQUIERE_RECURSOS/);
const attendance='AUTO_CONSECUTIVO';
assert.deepEqual(prepareAuthorizedAcademicDraft({
 operation:'quizAsistencia',courseId:authorized.courseId,requestId:'attendance-approval-012',
 title:attendance,authorization:{confirmed:true,courseId:authorized.courseId,
 operation:'quizAsistencia',title:attendance,state:'DRAFT',requestId:'attendance-approval-012'},
 params:{state:'DRAFT'}
}).params,{state:'DRAFT'});

let count=0;
const expected={
 ok:true,gateway:'UAQ_EXECUTOR',alternativeRouteUsed:false,
 action:'uaqExecutor',operation:'tarea',state:'DRAFT'
};
const good=await submitSignedAcademicDraft(signed,{
 webAppUrl:manifest.webApp.url,
 fetchImpl:async (url,options)=>{
   count++;
   assert.equal(url,manifest.webApp.url);
   assert.equal(options.method,'POST');
   assert.equal(JSON.parse(options.body).requestId,source.requestId);
   assert.ok(!options.headers['Authorization']);
   return {ok:true,json:async()=>expected};
 }
});
assert.deepEqual(good,expected);
assert.equal(count,1);
await assert.rejects(submitSignedAcademicDraft(signed,{
 webAppUrl:manifest.webApp.url,
 fetchImpl:async()=>{count++;throw new Error('unknown network error');}
}),/WRITE_OUTCOME_UNKNOWN_RECONCILE/);
assert.equal(count,2,'Ambiguous responses must never be retried');
await assert.rejects(submitSignedAcademicDraft(signed,{
 webAppUrl:manifest.webApp.url,
 fetchImpl:async()=>{count++;return {ok:true,json:async()=>({ok:true})};}
}),/WEBAPP_WRITE_GATEWAY_PROOF_MISSING/);
assert.equal(count,3);
await assert.rejects(submitSignedAcademicDraft(signed,{
 webAppUrl:manifest.webApp.url,
 fetchImpl:async()=>({ok:true,json:async()=>({
   ok:false,errorCode:'EXAMEN_BATCH_POSTFLIGHT_ITEMS_MISMATCH',
   error:'Do not expose original exception with private data'
 })})
}),/WEBAPP_WRITE_REJECTED_EXAMEN_BATCH_POSTFLIGHT_ITEMS_MISMATCH_RECONCILE/);
await assert.rejects(submitSignedAcademicDraft(signed,{
 webAppUrl:manifest.webApp.url,
 fetchImpl:async()=>({ok:true,json:async()=>({
   ok:false,errorCode:'INJECT PRIVATE STUDENT DATA'
 })})
}),/WEBAPP_WRITE_REJECTED_UNKNOWN_RECONCILE/);
console.log('PASS: Site signs canonical draft WebApp request, rejects invalid courses/operations, never retries writes.');
