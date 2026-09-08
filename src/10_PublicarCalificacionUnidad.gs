/**
 * Crea/reutiliza una actividad DRAFT de cierre de unidad y carga draftGrade
 * desde la hoja auditable "Promedios Unidad".
 * No publica ni devuelve entregas.
 */
const UNIT_GRADE_PUBLISH = Object.freeze({
  SHEET: 'Configuración Quizzes',
  KEY: 'SOLICITUD_PUBLICAR_CALIFICACION_UNIDAD',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR',
  REPORT_SHEET: 'Promedios Unidad'
});

function procesarSolicitudPublicarCalificacionUnidad_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(UNIT_GRADE_PUBLISH.SHEET);
  if (!sh) throw new Error('No existe la hoja ' + UNIT_GRADE_PUBLISH.SHEET);

  const lastRow = Math.max(sh.getLastRow(), 1);
  const values = sh.getRange(1, 1, lastRow, 8).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === UNIT_GRADE_PUBLISH.KEY) {
      row = i + 1;
      break;
    }
  }
  if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== UNIT_GRADE_PUBLISH.REQUESTED) {
    return {procesado: false, motivo: 'SIN_SOLICITUD_PENDIENTE', estado: estado};
  }

  const courseId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  const unidad = String(sh.getRange(row, 7).getDisplayValue() || '').trim() || 'Unidad 1';
  const titulo = String(sh.getRange(row, 8).getDisplayValue() || '').trim() || 'Calificación ' + unidad;
  if (!courseId) throw new Error('Falta el ID del curso.');

  sh.getRange(row, 2).setValue(UNIT_GRADE_PUBLISH.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = publicarCalificacionUnidadDraft_(ss, courseId, unidad, titulo);
    sh.getRange(row, 2).setValue(UNIT_GRADE_PUBLISH.DONE);
    sh.getRange(row, 3).setValue(
      'Actividad DRAFT creada/reutilizada: ' + titulo + '. ' +
      result.actualizadas + ' draftGrade cargadas.'
    );
    sh.getRange(row, 5).setValue('ACTIVA');
    sh.getRange(row, 6).setValue(new Date());
    return result;
  } catch (err) {
    sh.getRange(row, 2).setValue(UNIT_GRADE_PUBLISH.ERROR);
    sh.getRange(row, 3).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}

function publicarCalificacionUnidadDraft_(ss, courseId, unidad, titulo) {
  const report = ss.getSheetByName(UNIT_GRADE_PUBLISH.REPORT_SHEET);
  if (!report) throw new Error('No existe el reporte ' + UNIT_GRADE_PUBLISH.REPORT_SHEET + '.');

  const data = report.getDataRange().getValues();
  if (data.length < 2) throw new Error('El reporte de promedios está vacío.');
  const h = {};
  data[0].forEach((v, i) => h[String(v)] = i);

  const rows = data.slice(1).filter(r =>
    String(r[h['ID curso']] || '') === String(courseId) &&
    String(r[h['Unidad']] || '') === String(unidad)
  );
  if (!rows.length) throw new Error('No hay promedios calculados para el curso/unidad indicados.');

  const topicId = buscarTopicIdPorNombre_(courseId, unidad);
  const allWork = listarCourseWorkPublicacion_(courseId);
  let work = allWork.find(w => String(w.title || '').trim() === titulo);

  if (work) {
    if (String(work.state || '').toUpperCase() !== 'DRAFT') {
      throw new Error('Ya existe una actividad con ese título y no está en DRAFT.');
    }
    if (!work.associatedWithDeveloper) {
      throw new Error('La actividad existente no es administrable por este Apps Script.');
    }
  } else {
    work = Classroom.Courses.CourseWork.create({
      title: titulo,
      description:
        'Calificación calculada automáticamente para ' + unidad + ': ' +
        'Examen 70% + promedio de tareas, actividades, quizzes y prácticas 30%.',
      workType: 'ASSIGNMENT',
      state: 'DRAFT',
      maxPoints: 100,
      topicId: topicId || undefined
    }, String(courseId));
  }

  const submissions = entregasPorAlumnoPublicacion_(courseId, work.id);
  let updated = 0;
  rows.forEach(r => {
    const uid = String(r[h['User ID']] || '').trim();
    const grade = Number(r[h['Promedio final']]);
    const sub = submissions[uid];
    if (!uid || !sub) return;
    Classroom.Courses.CourseWork.StudentSubmissions.patch(
      {draftGrade: grade},
      String(courseId),
      String(work.id),
      String(sub.id),
      {updateMask: 'draftGrade'}
    );
    updated++;
  });

  return {
    courseWorkId: String(work.id),
    alternateLink: work.alternateLink || '',
    estado: work.state,
    titulo: titulo,
    actualizadas: updated,
    alumnosReporte: rows.length
  };
}

function buscarTopicIdPorNombre_(courseId, unidad) {
  let token = null;
  do {
    const page = Classroom.Courses.Topics.list(String(courseId), {pageToken: token});
    const hit = (page.topic || []).find(t => String(t.name || '').trim() === String(unidad));
    if (hit) return hit.topicId;
    token = page.nextPageToken;
  } while (token);
  return null;
}

function listarCourseWorkPublicacion_(courseId) {
  const out = [];
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.list(String(courseId), {pageToken: token, pageSize: 100});
    (page.courseWork || []).forEach(w => out.push(w));
    token = page.nextPageToken;
  } while (token);
  return out;
}

function entregasPorAlumnoPublicacion_(courseId, workId) {
  const out = {};
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
      String(courseId), String(workId), {pageToken: token, pageSize: 100}
    );
    (page.studentSubmissions || []).forEach(s => out[String(s.userId)] = s);
    token = page.nextPageToken;
  } while (token);
  return out;
}
