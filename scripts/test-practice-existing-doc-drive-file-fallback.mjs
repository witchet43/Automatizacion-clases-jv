import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let created=0,docOpen=0;
const docId='1minkRgNBGsasKdibHqDfaoSORi7HO5Aktlv18eUs-O0';
const context={
 console:{warn(){}},
 Drive:{Files:{get(){throw Error('File not found: '+docId)}}},
 DocumentApp:{openById:(id)=>{
   docOpen++;
   if(id!==docId)throw Error('No such document');
   return {getId:()=>docId,getName:()=> 'Práctica 16 - Observar cookies y estado de sesión'};
 }},
 Utilities:{sleep(){}},
 crearGoogleDocumentoPractica_:()=>{created++;throw Error('Duplicate document attempted');},
 validarFormatoDescripcionClassroom_:()=>true
};
vm.createContext(context);
for(const p of [
 'src/00_PoliticasCanonicas.gs',
 'src/57_DocumentoEditableClassroom.gs',
 'src/30_PracticaConGoogleDoc.gs',
 'src/20_CreacionDirectaRecursos.gs'
])vm.runInContext(fs.readFileSync(p,'utf8'),context);
const run=x=>vm.runInContext(x,context);
const prepared=run('prepararPracticaConGoogleDoc_({courseId:"871158466533",titulo:"Práctica 16 - Observar cookies y estado de sesión",documentId:"'+docId+'",studentCopy:true,shareMode:"STUDENT_COPY"})');
assert.equal(prepared.documentId,docId);
assert.equal(prepared.documentoCreadoPorScript,false);
assert.equal(prepared.shareMode,'STUDENT_COPY');
const materials=run('construirMaterialesDirectos_({tipo:"PRACTICA",documentId:"'+docId+'"})');
assert.equal(materials.length,1);
assert.equal(materials[0].driveFile.driveFile.id,docId);
assert.equal(materials[0].driveFile.shareMode,'STUDENT_COPY');
const expected={materials:[{driveFile:{driveFile:{id:docId},shareMode:'STUDENT_COPY'}}]};
context.testWork=expected;
assert.equal(run('verificarTodosLosGoogleDocsEnClassroom_(testWork,["'+docId+'"]).length'),1);
assert.equal(run('verificarAdjuntoDocumentoEditable_(testWork,"'+docId+'")'),true);
assert.equal(created,0,'Never duplicate the existing canonical practice document');
assert.ok(docOpen>=4,'Docs-scope fallback must be used for preexisting file');

context.DocumentApp.openById=()=>{throw Error('Docs scope cannot read document')};
assert.throws(
 ()=>run('prepararPracticaConGoogleDoc_({courseId:"871158466533",titulo:"Práctica 16 - Observar cookies y estado de sesión",documentId:"'+docId+'"})'),
 /BLOCKED_GOOGLE_DOC_NOT_ACCESSIBLE/
);
assert.equal(created,0,'Original provided Google Doc may never be silently replaced');
console.log('PASS: original Practice 16 Doc re-used with existing Docs OAuth scope, STUDENT_COPY preserved, inaccessible originals block without duplicating.');
