import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const start=web.indexOf('function crearPaqueteClaseWeb_(');
const end=web.indexOf('function deduplicarDraftsExactosClaseWeb_(',start);
assert.ok(start>=0&&end>start,'Canonical class package function is present');
const code=web.slice(start,end);
const course={id:'875776451793',materia:'Sistemas Operativos'};
const tasks=[
 {type:'tarea',params:{titulo:'Tarea 19 - Sincronización',topicId:'123',materia:'Sistemas Operativos'}},
 {type:'practica',params:{titulo:'Práctica 13 - Mutex',topicId:'123',materia:'Sistemas Operativos'}}
];
const existingTask={id:'101',title:tasks[0].params.titulo,topicId:'123',state:'DRAFT'};
const existingPractice={id:'102',title:tasks[1].params.titulo,topicId:'123',state:'DRAFT',
 materials:[{driveFile:{driveFile:{id:'doc102'},shareMode:'STUDENT_COPY'}}]};
function scenario(initial){
 const works=initial.slice(),calls={tarea:0,practica:0,delete:0},sandbox={
  String,Array,Object,Error,console,
  normalizarPayloadAcademicoWeb_(_course,p){return {...p.params,courseId:course.id}},
  listarCourseWorkClase_(){return works},
  crearTarea(p){calls.tarea++;return {workId:'201',state:'DRAFT',creado:true}},
  crearPractica(p){calls.practica++;return {workId:'202',state:'DRAFT',creado:true}},
  crearActividad(){throw Error('Unexpected activity mutation')},
  crearQuiz(){throw Error('Unexpected quiz mutation')},
  crearExamen(){throw Error('Unexpected exam mutation')},
  crearMaterialDidacticoWeb_(){throw Error('Unexpected material mutation')},
  crearQuizAsistenciaRapido(){throw Error('Unexpected attendance mutation')},
  Classroom:{Courses:{CourseWork:{remove(){calls.delete++}}}}
 };
 vm.createContext(sandbox);
 vm.runInContext(code,sandbox);
 return {run:(resources=tasks)=>sandbox.crearPaqueteClaseWeb_(course,{
  resources,expectedResourceTypes:['tarea','practica']
 }),calls};
}
let s=scenario([existingTask,existingPractice]),result=s.run();
assert.equal(result.resourcePhaseStatus,'MATERIALES_LISTOS_PARA_GAMMA');
assert.equal(result.allResourcesAlreadyExisted,true);
assert.equal(result.reusedCount,2);
assert.equal(result.createdCount,0);
assert.equal(s.calls.tarea+s.calls.practica+s.calls.delete,0);
s=scenario([existingTask]);result=s.run();
assert.equal(result.createdCount,1);
assert.equal(result.reusedCount,1);
assert.equal(s.calls.practica,1);
assert.equal(s.calls.tarea,0);
assert.equal(s.calls.delete,0);
s=scenario([{...existingTask,state:'PUBLISHED'}, {...existingPractice,state:'PUBLISHED'}]);
result=s.run();
assert.equal(result.createdCount,0);
assert.equal(result.reusedCount,2);
assert.equal(s.calls.delete,0);
s=scenario([existingTask,{...existingTask,id:'103'}]);result=s.run();
assert.equal(result.resourcePhaseStatus,'PARCIAL');
assert.equal(result.resourceErrors[0].errorCode,'CLASE_RECURSO_IDENTIDAD_AMBIGUA');
assert.equal(s.calls.tarea,0);
assert.equal(s.calls.practica,1,'An ambiguous existing resource must not block independent missing practice');
assert.equal(s.calls.delete,0);
s=scenario([{...existingPractice,materials:[]}]);
result=s.run();
assert.equal(s.calls.practica,1,'Incomplete DRAFT practice is repaired through its existing entrypoint');
assert.equal(s.calls.delete,0);
s=scenario([{...existingPractice,state:'PUBLISHED',materials:[]}]);
result=s.run();
assert.equal(result.resourcePhaseStatus,'PARCIAL');
assert.equal(s.calls.practica,0,'PUBLISHED resource cannot be altered');
s=scenario([existingTask]);const dup=[tasks[0],tasks[0]];
assert.throws(()=>s.run(dup),/CLASE_RECURSO_DUPLICADO_EN_SOLICITUD/);
assert.equal(s.calls.tarea+s.calls.practica,0,'Reject duplicates before side effects');
assert.doesNotMatch(code,/deduplicarDraftsExactosClaseWeb_\(/,
 'The class execution must never delete preexisting drafts as a side effect');
const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
assert.match(policy,/EXPLICIT_SESSION_RECONCILES_ONLY_TARGET: true/);
assert.match(policy,/EXISTING_CLASS_RESOURCES_MUST_BE_REUSED: true/);
assert.match(policy,/ALL_EXISTING_CLASS_COMPONENTS_IS_SUCCESS: true/);
console.log('PASS: explicit class packages reuse existing DRAFT/PUBLISHED, complete only missing, preserve student work, no deletion or duplicate creation.');
