/**
 * Cierre oficial y auditable de una unidad.
 *
 * Orden obligatorio:
 * 1) mover Tarea/Actividad/Práctica/Quiz PUBLISHED sin unidad al siguiente tema
 *    de unidad inmediato cuyo promedio aún no esté cerrado;
 * 2) ejecutar Revisa tareas (finaliza y devuelve lo TURNED_IN);
 * 3) importar y consolidar quizzes/examen de la unidad;
 * 4) verificar que todos los insumos publicados tengan calificación;
 * 5) calcular examen 70% + promedio de todo lo no-examen 30%;
 * 6) crear/reutilizar "Calificación Unidad N" PUBLISHED y cargar assignedGrade.
 */
const UNIT_AVG_REQUEST = Object.freeze({
  SHEET: 'Configuración Quizzes',
  KEY: 'SOLICITUD_PROMEDIOS_UNIDAD',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR',
  REPORT_SHEET: 'Promedios Unidad'
});

function procesarSolicitudPromediosUnidad_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(UNIT_AVG_REQUEST.SHEET);
  if (!sh) throw new Error('No existe la hoja ' + UNIT_AVG_REQUEST.SHEET);

  const lastRow = Math.max(sh.getLastRow(), 1);
  const values = sh.getRange(1, 1, lastRow, 7).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === UNIT_AVG_REQUEST.KEY) {
      row = i + 1;
      break;
    }
  }
  if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== UNIT_AVG_REQUEST.REQUESTED) {
    return {procesado: false, motivo: 'SIN_SOLICITUD_PENDIENTE', estado: estado};
  }

  const courseId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  const unidad = String(sh.getRange(row, 7).getDisplayValue() || '').trim() || 'Unidad 1';
  if (!courseId) throw new Error('Falta el ID del curso objetivo para calcular promedios.');

  sh.getRange(row, 2).setValue(UNIT_AVG_REQUEST.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const movidos = reubicarCourseWorkSinUnidad_(ss, courseId, unidad);
    const revision = revisarTareasCurso_(courseId, true);
    const instrumentos = importarYConsolidarInstrumentosUnidad_(ss, courseId, unidad);
    const result = calcularPromediosUnidad_(courseId, unidad, true);
    const final = publicarCalificacionUnidadFinal_(ss, courseId, unidad, 'Calificación ' + unidad);

    sh.getRange(row, 2).setValue(UNIT_AVG_REQUEST.DONE);
    sh.getRange(row, 3).setValue(
      'Cierre de ' + unidad + ' completado. ' + movidos.movidos + ' trabajo(s) sin unidad movidos a ' + movidos.unidadDestino + '; ' +
      revision.devueltas + ' entregas devueltas; ' + instrumentos.instrumentos + ' quiz/examen procesados; ' +
      result.alumnos + ' promedios calculados; ' + final.actualizadas + ' calificaciones finales enviadas.'
    );
    sh.getRange(row, 5).setValue('ACTIVA');
    sh.getRange(row, 6).setValue(new Date());
    return {reubicacion: movidos, revision: revision, instrumentos: instrumentos, promedios: result, cierre: final};
  } catch (err) {
    sh.getRange(row, 2).setValue(UNIT_AVG_REQUEST.ERROR);
    sh.getRange(row, 3).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}

