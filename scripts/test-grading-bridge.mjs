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

// Classroom omits false boolean values in JSON. Expose a stable boolean without inferring from timestamps.
test('submission listing exposes late true and false, including omitted default',async()=>{
  const {readFileSync}=await import('node:fs');
  const vm=await import('node:vm');
  const src=readFileSync('src/67_RevisionContenidoEntregas.gs','utf8');
  const records=[{id:'a',userId:'1',state:'TURNED_IN',late:true},{id:'b',userId:'2',state:'TURNED_IN',late:false},{id:'c',userId:'3',state:'CREATED'}];
  const ctx={Classroom:{Courses:{CourseWork:{get:()=>({title:'Task',maxPoints:100}),StudentSubmissions:{list:()=>({studentSubmissions:records})}}}}};
  vm.createContext(ctx);vm.runInContext(src,ctx);
  const result=vm.runInContext('listarEntregasEvaluables_("123","456")',ctx);
  assert.deepEqual(Array.from(result.submissions,s=>s.late),[true,false,false]);
});

test('authenticated coursework read exposes teacher materials separately from student attachments',async()=>{
  const {readFileSync}=await import('node:fs');
  const vm=await import('node:vm');
  const src=readFileSync('src/67_RevisionContenidoEntregas.gs','utf8');
  const materials=[
    {form:{title:'Exam',formUrl:'https://docs.google.com/forms/d/e/example/viewform',responseUrl:'https://docs.google.com/forms/d/original/edit'}},
    {link:{title:'Original exam link',url:'https://docs.google.com/forms/d/original/edit'}},
    {driveFile:{driveFile:{id:'file123',title:'Guide',alternateLink:'https://docs.google.com/document/d/file123/edit'},shareMode:'STUDENT_COPY'}},
    {youtubeVideo:{id:'v',title:'Video',alternateLink:'https://www.youtube.com/watch?v=v'}},
    {unknown:{}}
  ];
  const ctx={Classroom:{Courses:{CourseWork:{get:()=>({title:'Exam 3',maxPoints:100,state:'PUBLISHED',materials}),StudentSubmissions:{list:()=>({studentSubmissions:[{id:'s',userId:'u',assignmentSubmission:{attachments:[{link:{url:'https://example.test/student-evidence'}}]}}]})}}}}};
  vm.createContext(ctx);vm.runInContext(src,ctx);
  const r=vm.runInContext('listarEntregasEvaluables_("123","456")',ctx);
  assert.equal(r.state,'PUBLISHED');assert.equal(r.topicId,null);
  assert.deepEqual(Array.from(r.materials,m=>m.type),['FORM','LINK','DRIVE','YOUTUBE','OTHER']);
  assert.equal(r.materials[0].formUrl,materials[0].form.formUrl);
  assert.equal(r.materials[0].responseUrl,materials[0].form.responseUrl);
  assert.equal(r.materials[1].url,materials[1].link.url);
  assert.equal(r.materials[2].driveFileId,'file123');
  assert.equal(r.materials[2].shareMode,'STUDENT_COPY');
  assert.equal(r.submissions[0].attachments[0].linkUrl,'https://example.test/student-evidence');
  materials.length=0;
  assert.equal(vm.runInContext('listarEntregasEvaluables_("123","456")',ctx).materials.length,0);
});
