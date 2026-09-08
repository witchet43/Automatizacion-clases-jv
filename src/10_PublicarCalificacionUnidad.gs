/**
 * Crea/reutiliza la actividad sintética "Calificación Unidad N" como PUBLISHED
 * y carga draftGrade + assignedGrade desde el reporte auditable "Promedios Unidad".
 * Esta es la única excepción automática al DRAFT general del sistema.
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
    const result = publicarCalificacionUnidadFinal_(ss, courseId, unidad, titulo);
    sh.getRange(row, 2).setValue(UNIT_GRADE_PUBLISH.DONE);
    sh.getRange(row, 3).setValue(
      'Calificación de unidad enviada: ' + titulo + ' PUBLISHED; ' +
      result.actualizadas + ' assignedGrade cargadas y verificadas.'
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

function publicarCalificacionUnidadFinal_(ss, courseId, unidad, titulo) {
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

  const topicId = buscarTopicIdUnidad_(courseId, unidad);
  const allWork = listarCourseWorkPublicacion_(courseId);
  const canonicalTitle = titulo || ('Calificación ' + unidad);
  const matches = allWork.filter(w => String(w.title || '').trim() === canonicalTitle);
  if (matches.length > 1) throw new Error('Existen múltiples CourseWork con título ' + canonicalTitle + '. Resolver duplicado antes de cerrar.');
  let work = matches[0] || null;

  if (work) {
    if (!work.associatedWithDeveloper) {
      throw new Error('La actividad existente no es administrable por este Apps Script.');
    }
    if (String(work.topicId || '') !== String(topicId)) {
      work = Classroom.Courses.CourseWork.patch(
        {topicId: topicId}, String(courseId), String(work.id), {updateMask: 'topicId'}
      );
    }
    if (String(work.state || '').toUpperCase() === 'DRAFT') {
      work = Classroom.Courses.CourseWork.patch(
        {state: 'PUBLISHED'}, String(courseId), String(work.id), {updateMask: 'state'}
      );
    } else if (String(work.state || '').toUpperCase() !== 'PUBLISHED') {
      throw new Error('La actividad final existe en estado incompatible: ' + work.state);
    }
  } else {
    work = Classroom.Courses.CourseWork.create({
      title: canonicalTitle,
      description:
        'Calificación final de ' + unidad + '. Cálculo: Examen 70% + promedio de tareas, actividades, quizzes y prácticas 30%.',
      workType: 'ASSIGNMENT',
      state: 'PUBLISHED',
      maxPoints: 100,
      topicId: topicId
    }, String(courseId));
  }

  if (String(work.state || '').toUpperCase() !== 'PUBLISHED') {
    throw new Error('No se logró dejar PUBLISHED la actividad final.');
  }

  // Classroom genera StudentSubmissions al publicar. Reintento breve por propagación.
  let submissions = {};
  for (let attempt = 0; attempt < 5; attempt++) {
    submissions = entregasPorAlumnoPublicacion_(courseId, work.id);
    if (Object.keys(submissions).length >= rows.length) break;
    Utilities.sleep(1000);
  }

  if (Object.keys(submissions).length < rows.length) {
    throw new Error('Classroom no generó StudentSubmissions para todos los alumnos: ' + Object.keys(submissions).length + '/' + rows.length + '.');
  }

  let updated = 0;
  rows.forEach(r => {
    const uid = String(r[h['User ID']] || '').trim();
    const grade = Number(r[h['Promedio final']]);
    if (!uid || !Number.isFinite(grade)) throw new Error('Fila de promedio inválida para User ID ' + uid + '.');
    const sub = submissions[uid];
    if (!sub) throw new Error('No existe StudentSubmission final para User ID ' + uid + '.');
    Classroom.Courses.CourseWork.StudentSubmissions.patch(
      {draftGrade: grade, assignedGrade: grade},
      String(courseId), String(work.id), String(sub.id),
      {updateMask: 'draftGrade,assignedGrade'}
    );
    updated++;
  });

  // Verificación de cierre: todos los alumnos deben tener assignedGrade igual al reporte.
  const verify = entregasPorAlumnoPublicacion_(courseId, work.id);
  const mismatches = [];
  rows.forEach(r => {
    const uid = String(r[h['User ID']] || '').trim();
    const expected = Number(r[h['Promedio final']]);
    const sub = verify[uid];
    const assigned = sub && sub.assignedGrade !== undefined && sub.assignedGrade !== null
      ? Number(sub.assignedGrade) : null;
    if (assigned === null || Math.abs(assigned - expected) > 0.001) {
      mismatches.push({userId: uid, esperado: expected, assignedGrade: assigned});
    }
  });
  if (mismatches.length) {
    throw new Error('Falló verificación de assignedGrade final: ' + JSON.stringify(mismatches).slice(0, 3000));
  }

  return {
    courseWorkId: String(work.id),
    alternateLink: work.alternateLink || '',
    estado: work.state,
    titulo: canonicalTitle,
    actualizadas: updated,
    alumnosReporte: rows.length,
    verificadas: rows.length
  };
}

function buscarTopicIdUnidad_(courseId, unidad) {
  const unitNo = extraerNumeroUnidad_(unidad);
  const topics = listarTopics_(courseId).filter(t => extraerNumeroUnidad_(t.name) === unitNo);
  if (!topics.length) throw new Error('No existe tema verificable para ' + unidad + '.');
  const exact = topics.filter(t => String(t.name || '').trim().toLowerCase() === ('unidad ' + unitNo).toLowerCase());
  if (exact.length === 1) return exact[0].topicId;
  if (topics.length === 1) return topics[0].topicId;
  throw new Error('Hay múltiples temas candidatos para ' + unidad + ': ' + topics.map(t => t.name).join(' | '));
}

function extraerNumeroUnidad_(text) {
  const m = String(text || '').trim().match(/^unidad\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

function listarTopics_(courseId) {
  const out = [];
  let token = null;
  do {
    const page = Classroom.Courses.Topics.list(String(courseId), {pageToken: token, pageSize: 100});
    (page.topic || []).forEach(t => out.push(t));
    token = page.nextPageToken;
  } while (token);
  return out;
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
