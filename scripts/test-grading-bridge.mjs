import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSignedGradingRequest,submitSignedGradingRequest} from '../site-bridge/grading-client.mjs';

const manifest={contractVersion:'v1',repository:'owner/repo',workflow:{name:'legacy'},webApp:{url:'https://script.google.com/macros/s/canonical/exec'},courses:{course:{id:'123456789'}}};
const options={manifest,manifestSha256:'a'.repeat(64),hmacSecret:'x'.repeat(48),now:1700000000000,nonce:'abcdefghABCDEFGH1234567890'};
const base={action:'listarEntregasEvaluables',courseId:'123456789',courseWorkId:'987654321',requestId:'request_1234567890'};

test('signs a known course read request',()=>{
  const payload=buildSignedGradingRequest(base,options);
  assert.equal(payload.action,'listarEntregasEvaluables');
  assert.equal(payload.params.courseWorkId,'987654321');
  assert.match(payload.auth.signature,/^[a-f0-9]{64}$/);
});
test('rejects unknown courses',()=>{
  assert.throws(()=>buildSignedGradingRequest({...base,courseId:'0000'},options),/UNKNOWN_CANONICAL_COURSE/);
});
test('rejects extra publication or return fields',()=>{
  assert.throws(()=>buildSignedGradingRequest({...base,action:'guardarEvaluacionDraft',submissionId:'sub1',evaluation:{
    confirmed:true,evidenceReviewed:true,score:90,maxPoints:100,assignedGrade:90
  }},options),/GRADING_FIELD_NOT_ALLOWED/);
});
test('requires reviewed evidence approval',()=>{
  assert.throws(()=>buildSignedGradingRequest({...base,action:'guardarEvaluacionDraft',submissionId:'sub1',
    evaluation:{confirmed:false,evidenceReviewed:true}},options),/GRADE_APPROVAL_REQUIRED/);
});
test('rejects a purported final-grade response',async()=>{
  const payload=buildSignedGradingRequest({...base,action:'guardarEvaluacionDraft',submissionId:'sub1',
    evaluation:{confirmed:true,evidenceReviewed:true,score:80,maxPoints:100,criteria:[],justification:'x',reviewedFileIds:['file1']}},options);
  await assert.rejects(submitSignedGradingRequest(payload,{
    webAppUrl:manifest.webApp.url,
    fetchImpl:async()=>({ok:true,json:async()=>({ok:true,action:'guardarEvaluacionDraft',
      result:{draftGrade:80,assignedGrade:80,returnedByAutomation:false}})})
  }),/GRADING_POSTFLIGHT_INVALID/);
});

test('rejects unknown grading actions before network access',()=>{
  assert.throws(()=>buildSignedGradingRequest({...base,action:'returnSubmission'},options),/GRADING_ACTION_INVALID/);
});
