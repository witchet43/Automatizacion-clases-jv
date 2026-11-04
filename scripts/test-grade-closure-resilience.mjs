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
base.extraerNumeroUnidad_=text=>{const m=String(text||'').match(/^Unidad\s+(\d+)$/);return m?Number(m[1]):null;};
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
// Regression: the teacher chose an official U1 exam; the old exam must not
// contribute to either 70% (exam) or 30% (other published coursework).
const algSource=fs.readFileSync('src/13_RecalculoFinalCeros.gs','utf8');
const selectedWorks=[
  {id:'876666547526',title:'Examen 1',topicId:'u1',state:'PUBLISHED',maxPoints:100},
  {id:'878569197406',title:'Examen Unidad 1 - Algoritmos y Estructuras de Datos',topicId:'u1',state:'PUBLISHED',maxPoints:100},
  {id:'work-1',title:'Actividad 1',topicId:'u1',state:'PUBLISHED',maxPoints:100}
];
const gradesFor={
  '876666547526':{learner:{draftGrade:100}},
  '878569197406':{learner:{draftGrade:80}},
  'work-1':{learner:{draftGrade:100}}
};
const mockSheet={
  getLastRow:()=>2,
  getDataRange:()=>({getValues:()=>[
    ['ID del curso','Unidad / tema','Tipo instrumento','Título','ID actividad Classroom'],
    ['871156334717','Unidad 1','EXAMEN','Examen Unidad 1 - Algoritmos y Estructuras de Datos','878569197406']
  ]})
};
const algCtx={
  Set,Date,Math,Number,String,
  ACADEMIC_POLICY:{UNIT_GRADING:{SCOPE:'EXACT_UNIT_PUBLISHED',TOUCH_OTHER_UNITS:false,MISSING_GRADE_VALUE:0,FINAL_ROUNDING:'NEAREST_INTEGER'}},
  politicaCalificacionUnidad_:()=>({examWeight:0.7,nonExamWeight:0.3}),
  buscarTopicIdUnidad_:()=> 'u1',
  listarCourseWorkPublicacion_:()=>selectedWorks,
  entregasPorAlumnoPromedio_:(_course,id)=>gradesFor[id],
  listarAlumnosPromedio_:()=>[{userId:'learner',profile:{name:{fullName:'Alumno'}}}],
  tieneNota_:s=>s?.draftGrade!==null&&s?.draftGrade!==undefined,
  normalizarNota_:(s,max)=>Number(s.draftGrade)/max*100,
  promedioSimple_:x=>x.reduce((a,b)=>a+b,0)/x.length,
  redondearCalificacionFinalCanonica_:n=>Math.round(n),
  redondearPromedio_:n=>Math.round(n*100)/100,
  captured:null,
  escribirReportePromedios_(_ss,_course,_unit,rows){algCtx.captured=rows;}
};
const algSs={getSheetByName:name=>name==='Quizzes'?mockSheet:null};
algCtx.algSs=algSs;
vm.createContext(algCtx);
vm.runInContext(extract(algSource,'calcularPromediosDirectoClassroomConCeros_'),algCtx);
const algResult=vm.runInContext('calcularPromediosDirectoClassroomConCeros_(algSs,"871156334717","Unidad 1")',algCtx);
assert.equal(algResult.examenes.length,1);
assert.equal(algResult.examenes[0].classroomId,'878569197406');
assert.equal(algResult.noExamen.length,1);
assert.equal(algResult.noExamen[0].classroomId,'work-1');
assert.equal(algCtx.captured[0][10],86,'80x70% + 100x30% = 86, never counting Examen 1');
assert.throws(()=>vm.runInContext('calcularPromediosDirectoClassroomConCeros_(algSs,"another-course","Unidad 1")',algCtx),/Se esperaba exactamente 1 examen/,'Exception must not change other courses');
selectedWorks[1].state='DRAFT';
assert.throws(()=>vm.runInContext('calcularPromediosDirectoClassroomConCeros_(algSs,"871156334717","Unidad 1")',algCtx),/CLOSE_OFFICIAL_EXAM_NOT_FOUND/,'Never silently select the old exam');
selectedWorks[1].state='PUBLISHED';
console.log('PASS: Algorithms U1 only official 878569197406 counts for 70%; old exam excluded from 30%; others untouched.');
console.log('PASS: cierre reintenta notas desactualizadas, protege assignedGrade, usa exclusivamente draftGrade y serializa cierres.');
