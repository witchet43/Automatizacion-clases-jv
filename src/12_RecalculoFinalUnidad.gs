/** Recalculo directo desde Classroom, sin revisar ni devolver tareas. */
function recalcularYPublicarUnidadSolicitadaAhora() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const cfg = ss.getSheetByName('Configuración Quizzes');
  if (!cfg) throw new Error('No existe Configuración Quizzes.');
  const vals = cfg.getRange(1,1,Math.max(cfg.getLastRow(),1),8).getDisplayValues();
  let row=-1;
  for (let i=1;i<vals.length;i++) {
    if (String(vals[i][0]||'').trim()==='SOLICITUD_PROMEDIOS_UNIDAD') { row=i+1; break; }
  }
  if (row<0) throw new Error('No existe SOLICITUD_PROMEDIOS_UNIDAD.');
  const courseId=String(cfg.getRange(row,4).getDisplayValue()||'').trim();
  const unidad=String(cfg.getRange(row,7).getDisplayValue()||'').trim()||'Unidad 1';
  if (!courseId) throw new Error('Falta ID curso.');

  cfg.getRange(row,2).setValue('PROCESANDO');
  cfg.getRange(row,3).setValue('Recalculando directamente desde Classroom sin revisar tareas.');
  cfg.getRange(row,6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = calcularPromediosDirectoClassroom_(ss, courseId, unidad);
    const final = publicarCalificacionUnidadFinal_(ss, courseId, unidad, 'Calificación '+unidad);
    cfg.getRange(row,2).setValue('PROCESADO');
    cfg.getRange(row,3).setValue('Promedios recalculados desde Classroom y cargados en Calificación '+unidad+'. '+result.alumnos+' alumnos; '+result.noExamen.length+' instrumentos no-examen; '+final.actualizadas+' calificaciones finales asignadas y verificadas.');
    cfg.getRange(row,5).setValue('ACTIVA');
    cfg.getRange(row,6).setValue(new Date());
    return {promedios:result,cierre:final};
  } catch (err) {
    cfg.getRange(row,2).setValue('ERROR');
    cfg.getRange(row,3).setValue(String(err&&err.message?err.message:err));
    cfg.getRange(row,6).setValue(new Date());
    throw err;
  }
}

function calcularPromediosDirectoClassroom_(ss, courseId, unidad) {
  const topicId=String(buscarTopicIdUnidad_(courseId,unidad));
  const all=listarCourseWorkPublicacion_(courseId).filter(w =>
    String(w.state||'').toUpperCase()==='PUBLISHED' &&
    String(w.topicId||'')===topicId &&
    Number(w.maxPoints||0)>0 &&
    !/^Calificación\s+Unidad\b/i.test(String(w.title||'').trim())
  );

  const examenIds=new Set();
  const q=ss.getSheetByName('Quizzes');
  if (q && q.getLastRow()>1) {
    const d=q.getDataRange().getValues(), h={};
    d[0].forEach((v,i)=>h[String(v)]=i);
    for (let i=1;i<d.length;i++) {
      const r=d[i];
      if (String(r[h['ID del curso']]||'').trim()!==String(courseId)) continue;
      if (String(r[h['Unidad / tema']]||'').trim().toLowerCase()!==String(unidad).trim().toLowerCase()) continue;
      const tipo=String(r[h['Tipo instrumento']]||'').trim().toUpperCase();
      const titulo=String(r[h['Título']]||'').trim();
      if (tipo==='EXAMEN' || /^EXAMEN\b/i.test(titulo)) {
        const id=String(r[h['ID actividad Classroom']]||'').trim();
        if (id) examenIds.add(id);
      }
    }
  }

  const instrumentos=all.map(w=>({
    classroomId:String(w.id),
    titulo:String(w.title||''),
    maxPoints:Number(w.maxPoints),
    esExamen:examenIds.has(String(w.id)) || /^EXAMEN\b/i.test(String(w.title||'').trim())
  }));
  const examenes=instrumentos.filter(x=>x.esExamen);
  const noExamen=instrumentos.filter(x=>!x.esExamen);
  if (examenes.length!==1) throw new Error('Se esperaba exactamente 1 examen publicado en '+unidad+'; encontrados: '+examenes.length+'.');
  if (!noExamen.length) throw new Error('No hay instrumentos no-examen publicados en '+unidad+'.');

  const grades={};
  instrumentos.forEach(w=>grades[w.classroomId]=entregasPorAlumnoPromedio_(courseId,w.classroomId));
  const students=listarAlumnosPromedio_(courseId), rows=[], faltantes=[];
  students.forEach(student=>{
    const uid=String(student.userId);
    const nombre=student.profile&&student.profile.name?student.profile.name.fullName:uid;
    const email=student.profile&&student.profile.emailAddress?student.profile.emailAddress:'';
    instrumentos.forEach(w=>{ if(!tieneNota_(grades[w.classroomId][uid])) faltantes.push({alumno:nombre,userId:uid,trabajo:w.titulo,classroomId:w.classroomId}); });
    const exam=promedioSimple_(examenes.map(w=>normalizarNota_(grades[w.classroomId][uid],w.maxPoints)));
    const non=promedioSimple_(noExamen.map(w=>normalizarNota_(grades[w.classroomId][uid],w.maxPoints)));
    const final=redondearPromedio_(exam*0.70+non*0.30);
    rows.push([new Date(),String(courseId),unidad,uid,nombre,email,redondearPromedio_(exam),redondearPromedio_(exam*0.70),redondearPromedio_(non),redondearPromedio_(non*0.30),final,noExamen.length,0,0]);
  });
  if (faltantes.length) throw new Error('Aún existen '+faltantes.length+' calificaciones faltantes en Classroom. '+JSON.stringify(faltantes).slice(0,3000));
  escribirReportePromedios_(ss,courseId,unidad,rows);
  return {courseId:String(courseId),unidad:unidad,alumnos:rows.length,examenes:examenes,noExamen:noExamen,reporte:'Promedios Unidad',faltantes:0};
}
