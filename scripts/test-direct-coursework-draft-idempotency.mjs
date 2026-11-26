import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const courseId='871158466533';
const topicId='878325547335';
const title='Práctica 16 - Observar cookies y estado de sesión';
const docId='1minkRgNBGsasKdibHqDfaoSORi7HO5Aktlv18eUs-O0';
const makeWork=id=>({
 id,state:'DRAFT',title,topicId,
 materials:[{driveFile:{driveFile:{id:docId},shareMode:'STUDENT_COPY'}}]
});
let works=[makeWork('893237625248')];
let requests=[];
const context={
 listarCourseWorkPaginaConReintento_:(id,options)=>{
   assert.equal(id,courseId);
   requests.push(options);
   assert.deepEqual(Array.from(options.courseWorkStates),['DRAFT','PUBLISHED'],
     'Every idempotency lookup MUST include DRAFTs, even if API defaults exclude them.');
   return {courseWork:works.filter(w=>options.courseWorkStates.includes(w.state))};
 },
 idsGoogleDocumentosAccesiblesSolicitados_:()=>[docId],
 idsGoogleDocumentosAdjuntos_:materials=>materials.map(x=>x.driveFile.driveFile.id)
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/20_CreacionDirectaRecursos.gs','utf8'),context);
const p={courseId,titulo:title,documentId:docId};
const original=context.buscarCourseWorkDirectoPorEvidencia_(p,topicId);
assert.equal(original.id,'893237625248');
assert.equal(context.buscarCourseWorkDirectoExacto_(courseId,title,topicId).id,'893237625248');
assert.equal(requests.length,2);

works=[makeWork('893237625248'),makeWork('883005863308')];
assert.throws(()=>context.buscarCourseWorkDirectoPorEvidencia_(p,topicId),
 /BLOCKED_IDEMPOTENCY_DUPLICATE/,
 'Never create a third Practice 16 when two draft duplicates are already present.');
assert.equal(context.buscarCourseWorkDirectoExacto_(courseId,title,topicId).id,'893237625248');
assert.ok(requests.every(x=>x.courseWorkStates.includes('DRAFT')));
console.log('PASS: both Classroom existence lookups see drafts; duplicate Practice 16 now blocks further creation.');

const formUrl='https://docs.google.com/forms/d/original123/edit';
const prior=[{driveFile:{driveFile:{id:docId},shareMode:'STUDENT_COPY'}},{link:{url:'https://example.org/guide',title:'Guide'}},{youtubeVideo:{id:'abc'}}];
let live={id:'draft-1',state:'DRAFT',materials:JSON.parse(JSON.stringify(prior))},writes=0,reads=0,drop=false;
context.extraerIdGoogleDocumentoDeUrl_=()=> '';
context.ACADEMIC_POLICY={CLASSROOM:{DEFAULT_COURSEWORK_STATE:'DRAFT'}};
context.Classroom={Courses:{CourseWork:{get:()=>{reads++;return JSON.parse(JSON.stringify(live));},patch:(body,c,w,opts)=>{
 assert.equal(c,courseId);assert.equal(w,'draft-1');assert.equal(opts.updateMask,'materials');writes++;
 live.materials=JSON.parse(JSON.stringify(body.materials));
 if(drop)live.materials.shift();
 else live.materials=live.materials.map(m=>m.link?.url===formUrl?{form:{formUrl,title:'Exam'}}:m);
}}}};
const params={courseId,links:[{url:formUrl},{url:formUrl}]};
let result=context.reconciliarMaterialesBorradorDirecto_(params,live);
assert.equal(writes,1);assert.equal(reads,2);assert.equal(result.materials.length,4);
assert.deepEqual(result.materials.slice(0,3),prior);
assert.equal(result.materials[3].form.formUrl,formUrl);
context.reconciliarMaterialesBorradorDirecto_(params,live);assert.equal(writes,1);
live.state='PUBLISHED';assert.throws(()=>context.reconciliarMaterialesBorradorDirecto_(params,live),/NOT_DRAFT/);assert.equal(writes,1);
live.state='DRAFT';drop=true;
assert.throws(()=>context.reconciliarMaterialesBorradorDirecto_({courseId,links:[{url:'https://example.org/new'}]},live),/READBACK_MISMATCH/);
console.log('PASS: draft materials append, preserve existing, normalize native Forms identity, deduplicate, protect published, and verify readback.');
