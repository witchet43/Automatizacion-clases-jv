import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const start=web.indexOf('function planificarClaseCanonicaWeb_(');
const end=web.indexOf('function deduplicarDraftsExactosClaseWeb_(',start);
assert.ok(start>=0&&end>start,'Canonical plan and execute functions are present');
const code=web.slice(start,end);
const course={id:'875776451793',materia:'Sistemas Operativos'};
const tasks=[
 {type:'tarea',params:{titulo:'Tarea 19 - Sincronización',topicId:'123',materia:'Sistemas Operativos',contenidoDocumento:'Investigar antes de la clase'}},
 {type:'practica',params:{titulo:'Práctica 13 - Mutex',topicId:'123',materia:'Sistemas Operativos',contenidoDocumento:'Implementar la práctica'}}
];
const studentDoc=id=>[{driveFile:{driveFile:{id},shareMode:'STUDENT_COPY'}}];
const existingTask={id:'101',title:tasks[0].params.titulo,topicId:'123',state:'DRAFT',
 materials:studentDoc('doc101')};
const existingPractice={id:'102',title:tasks[1].params.titulo,topicId:'123',state:'DRAFT',
 materials:studentDoc('doc102')};

function scenario(initial){
 const works=initial.slice(),calls={tarea:0,practica:0,delete:0,format:0,plan:0,read:0},sandbox={
  String,Array,Object,Error,console,
  normalizarPayloadAcademicoWeb_(_course,p){return {...p.params,courseId:course.id}},
  listarCourseWorkClase_(){calls.read++;return works},
  leerPlaneacionSiguienteClase_(){calls.plan++;return {rows:[{session:'19',unit:'2',
    topic:'Sincronización: mutex y semáforos',kind:'Clase',
    practice:tasks[1].params.titulo}],source:{}};},
  seleccionarSiguienteClasePorEstadoReal_(rows,works,requested,options){
    const gamma=options?.gammaLiveEvidence?.['19'];
    const notion=options?.notionLiveEvidence?.['19'];
    return {complete:false,target:rows[0],source:requested?'EXPLICIT_CANONICAL_SESSION':'PLAN',
      evidence:{classroomIds:works.map(w=>String(w.id)),
      recursoPreparado:works.length>0,
      gammaRequired:true,gammaVerificada:gamma?.status==='LIVE_ACTIVE_CANONICAL',
      notionVerificada:notion?.status==='LIVE_CANONICAL',
      notionGammaReferenceVerified:notion?.gammaReferenceVerified===true,
      gammaDecision:gamma?'REUSE':'VERIFY_LIVE',
      notionDecision:notion?'REUSE':'VERIFY_LIVE'}};
  },
  normalizarCreacionDirecta_(p,kind){
    if(p.contenidoDocumento==='BLOCKED_FORMAT')throw Error('BLOCKED_DOCUMENT_FORMAT');
    calls.format++;return {...p,tipo:kind};
  },
  normalizarContenidoPractica_(t){return String(t).split('\n')},
  construirHtmlPractica_(){return '<h1>Practice</h1>'},
  construirHtmlDocumentoAcademico_(){return '<h1>Doc</h1>'},
  validarFormatoHtmlDocumentoAcademico_(){return true},
  crearTarea(){calls.tarea++;return {workId:'201',state:'DRAFT',creado:true}},
  crearPractica(){calls.practica++;return {workId:'202',state:'DRAFT',creado:true}},
  crearActividad(){throw Error('Unexpected activity mutation')},
  crearQuiz(){throw Error('Unexpected quiz mutation')},
  crearExamen(){throw Error('Exams are not classes')},
  crearMaterialDidacticoWeb_(){throw Error('Unexpected material mutation')},
  Classroom:{Courses:{CourseWork:{remove(){calls.delete++}}}}
 };
 vm.createContext(sandbox);
 vm.runInContext(code,sandbox);
 return {run:(resources=tasks,options={})=>sandbox.crearPaqueteClaseWeb_(course,{
  resources,expectedResourceTypes:['tarea','practica'],...options
 }),calls};
}
let s=scenario([existingTask,existingPractice]),result=s.run();
assert.equal(result.resourcePhaseStatus,'MATERIALES_LISTOS_PARA_GAMMA');
assert.equal(result.allResourcesAlreadyExisted,true);
assert.equal(result.reusedCount,2);
assert.equal(result.createdCount,0);
assert.equal(s.calls.tarea+s.calls.practica+s.calls.delete+s.calls.format,0);
assert.equal(s.calls.read,1,'Only one inventory read');
s=scenario([existingTask]);result=s.run();
assert.equal(result.createdCount,1);
assert.equal(result.reusedCount,1);
assert.equal(s.calls.practica,1);
assert.equal(s.calls.tarea,0);
assert.equal(s.calls.format,1,'Only the missing document needs preparation');
assert.equal(s.calls.delete,0);
s=scenario([{...existingTask,state:'PUBLISHED'},{...existingPractice,state:'PUBLISHED'}]);
result=s.run();
assert.equal(result.createdCount,0);
assert.equal(result.reusedCount,2);
assert.equal(s.calls.delete,0);
s=scenario([existingTask,{...existingTask,id:'103'}]);result=s.run();
assert.equal(result.resourcePhaseStatus,'PARCIAL');
assert.equal(result.resourceErrors[0].errorCode,'CLASE_RECURSO_IDENTIDAD_AMBIGUA');
assert.equal(s.calls.tarea,0);
assert.equal(s.calls.practica,1,'Ambiguous resource does not block independent practice');
assert.equal(s.calls.delete,0);
s=scenario([{...existingPractice,materials:[]}]);result=s.run();
assert.equal(s.calls.practica,1,'Incomplete DRAFT practice is repaired through its existing entrypoint');
assert.equal(s.calls.delete,0);
s=scenario([{...existingPractice,state:'PUBLISHED',materials:[]}]);
result=s.run();
assert.equal(result.resourcePhaseStatus,'PARCIAL');
assert.equal(s.calls.practica,0,'PUBLISHED resource cannot be altered');
s=scenario([existingTask]);const dup=[tasks[0],tasks[0]];
assert.throws(()=>s.run(dup),/CLASE_RECURSO_DUPLICADO_EN_SOLICITUD/);
assert.equal(s.calls.tarea+s.calls.practica,0,'Reject duplicates before side effects');
s=scenario([]);
result=s.run([], {mode:'PLAN',requestedSession:'19'});
assert.equal(result.packageStatus,'PLAN_READY');
assert.equal(result.target.session,'19');
assert.equal(result.createdCount,0);
assert.equal(s.calls.plan,1);
assert.equal(s.calls.read,1);
assert.equal(s.calls.tarea+s.calls.practica,0,'Planning never writes');
s=scenario([existingTask]);
result=s.run([{type:'tarea',params:{titulo:tasks[0].params.titulo}},
  {type:'practica',params:{titulo:tasks[1].params.titulo}}]);
