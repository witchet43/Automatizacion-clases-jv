/**
 * Contrato de evidencia editable: en cursos configurados y en solicitudes con
 * requiereDocumentoEditable, el alumno recibe un Google Doc nativo con copia
 * individual. Classroom contiene solo orientación breve, no el desarrollo.
 * Nunca se agrega un enlace simple como sustituto de STUDENT_COPY.
 */
const DOCUMENTO_EDITABLE_CLASSROOM=Object.freeze({
  CURSOS_OBLIGATORIOS:Object.freeze(['871156721160']),
  TIPOS:Object.freeze(['TAREA','ACTIVIDAD']),
  MODO:'STUDENT_COPY'
});
function requiereDocumentoEditableClassroom_(p){
  const tipo=String(p&&p.tipo||'').toUpperCase();
  if(DOCUMENTO_EDITABLE_CLASSROOM.TIPOS.indexOf(tipo)<0)return false;
  return p.requiereDocumentoEditable===true||
    DOCUMENTO_EDITABLE_CLASSROOM.CURSOS_OBLIGATORIOS.indexOf(String(p.courseId||''))>=0;
}
function verificarAdjuntoDocumentoEditable_(work,docId){
  const materials=Array.isArray(work&&work.materials)?work.materials:[];
  const material=materials.find(function(m){
    return m&&m.driveFile&&m.driveFile.driveFile&&
      String(m.driveFile.driveFile.id||'')===String(docId||'')&&
      String(m.driveFile.shareMode||'').toUpperCase()==='STUDENT_COPY';
  });
  if(!material)throw new Error('BLOCKED_STUDENT_COPY: Classroom no confirmó el Google Doc con copia individual.');
  const f=Drive.Files.get(String(docId),{fields:'id,mimeType,trashed,name'});
  if(f.trashed||String(f.mimeType)!=='application/vnd.google-apps.document')
    throw new Error('BLOCKED_GOOGLE_DOC: adjunto no es un Google Documento nativo vigente.');
  return true;
}
function prepararRecursoConDocumentoEditable_(p){
  if(!requiereDocumentoEditableClassroom_(p))return p;
  const original=String(p.descripcion||'').trim();
  if(!original&&!String(p.documentId||p.googleDocId||''))throw new Error('BLOCKED_GOOGLE_DOC: falta contenido didáctico.');
  let docId=String(p.documentId||p.googleDocId||'').trim();
  if(!docId){
    const items=original.split(/\n\s*\n/).map(function(s){return s.trim();}).filter(Boolean);
    const respuesta=[];
    items.forEach(function(s){
      respuesta.push(s);
      if(/^\d+\.\s+/.test(s)) respuesta.push('RESPUESTA / EVIDENCIA DEL ALUMNO: __________________________________________________________');
    });
    respuesta.push('EVIDENCIA FINAL: inserta aquí las tablas y capturas solicitadas.','CONCLUSIONES / PREGUNTAS: escribe aquí tus respuestas.');
    const nuevo=crearGoogleDocumentoPractica_({
      titulo:p.titulo,
      descripcion:'Trabaja directamente en tu copia personal de este documento. Completa cada espacio de respuesta e inserta las evidencias solicitadas. Utiliza tu computadora personal con Windows.',
      contenidoDocumento:respuesta
    });
    docId=String(nuevo.id);
  }
  const file=Drive.Files.get(docId,{fields:'id,mimeType,trashed'});
  if(file.trashed||String(file.mimeType)!=='application/vnd.google-apps.document')throw new Error('BLOCKED_GOOGLE_DOC: el documento editable no es nativo o está en papelera.');
  p.documentId=docId;
  p.shareMode='STUDENT_COPY';
  p.studentCopy=true;
  p.descripcion='INDICACIONES PARA EL ALUMNO\n\nAbre la copia personal del Google Documento adjunto, completa allí los pasos y las evidencias solicitadas, y entrega tu trabajo mediante Classroom. No redactes la evidencia en este campo.';
  validarFormatoDescripcionClassroom_(p.descripcion,p.tipo);
  return p;
}
/** Regresión determinista: el generador no puede olvidar qué cursos exigen Docs. */
function validarContratoDocumentoEditableClassroom(){
  const base={courseId:'871156721160',tipo:'TAREA'};
  if(!requiereDocumentoEditableClassroom_(base)||!requiereDocumentoEditableClassroom_({courseId:base.courseId,tipo:'ACTIVIDAD'}))
    throw new Error('REGRESION_DOC: faltan TAREA y ACTIVIDAD de Introducción TI.');
  if(requiereDocumentoEditableClassroom_({courseId:base.courseId,tipo:'QUIZ'}))
    throw new Error('REGRESION_DOC: quiz vacío no debe recibir un documento.');
  if(!requiereDocumentoEditableClassroom_({courseId:'otro',tipo:'TAREA',requiereDocumentoEditable:true}))
    throw new Error('REGRESION_DOC: se perdió el interruptor transversal.');
  if(requiereDocumentoEditableClassroom_({courseId:'otro',tipo:'TAREA'}))
    throw new Error('REGRESION_DOC: se crearía un documento artificial para otra materia.');
  return {ok:true,mode:'NATIVE_GOOGLE_DOC_STUDENT_COPY',courseId:base.courseId,
    types:DOCUMENTO_EDITABLE_CLASSROOM.TIPOS,noArbitraryDocs:true,mutation:false};
}
