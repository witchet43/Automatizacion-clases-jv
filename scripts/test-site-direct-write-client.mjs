import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {buildSignedAcademicDraft,submitSignedAcademicDraft} from '../site-bridge/direct-write-client.mjs';

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