function reubicarCourseWorkSinUnidad_(ss, courseId, unidadActual) {
  const currentNo = extraerNumeroUnidad_(unidadActual);
  if (!currentNo) throw new Error('No se pudo identificar el número de ' + unidadActual + '.');

  const topics = listarTopics_(courseId);
  const allWork = listarCourseWorkPublicacion_(courseId);
  const topicById = {};
  topics.forEach(t => topicById[String(t.topicId)] = t);

  const unitNumbers = Array.from(new Set(topics.map(t => extraerNumeroUnidad_(t.name)).filter(n => n && n > currentNo))).sort((a, b) => a - b);
  let targetNo = null;
  let targetTopicId = null;
  for (const n of unitNumbers) {
    const finalTitle = 'Calificación Unidad ' + n;
    const closed = allWork.some(w =>
      String(w.title || '').trim() === finalTitle && String(w.state || '').toUpperCase() === 'PUBLISHED'
    );
    if (!closed) {
      targetNo = n;
      targetTopicId = buscarTopicIdUnidad_(courseId, 'Unidad ' + n);
      break;
    }
  }
  if (!targetNo || !targetTopicId) {
    throw new Error('No existe una siguiente unidad verificable y no cerrada después de ' + unidadActual + '.');
  }

  const targetName = 'Unidad ' + targetNo;
  const candidates = [];

  const tareas = ss.getSheetByName('Tareas');
  if (tareas && tareas.getLastRow() > 1) {
    const data = tareas.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID curso']] || '').trim() !== String(courseId)) continue;
      if (String(r[h['Estado solicitud']] || '').trim().toUpperCase() !== 'CREADA') continue;
      const id = String(r[h['ID Classroom']] || '').trim();
      if (!id) continue;
      const title = String(r[h['Título']] || '').trim();
      const type = String(r[h['Tipo de actividad']] || '').trim().toUpperCase();
      const esExamen = type === 'EXAMEN' || /^EXAMEN\b/i.test(title);
      const esProyecto = type === 'PROYECTO' || /^PROYECTO\b/i.test(title);
      const esElegible = type === 'TAREA' || type === 'PRACTICA' || type === 'PRÁCTICA' || type === 'ACTIVIDAD' || type === 'ACTIVIDAD EN CLASE' ||
        /^TAREA\s*\d+/i.test(title) || /^PR[ÁA]CTICA\s*\d+/i.test(title) || /^ACTIVIDAD\s*\d+/i.test(title);
      if (esExamen || esProyecto || !esElegible) continue;
      candidates.push({source: 'Tareas', sheet: tareas, row: i + 1, topicCol: h['Tema'] + 1, id: id, title: title});
    }
  }

  const quizzes = ss.getSheetByName('Quizzes');
  if (quizzes && quizzes.getLastRow() > 1) {
    const data = quizzes.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID del curso']] || '').trim() !== String(courseId)) continue;
      if (String(r[h['Estado']] || '').trim().toUpperCase() !== 'CREADA') continue;
      const id = String(r[h['ID actividad Classroom']] || '').trim();
      if (!id) continue;
      const title = String(r[h['Título']] || '').trim();
      const type = String(r[h['Tipo instrumento']] || '').trim().toUpperCase();
      const esExamen = type === 'EXAMEN' || /^EXAMEN\b/i.test(title);
      const esQuiz = type === 'QUIZ' || /^QUIZ\b/i.test(title);
      if (esExamen || !esQuiz) continue;
      candidates.push({source: 'Quizzes', sheet: quizzes, row: i + 1, topicCol: h['Unidad / tema'] + 1, id: id, title: title});
    }
  }

  const seen = new Set();
  const moved = [];
  candidates.forEach(x => {
    if (seen.has(x.id)) return;
    seen.add(x.id);
    const cw = Classroom.Courses.CourseWork.get(String(courseId), String(x.id));
    if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') return;
    const topic = cw.topicId ? topicById[String(cw.topicId)] : null;
    const currentUnitNo = topic ? extraerNumeroUnidad_(topic.name) : null;
    if (currentUnitNo) return; // Ya está asignado a una unidad; no se mueve.
    if (!cw.associatedWithDeveloper) {
      throw new Error('No se puede mover el trabajo no asociado al proyecto: ' + x.title + ' (' + x.id + ').');
    }
    Classroom.Courses.CourseWork.patch(
      {topicId: String(targetTopicId)}, String(courseId), String(x.id), {updateMask: 'topicId'}
    );
    x.sheet.getRange(x.row, x.topicCol).setValue(targetName);
    moved.push({id: x.id, titulo: x.title, fuente: x.source, unidadDestino: targetName});
  });

  return {unidadActual: unidadActual, unidadDestino: targetName, topicIdDestino: String(targetTopicId), movidos: moved.length, detalle: moved};
}

