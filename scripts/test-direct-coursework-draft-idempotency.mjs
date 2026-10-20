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
