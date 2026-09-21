/**
 * Contrato global: cualquier Google Documento académico adjunto a una tarea,
 * actividad o práctica se entrega como copia individual editable (STUDENT_COPY).
 * La regla se infiere del documento; no depende de repetir un interruptor,
 * del curso ni del texto de la solicitud. No se crean Docs artificiales cuando
 * la evidencia pertenece a Forms, un simulador u otra herramienta.
 */
const DOCUMENTO_EDITABLE_CLASSROOM=Object.freeze({
  CURSOS_OBLIGATORIOS:Object.freeze(['871156721160']),
  TIPOS:Object.freeze(['TAREA','ACTIVIDAD','PRACTICA']),
  MODO:'STUDENT_COPY',
  MIME:'application/vnd.google-apps.document'
});

function extraerIdGoogleDocumentoDeUrl_(url) {
  const match=String(url||'').trim().match(/^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/i);
  return match ? match[1] : '';
}

function idsGoogleDocumentosSolicitados_(p) {
  const x=p&&typeof p==='object'?p:{};
  const ids=[];
  [x.documentId,x.googleDocId].concat(Array.isArray(x.documentIds)?x.documentIds:[]).forEach(function(id){
    const s=String(id||'').trim();
    if(s&&ids.indexOf(s)<0)ids.push(s);
  });
  (Array.isArray(x.links)?x.links:[]).forEach(function(link){
    const id=extraerIdGoogleDocumentoDeUrl_(link&&link.url);
    if(id&&ids.indexOf(id)<0)ids.push(id);
  });
  return ids;
}

/** Obtiene únicamente Google Docs nativos YA adjuntos al CourseWork real. */
function idsGoogleDocumentosAdjuntos_(materials) {
  const ids=[];
  (Array.isArray(materials)?materials:[]).forEach(function(m){
    const id=m&&m.driveFile&&m.driveFile.driveFile?
      String(m.driveFile.driveFile.id||'').trim():m&&m.link?
      extraerIdGoogleDocumentoDeUrl_(m.link.url):'';
    if(!id||ids.indexOf(id)>=0)return;
    const f=Drive.Files.get(id,{fields:'id,mimeType,trashed'});
    if(f.trashed)throw new Error('BLOCKED_GOOGLE_DOC: documento adjunto en la papelera: '+id);
    if(String(f.mimeType)===DOCUMENTO_EDITABLE_CLASSROOM.MIME)ids.push(id);
  });
  return ids;
}

function requiereDocumentoEditableClassroom_(p) {
  const tipo=String(p&&p.tipo||'').toUpperCase();
  if(DOCUMENTO_EDITABLE_CLASSROOM.TIPOS.indexOf(tipo)<0)return false;
  return tipo==='PRACTICA'||
    idsGoogleDocumentosSolicitados_(p).length>0||
    p.requiereDocumentoEditable===true||p.requiereGoogleDoc===true||
    (p.contenidoDocumento!==undefined&&String(p.contenidoDocumento||'').trim()!=='')||
    (p.googleDocContent!==undefined&&String(p.googleDocContent||'').trim()!=='')||
    DOCUMENTO_EDITABLE_CLASSROOM.CURSOS_OBLIGATORIOS.indexOf(String(p.courseId||''))>=0;
}

function verificarAdjuntoDocumentoEditable_(work,docId) {
  const id=String(docId||'').trim();
  const materials=Array.isArray(work&&work.materials)?work.materials:[];
  const material=materials.find(function(m){
    return m&&m.driveFile&&m.driveFile.driveFile&&
      String(m.driveFile.driveFile.id||'')===id&&
      String(m.driveFile.shareMode||'').toUpperCase()==='STUDENT_COPY';
  });
  if(!material)throw new Error('BLOCKED_STUDENT_COPY: Classroom no confirmó el Google Doc con copia individual: '+id);
  const f=Drive.Files.get(id,{fields:'id,mimeType,trashed,name'});
  if(f.trashed||String(f.mimeType)!==DOCUMENTO_EDITABLE_CLASSROOM.MIME)
    throw new Error('BLOCKED_GOOGLE_DOC: adjunto no es un Google Documento nativo vigente: '+id);
  return true;
}

