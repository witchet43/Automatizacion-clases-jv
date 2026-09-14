/** Cierre/recalculo final estricto: no modifica instrumentos fuente; faltantes o no asignados cuentan como 0. */
function procesarSolicitudRecalculoFinalUnidadCero_() {
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const cfg=ss.getSheetByName('Configuración Quizzes');
  if(!cfg) throw new Error('No existe Configuración Quizzes.');
  const vals=cfg.getRange(1,1,Math.max(cfg.getLastRow(),1),8).getDisplayValues();
  let row=-1;
  for(let i=1;i<vals.length;i++) if(String(vals[i][0]||'').trim()==='SOLICITUD_RECALCULAR_PUBLICAR_UNIDAD'){row=i+1;break;}
  if(row<0) return {procesado:false,motivo:'SIN_SOLICITUD_CONFIGURADA'};
  const estado=String(cfg.getRange(row,2).getDisplayValue()||'').trim().toUpperCase();
  if(estado!=='SOLICITAR') return {procesado:false,motivo:'SIN_SOLICITUD_PENDIENTE',estado:estado};
  const courseId=String(cfg.getRange(row,4).getDisplayValue()||'').trim();
  const unidad=String(cfg.getRange(row,7).getDisplayValue()||'').trim()||'Unidad 1';
  if(!courseId) throw new Error('Falta ID curso.');
  cfg.getRange(row,2).setValue('PROCESANDO');
  cfg.getRange(row,3).setValue('Recalculando solo '+unidad+'; ausencias/no asignaciones cuentan como 0; se sobrescribe la calificación final.');
  cfg.getRange(row,6).setValue(new Date()); SpreadsheetApp.flush();
  try {
    const result=calcularPromediosDirectoClassroomConCeros_(ss,courseId,unidad);
    const final=publicarCalificacionUnidadFinal_(ss,courseId,unidad,'Calificación '+unidad);
    cfg.getRange(row,2).setValue('PROCESADO');
    cfg.getRange(row,3).setValue('Recalculo completado: '+result.alumnos+' alumnos; '+result.noExamen.length+' instrumentos no-examen; '+result.faltantesComoCero+' ausencias/no asignaciones contabilizadas como 0; '+final.actualizadas+' calificaciones finales sobrescritas y verificadas.');
    cfg.getRange(row,6).setValue(new Date());
    return {promedios:result,cierre:final};
  } catch(err) {
    cfg.getRange(row,2).setValue('ERROR'); cfg.getRange(row,3).setValue(String(err&&err.message?err.message:err)); cfg.getRange(row,6).setValue(new Date()); throw err;
  }
}

/**
 * Único motor de cálculo de unidad.
 * Solo incluye CourseWork PUBLISHED del topic exacto Unidad N.
 * Cualquier alumno sin nota o sin StudentSubmission en un instrumento incluido recibe 0 en ese instrumento.
 */
function calcularPromediosDirectoClassroomConCeros_(ss,courseId,unidad){
  const policy=politicaCalificacionUnidad_(courseId);
  const topicId=String(buscarTopicIdUnidad_(courseId,unidad));
  const all=listarCourseWorkPublicacion_(courseId).filter(w=>
    String(w.state||'').toUpperCase()==='PUBLISHED'&&
    String(w.topicId||'')===topicId&&
    Number(w.maxPoints||0)>0&&
    !/^Calificación\s+Unidad\b/i.test(String(w.title||'').trim())
  );

  const examenIds=new Set(),q=ss.getSheetByName('Quizzes');
  if(q&&q.getLastRow()>1){
    const d=q.getDataRange().getValues(),h={};d[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<d.length;i++){
      const r=d[i];
      if(String(r[h['ID del curso']]||'').trim()!==String(courseId))continue;
      if(String(r[h['Unidad / tema']]||'').trim().toLowerCase()!==String(unidad).trim().toLowerCase())continue;
      const tipo=String(r[h['Tipo instrumento']]||'').trim().toUpperCase(),titulo=String(r[h['Título']]||'').trim();
      if(tipo==='EXAMEN'||/^EXAMEN\b/i.test(titulo)){
        const id=String(r[h['ID actividad Classroom']]||'').trim();if(id)examenIds.add(id);
      }
    }
  }

  const instrumentos=all.map(w=>({
    classroomId:String(w.id),titulo:String(w.title||''),maxPoints:Number(w.maxPoints),
    esExamen:examenIds.has(String(w.id))||/^EXAMEN\b/i.test(String(w.title||'').trim())
  }));
  const examenes=instrumentos.filter(x=>x.esExamen),noExamen=instrumentos.filter(x=>!x.esExamen);
  if(examenes.length!==1) throw new Error('Se esperaba exactamente 1 examen publicado en '+unidad+'; encontrados: '+examenes.length+'.');
  if(!noExamen.length) throw new Error('No hay instrumentos no-examen publicados en '+unidad+'.');

  const grades={};instrumentos.forEach(w=>grades[w.classroomId]=entregasPorAlumnoPromedio_(courseId,w.classroomId));
  const students=listarAlumnosPromedio_(courseId),rows=[];let faltantesComoCero=0;

  students.forEach(student=>{
    const uid=String(student.userId),nombre=student.profile&&student.profile.name?student.profile.name.fullName:uid,email=student.profile&&student.profile.emailAddress?student.profile.emailAddress:'';
    let faltNoExam=0,faltExam=0;
    const norm=(w,esExamen)=>{
      const sub=grades[w.classroomId][uid];
      if(!tieneNota_(sub)){
        faltantesComoCero++;
        if(esExamen) faltExam++; else faltNoExam++;
        return 0;
      }
      return normalizarNota_(sub,w.maxPoints);
    };
    const exam=promedioSimple_(examenes.map(w=>norm(w,true)));
    const non=promedioSimple_(noExamen.map(w=>norm(w,false)));
    const final=redondearPromedio_(exam*policy.examWeight+non*policy.nonExamWeight);
    rows.push([
      new Date(),String(courseId),unidad,uid,nombre,email,
      redondearPromedio_(exam),redondearPromedio_(exam*policy.examWeight),
      redondearPromedio_(non),redondearPromedio_(non*policy.nonExamWeight),
      final,noExamen.length,faltNoExam,faltExam
    ]);
  });

  escribirReportePromedios_(ss,courseId,unidad,rows,policy);
  return {
    courseId:String(courseId),unidad:unidad,alumnos:rows.length,examenes:examenes,noExamen:noExamen,
    reporte:'Promedios Unidad',faltantesComoCero:faltantesComoCero,politica:policy,modo:'UNIDAD_ESTRICTA'
  };
}
