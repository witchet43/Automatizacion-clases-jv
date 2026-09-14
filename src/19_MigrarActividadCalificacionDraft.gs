/**
 * Migra exclusivamente una actividad de calificación final ya existente a DRAFT_ONLY.
 * No recalcula promedios, no mueve temas, no toca otras actividades ni modifica
 * el estado PUBLISHED/DRAFT del CourseWork objetivo.
 */
function migrarActividadCalificacionADraft_(courseId, tituloExacto) {
  const works = listarCourseWorkPublicacion_(courseId)
    .filter(w => String(w.title || '').trim() === String(tituloExacto || '').trim());

  if (works.length !== 1) {
    throw new Error('Se esperaba exactamente una actividad con título "' + tituloExacto + '"; encontradas: ' + works.length + '.');
  }

  const work = works[0];
  if (!work.associatedWithDeveloper) {
    throw new Error('La actividad objetivo no es administrable por este Apps Script.');
  }

  const subs = entregasPorAlumnoPublicacion_(courseId, work.id);
  let migradas = 0;
  let yaDraft = 0;
  let sinCalificacion = 0;
  const detalle = [];

  Object.keys(subs).forEach(uid => {
    const sub = subs[uid];
    const tieneDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
    const tieneAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;

    if (!tieneDraft && !tieneAssigned) {
      sinCalificacion++;
      return;
    }

    if (!tieneAssigned) {
      yaDraft++;
      return;
    }

    const grade = tieneDraft ? Number(sub.draftGrade) : Number(sub.assignedGrade);
    escribirCalificacionDraft_(courseId, work.id, sub.id, grade);
    migradas++;
    detalle.push({userId:String(uid),calificacion:grade});
  });

  const verify = entregasPorAlumnoPublicacion_(courseId, work.id);
  const errores = [];
  Object.keys(verify).forEach(uid => {
    const sub = verify[uid];
    if (sub.assignedGrade !== undefined && sub.assignedGrade !== null) {
      errores.push({userId:String(uid),assignedGrade:Number(sub.assignedGrade)});
    }
  });
  if (errores.length) {
    throw new Error('Persisten assignedGrade en la actividad objetivo: ' + JSON.stringify(errores).slice(0,3000));
  }

  return {
    courseId:String(courseId),
    courseWorkId:String(work.id),
    titulo:String(work.title || ''),
    estadoCourseWork:String(work.state || ''),
    migradas:migradas,
    yaDraft:yaDraft,
    sinCalificacion:sinCalificacion,
    verificadas:Object.keys(verify).length,
    estadoCalificacion:'DRAFT_ONLY',
    detalle:detalle
  };
}

function procesarSolicitudMigrarActividadCalificacionDraft_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe Configuración Quizzes.');
  const row = buscarFilaSolicitud_(sh, 'SOLICITUD_MIGRAR_ACTIVIDAD_CALIFICACION_DRAFT', 8);
  if (row < 0) return {procesado:false,motivo:'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row,2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== 'SOLICITAR') return {procesado:false,motivo:'SIN_SOLICITUD_PENDIENTE',estado:estado};

  const courseId = String(sh.getRange(row,4).getDisplayValue() || '').trim();
  const titulo = String(sh.getRange(row,8).getDisplayValue() || '').trim();
  if (!courseId || !titulo) throw new Error('La migración requiere courseId y título exacto.');

  sh.getRange(row,2).setValue('PROCESANDO');
  sh.getRange(row,6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = migrarActividadCalificacionADraft_(courseId, titulo);
    sh.getRange(row,2).setValue('PROCESADO');
    sh.getRange(row,3).setValue(
      'Migración exclusiva completada para "'+titulo+'": '+result.migradas+
      ' calificaciones movidas a DRAFT; '+result.yaDraft+' ya estaban en DRAFT; '+
      result.sinCalificacion+' sin calificación; '+result.verificadas+' entregas verificadas. No se modificó ninguna otra actividad.'
    );
    sh.getRange(row,5).setValue('ACTIVA');
    sh.getRange(row,6).setValue(new Date());
    return result;
  } catch (err) {
    sh.getRange(row,2).setValue('ERROR');
    sh.getRange(row,3).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row,6).setValue(new Date());
    throw err;
  }
}