function importarYConsolidarInstrumentosUnidad_(ss, courseId, unidad) {
  const sh = ss.getSheetByName('Quizzes');
  if (!sh) throw new Error('No existe la hoja Quizzes.');
  const data = sh.getDataRange().getValues();
  const h = {};
  data[0].forEach((v, i) => h[String(v)] = i);
  const unidadNorm = String(unidad).trim().toLowerCase();
  const detalle = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[h['ID del curso']] || '').trim() !== String(courseId)) continue;
    if (String(r[h['Unidad / tema']] || '').trim().toLowerCase() !== unidadNorm) continue;
    if (String(r[h['Estado']] || '').trim().toUpperCase() !== 'CREADA') continue;
    const workId = String(r[h['ID actividad Classroom']] || '').trim();
    const formId = String(r[h['ID del Form']] || '').trim();
    const quizId = String(r[h['Quiz ID']] || '').trim();
    if (!workId || !formId || !quizId) continue;

    const cw = Classroom.Courses.CourseWork.get(String(courseId), workId);
    if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') continue;

    const imported = procesarCalificacionesQuiz_(String(courseId), workId, formId, true, quizId);
    const subs = entregasPorAlumnoPromedio_(courseId, workId);
    let ceros = 0;
    let borradoresFinalizados = 0;
    Object.keys(subs).forEach(uid => {
      const sub = subs[uid];
      const hasAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;
      const hasDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
      if (hasAssigned) return;
      const grade = hasDraft ? Number(sub.draftGrade) : 0;
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        {draftGrade: grade, assignedGrade: grade},
        String(courseId), workId, String(sub.id), {updateMask: 'draftGrade,assignedGrade'}
      );
      if (hasDraft) borradoresFinalizados++; else ceros++;
    });

    detalle.push({quizId: quizId, workId: workId, importadas: imported.actualizadas, ceros: ceros, borradoresFinalizados: borradoresFinalizados});
  }

  return {instrumentos: detalle.length, detalle: detalle};
}

function calcularPromediosUnidad_(courseId, unidad, exigirCalificacion) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const candidatos = inventarioUnidadDesdeFuentes_(ss, courseId, unidad);
  const publicados = [];
  const seen = new Set();

  candidatos.forEach(x => {
    if (!x.classroomId || seen.has(x.classroomId)) return;
    const cw = Classroom.Courses.CourseWork.get(String(courseId), String(x.classroomId));
    if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') return;
    if (!cw.maxPoints || Number(cw.maxPoints) <= 0) return;
    seen.add(String(x.classroomId));
    publicados.push({
      classroomId: String(x.classroomId), titulo: String(cw.title || x.titulo || ''), tipo: x.tipo,
      esExamen: Boolean(x.esExamen), maxPoints: Number(cw.maxPoints)
    });
  });

  const examenes = publicados.filter(x => x.esExamen);
  const noExamen = publicados.filter(x => !x.esExamen);
  if (examenes.length !== 1) throw new Error('Se esperaba exactamente 1 examen publicado para ' + unidad + '; encontrados: ' + examenes.length + '.');
  if (!noExamen.length) throw new Error('No hay trabajos no-examen publicados para ' + unidad + '.');

  const grades = {};
  publicados.forEach(w => grades[w.classroomId] = entregasPorAlumnoPromedio_(courseId, w.classroomId));
  const students = listarAlumnosPromedio_(courseId);
  const rows = [];
  const faltantes = [];

  students.forEach(student => {
    const uid = String(student.userId);
    const nombre = student.profile && student.profile.name ? student.profile.name.fullName : uid;
    const email = student.profile && student.profile.emailAddress ? student.profile.emailAddress : '';

    publicados.forEach(w => {
      if (!tieneNota_(grades[w.classroomId][uid])) faltantes.push({alumno: nombre, userId: uid, trabajo: w.titulo, classroomId: w.classroomId});
    });

    const examValues = examenes.map(w => normalizarNota_(grades[w.classroomId][uid], w.maxPoints));
    const nonExamValues = noExamen.map(w => normalizarNota_(grades[w.classroomId][uid], w.maxPoints));
    const exam = promedioSimple_(examValues);
    const noExam = promedioSimple_(nonExamValues);
    const final = redondearPromedio_(exam * 0.70 + noExam * 0.30);
    const missingNonExam = noExamen.reduce((n, w) => n + (tieneNota_(grades[w.classroomId][uid]) ? 0 : 1), 0);
    const missingExam = examenes.reduce((n, w) => n + (tieneNota_(grades[w.classroomId][uid]) ? 0 : 1), 0);

    rows.push([new Date(), String(courseId), unidad, uid, nombre, email,
      redondearPromedio_(exam), redondearPromedio_(exam * 0.70), redondearPromedio_(noExam),
      redondearPromedio_(noExam * 0.30), final, noExamen.length, missingNonExam, missingExam]);
  });

  if (exigirCalificacion && faltantes.length) {
    throw new Error('El cierre se bloqueó: existen ' + faltantes.length + ' calificaciones faltantes después de la consolidación. ' + JSON.stringify(faltantes).slice(0, 3000));
  }

  escribirReportePromedios_(ss, courseId, unidad, rows);
  return {courseId: String(courseId), unidad: unidad, alumnos: rows.length, examenes: examenes, noExamen: noExamen, reporte: UNIT_AVG_REQUEST.REPORT_SHEET, faltantes: faltantes.length};
}

