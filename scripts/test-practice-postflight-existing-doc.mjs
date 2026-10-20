import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const existingDocId='1minkRgNBGsasKdibHqDfaoSORi7HO5Aktlv18eUs-O0';
const existingWorkId='893237625248';
let metadataReads=0;
let readCourseWork=0;
const work={
  id:existingWorkId,
  state:'DRAFT',
  title:'Práctica 16 - Observar cookies y estado de sesión',
  materials:[{driveFile:{driveFile:{id:existingDocId},shareMode:'STUDENT_COPY'}}]
};
const sandbox={
 MASTER_GUARDRAILS:{DEFAULT_STATE:'DRAFT'},
 Classroom:{Courses:{CourseWork:{get(courseId,workId){
   readCourseWork++;
   assert.equal(courseId,'871158466533');
   assert.equal(workId,existingWorkId);
   return work;
 }}}},
 obtenerMetadataDocumentoClassroom_(id){
   metadataReads++;
   assert.equal(id,existingDocId);
   return {id,name:work.title,mimeType:'application/vnd.google-apps.document',trashed:false};
 },
 verificarAdjuntoDocumentoEditable_(w,id){
   assert.equal(w,work);
   assert.equal(id,existingDocId);
   assert.equal(w.materials[0].driveFile.shareMode,'STUDENT_COPY');
 },
 verificarTodosLosGoogleDocsEnClassroom_(w,ids){
   assert.equal(w,work);
   assert.equal(ids.length,1);
   assert.equal(ids[0],existingDocId);
   return [existingDocId];
 },
 Drive:{Files:{get(){throw Error('Raw drive.files.get must not bypass canonical metadata resolver');}}}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('src/52_MasterPostflight.gs','utf8'),sandbox);
const pass=sandbox.postflightDocumentoMaestro(
 {courseId:'871158466533',workId:existingWorkId,documentId:existingDocId},
 {resourceState:'DRAFT'}
);
assert.equal(pass.ok,true);
assert.equal(pass.workId,existingWorkId);
assert.equal(pass.documentId,existingDocId);
assert.equal(pass.documentosConCopiaIndividual.length,1);
assert.equal(metadataReads,1);
assert.equal(readCourseWork,1);
sandbox.Classroom.Courses.CourseWork.get=()=>({...work,state:'PUBLISHED'});
assert.throws(
 ()=>sandbox.postflightDocumentoMaestro({courseId:'871158466533',workId:existingWorkId,documentId:existingDocId},{resourceState:'DRAFT'}),
 /POSTFLIGHT_MASTER: CourseWork no quedó DRAFT/
);
console.log('PASS: postflight reconciles existing Practice 16 DRAFT with canonical native Doc and STUDENT_COPY; no raw Drive access or resource recreation.');
