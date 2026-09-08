/** Cierre final: no modifica instrumentos fuente; faltantes cuentan como 0. */
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
  cfg.getRange(row,2).setValue('PROCESANDO');
  cfg.getRange(row,3).setValue('Calculando desde Classroom; faltantes se consideran 0; no se modifican instrumentos fuente.');
  cfg.getRange(row,6).setValue(new Date()); SpreadsheetApp.flush();
  try {
    const result=calcularPromediosDirectoClassroomConCeros_(ss,courseId,unidad);
    const final=publicarCalificacionUnidadFinal_(ss,courseId,unidad,'Calificación '+unidad);
    cfg.getRange(row,2).setValue('PROCESADO');
    cfg.getRange(row,3).setValue('Cierre completado: '+result.alumnos+' alumnos; '+result.noExamen.length+' instrumentos no-examen; '+result.faltantesComoCero+' faltantes contabilizados como 0; '+final.actualizadas+' calificaciones finales asignadas y verificadas.');
    cfg.getRange(row,6).setValue(new Date());
    return {promedios:result,cierre:final};
  } catch(err) {
    cfg.getRange(row,2).setValue('ERROR'); cfg.getRange(row,3).setValue(String(err&&err.message?err.message:err)); cfg.getRange(row,6).setValue(new Date()); throw err;
  }
}

function calcularPromediosDirectoClassroomConCeros_(ss,courseId,unidad){
  const topicId=String(buscarTopicIdUnidad_(courseId,unidad));
  const all=listarCourseWorkPublicacion_(courseId).filter(w=>String(w.state||'').toUpperCase()==='PUBLISHED'&&String(w.topicId||'')===topicId&&Number(w.maxPoints||0)>0&&!/^Calificación\s+Unidad\b/i.test(String(w.title||'').trim()));
  const examenIds=new Set(),q=ss.getSheetByName('Quizzes');
  if(q&&q.getLastRow()>1){const d=q.getDataRange().getValues(),h={};d[0].forEach((v,i)=>h[String(v)]=i);for(let i=1;i<d.length;i++){const r=d[i];if(String(r[h['ID del curso']]||'').trim()!==String(courseId)||String(r[h['Unidad / tema']]||'').trim().toLowerCase()!==String(unidad).trim().toLowerCase())continue;const tipo=String(r[h['Tipo instrumento']]||'').trim().toUpperCase(),titulo=String(r[h['Título']]||'').trim();if(tipo==='EXAMEN'||/^EXAMEN\b/i.test(titulo)){const id=String(r[h['ID actividad Classroom']]||'').trim();if(id)examenIds.add(id);}}}
  const instrumentos=all.map(w=>({classroomId:String(w.id),titulo:String(w.title||''),maxPoints:Number(w.maxPoints),esExamen:examenIds.has(String(w.id))||/^EXAMEN\b/i.test(String(w.title||'').trim())}));
  const examenes=instrumentos.filter(x=>x.esExamen),noExamen=instrumentos.filter(x=>!x.esExamen);
  if(examenes.length!==1) throw new Error('Se esperaba exactamente 1 examen publicado en '+unidad+'; encontrados: '+examenes.length+'.');
  if(!noExamen.length) throw new Error('No hay instrumentos no-examen publicados en '+unidad+'.');
  const grades={};instrumentos.forEach(w=>grades[w.classroomId]=entregasPorAlumnoPromedio_(courseId,w.classroomId));
  const students=listarAlumnosPromedio_(courseId),rows=[];let faltantesComoCero=0;
  const norm=(w,uid)=>{const sub=grades[w.classroomId][uid];if(!tieneNota_(sub)){faltantesComoCero++;return 0;}return normalizarNota_(sub,w.maxPoints);};
  students.forEach(student=>{const uid=String(student.userId),nombre=student.profile&&student.profile.name?student.profile.name.fullName:uid,email=student.profile&&student.profile.emailAddress?student.profile.emailAddress:'';const exam=promedioSimple_(examenes.map(w=>norm(w,uid))),non=promedioSimple_(noExamen.map(w=>norm(w,uid))),final=redondearPromedio_(exam*.70+non*.30);rows.push([new Date(),String(courseId),unidad,uid,nombre,email,redondearPromedio_(exam),redondearPromedio_(exam*.70),redondearPromedio_(non),redondearPromedio_(non*.30),final,noExamen.length,0,0]);});
  escribirReportePromedios_(ss,courseId,unidad,rows);
  return {courseId:String(courseId),unidad:unidad,alumnos:rows.length,examenes:examenes,noExamen:noExamen,reporte:'Promedios Unidad',faltantesComoCero:faltantesComoCero};
}
