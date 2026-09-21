/** Postflight canónico faltante: valida la mutación real contra Classroom/Drive sin publicar. */
function postflightDocumentoMaestro(result, request) {
  const r=result&&typeof result==='object'?result:{};
  const q=request&&typeof request==='object'?request:{};
  const expected=String(q.resourceState||MASTER_GUARDRAILS.DEFAULT_STATE||'DRAFT').toUpperCase();
  if(expected!=='DRAFT') throw new Error('POSTFLIGHT_MASTER: solo se permite DRAFT para recursos académicos ordinarios.');
  const workId=String(r.workId||'').trim();
  if(!workId) throw new Error('POSTFLIGHT_MASTER: falta workId verificable.');
  let courseId=String(r.courseId||q.courseId||'').trim();
  if(!courseId && q.materia){
    courseId=String(resolverCursoClassroomPorMateria_(String(q.materia)).id);
  }
  if(!courseId) throw new Error('POSTFLIGHT_MASTER: falta courseId verificable.');
  const work=Classroom.Courses.CourseWork.get(courseId,workId);
  if(String(work.state||'').toUpperCase()!==expected) throw new Error('POSTFLIGHT_MASTER: CourseWork no quedó '+expected+': '+workId+'.');
  const documentId=String(r.documentId||'').trim();
  if(documentId){
    const file=Drive.Files.get(documentId,{fields:'id,name,mimeType,trashed'});
    if(file.trashed===true) throw new Error('POSTFLIGHT_MASTER: documento adjunto está en papelera.');
    const material=(work.materials||[]).find(function(m){return m.driveFile&&m.driveFile.driveFile&&String(m.driveFile.driveFile.id||'')===documentId;});
    if(!material) throw new Error('POSTFLIGHT_MASTER: Classroom no conserva el documento esperado.');
    verificarAdjuntoDocumentoEditable_(work,documentId);
  }
  // Gate transversal: incluso los Docs añadidos por un flujo alterno no pueden
  // quedar como VIEW, EDIT ni como enlace simple dentro de un CourseWork.
  const docsVerificados=verificarTodosLosGoogleDocsEnClassroom_(work,documentId?[documentId]:[]);
  return {ok:true,courseId:courseId,workId:workId,state:String(work.state||''),documentId:documentId,documentosConCopiaIndividual:docsVerificados};
}
