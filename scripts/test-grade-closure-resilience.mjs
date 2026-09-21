import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const policy=fs.readFileSync('src/18_PoliticaCalificacionesDraft.gs','utf8');
const close=fs.readFileSync('src/10_PublicarCalificacionUnidad.gs','utf8');
const facade=fs.readFileSync('src/15_OperacionesAcademicas.gs','utf8');
assert.match(policy,/updateMask: 'draftGrade'/);
assert.doesNotMatch(policy,/updateMask: 'draftGrade,assignedGrade'/);
assert.doesNotMatch(policy,/\{draftGrade: value, assignedGrade:/);
assert.match(close,/CLOSE_MANUAL_GRADE_PRESENT/);
assert.match(close,/CLOSE_VERIFY_PENDING/);
assert.match(facade,/LockService\.getScriptLock\(\)/);
assert.match(facade,/lock\.releaseLock\(\)/);
function extract(source,name){
  const at=source.indexOf('function '+name+'(');
  assert.ok(at>=0,'No se encuentra '+name);
  const end=source.indexOf('\n}',at);
  assert.ok(end>at,'Sin final '+name);
  return source.slice(at,end+2);
}
const base={
  ACADEMIC_POLICY:{CLASSROOM:{AUTOMATIC_GRADE_FIELD:'draftGrade',AUTOMATIC_ASSIGNED_GRADE:false,AUTOMATIC_RETURN:false}},
  Utilities:{sleep(){}},
  submissions:{alice:{id:'sub-a',draftGrade:56,assignedGrade:null},bob:{id:'sub-b',draftGrade:61,assignedGrade:null}},
  Classroom:{Courses:{CourseWork:{StudentSubmissions:{patch(body,courseId,workId,subId,opts){
    assert.deepEqual(Object.keys(body),['draftGrade']);
    assert.equal(opts.updateMask,'draftGrade');
    assert.equal(courseId,'course');
    assert.equal(workId,'work');
    const uid=subId==='sub-a'?'alice':'bob';
    base.submissions[uid].draftGrade=body.draftGrade;
  }}}}},
  entregasPorAlumnoPublicacion_:()=>base.submissions
};
vm.createContext(base);
for(const [src,name] of [[policy,'escribirCalificacionDraft_'],[policy,'verificarCalificacionDraft_'],[close,'verificarYReintentarCalificacionUnidad_']])
  vm.runInContext(extract(src,name),base);
const execute=(js)=>vm.runInContext(js,base);
const work=[{uid:'alice',submissionId:'sub-a',grade:61},{uid:'bob',submissionId:'sub-b',grade:66}];
base.work=work;
assert.equal(execute('verificarYReintentarCalificacionUnidad_("course","work",work).length'),0);
assert.equal(base.submissions.alice.draftGrade,61);
assert.equal(base.submissions.bob.draftGrade,66);
base.submissions.bob.assignedGrade=90;
assert.throws(()=>execute('verificarYReintentarCalificacionUnidad_("course","work",work)'),/CLOSE_MANUAL_GRADE_PRESENT/);
assert.equal(base.submissions.bob.assignedGrade,90);
base.ACADEMIC_POLICY.NAMING={UNIT_PREFIX:'Unidad '};
base.extraerNumeroUnidad_=text=>{const m=String(text||'').match(/^Unidad\\s+(\\d+)$/);return m?Number(m[1]):null;};
vm.runInContext(extract(facade,'normalizarUnidadOperacion_'),base);
assert.equal(execute('normalizarUnidadOperacion_(2)'),'Unidad 2');
assert.equal(execute('normalizarUnidadOperacion_("2")'),'Unidad 2');
assert.equal(execute('normalizarUnidadOperacion_("Unidad 2")'),'Unidad 2');
assert.throws(()=>execute('normalizarUnidadOperacion_("2.5")'),/No se pudo identificar/);
assert.throws(()=>execute('normalizarUnidadOperacion_(0)'),/No se pudo identificar/);
assert.match(facade,/modo:'OMITIDO_POR_NOTAS_ASIGNADAS'/);
assert.match(facade,/noWrites:true/);
assert.ok(facade.indexOf('const publicado=detectarCierreConNotasAsignadas_')<
  facade.indexOf('const ss = SpreadsheetApp.openById',facade.indexOf('const publicado=detectarCierreConNotasAsignadas_')));
const remote=fs.readFileSync('src/38_ExecutionApi.gs','utf8');
assert.match(remote,/verification:'CLOSE_MANUAL_GRADES_PROTECTED'/);
assert.match(remote,/actual\.assignedGrades<1/);
console.log('PASS: cierre reintenta notas desactualizadas, protege assignedGrade, usa exclusivamente draftGrade y serializa cierres.');
