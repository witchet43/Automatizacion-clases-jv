/**
 * Diagnóstico operativo de SOLO LECTURA de fallos de documentación y cierre.
 * No cambia Classroom, Forms, Drive, Sheets ni calificaciones.
 * Exponer solo agregados de alumnos para no enviar notas/identidades a GitHub.
 */
function diagnosticarEstabilidadAcademicaReadOnly(params) {
  const p=params&&typeof params==='object'?params:{};
  const courseId=String(p.courseId||'').trim();
  const unidad=String(p.unidad||'').trim();
  if(!courseId||!/^Unidad\s+\d+$/i.test(unidad))
    throw new Error('READ_ONLY_DIAGNOSTIC: indique courseId y unidad canónica.');
  const docs=(Array.isArray(p.courseWorkIds)?p.courseWorkIds:[]).map(function(workId){
    const cw=Classroom.Courses.CourseWork.get(courseId,String(workId));
    const state=String(cw.state||'');
    // El docente puede haber PUBLICADO o eliminado manualmente un borrador
    // después de crearlo. Diagnosticar el estado real, sin imponer DRAFT
    // retrospectivamente ni convertir acciones legítimas en falsos errores.
    if(state==='DELETED')
      return {workId:String(workId),state:state,documentCount:0,teacherDeleted:true};
    const docIds=verificarTodosLosGoogleDocsEnClassroom_(cw,[]);
    return {workId:String(workId),state:state,documentCount:docIds.length,
      shareMode:docIds.length?'STUDENT_COPY':'SIN_GOOGLE_DOC'};
  });
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh=ss.getSheetByName('Promedios Unidad');
  if(!sh)throw new Error('READ_ONLY_DIAGNOSTIC: falta el reporte de promedios.');
  const data=sh.getDataRange().getValues(),h={};
  data[0].forEach(function(value,i){h[String(value)]=i;});
  ['ID curso','Unidad','User ID','Promedio final'].forEach(function(key){
    if(h[key]===undefined)throw new Error('READ_ONLY_DIAGNOSTIC: falta columna '+key);
  });
  const rows=data.slice(1).filter(function(r){
    return String(r[h['ID curso']])===courseId&&String(r[h['Unidad']])===unidad;
  });
  if(rows.length===0)throw new Error('READ_ONLY_DIAGNOSTIC: no hay promedios calculados para el curso y unidad.');
  const title=ACADEMIC_POLICY.CLASSROOM.FINAL_GRADE_PREFIX+extraerNumeroUnidad_(unidad);
  const finals=listarCourseWorkPublicacion_(courseId).filter(function(w){
    return String(w.title||'').trim()===title&&String(w.state||'')!=='DELETED';
  });
  if(finals.length!==1)throw new Error('READ_ONLY_DIAGNOSTIC: cierre final inexistente o duplicado: '+finals.length);
  const final=finals[0],subs=entregasPorAlumnoPublicacion_(courseId,final.id);
  let mismatches=0,assigned=0,missing=0;
  rows.forEach(function(r){
    const uid=String(r[h['User ID']]||'').trim(),expected=Number(r[h['Promedio final']]);
    const sub=subs[uid];
    if(!sub){missing++;return;}
    if(sub.assignedGrade!==undefined&&sub.assignedGrade!==null)assigned++;
    if(!verificarCalificacionDraft_(sub,expected).ok)mismatches++;
  });
  const formId=String(p.formId||'').trim();
  const form=formId?FormApp.openById(formId):null;
  const formUnpublished=form?Boolean(form.supportsAdvancedResponderPermissions()&&
    form.supportsAdvancedResponderPermissions()===true&&form.isPublished()===false):null;
  return {ok:true,mode:'READ_ONLY',courseId:courseId,unidad:unidad,
    documentCourseWork:docs,grades:{finalCourseWorkId:String(final.id),
      finalState:String(final.state),reportStudents:rows.length,
      unmatched:mismatches,assignedGrades:assigned,missingSubmissions:missing,
      aligned:mismatches===0&&assigned===0&&missing===0},
    form:form?{formId:formId,unpublished:formUnpublished}:null,
    writes:false};
}
