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
  setProperty:(k,v)=>props.set(k,v)
 })},
 validarArranqueAcademicoWeb_:()=>({contractVersion:'1.1.0'}),
 executeAuthenticatedAcademicWrite_:()=>{throw Error('EXAMEN_SYNTHETIC_FAILURE: simulated internal details')},
 respuestaAcademicaWeb_:value=>value
};
vm.createContext(ctx);
vm.runInContext(web+'\n'+maintenance,ctx);
const result=ctx.ejecutarServicioAcademicoWeb_({
 action:'uaqExecutor',operation:'examen',courseId:'875776451793',requestId:'test-request'
});
assert.equal(result.ok,false);
assert.equal(result.errorCode,'EXAMEN_SYNTHETIC_FAILURE');
assert.match(result.error,/simulated internal details/);
const summary=ctx.diagnosticarPropiedadesAcademicas();
assert.equal(summary.recibosPendientes,2);
assert.equal(summary.recibosPendientesPorOperacion.examen,2);
assert.equal(summary.ultimoErrorWebApp.code,'EXAMEN_SYNTHETIC_FAILURE');
assert.equal(summary.ultimoErrorWebApp.operation,'examen');
assert.equal(summary.claveHmacConfigurada,true);
assert.ok(!log.join(' ').includes('DO_NOT_PRINT_THIS_TEST_SECRET_'));
assert.ok(!log.join(' ').includes('ACADEMIC_WRITE_RECEIPT_111'));
assert.ok(!log.join(' ').includes('simulated internal details'),
  'Only error codes, not internal exceptions, belong in persistent logs');
console.log('PASS: WebApp returns safe error code and receipts diagnostics without leaking secrets or question content.');
