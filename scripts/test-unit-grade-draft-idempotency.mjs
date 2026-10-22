import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/10_PublicarCalificacionUnidad.gs','utf8');
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
const engine=fs.readFileSync('src/13_RecalculoFinalCeros.gs','utf8');
const facade=fs.readFileSync('src/15_OperacionesAcademicas.gs','utf8');
assert.match(policy,/FINAL_GRADE_COURSEWORK_STATE:\s*'PUBLISHED'/);
assert.match(policy,/UNIT_GRADE_POSTING_MODE:\s*'PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY'/);
assert.match(engine,/String\(w\.state\|\|''\)\.toUpperCase\(\)==='PUBLISHED'/);
assert.match(engine,/\^EXAMEN/);
assert.match(engine,/!\/\^Calificación/);
assert.match(source,/state:\s*'PUBLISHED'/);
assert.match(source,/updateMask:\s*'state'/);

function extract(src,name){
 const start=src.indexOf('function '+name+'(');
 assert.ok(start>=0,'Missing '+name);
 const end=src.indexOf('\n}',start);
 assert.ok(end>start,'Unexpected closing '+name);
 return src.slice(start,end+2);
}
const grades={a:94,b:72};
const ctx={
 console, Set,Date,Math,
 UNIT_GRADE_PUBLISH:{REPORT_SHEET:'Promedios Unidad'},
 ACADEMIC_POLICY:{CLASSROOM:{FINAL_GRADE_PREFIX:'Calificación Unidad ',FINAL_GRADE_COURSEWORK_STATE:'PUBLISHED'}},
 topic:'topic2',works:[],patches:[],creates:[],
 subs:{
  a:{id:'sub-a',userId:'a',draftGrade:null,assignedGrade:null},
  b:{id:'sub-b',userId:'b',draftGrade:null,assignedGrade:null}
 },
 buscarTopicIdUnidad_:()=> 'topic2',
 listarCourseWorkPublicacion_:()=>ctx.works,
 entregasPorAlumnoPublicacion_:()=>ctx.subs,
 extraerNumeroUnidad_:v=>{const m=String(v).match(/^Unidad\s+([1-9]\d*)$/);return m?Number(m[1]):null;},
 escribirCalificacionDraft_(_c,_w,subId,grade){
   const sub=Object.values(ctx.subs).find(x=>x.id===subId);
   assert.ok(sub,'Unknown submission');
   assert.equal(ctx.works[0].state,'PUBLISHED','CourseWork must be PUBLISHED; grades remain draft');
   assert.equal(sub.assignedGrade,null);
   sub.draftGrade=grade;ctx.patches.push({submission:subId,grade,mask:'draftGrade'});
 },
 verificarCalificacionDraft_:(sub,grade)=>({ok:Math.abs(Number(sub?.draftGrade)-grade)<1e-8}),
 Utilities:{sleep(){}},
 Classroom:{Courses:{CourseWork:{create(body){
   assert.equal(body.title,'Calificación Unidad 2');
   assert.equal(body.state,'PUBLISHED');
   assert.equal(body.topicId,'topic2');
   assert.equal(body.maxPoints,100);
   const work={id:'grade-2',state:'PUBLISHED',topicId:'topic2',
     title:body.title,workType:'ASSIGNMENT',maxPoints:100,associatedWithDeveloper:true};
   ctx.works.push(work);ctx.creates.push(work);return work;
 },patch(body,courseId,id,opts){
   assert.equal(courseId,'course');assert.equal(id,'grade-2');
   if(opts.updateMask==='state'){
     assert.equal(body.state,'PUBLISHED');
     ctx.works[0].state='PUBLISHED';return ctx.works[0];
   }
   if(opts.updateMask==='topicId'){
     assert.equal(body.topicId,'topic2');return ctx.works[0];
   }
   throw Error('Unexpected CourseWork patch '+opts.updateMask);
 }}}}
};
vm.createContext(ctx);
for(const name of ['publicarCalificacionUnidadFinal_','verificarYReintentarCalificacionUnidad_'])
 vm.runInContext(extract(source,name),ctx);
