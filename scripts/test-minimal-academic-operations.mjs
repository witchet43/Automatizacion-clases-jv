#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('src/64_QuizAsistenciaRapido.gs','utf8');
const main=fs.readFileSync('src/33_QuizSencillo.gs','utf8');
const facade=fs.readFileSync('src/22_EntrypointsRecursosSeguros.gs','utf8');
const hourly=fs.readFileSync('src/47_AutoQuizSencilloHorario.gs','utf8');
const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
const guards=fs.readFileSync('src/39_MasterGuardrails.gs','utf8');
assert.match(main,/return crearQuizAsistenciaMinimo_\(params\)/);
assert.match(facade,/function crearQuizAsistencia\(params\)/);
assert.doesNotMatch(facade.slice(facade.indexOf('function crearQuizSencillo('),facade.indexOf('function crearExamen(')),/preflightDocumentoMaestro|temaSubtema|assertAcademicAutomationWriteEnabled_/);
assert.match(policy,/SEQUENCE_SOURCE:\s*'LATEST_PUBLISHED_QUIZ'/);
assert.match(guards,/validarPlaneacionCanonicaReadOnly_\(subject\)/);
assert.doesNotMatch(hourly.slice(hourly.indexOf('function procesarAutoQuizSencilloHorario_('),hourly.indexOf('function resolverTemaCanonicoAutoQuizHorario_(')),/resolverUnidadAbiertaQuizSencillo_|resolverTemaCanonicoAutoQuizHorario_|preflightDocumentoMaestro/);

function scenario(initial){
  let works=initial.map(w=>({...w}));
  let created=0,audited=0;
  const clock={waitLock(){},releaseLock(){}};
  const context={
    ACADEMIC_POLICY:{CLASSROOM:{SIMPLE_QUIZ:{TIMEZONE:'America/Mexico_City'}}},
    validarPoliticaQuizSencillo_(){},
    Utilities:{formatDate(){return '2026-09-24 14:40:00';}},
    resolverInstanteSolicitudQuizSencillo_(){return {texto:'2026-09-24 14:40:00'};},
    calcularSiguienteHoraNaturalQuizSencillo_(){return {utcMs:Date.now()+100000,utcYear:2026,utcMonth:9,utcDay:24,utcHours:21,fechaUtc:'2026-09-24',horaUtc:'21:00',fechaLocal:'2026-09-24',horaLocal:'15:00'};},
    LockService:{getScriptLock(){return clock;}},
    Classroom:{Courses:{CourseWork:{
      list(courseId,p){
        assert.equal(courseId,'123');
        const subset=works.filter(w=>w.state===p.courseWorkStates[0]);
        return {courseWork:subset};
      },
      get(courseId,id){const w=works.find(w=>String(w.id)===String(id));if(!w)throw Error('missing work');return w;},
      create(body,courseId){
        created++;
        const w={...body,id:String(100+created),materials:[],description:'',maxPoints:null};
        works.push(w);return w;
      }
    }}},
    registrarAuditoriaCourseWorkDirecto_(){audited++;},
    Date,Number,String,Array,Object,RegExp,Error
  };
  vm.createContext(context);
  vm.runInContext(core,context);
  return {run:()=>context.crearQuizAsistenciaMinimo_({courseId:'123',requestId:'stable'}),get created(){return created;},get audited(){return audited;}};
}
const quiz=(id,n,state,topicId='')=>({id:String(id),title:'Quiz '+n,state,workType:'ASSIGNMENT',topicId,materials:[],description:'',maxPoints:null,creationTime:'2026-09-20T00:00:00Z'});
let s=scenario([]),r=s.run();assert.equal(r.title,'Quiz 1');assert.equal(r.state,'DRAFT');assert.equal(s.created,1);
s=scenario([quiz(7,7,'PUBLISHED','UNIT_2'),quiz(8,8,'DRAFT','UNIT_2')]);r=s.run();assert.equal(r.title,'Quiz 8');assert.equal(r.reutilizado,true);assert.equal(s.created,0);
s=scenario([quiz(7,7,'PUBLISHED'),quiz(9,9,'DRAFT')]);r=s.run();assert.equal(r.title,'Quiz 8');assert.equal(s.created,1);
s=scenario([quiz(7,7,'PUBLISHED'),quiz(8,8,'PUBLISHED')]);r=s.run();assert.equal(r.title,'Quiz 9');assert.equal(s.created,1);
s=scenario([quiz(7,7,'PUBLISHED'),quiz(8,8,'DRAFT'),quiz(18,8,'DRAFT')]);assert.throws(()=>s.run(),/CONSECUTIVO_DUPLICADO/);
console.log('OK: último Quiz PUBLISHED, reutilización de borrador, sin salto por borradores, sin unidad/planeación y DRAFT.');