/** Se ejecuta incluso cuando la petición no trae el interruptor especial. */
function verificarTodosLosGoogleDocsEnClassroom_(work,idsEsperados) {
  const materials=Array.isArray(work&&work.materials)?work.materials:[];
  const ids=[];
  materials.forEach(function(m){
    if(m&&m.link&&extraerIdGoogleDocumentoDeUrl_(m.link.url))
      throw new Error('BLOCKED_STUDENT_COPY: un enlace a Google Docs no sustituye el adjunto con copia individual.');
    if(!m||!m.driveFile||!m.driveFile.driveFile)return;
    const id=String(m.driveFile.driveFile.id||'').trim();
    if(!id)return;
    const f=Drive.Files.get(id,{fields:'id,mimeType,trashed'});
    if(f.trashed)throw new Error('BLOCKED_GOOGLE_DOC: el archivo adjunto está en la papelera: '+id);
    if(String(f.mimeType)===DOCUMENTO_EDITABLE_CLASSROOM.MIME){
      if(String(m.driveFile.shareMode||'').toUpperCase()!=='STUDENT_COPY')
        throw new Error('BLOCKED_STUDENT_COPY: Google Documento adjunto sin copia individual: '+id);
      ids.push(id);
    }
  });
  (idsEsperados||[]).forEach(function(id){
    if(ids.indexOf(String(id))<0)throw new Error('BLOCKED_STUDENT_COPY: falta el documento esperado en Classroom: '+id);
  });
  return ids;
}

/**
 * Cuando ya existe un borrador canónico, repara solamente sus materiales
 * documentales; no crea una segunda tarea ni altera su estado/fecha/puntos.
 * Un error de la API se propaga y nunca se comunica éxito sin readback.
 */
function asegurarCopiasDocumentosBorrador_(courseId,work,idsEsperados) {
  if(String(work&&work.state||'').toUpperCase()!=='DRAFT')
    throw new Error('BLOCKED_STUDENT_COPY: no se modificará un CourseWork que no sea DRAFT.');
  const materiales=Array.isArray(work.materials)?work.materials:[];
  const ids=Array.isArray(idsEsperados)?idsEsperados:[];
  let changed=false;
  const rewritten=materiales.map(function(m){
    const docLinkId=m&&m.link?extraerIdGoogleDocumentoDeUrl_(m.link.url):'';
    if(docLinkId){
      const f=Drive.Files.get(docLinkId,{fields:'id,mimeType,trashed'});
      if(f.trashed||String(f.mimeType)!==DOCUMENTO_EDITABLE_CLASSROOM.MIME)
        throw new Error('BLOCKED_GOOGLE_DOC: enlace de documento no accesible: '+docLinkId);
      changed=true;
      return {driveFile:{driveFile:{id:docLinkId},shareMode:'STUDENT_COPY'}};
    }
    if(!m||!m.driveFile||!m.driveFile.driveFile)return m;
    const id=String(m.driveFile.driveFile.id||'').trim();
    const f=Drive.Files.get(id,{fields:'id,mimeType,trashed'});
    if(f.trashed)throw new Error('BLOCKED_GOOGLE_DOC: archivo en la papelera: '+id);
    if(String(f.mimeType)!==DOCUMENTO_EDITABLE_CLASSROOM.MIME)return m;
    if(String(m.driveFile.shareMode||'').toUpperCase()==='STUDENT_COPY')return m;
    changed=true;
    return {driveFile:{driveFile:{id:id},shareMode:'STUDENT_COPY'}};
  });
  ids.forEach(function(id){
    if(rewritten.some(function(m){return m&&m.driveFile&&m.driveFile.driveFile&&String(m.driveFile.driveFile.id)===String(id);}))return;
    Drive.Files.get(String(id),{fields:'id,mimeType,trashed'});
    rewritten.push({driveFile:{driveFile:{id:String(id)},shareMode:'STUDENT_COPY'}});
    changed=true;
  });
  if(changed){
    Classroom.Courses.CourseWork.patch({materials:rewritten},String(courseId),String(work.id),{updateMask:'materials'});
    work=Classroom.Courses.CourseWork.get(String(courseId),String(work.id));
  }
  verificarTodosLosGoogleDocsEnClassroom_(work,ids);
  return work;
}