const ss={getSheetByName:()=>({getDataRange:()=>({getValues:()=>[
 ['Fecha cálculo','ID curso','Unidad','User ID','Alumno','Correo','Promedio final'],
 ['2026-10-22','course','Unidad 2','a','Alumno A','',94],
 ['2026-10-22','course','Unidad 2','b','Alumno B','',72]
]})})};
ctx.ss=ss;
let result=vm.runInContext('publicarCalificacionUnidadFinal_(ss,"course","Unidad 2","Calificación Unidad 2")',ctx);
assert.equal(result.estado,'PUBLISHED');
assert.equal(result.actualizadas,2);
assert.equal(ctx.creates.length,1);
assert.equal(ctx.patches.length,2);
assert.equal(ctx.subs.a.assignedGrade,null);
assert.equal(ctx.subs.b.assignedGrade,null);
result=vm.runInContext('publicarCalificacionUnidadFinal_(ss,"course","Unidad 2","Calificación Unidad 2")',ctx);
assert.equal(result.sinCambios,2);
assert.equal(result.actualizadas,0);
assert.equal(ctx.creates.length,1,'Idempotence: do not create duplicate grade assignment');
assert.equal(ctx.patches.length,2,'Idempotence: no redundant grade writes');

ctx.subs.a.draftGrade=91;
result=vm.runInContext('publicarCalificacionUnidadFinal_(ss,"course","Unidad 2","Calificación Unidad 2")',ctx);
assert.equal(result.actualizadas,1);
assert.equal(ctx.creates.length,1);
assert.equal(ctx.patches.length,3);
ctx.works[0].state='DRAFT';
result=vm.runInContext('publicarCalificacionUnidadFinal_(ss,"course","Unidad 2","Calificación Unidad 2")',ctx);
assert.equal(result.estado,'PUBLISHED','Reused draft is published once without publishing student grades');
assert.equal(ctx.creates.length,1);
assert.equal(ctx.patches.length,3);
ctx.subs.a.assignedGrade=70;
assert.throws(()=>vm.runInContext('publicarCalificacionUnidadFinal_(ss,"course","Unidad 2","Calificación Unidad 2")',ctx),
 /CLOSE_MANUAL_GRADE_PRESENT/);
assert.equal(ctx.patches.length,3,'Protect manually assigned grades');
ctx.subs.a.assignedGrade=null;ctx.works.push({...ctx.works[0],id:'another'});
assert.throws(()=>vm.runInContext('publicarCalificacionUnidadFinal_(ss,"course","Unidad 2","Calificación Unidad 2")',ctx),
 /múltiples CourseWork/);
ctx.works.pop();

const route={
 normalizarUnidadOperacion_:()=> 'Unidad 2',
 extraerNumeroUnidad_:()=>2,
 ACADEMIC_POLICY:{CLASSROOM:{FINAL_GRADE_PREFIX:'Calificación Unidad '}}
};
vm.createContext(route);
vm.runInContext(extract(web,'validarCierreUnidadWeb_'),route);
const req={title:'Calificación Unidad 2',titulo:'Calificación Unidad 2',
 unidad:'Unidad 2',modo:'PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY'};
assert.equal(route.validarCierreUnidadWeb_({title:req.title},req),'Unidad 2');
assert.throws(()=>route.validarCierreUnidadWeb_({title:req.title},{...req,modo:''}),/UNIT_GRADE_EXPLICIT_POSTING_INTENT_REQUIRED/);
assert.throws(()=>route.validarCierreUnidadWeb_({title:req.title},{...req,titulo:'Calificación Unidad 3'}),/UNIT_GRADE_TITLE_MISMATCH/);
assert.throws(()=>route.validarCierreUnidadWeb_({title:req.title},{...req,calificaciones:[94,72]}),/UNIT_GRADE_SCORES_MUST_COME_FROM_CLASSROOM/);
assert.match(web,/operation==='cerrarUnidad'/);
assert.doesNotMatch(web,/operation==='actividad'&&esCalificacionUnidadDraftWeb_/);
assert.match(facade,/const promedios = calcularPromediosDirectoClassroomConCeros_/);
console.log('PASS: exact unit grade identity; CourseWork PUBLISHED, individual draftGrade only; idempotent reuse and protection for assigned grades.');
