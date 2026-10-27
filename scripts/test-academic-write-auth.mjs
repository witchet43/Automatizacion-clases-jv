import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/00_AcademicWriteAuthorization.gs','utf8');
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const KEY='dev-only-test-hmac-secret-this-is-not-production';
const props=new Map([['ACADEMIC_WRITE_HMAC_KEY',KEY]]);
let acquired=false;
const sandbox={
  Date,
  PropertiesService:{getScriptProperties:()=>({
    getProperty:k=>props.get(k)??null,
    setProperty:(k,v)=>{props.set(k,String(v));return null;}
  })},
  LockService:{getScriptLock:()=>({
    tryLock:()=>{if(acquired)return false;acquired=true;return true;},
    waitLock:()=>{if(acquired)throw new Error('LOCK_REENTRY_BLOCKED');acquired=true;},
    releaseLock:()=>{acquired=false;}
  })},
  Utilities:{
    Charset:{UTF_8:'UTF-8'},
    DigestAlgorithm:{SHA_256:'SHA-256'},
    computeDigest:(_algorithm,input)=>[...crypto.createHash('sha256').update(input).digest()].map(x=>x>127?x-256:x),
    computeHmacSha256Signature:(input,key)=>[...crypto.createHmac('sha256',key).update(input).digest()].map(x=>x>127?x-256:x)
  }
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);

const mk=(id='unique-write-request-0001')=>{
 const payload={
   action:'uaqExecutor',operation:'tarea',courseId:'871158466533',
   requestId:id,params:{titulo:'Prueba',state:'DRAFT'},
   operationalContext:{contractVersion:'1.1.0'}
 };
 const signature=crypto.createHmac('sha256',KEY).update(JSON.stringify(payload)).digest('hex');
 return {...payload,auth:{timestamp:Date.now(),nonce:'randomnonce123456789012',signature}};
};

let effects=0;
const valid=mk();
assert.equal(sandbox.executeAuthenticatedAcademicWrite_(valid,()=>{effects++;return 'created';}),'created');
assert.equal(effects,1);
assert.equal(acquired,false);
assert.throws(()=>sandbox.executeAuthenticatedAcademicWrite_(valid,()=>{effects++;}),/ACADEMIC_WRITE_DUPLICATE_BLOCKED/);
assert.equal(effects,1,'Replays must not create another resource');

// Regression for the real quizAsistencia entrypoint: its own ScriptLock
// MUST be obtainable while the outer request receipt is PENDING.
const quiz=mk('quiz-asistencia-nested-lock-007');
assert.equal(sandbox.executeAuthenticatedAcademicWrite_(quiz,()=>{
  const inner=sandbox.LockService.getScriptLock();
  inner.waitLock(10000);
  try {effects++;return 'QUIZ_CREATED_DRAFT';}
  finally{inner.releaseLock();}
}), 'QUIZ_CREATED_DRAFT');
assert.equal(acquired,false,'The inner quiz lock must release independently');
assert.throws(()=>sandbox.executeAuthenticatedAcademicWrite_(quiz,()=>{effects++;}),/ACADEMIC_WRITE_DUPLICATE_BLOCKED/);
assert.equal(effects,2,'Quiz cannot be created twice');

const tests=[
  [()=>({...mk('tamper-request-000002'),params:{state:'PUBLISHED'}}),/ACADEMIC_WRITE_AUTH_INVALID/],
  [()=>({...mk('missing-auth-00000003'),auth:undefined}),/ACADEMIC_WRITE_AUTH_REQUIRED/],
  [()=>({...mk('expired-auth-00000004'),auth:{...mk().auth,timestamp:Date.now()-3600000}}),/ACADEMIC_WRITE_AUTH_EXPIRED/],
  [()=>({...mk('short'),auth:mk().auth}),/ACADEMIC_WRITE_REQUEST_ID_REQUIRED/],
];
for(const [maker,error] of tests)assert.throws(()=>sandbox.executeAuthenticatedAcademicWrite_(maker(),()=>{effects++;}),error);
assert.equal(effects,2,'Invalid calls must not have side effects');

const unknown=mk('write-failed-midstream-005');
assert.throws(()=>sandbox.executeAuthenticatedAcademicWrite_(unknown,()=>{effects++;throw Error('UPSTREAM_TIMED_OUT');}),/UPSTREAM_TIMED_OUT/);
assert.equal(acquired,false,'Locks release even after failure');
assert.throws(()=>sandbox.executeAuthenticatedAcademicWrite_(unknown,()=>{effects++;}),/ACADEMIC_WRITE_DUPLICATE_BLOCKED/);
assert.equal(effects,3,'Unknown commit states must not be retried automatically');

props.delete('ACADEMIC_WRITE_HMAC_KEY');
assert.throws(()=>sandbox.executeAuthenticatedAcademicWrite_(mk('key-unconfigured-006'),()=>{effects++;}),/ACADEMIC_WRITE_KEY_NOT_CONFIGURED/);
assert.equal(effects,3);
assert.match(web,/executeAuthenticatedAcademicWrite_\(p,function\(\)\{\s*return ejecutarUaqExecutorWeb_\(p\)/);
assert.match(web,/executeAuthenticatedAcademicWrite_\(p,function\(\)\{\s*return eliminarCourseWorkDraftsWeb_\(course,p\)/);
assert.match(web,/ACADEMIC_READ_ONLY_GET_REQUIRED/);

// HMAC probe must validate the signature before any academic action or receipt.
assert.match(web,/if\(action==='diagnosticarFirma'\)\{/);
assert.match(web,/academic-hmac-key-equivalence:/);
assert.match(web,/validateAcademicWriteAuthorization_\(p,props\)/);
assert.match(web,/keyEquivalent,signatureAccepted/);
assert.ok(web.indexOf("if(action==='diagnosticarFirma')") < web.indexOf("const operationalContext=validarArranqueAcademicoWeb_"));

console.log('PASS: HMAC authorization, reentrant quiz lock avoidance, duplicate blocking, and failure isolation.');