function prepararRecursoConDocumentoEditable_(p) {
  if(!requiereDocumentoEditableClassroom_(p))return p;
  const original=String(p.descripcion||'').trim();
  const ids=idsGoogleDocumentosSolicitados_(p);
  if(!ids.length){
    const raw=p.contenidoDocumento!==undefined?p.contenidoDocumento:
      p.googleDocContent!==undefined?p.googleDocContent:original;
    if(!String(Array.isArray(raw)?raw.join('\n'):raw||'').trim())
      throw new Error('BLOCKED_GOOGLE_DOC: falta el contenido didáctico para generar el documento individual.');
    const items=Array.isArray(raw)?raw:String(raw).split(/\n\s*\n/).map(function(x){return x.trim();}).filter(Boolean);
    const respuesta=[];
    items.forEach(function(item){
      respuesta.push(String(item));
      if(/^\d+\.\s+/.test(String(item)))respuesta.push('RESPUESTA / EVIDENCIA DEL ALUMNO: __________________________________________________________');
    });
    respuesta.push('EVIDENCIA FINAL: revisa que hayas completado lo solicitado.');
    const nuevo=crearGoogleDocumentoPractica_({
      titulo:p.titulo,
      descripcion:'Trabaja directamente en tu copia personal de este documento. Completa los apartados y entrega la evidencia solicitada.',
      contenidoDocumento:respuesta
    });
    ids.push(String(nuevo.id));
    p.documentoCreadoPorScript=true;
  }
  ids.forEach(function(id){
    const file=Drive.Files.get(String(id),{fields:'id,mimeType,trashed'});
    if(file.trashed||String(file.mimeType)!==DOCUMENTO_EDITABLE_CLASSROOM.MIME)
      throw new Error('BLOCKED_GOOGLE_DOC: no es un Google Documento nativo vigente y accesible: '+id);
  });
  p.documentId=ids[0];
  p.documentIds=ids;
  p.shareMode='STUDENT_COPY';
  p.studentCopy=true;
  p.descripcion='INDICACIONES PARA EL ALUMNO\n\nAbre tu copia personal del Google Documento adjunto, complétala y entrega tu trabajo mediante Classroom. No redactes la evidencia en este campo.';
  validarFormatoDescripcionClassroom_(p.descripcion,p.tipo);
  return p;
}

/** Regresión académica sin crear recursos externos. */
function validarContratoDocumentoEditableClassroom() {
  const base={courseId:'871156721160',tipo:'TAREA'};
  if(!requiereDocumentoEditableClassroom_(base)||!requiereDocumentoEditableClassroom_({courseId:base.courseId,tipo:'ACTIVIDAD'}))
    throw new Error('REGRESION_DOC: los recursos documentales configurados deben crear copia individual.');
  ['TAREA','ACTIVIDAD','PRACTICA'].forEach(function(tipo){
    if(!requiereDocumentoEditableClassroom_({courseId:'otro',tipo:tipo,documentId:'doc-nativo'}))
      throw new Error('REGRESION_DOC: Google Doc sin STUDENT_COPY en '+tipo);
    if(resolverShareModeDirecto_({tipo:tipo,documentId:'doc-nativo',shareMode:'VIEW',studentCopy:false})!=='STUDENT_COPY')
      throw new Error('REGRESION_DOC: VIEW no puede prevalecer sobre STUDENT_COPY en '+tipo);
  });
  const link='https://docs.google.com/document/d/doc_123/edit';
  if(!requiereDocumentoEditableClassroom_({courseId:'otro',tipo:'TAREA',links:[{url:link}]}))
    throw new Error('REGRESION_DOC: no detectó el Google Doc enlazado.');
  if(!requiereDocumentoEditableClassroom_({courseId:'otro',tipo:'TAREA',contenidoDocumento:'Lee y responde.'}))
    throw new Error('REGRESION_DOC: no detectó el contenido documental.');
  if(requiereDocumentoEditableClassroom_({courseId:'otro',tipo:'TAREA'})||
      requiereDocumentoEditableClassroom_({courseId:'otro',tipo:'QUIZ'}))
    throw new Error('REGRESION_DOC: no crear documento artificial en recursos sin Google Doc.');
  return {ok:true,mode:'NATIVE_GOOGLE_DOC_STUDENT_COPY',scope:'ALL_COURSES_ALL_DOC_BASED_COURSEWORK',
    types:DOCUMENTO_EDITABLE_CLASSROOM.TIPOS,noArbitraryDocs:true,mutation:false};
}