function inventarioUnidadDesdeFuentes_(ss, courseId, unidad) {
  const out = [];
  const normaliza = s => String(s || '').trim().toLowerCase();
  const unidadNorm = normaliza(unidad);

  const tareas = ss.getSheetByName('Tareas');
  if (tareas) {
    const data = tareas.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID curso']] || '').trim() !== String(courseId)) continue;
      const tema = normaliza(r[h['Tema']]);
      if (!(tema === unidadNorm || tema.indexOf(unidadNorm + ' -') === 0)) continue;
      if (String(r[h['Estado solicitud']] || '').trim().toUpperCase() !== 'CREADA') continue;
      const id = String(r[h['ID Classroom']] || '').trim();
      if (!id) continue;
      const title = String(r[h['Título']] || '').trim();
      const type = String(r[h['Tipo de actividad']] || '').trim().toUpperCase();
      const esExamen = type === 'EXAMEN' || /^EXAMEN\b/i.test(title);
      const esProyecto = type === 'PROYECTO' || /^PROYECTO\b/i.test(title);
      if (esProyecto) continue;
      out.push({classroomId: id, titulo: title, tipo: type || 'COURSEWORK', esExamen: esExamen});
    }
  }

  const quizzes = ss.getSheetByName('Quizzes');
  if (quizzes) {
    const data = quizzes.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID del curso']] || '').trim() !== String(courseId)) continue;
      if (normaliza(r[h['Unidad / tema']]) !== unidadNorm) continue;
      if (String(r[h['Estado']] || '').trim().toUpperCase() !== 'CREADA') continue;
      const id = String(r[h['ID actividad Classroom']] || '').trim();
      if (!id) continue;
      const title = String(r[h['Título']] || '').trim();
      const type = String(r[h['Tipo instrumento']] || '').trim().toUpperCase();
      const esExamen = type === 'EXAMEN' || /^EXAMEN\b/i.test(title);
      out.push({classroomId: id, titulo: title, tipo: type || 'QUIZ', esExamen: esExamen});
    }
  }
  return out;
}

function listarAlumnosPromedio_(courseId) {
  const out = [];
  let token = null;
  do {
    const page = Classroom.Courses.Students.list(String(courseId), {pageToken: token, pageSize: 100});
    (page.students || []).forEach(s => out.push(s));
    token = page.nextPageToken;
  } while (token);
  return out;
}

function entregasPorAlumnoPromedio_(courseId, workId) {
  const out = {};
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(String(courseId), String(workId), {pageToken: token, pageSize: 100});
    (page.studentSubmissions || []).forEach(s => out[String(s.userId)] = s);
    token = page.nextPageToken;
  } while (token);
  return out;
}

function tieneNota_(submission) {
  if (!submission) return false;
  return (submission.assignedGrade !== undefined && submission.assignedGrade !== null) ||
         (submission.draftGrade !== undefined && submission.draftGrade !== null);
}

function normalizarNota_(submission, maxPoints) {
  if (!tieneNota_(submission)) return 0;
  const grade = submission.assignedGrade !== undefined && submission.assignedGrade !== null ? Number(submission.assignedGrade) : Number(submission.draftGrade);
  return Math.max(0, Math.min(100, (grade / Number(maxPoints)) * 100));
}

function promedioSimple_(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + Number(b || 0), 0) / values.length;
}

function redondearPromedio_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function escribirReportePromedios_(ss, courseId, unidad, rows) {
  let sh = ss.getSheetByName(UNIT_AVG_REQUEST.REPORT_SHEET);
  if (!sh) sh = ss.insertSheet(UNIT_AVG_REQUEST.REPORT_SHEET);
  const headers = ['Fecha cálculo','ID curso','Unidad','User ID','Alumno','Correo','Examen (0-100)','Aporte examen 70%','Promedio no examen (0-100)','Aporte no examen 30%','Promedio final','Trabajos no examen incluidos','No examen sin calificación','Examen sin calificación'];
  const data = sh.getDataRange().getValues();
  const keep = [];
  if (data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1] || '') === String(courseId) && String(data[i][2] || '') === String(unidad)) continue;
      if (data[i].some(v => v !== '')) keep.push(data[i].slice(0, headers.length));
    }
  }
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  const all = keep.concat(rows);
  if (all.length) sh.getRange(2, 1, all.length, headers.length).setValues(all);
  sh.setFrozenRows(1);
}
