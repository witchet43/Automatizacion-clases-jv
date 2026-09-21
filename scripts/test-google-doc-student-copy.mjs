import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const files=[
  'src/00_PoliticasCanonicas.gs',
  'src/57_DocumentoEditableClassroom.gs',
  'src/20_CreacionDirectaRecursos.gs'
];
const docs=new Set(['doc1','doc2','docNew']);
let stored=null;
let patchCount=0;
let generated=0;
const sandbox={
  console,
  Drive:{Files:{get(id){
    if(docs.has(String(id)))return {id:String(id),mimeType:'application/vnd.google-apps.document',trashed:false};
    if(String(id)==='pdf1')return {id:'pdf1',mimeType:'application/pdf',trashed:false};
    throw new Error('Documento no accesible: '+id);
  }}},
  Classroom:{Courses:{CourseWork:{
    patch(body){patchCount++;stored={...stored,...body};return stored;},
    get(){return stored;}
  }}},
  crearGoogleDocumentoPractica_(){generated++;return {id:'docNew',name:'Documento creado'};},
  validarFormatoDescripcionClassroom_(){return true;}
};
vm.createContext(sandbox);
for(const path of files)vm.runInContext(fs.readFileSync(path,'utf8'),sandbox,{filename:path});
const run=(expression)=>vm.runInContext(expression,sandbox);

assert.equal(run('ACADEMIC_POLICY.DOCUMENTS.ALL_GOOGLE_DOCS_STUDENT_COPY'),true);
assert.equal(run('ACADEMIC_POLICY.DOCUMENTS.TASK_STUDENT_COPY_DEFAULT'),true);
assert.equal(run('validarContratoDocumentoEditableClassroom().ok'),true);
for(const tipo of ['TAREA','ACTIVIDAD','PRACTICA']){
  assert.equal(run('requiereDocumentoEditableClassroom_({tipo:'+JSON.stringify(tipo)+',documentId:"doc1"})'),true);
  assert.equal(run('resolverShareModeDirecto_({tipo:'+JSON.stringify(tipo)+',documentId:"doc1",shareMode:"VIEW",studentCopy:false})'),'STUDENT_COPY');
  assert.equal(run('resolverShareModeDirecto_({tipo:'+JSON.stringify(tipo)+',documentId:"doc1",shareMode:"EDIT"})'),'STUDENT_COPY');
}
assert.equal(run('requiereDocumentoEditableClassroom_({tipo:"TAREA"})'),false,'Una tarea sin evidencia documental no genera un Doc artificial.');
assert.equal(run('requiereDocumentoEditableClassroom_({tipo:"TAREA",googleDocContent:"Lectura y preguntas"})'),true);
assert.equal(run('requiereDocumentoEditableClassroom_({tipo:"TAREA",links:[{url:"https://docs.google.com/document/d/doc2/edit"}]})'),true);

const materials=run('construirMaterialesDirectos_({tipo:"TAREA",shareMode:"VIEW",links:[{url:"https://docs.google.com/document/d/doc1/edit"},{url:"https://example.org/lectura"}]})');
assert.equal(materials.length,2);
assert.equal(materials[0].driveFile.driveFile.id,'doc1');
assert.equal(materials[0].driveFile.shareMode,'STUDENT_COPY');
assert.equal(materials[1].link.url,'https://example.org/lectura');

const prepared=run('prepararRecursoConDocumentoEditable_({tipo:"TAREA",titulo:"Tarea de lectura",descripcion:"Lectura y preguntas",documentId:"doc1",shareMode:"VIEW"})');
assert.equal(prepared.documentId,'doc1');
assert.equal(prepared.shareMode,'STUDENT_COPY');
assert.equal(prepared.studentCopy,true);
const created=run('prepararRecursoConDocumentoEditable_({tipo:"TAREA",titulo:"Tarea con Doc",descripcion:"Lectura y preguntas",requiereDocumentoEditable:true})');
assert.equal(created.documentId,'docNew');
assert.equal(created.shareMode,'STUDENT_COPY');
assert.equal(generated,1);

const attached=run('idsGoogleDocumentosAdjuntos_([{driveFile:{driveFile:{id:"doc1"},shareMode:"STUDENT_COPY"}},{driveFile:{driveFile:{id:"pdf1"},shareMode:"VIEW"}}])');
assert.equal(attached.length,1);
assert.equal(attached[0],'doc1');
const creator=fs.readFileSync('src/20_CreacionDirectaRecursos.gs','utf8');
assert.match(creator,/const docsAdjuntosExistentes=idsGoogleDocumentosAdjuntos_\(adjuntosExistentes\)/);
assert.match(creator,/p\.googleDocId='';/);
assert.match(creator,/p\.documentId=docsAdjuntosExistentes\[0\]/);
const oldWork={
  id:'work1',state:'DRAFT',
  materials:[
    {driveFile:{driveFile:{id:'doc1'},shareMode:'VIEW'}},
    {link:{url:'https://docs.google.com/document/d/doc2/edit'}},
    {driveFile:{driveFile:{id:'pdf1'},shareMode:'VIEW'}}
  ]
};
stored=oldWork;
const repaired=run('asegurarCopiasDocumentosBorrador_("course1",Classroom.Courses.CourseWork.get(),["doc1","doc2"])');
assert.equal(patchCount,1);
assert.equal(repaired.id,'work1');
assert.equal(repaired.state,'DRAFT');
assert.equal(repaired.materials[0].driveFile.shareMode,'STUDENT_COPY');
assert.equal(repaired.materials[1].driveFile.shareMode,'STUDENT_COPY');
assert.equal(repaired.materials[2].driveFile.shareMode,'VIEW','Los archivos no-Docs no se modifican.');
assert.equal(run('verificarTodosLosGoogleDocsEnClassroom_(Classroom.Courses.CourseWork.get(),["doc1","doc2"]).length'),2);
run('asegurarCopiasDocumentosBorrador_("course1",Classroom.Courses.CourseWork.get(),["doc1","doc2"])');
assert.equal(patchCount,1,'Reintentar un borrador correcto no debe mutarlo.');
assert.throws(()=>run('verificarTodosLosGoogleDocsEnClassroom_({materials:[{driveFile:{driveFile:{id:"doc1"},shareMode:"VIEW"}}]},[])'),/BLOCKED_STUDENT_COPY/);
assert.throws(()=>run('asegurarCopiasDocumentosBorrador_("course1",{id:"work2",state:"PUBLISHED",materials:[]},["doc1"])'),/DRAFT/);

console.log('PASS: TAREA, ACTIVIDAD y PRACTICA: detección automática, STUDENT_COPY aun con VIEW/EDIT, URLs Google Docs, creación automática, reparación idempotente de DRAFT, preservación de PDFs y bloqueo de PUBLISHED.');
