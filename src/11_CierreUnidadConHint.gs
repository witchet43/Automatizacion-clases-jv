function cerrarUnidadConSiguienteVerificadaAhora() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe Configuración Quizzes.');
  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 8).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === 'SOLICITUD_PROMEDIOS_UNIDAD') { row = i + 1; break; }
  }
  if (row < 0) throw new Error('No existe SOLICITUD_PROMEDIOS_UNIDAD.');

  const courseId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  const unidad = String(sh.getRange(row, 7).getDisplayValue() || '').trim();
  const siguiente = String(sh.getRange(row, 8).getDisplayValue() || '').trim();
  if (!courseId || !unidad || !siguiente) throw new Error('Falta curso, unidad o siguiente unidad verificada.');
  const actualNo = extraerNumeroUnidad_(unidad);
  const siguienteNo = extraerNumeroUnidad_(siguiente);
  if (!actualNo || !siguienteNo || siguienteNo <= actualNo) throw new Error('La siguiente unidad verificada no es válida: ' + siguiente);

  sh.getRange(row, 2).setValue('PROCESANDO');
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const movidos = reubicarSinUnidadAHint_(ss, courseId, siguiente);
    const revision = revisarTareasCurso_(courseId, true);
    const instrumentos = importarYConsolidarInstrumentosUnidad_(ss, courseId, unidad);
    const result = calcularPromediosUnidad_(courseId, unidad, true);
    const final = publicarCalificacionUnidadFinal_(ss, courseId, unidad, 'Calificación ' + unidad);
    sh.getRange(row, 2).setValue('PROCESADO');
    sh.getRange(row, 3).setValue(
      'Cierre de ' + unidad + ' completado. ' + movidos.movidos + ' trabajo(s) sin unidad movidos a ' + siguiente + '; ' +
      revision.devueltas + ' entregas devueltas; ' + instrumentos.instrumentos + ' quiz/examen procesados; ' +
      result.alumnos + ' promedios calculados; ' + final.actualizadas + ' calificaciones finales enviadas.'
    );
    sh.getRange(row, 5).setValue('ACTIVA');
    sh.getRange(row, 6).setValue(new Date());
    return {reubicacion:movidos,revision:revision,instrumentos:instrumentos,promedios:result,cierre:final};
  } catch (err) {
    sh.getRange(row, 2).setValue('ERROR');
    sh.getRange(row, 3).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}

function reubicarSinUnidadAHint_(ss, courseId, unidadDestino) {
  let targetTopicId = null;
  try { targetTopicId = buscarTopicIdUnidad_(courseId, unidadDestino); } catch (e) { targetTopicId = null; }
  if (!targetTopicId) {
    const created = Classroom.Courses.Topics.create({name: unidadDestino}, String(courseId));
    targetTopicId = String(created.topicId);
  }
  const topics = listarTopics_(courseId);
  const topicById = {};
  topics.forEach(t => topicById[String(t.topicId)] = t);
  const candidates = [];

  const tareas = ss.getSheetByName('Tareas');
  if (tareas && tareas.getLastRow() > 1) {
    const data = tareas.getDataRange().getValues(); const h = {};
    data[0].forEach((v,i)=>h[String(v)]=i);
    for (let i=1;i<data.length;i++) {
      const r=data[i];
      if (String(r[h['ID curso']]||'').trim()!==String(courseId)) continue;
      if (String(r[h['Estado solicitud']]||'').trim().toUpperCase()!=='CREADA') continue;
      const id=String(r[h['ID Classroom']]||'').trim(); if(!id) continue;
      const title=String(r[h['Título']]||'').trim();
      const type=String(r[h['Tipo de actividad']]||'').trim().toUpperCase();
      const eligible=type==='TAREA'||type==='PRACTICA'||type==='PRÁCTICA'||type==='ACTIVIDAD'||type==='ACTIVIDAD EN CLASE'||/^TAREA\s*\d+/i.test(title)||/^PR[ÁA]CTICA\s*\d+/i.test(title)||/^ACTIVIDAD\s*\d+/i.test(title);
      if (!eligible || type==='EXAMEN' || type==='PROYECTO' || /^EXAMEN\b/i.test(title) || /^PROYECTO\b/i.test(title)) continue;
      candidates.push({sheet:tareas,row:i+1,col:h['Tema']+1,id:id,title:title,source:'Tareas'});
    }
  }
  const quizzes = ss.getSheetByName('Quizzes');
  if (quizzes && quizzes.getLastRow() > 1) {
    const data=quizzes.getDataRange().getValues(); const h={}; data[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<data.length;i++) {
      const r=data[i];
      if(String(r[h['ID del curso']]||'').trim()!==String(courseId)) continue;
      if(String(r[h['Estado']]||'').trim().toUpperCase()!=='CREADA') continue;
      const id=String(r[h['ID actividad Classroom']]||'').trim(); if(!id) continue;
      const title=String(r[h['Título']]||'').trim(); const type=String(r[h['Tipo instrumento']]||'').trim().toUpperCase();
      if(!(type==='QUIZ'||/^QUIZ\b/i.test(title)) || type==='EXAMEN'||/^EXAMEN\b/i.test(title)) continue;
      candidates.push({sheet:quizzes,row:i+1,col:h['Unidad / tema']+1,id:id,title:title,source:'Quizzes'});
    }
  }

  const seen=new Set(); const moved=[];
  candidates.forEach(x=>{
    if(seen.has(x.id)) return; seen.add(x.id);
    const cw=Classroom.Courses.CourseWork.get(String(courseId),String(x.id));
    if(String(cw.state||'').toUpperCase()!=='PUBLISHED') return;
    const topic=cw.topicId?topicById[String(cw.topicId)]:null;
    if(topic && extraerNumeroUnidad_(topic.name)) return;
    if(!cw.associatedWithDeveloper) throw new Error('No se puede mover el trabajo no asociado al proyecto: '+x.title+' ('+x.id+').');
    Classroom.Courses.CourseWork.patch({topicId:String(targetTopicId)},String(courseId),String(x.id),{updateMask:'topicId'});
    x.sheet.getRange(x.row,x.col).setValue(unidadDestino);
    moved.push({id:x.id,titulo:x.title,fuente:x.source,unidadDestino:unidadDestino});
  });
  return {unidadDestino:unidadDestino,topicIdDestino:String(targetTopicId),movidos:moved.length,detalle:moved};
}