assert.equal(result.packageStatus,'CONTENT_REQUIRED');
assert.equal(result.missingResourceContent.length,1);
assert.equal(result.reusedCount,1);
assert.equal(s.calls.tarea+s.calls.practica+s.calls.format,0,
 'Missing content returns a precise plan without creating anything');
s=scenario([]);
const bad=[tasks[0],{...tasks[1],params:{...tasks[1].params,contenidoDocumento:'BLOCKED_FORMAT'}}];
assert.throws(()=>s.run(bad),/BLOCKED_DOCUMENT_FORMAT/);
assert.equal(s.calls.tarea+s.calls.practica,0,
 'All missing documents must be ready before the first external mutation');
assert.equal(s.calls.format,1,'Earlier item can be prepared in memory without writing');
assert.doesNotMatch(code,/deduplicarDraftsExactosClaseWeb_\(/,
 'Never delete existing drafts as a side effect');
// The one canonical operation is a deterministic three-stage state machine.
// Neither PLAN nor FINALIZE mutates existing Classroom resources.
s=scenario([existingTask,existingPractice]);
result=s.run([], {mode:'PLAN',requestedSession:'19'});
assert.equal(result.complete,false);
assert.equal(result.packageStatus,'PLAN_READY');
assert.ok(result.missingComponents.includes('GAMMA'));
assert.ok(result.missingComponents.includes('NOTION'));
assert.equal(result.nextPhase,'GENERATE_OR_REUSE_GAMMA');
assert.throws(()=>s.run([], {mode:'FINALIZE'}),/CLASE_FINALIZE_REQUIERE_SESION_EXPLICITA/);
const gammaEvidence={status:'LIVE_ACTIVE_CANONICAL'};
const notionEvidence={status:'LIVE_CANONICAL',gammaReferenceVerified:true};
result=s.run([], {mode:'FINALIZE',requestedSession:'19',options:{
 gammaLiveEvidence:{'19':gammaEvidence}}});
assert.equal(result.complete,false);
assert.equal(result.packageStatus,'INCOMPLETE');
assert.deepEqual([...result.missingComponents],['NOTION']);
result=s.run([], {mode:'FINALIZE',requestedSession:'19',options:{
 gammaLiveEvidence:{'19':gammaEvidence},notionLiveEvidence:{'19':{...notionEvidence,gammaReferenceVerified:false}}}});
assert.equal(result.complete,false,'Notion without Gamma reference cannot close the package');
result=s.run([], {mode:'FINALIZE',requestedSession:'19',options:{
 gammaLiveEvidence:{'19':gammaEvidence},notionLiveEvidence:{'19':notionEvidence}}});
assert.equal(result.complete,true);
assert.equal(result.packageStatus,'COMPLETE');
assert.equal(result.nextPhase,'NONE');
assert.equal(s.calls.tarea+s.calls.practica+s.calls.delete+s.calls.format,0,
  'FINALIZE never creates, deletes, rewrites or validates individual docs');
assert.equal(s.calls.read,4,'One Classroom inventory read per accepted request, never repeated postflight');

const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
assert.match(policy,/EXPLICIT_SESSION_RECONCILES_ONLY_TARGET: true/);
assert.match(policy,/EXISTING_CLASS_RESOURCES_MUST_BE_REUSED: true/);
assert.match(policy,/ALL_EXISTING_CLASS_COMPONENTS_IS_SUCCESS: true/);
console.log('PASS: class PLAN needs only session; EXECUTE uses one inventory read, reuses existing, asks only for missing content and prepares all missing docs before writes; no extra postflight or deletion.');
