import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bundle,bundlePath,prepareRequest,readContext} from './academic-context.mjs';
assert.equal(fs.readFileSync(bundlePath,'utf8'),bundle());

// Gamma canonical naming is machine-checked to prevent ad-hoc titles.
const masterRules=JSON.parse(fs.readFileSync('config/master-rules.json','utf8'));
assert.equal(masterRules.gamma.titleMustUseCanonicalTopicNumberAndName,true);
assert.equal(masterRules.gamma.canonicalTitleSource,'subjects.<materia>.canonicalSequence');
assert.equal(masterRules.gamma.canonicalTitleFormat,'<número oficial> - <nombre oficial>');
assert.equal(masterRules.gamma.requireExactTitleBeforeGeneration,true);
assert.equal(masterRules.gamma.requireExactTitlePostflight,true);
assert.equal(masterRules.gamma.blockRegistrationOnTitleMismatch,true);
assert.equal(masterRules.gamma.repairExistingGammaInsteadOfRegenerate,true);
assert.equal(masterRules.gamma.titleMustNotAppendSubjectName,true);
const {manifest}=readContext();
let calls=[];
const ctx=vm.createContext({
  ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return {setMimeType(){return JSON.parse(text);}};}},
  normalizarNombreCursoRapido_:s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
  crearQuizAsistenciaRapido:m=>{calls.push('quizAsistencia');return {workId:'attendance',state:'DRAFT'};},
  resolverSiguienteClase:()=>{calls.push('resolverClase');return {target:{session:'23'}};},
});
for(const file of ['00_PoliticasCanonicas.gs','39_MasterGuardrails.gs','00_AcademicContextConfig.gs','00_AcademicContextGuard.gs','65_QuizAsistenciaWebApp.gs'])vm.runInContext(fs.readFileSync('src/'+file,'utf8'),ctx);
for(const action of ['actividad','tarea','practica','quiz','examen'])ctx['crear'+action[0].toUpperCase()+action.slice(1)]=p=>{calls.push(action);return {workId:action,state:'DRAFT',courseId:p.courseId};};
ctx.crearGoogleDocumentoAcademico_=()=>{calls.push('material');return {id:'doc'};};
ctx.diagnosticarProgresoClaseWeb_=()=>{calls.push('diagnosticarClase');return {readOnly:true};};
ctx.auditarIdentidadClassroomWeb_=()=>{calls.push('auditarIdentidadClassroom');return {readOnly:true};};
const run=p=>ctx.ejecutarServicioAcademicoWeb_(p);
const good=p=>prepareRequest({materia:'Administración',...p}).request;
let checks=0;
function blocked(p,error){calls=[];const r=run(p);assert.equal(r.ok,false);assert.match(r.error,error);assert.equal(calls.length,0);checks++;}
for(const action of ['actividad','tarea','practica','quiz','examen','material','clase','resolverClase','diagnosticarClase','auditarIdentidadClassroom'])blocked({action,materia:'Administración'},/ACADEMIC_CONTEXT_REQUIRED/);
for(const key of Object.keys(good({action:'clase'}).operationalContext)){
  const p=good({action:'clase'});p.operationalContext[key]='stale-or-alternative';blocked(p,/ACADEMIC_CONTEXT_MISMATCH/);
}
blocked(good({action:'clase',resources:[{type:'actividad',params:{state:'DRAFT'}},{type:'tarea',params:{state:'PUBLISHED'}}]}),/DRAFT_REQUIRED/);
blocked(good({action:'actividad',params:{endpoint:'https://example.invalid'}}),/OVERRIDE_FORBIDDEN/);
blocked(good({action:'resolverClase',options:{calendarSelectsClass:true}}),/OVERRIDE_FORBIDDEN/);
blocked(good({action:'clase',resources:[]}),/CLASE_REQUIERE_RECURSOS/);
blocked(good({action:'actividad',courseId:'not-a-course'}),/CURSO_NO_PERMITIDO/);
for(const action of ['actividad','tarea','practica','quiz','examen','resolverClase','diagnosticarClase','auditarIdentidadClassroom']){
  calls=[];const r=run(good({action}));assert.equal(r.ok,true);assert.deepEqual(calls,[action]);checks++;
}
calls=[];
blocked(good({action:'clase',gammaUrl:'https://gamma.app/docs/verified',expectedResourceTypes:['actividad'],resources:[{type:'actividad',params:{}}]}),/CLASE_RECURSOS_PRIMERO/);
calls=[];
const pkg=run(good({action:'clase',expectedResourceTypes:['actividad','tarea'],resources:[{type:'actividad',params:{}},{type:'tarea',params:{}}]}));
assert.equal(pkg.ok,true);assert.equal(pkg.packageStatus,'MATERIALES_LISTOS_PARA_GAMMA');assert.equal(pkg.nextPhase,'GENERATE_AND_VERIFY_GAMMA_REFERENCING_RESOURCE_IDS_URLS');assert.deepEqual(calls,['actividad','tarea']);
assert.ok(pkg.resources.every(r=>r.result.state==='DRAFT'));checks++;
calls=[];assert.equal(run(good({action:'material',params:{titulo:'Material',contenidoDocumento:'Contenido'}})).ok,true);assert.deepEqual(calls,['material']);checks++;
// Server-side source drift blocks before any action; FAST_PATH still works.
vm.runInContext("ACADEMIC_CONTEXT_CONFIG.courses.administracion.id='wrong'",ctx);
blocked(good({action:'actividad'}),/REGISTRY_DRIFT/);
calls=[];assert.equal(run({action:'quizAsistencia',materia:'Administración'}).ok,true);assert.deepEqual(calls,['quizAsistencia']);checks++;
blocked({action:'quizAsistencia',materia:'Administración',operationalContext:{}},/PARAMETRO_NO_PERMITIDO/);
assert.throws(()=>prepareRequest({action:'clase',operationalContext:{}}),/CONTEXT_MISMATCH/);checks++;
assert.deepEqual(prepareRequest({action:'quizAsistencia',materia:'Administración'}).request,{action:'quizAsistencia',materia:'Administración'});checks++;
// All existing period IDs and schema details remain exactly in sync.
assert.equal(new Set(Object.values(manifest.courses).map(c=>c.id)).size,7);
console.log(`OK: ${checks} deterministic startup, drift, fail-before-write, dispatch and FAST_PATH checks; no external services.`);
