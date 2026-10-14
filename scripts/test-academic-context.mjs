import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bundle,bundlePath,prepareRequest,readContext} from './academic-context.mjs';
assert.equal(fs.readFileSync(bundlePath,'utf8'),bundle());

const masterRules=JSON.parse(fs.readFileSync('config/master-rules.json','utf8'));
assert.equal(masterRules.gamma.titleMustUseCanonicalTopicNumberAndName,true);
const {manifest}=readContext();
let calls=[];
const ctx=vm.createContext({
  ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return {setMimeType(){return JSON.parse(text);}};}},
  normalizarNombreCursoRapido_:s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
  crearQuizAsistenciaRapido:m=>{calls.push('quizAsistencia');return {workId:'attendance',state:'DRAFT'};},
  resolverSiguienteClase:()=>{calls.push('resolverClase');return {target:{session:'23'}};},
});
for(const file of ['00_PoliticasCanonicas.gs','00_AcademicContextConfig.gs','39_MasterGuardrails.gs','00_AcademicContextGuard.gs','65_QuizAsistenciaWebApp.gs'])vm.runInContext(fs.readFileSync('src/'+file,'utf8'),ctx);
for(const action of ['actividad','tarea','practica','quiz','examen'])ctx['crear'+action[0].toUpperCase()+action.slice(1)]=p=>{calls.push(action);return {workId:action,state:'DRAFT',courseId:p.courseId};};
ctx.crearGoogleDocumentoAcademico_=()=>{calls.push('material');return {id:'doc'};};
ctx.crearMaterialDidacticoWeb_=()=>{calls.push('material');return {documentId:'doc',state:'DRAFT'};};
ctx.crearPaqueteClaseWeb_=(_course,p)=>{calls.push('clase');if(!Array.isArray(p.resources)||!p.resources.length)throw new Error('CLASE_REQUIERE_RECURSOS');return {packageStatus:'MATERIALES_LISTOS_PARA_GAMMA',state:'DRAFT'};};
ctx.diagnosticarProgresoClaseWeb_=()=>{calls.push('diagnosticarClase');return {readOnly:true};};
ctx.auditarIdentidadClassroomWeb_=()=>{calls.push('auditarIdentidadClassroom');return {readOnly:true};};

const run=p=>ctx.ejecutarServicioAcademicoWeb_(p);
const good=p=>prepareRequest({materia:'Administración',...p}).request;
let checks=0;
function blocked(p,error){calls=[];const r=run(p);assert.equal(r.ok,false);assert.match(r.error,error);assert.equal(calls.length,0);checks++;}

blocked({action:'uaqExecutor',operation:'actividad',materia:'Administración'},/ACADEMIC_CONTEXT_REQUIRED/);
const validContext=good({action:'uaqExecutor',operation:'actividad',params:{}}).operationalContext;
blocked({action:'actividad',materia:'Administración',operationalContext:validContext},/ACCION_NO_PERMITIDA/);
for(const direct of manifest.operations.uaqExecutor.allowedOperations)
  assert.throws(()=>prepareRequest({action:direct,materia:'Administración'}),/DIRECT_ROUTINE_ACTION_FORBIDDEN_USE_UAQ_EXECUTOR/);
checks+=manifest.operations.uaqExecutor.allowedOperations.length;
assert.throws(()=>prepareRequest({action:'uaqExecutor',operation:'resolverClase',materia:'Administración'}),/UAQ_EXECUTOR_OPERATION_INVALID/);checks++;

for(const operation of ['actividad','tarea','practica','quiz','examen','quizAsistencia']){
  calls=[];
  const r=run(good({action:'uaqExecutor',operation,params:{}}));
  assert.equal(r.ok,true);assert.equal(r.gateway,'UAQ_EXECUTOR');assert.equal(r.operation,operation);
  assert.deepEqual(calls,[operation]);checks++;
}
calls=[];
const material=run(good({action:'uaqExecutor',operation:'material',params:{titulo:'Material',contenidoDocumento:'Contenido'}}));
assert.equal(material.ok,true);assert.deepEqual(calls,['material']);checks++;
calls=[];
const pkg=run(good({action:'uaqExecutor',operation:'clase',params:{resources:[{type:'actividad',params:{}}]}}));
assert.equal(pkg.ok,true);assert.deepEqual(calls,['clase']);checks++;

for(const action of ['resolverClase','diagnosticarClase','auditarIdentidadClassroom']){
  calls=[];const r=run(good({action}));assert.equal(r.ok,true);assert.deepEqual(calls,[action]);checks++;
}
const sanitized=good({action:'uaqExecutor',operation:'actividad',params:{endpoint:'https://example.invalid'}});
assert.equal(sanitized.params.endpoint,undefined);checks++;
blocked(good({action:'uaqExecutor',operation:'actividad',courseId:'not-a-course',params:{}}),/CURSO_NO_PERMITIDO/);
assert.equal(vm.runInContext("resolverCursoAcademicoWeb_({materia:'Administración'}).id",ctx),manifest.courses.administracion.id);checks++;
assert.equal(new Set(Object.values(manifest.courses).map(c=>c.id)).size,7);
console.log(`OK: ${checks} UAQ Executor gateway, direct-route rejection and deterministic dispatch checks; no external services.`);
