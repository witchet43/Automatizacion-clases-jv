import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
const task=fs.readFileSync('src/27_VencimientoTarea.gs','utf8');
const entry=fs.readFileSync('src/22_EntrypointsRecursosSeguros.gs','utf8');
const helpers={
  primerValorTextoActividad_(...xs){return xs.map(x=>String(x||'').trim()).find(Boolean)||''},
  parseFechaHoraLocalActividad_(fecha,hora){
    const date=String(fecha),time=String(hora);
    assert.match(date,/^\d{4}-\d{2}-\d{2}$/);
    assert.match(time,/^\d{2}:\d{2}$/);
    return {fecha:date,hora:time,localComparableMs:Date.parse(date+'T'+time+':00Z')};
  },
  convertirFechaHoraLocalActividadAUtc_(value,offset){
    const ms=value.localComparableMs-offset*60000,when=new Date(ms);
    return {fecha:when.toISOString().slice(0,10),hora:when.toISOString().slice(11,16)};
  },
  Classroom:{Courses:{CourseWork:{get:()=>({state:'DRAFT'})}}},
  Date,Number,String,Object,Array,Error
};
vm.createContext(helpers);
vm.runInContext(policy+'\n'+task,helpers);
const evaluate=(input,nowDate='2026-10-21',nowTime='10:00')=>
  helpers.aplicarReglaVencimientoTareaConAhora_(
    input,helpers.parseFechaHoraLocalActividad_(nowDate,nowTime));
const omit=(v,reason)=>{
  assert.equal(v.backfillSinVencimiento,true);
  assert.equal(v.vencimientoOmitidoMotivo,reason);
  for(const key of ['fechaLimite','horaLimite','fechaLimiteLocal','horaLimiteLocal','dueDate','dueTime'])
    assert.equal(v[key],undefined,key+' must not survive omit');
};
const noContext=evaluate({titulo:'Tarea 19'});
omit(noContext,'SIGUIENTE_SESION_NO_DETERMINADA');
omit(evaluate({fechaSiguienteSesion:'2026-11-04'}),'SIGUIENTE_SESION_NO_DETERMINADA');
omit(evaluate({fechaSiguienteSesion:'2026-09-24',horaInicioSiguienteSesion:'07:00'}),
 'SIGUIENTE_SESION_TRANSCURRIDA');
omit(evaluate({fechaSiguienteSesion:'2026-11-04',horaInicioSiguienteSesion:'07:00',
 fechaLimite:'2026-10-20',horaLimite:'15:00'}),'VENCIMIENTO_TRANSCURRIDO');
omit(evaluate({fechaSiguienteSesion:'2026-11-04',horaInicioSiguienteSesion:'07:00',
 fechaLimite:'2026-11-04',horaLimite:'07:10'}),'VENCIMIENTO_POSTERIOR_A_CLASE');
omit(evaluate({fechaSiguienteSesion:'2026-11-04',horaInicioSiguienteSesion:'07:00',
 fechaLimite:'2026-11-04'}),'VENCIMIENTO_INCOMPLETO');
omit(evaluate({backfillDraft:true,explicitSequenceOverride:true,
 fechaLimite:'2026-09-24',horaLimite:'07:00'}),'RECUPERACION_RETROSPECTIVA');
const future=evaluate({fechaSiguienteSesion:'2026-11-04',horaInicioSiguienteSesion:'07:00'});
assert.equal(future.backfillSinVencimiento,false);
assert.equal(future.fechaLimite,'2026-11-04');
assert.equal(future.horaLimite,'13:00');
const earlier=evaluate({fechaSiguienteSesion:'2026-11-04',horaInicioSiguienteSesion:'07:00',
 fechaLimite:'2026-11-04',horaLimite:'06:30'});
assert.equal(earlier.horaLimite,'12:30');
assert.equal(earlier.backfillSinVencimiento,false);
const invalidPolicy=vm.runInContext('ACADEMIC_POLICY.CLASSROOM.TASK_DUE',helpers);
assert.equal(invalidPolicy.REQUIRED,false);
assert.equal(invalidPolicy.PAST_DUE,'OMIT_DUE');
assert.equal(helpers.validarVencimientoTareaCanonico().ok,true);
assert.match(entry,/verificarVencimientoTareaCreada_\(tarea.courseId,result.workId,tarea\)/);
const verified=helpers.verificarVencimientoTareaCreada_('123','999',noContext);
assert.equal(verified.state,'DRAFT');
console.log('PASS: optional task next-session date, historical/expired due omission, future due, signed DRAFT entrypoint verification.');
