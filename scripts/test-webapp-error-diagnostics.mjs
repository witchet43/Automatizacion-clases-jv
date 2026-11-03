import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const maintenance=fs.readFileSync('src/66_MantenimientoPropiedadesAcademicas.gs','utf8');
const props=new Map([
 ['ACADEMIC_WRITE_HMAC_KEY','DO_NOT_PRINT_THIS_TEST_SECRET_1234567890ABC'],
 ['ACADEMIC_WRITE_RECEIPT_111',JSON.stringify({status:'PENDING',operation:'examen',at:1})],
 ['ACADEMIC_WRITE_RECEIPT_222',JSON.stringify({status:'PENDING',operation:'examen',at:2})],
 ['ACADEMIC_WRITE_RECEIPT_333',JSON.stringify({status:'COMPLETED',operation:'quiz',at:3})]
]);
const log=[];
const ctx={
 Date,console:{log:x=>log.push(String(x)),error:x=>log.push(String(x))},
 ContentService:{MimeType:{JSON:'JSON'},createTextOutput:raw=>({setMimeType:()=>JSON.parse(raw)})},
 PropertiesService:{getScriptProperties:()=>({
  getProperties:()=>Object.fromEntries(props),
  getProperty:k=>props.get(k),
  setProperty:(k,v)=>props.set(k,v)
 })},
 validarArranqueAcademicoWeb_:()=>({contractVersion:'1.1.0'}),
 executeAuthenticatedAcademicWrite_:()=>{throw Error('EXAMEN_SYNTHETIC_FAILURE: simulated internal details')},
 respuestaAcademicaWeb_:value=>value
};
vm.createContext(ctx);
vm.runInContext(web+'\n'+maintenance,ctx);
const invalidJson=ctx.doPost({postData:{contents:'{invalid'}});
assert.equal(invalidJson.errorCode,'JSON_INVALIDO');
assert.equal(invalidJson.errorDetails.failedAt,'APPS_SCRIPT_REQUEST_PARSE');
assert.equal(invalidJson.errorDetails.stage,'REQUEST_PARSE');
const invalidGet=ctx.doGet({parameter:{action:'clase'}});
assert.equal(invalidGet.errorCode,'ACADEMIC_READ_ONLY_GET_REQUIRED');
assert.equal(invalidGet.errorDetails.failedAt,'APPS_SCRIPT_HTTP_ENTRY');
const result=ctx.ejecutarServicioAcademicoWeb_({
 action:'uaqExecutor',operation:'examen',courseId:'875776451793',requestId:'test-request'
});
assert.equal(result.ok,false);
assert.equal(result.errorCode,'EXAMEN_SYNTHETIC_FAILURE');
assert.equal(result.error,'EXAMEN_SYNTHETIC_FAILURE');
assert.ok(!JSON.stringify(result).includes('simulated internal details'),
  'No raw backend exception or sensitive detail reaches the caller');
const summary=ctx.diagnosticarPropiedadesAcademicas();
assert.equal(summary.recibosPendientes,2);
assert.equal(summary.recibosPendientesPorOperacion.examen,2);
assert.equal(summary.ultimoErrorWebApp.code,'EXAMEN_SYNTHETIC_FAILURE');
assert.equal(summary.ultimoErrorWebApp.operation,'examen');
const safe=ctx.leerUltimoFalloAcademicoWeb_('875776451793');
assert.equal(safe.code,'EXAMEN_SYNTHETIC_FAILURE');
assert.equal(safe.operation,'examen');
assert.equal(safe.stage,'ACADEMIC_EXECUTION');
assert.equal(safe.failedAt,'APPS_SCRIPT_EXECUTION');
assert.equal(safe.provider,'GOOGLE_APPS_SCRIPT');
assert.equal(result.errorDetails.failedAt,'APPS_SCRIPT_EXECUTION');
assert.equal(result.errorDetails.provider,'GOOGLE_APPS_SCRIPT');
assert.equal(ctx.leerUltimoFalloAcademicoWeb_('123456789'),null,
  'Failure diagnostics must not leak across courses');
assert.equal(result.errorDetails.code,'EXAMEN_SYNTHETIC_FAILURE');
assert.ok(!JSON.stringify(safe).includes('simulated internal details'));
const mapped=ctx.detallarFalloAcademicoWeb_(new Error(
 'TAREA requiere fechaSiguienteSesion y horaInicioSiguienteSesion'),
 {action:'uaqExecutor',operation:'clase',courseId:'875776451793',requestId:'SO_C19_MUTEX_SEM_20261021_V1'});
assert.equal(mapped.code,'TASK_NEXT_SESSION_CONTEXT_MISSING');
assert.equal(mapped.stage,'PREFLIGHT_OR_POLICY');
assert.equal(mapped.requestIdHint,'_20261021_V1');
assert.equal(mapped.failedAt,'APPS_SCRIPT_POLICY_PREFLIGHT');
const classroom=ctx.detallarFalloAcademicoWeb_(new Error(
  'GoogleJsonResponseException: API call to classroom.courses.courseWork.list failed'),
  {action:'diagnosticarClase',courseId:'875776451793'});
assert.equal(classroom.provider,'GOOGLE_CLASSROOM');
assert.equal(classroom.failedAt,'GOOGLE_CLASSROOM_API');
assert.equal(classroom.stage,'ACADEMIC_EXECUTION');
assert.ok(!JSON.stringify(classroom).includes('GoogleJsonResponseException'));
assert.equal(summary.claveHmacConfigurada,true);
assert.ok(!log.join(' ').includes('DO_NOT_PRINT_THIS_TEST_SECRET_'));
assert.ok(!log.join(' ').includes('ACADEMIC_WRITE_RECEIPT_111'));
assert.ok(!log.join(' ').includes('simulated internal details'),
  'Only error codes, not internal exceptions, belong in persistent logs');
console.log('PASS: WebApp returns safe error code and receipts diagnostics without leaking secrets or question content.');
