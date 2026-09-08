const NIGHTLY_REVIEW = Object.freeze({
  COURSES_SHEET: 'Cursos',
  FLAG_HEADER: 'Revisión nocturna',
  LOG_SHEET: 'Revisión nocturna',
  TZ: 'America/Mexico_City',
  ERROR_EMAIL: 'witchet43@gmail.com',
  STATE_PROP: 'NIGHTLY_REVIEW_STATE_V1',
  LAST_DONE_PROP: 'NIGHTLY_REVIEW_LAST_DONE_V1'
});

/**
 * Se invoca desde el monitor de producción cada minuto.
 * Solo trabaja durante la hora 00 local y procesa un curso por invocación,
 * de modo que una materia con error no bloquee las demás ni se exceda
 * innecesariamente el tiempo máximo de ejecución.
 */
function procesarRevisionNocturnaSiCorresponde_() {
  const now = new Date();
  const hour = Utilities.formatDate(now, NIGHTLY_REVIEW.TZ, 'HH');
  if (hour !== '00') return {procesado: false, motivo: 'FUERA_DE_VENTANA'};

  const today = Utilities.formatDate(now, NIGHTLY_REVIEW.TZ, 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(NIGHTLY_REVIEW.LAST_DONE_PROP) === today) {
    return {procesado: false, motivo: 'YA_COMPLETADO'};
  }

  let state = null;
  const raw = props.getProperty(NIGHTLY_REVIEW.STATE_PROP);
  if (raw) {
    try { state = JSON.parse(raw); } catch (_) { state = null; }
  }

  if (!state || state.date !== today) {
    state = {
      date: today,
      startedAt: now.toISOString(),
      index: 0,
      courses: cursosConRevisionNocturna_(),
      summaries: [],
      errors: []
    };
    props.setProperty(NIGHTLY_REVIEW.STATE_PROP, JSON.stringify(state));
  }

  if (state.index >= state.courses.length) {
    finalizarRevisionNocturna_(state);
    props.setProperty(NIGHTLY_REVIEW.LAST_DONE_PROP, today);
    props.deleteProperty(NIGHTLY_REVIEW.STATE_PROP);
    return {procesado: true, completado: true, cursos: state.courses.length};
  }

  const course = state.courses[state.index];
  try {
    const result = revisarCursoNocturno_(course.id, course.nombre, now);
    state.summaries.push(result);
    (result.errores || []).forEach(e => state.errors.push(e));
    registrarResumenNocturno_(result);
  } catch (err) {
    const e = {
      curso: course.nombre,
      courseId: course.id,
      operacion: 'REVISIÓN NOCTURNA DEL CURSO',
      error: String(err && err.message ? err.message : err)
    };
    state.errors.push(e);
    registrarResumenNocturno_({
      fecha: new Date(), curso: course.nombre, courseId: course.id,
      trabajosRevisados: 0, temasReubicados: 0, completas: 0, ceros: 0,
      borradoresFinalizados: 0, devueltas: 0, pendientesSinVencer: 0,
      errores: [e]
    });
  }

  state.index++;
  props.setProperty(NIGHTLY_REVIEW.STATE_PROP, JSON.stringify(state));

  if (state.index >= state.courses.length) {
    finalizarRevisionNocturna_(state);
    props.setProperty(NIGHTLY_REVIEW.LAST_DONE_PROP, today);
    props.deleteProperty(NIGHTLY_REVIEW.STATE_PROP);
    return {procesado: true, completado: true, cursos: state.courses.length};
  }

  return {procesado: true, completado: false, indice: state.index, total: state.courses.length};
}

function cursosConRevisionNocturna_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(NIGHTLY_REVIEW.COURSES_SHEET);
  if (!sh) throw new Error('No existe la hoja Cursos.');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const h = {};
  data[0].forEach((v, i) => h[String(v).trim()] = i);
  ['ID curso', 'Nombre', 'Estado', NIGHTLY_REVIEW.FLAG_HEADER].forEach(k => {
    if (h[k] === undefined) throw new Error('Falta encabezado en Cursos: ' + k);
  });

  return data.slice(1)
    .filter(r => String(r[h.Estado] || '').trim().toUpperCase() === 'ACTIVE')
    .filter(r => valorVerdadero_(r[h[NIGHTLY_REVIEW.FLAG_HEADER]]))
    .map(r => ({id: String(r[h['ID curso']] || '').trim(), nombre: String(r[h.Nombre] || '').trim()}))
    .filter(x => x.id);
}

function valorVerdadero_(v) {
  if (v === true) return true;
  return ['TRUE', 'VERDADERO', 'SI', 'SÍ', '1', 'YES'].includes(String(v || '').trim().toUpperCase());
}

function revisarCursoNocturno_(courseId, courseName, now) {
  const course = Classroom.Courses.get(String(courseId));
  if (String(course.courseState || '').toUpperCase() !== 'ACTIVE') {
    throw new Error('El curso no está ACTIVE en Classroom. Estado: ' + course.courseState);
  }

  const topics = listarTopics_(courseId);
  const topicById = {};
  const unitTopicByNumber = {};
  topics.forEach(t => {
    topicById[String(t.topicId)] = String(t.name || '');
    const m = String(t.name || '').trim().match(/^UNIDAD\s+(\d+)$/i);
    if (m) unitTopicByNumber[Number(m[1])] = String(t.topicId);
  });

  const all = listarCourseWork_(courseId, ['PUBLISHED', 'DRAFT']);
  const exams = all
    .map(cw => {
      const m = String(cw.title || '').trim().match(/^EXAMEN\s+UNIDAD\s+(\d+)\b/i);
      return m && cw.creationTime ? {unit: Number(m[1]), time: new Date(cw.creationTime).getTime(), id: String(cw.id)} : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  const candidates = all.filter(cw => {
    const title = String(cw.title || '').trim();
    if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') return false;
    if (String(cw.workType || '').toUpperCase() !== 'ASSIGNMENT') return false;
    if (/^(QUIZ|EXAMEN|PROYECTO)\b/i.test(title)) return false;
    if (/^CALIFICACI[ÓO]N\s+UNIDAD\b/i.test(title)) return false;
    return /^(TAREA|PR[ÁA]CTICA|ACTIVIDAD)\b/i.test(title);
  });

  let temasReubicados = 0;
  let completas = 0;
  let ceros = 0;
  let borradoresFinalizados = 0;
  let devueltas = 0;
  let pendientesSinVencer = 0;
  const errores = [];

  candidates.forEach(cw => {
    const title = String(cw.title || '').trim();
    const workId = String(cw.id);

    try {
      const topicName = topicById[String(cw.topicId || '')] || '';
      if (esTemaCategoria_(topicName)) {
        const targetUnit = unidadPorCortes_(cw.creationTime, exams);
        const targetTopicId = unitTopicByNumber[targetUnit];
        if (!targetTopicId) {
          errores.push({
            curso: courseName, courseId: String(courseId), trabajo: title, classroomId: workId,
            operacion: 'REUBICAR TEMA',
            error: 'No existe el tema verificable Unidad ' + targetUnit + '; no se movió el trabajo.'
          });
        } else if (String(cw.topicId || '') !== String(targetTopicId)) {
          Classroom.Courses.CourseWork.patch(
            {topicId: String(targetTopicId)}, String(courseId), workId, {updateMask: 'topicId'}
          );
          cw.topicId = String(targetTopicId);
          temasReubicados++;
        }
      }
    } catch (err) {
      errores.push({
        curso: courseName, courseId: String(courseId), trabajo: title, classroomId: workId,
        operacion: 'REUBICAR TEMA', error: String(err && err.message ? err.message : err)
      });
    }

    try {
      const subs = listarSubmissions_(courseId, workId);
      const maxPoints = Number(cw.maxPoints || 100);
      const fullScore = maxPoints > 0 ? maxPoints : 100;

      subs.forEach(sub => {
        const state = String(sub.state || '').toUpperCase();
        const tieneDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
        const tieneAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;

        if (tieneAssigned) {
          if (state === 'TURNED_IN') {
            Classroom.Courses.CourseWork.StudentSubmissions.return({}, String(courseId), workId, String(sub.id));
            devueltas++;
          }
          return;
        }

        if (tieneDraft) {
          const score = Number(sub.draftGrade);
          Classroom.Courses.CourseWork.StudentSubmissions.patch(
            {draftGrade: score, assignedGrade: score},
            String(courseId), workId, String(sub.id), {updateMask: 'draftGrade,assignedGrade'}
          );
          borradoresFinalizados++;
          if (state === 'TURNED_IN') {
            Classroom.Courses.CourseWork.StudentSubmissions.return({}, String(courseId), workId, String(sub.id));
            devueltas++;
          }
          return;
        }

        const entregada = state === 'TURNED_IN' || state === 'RETURNED';
        if (entregada) {
          Classroom.Courses.CourseWork.StudentSubmissions.patch(
            {draftGrade: fullScore, assignedGrade: fullScore},
            String(courseId), workId, String(sub.id), {updateMask: 'draftGrade,assignedGrade'}
          );
          completas++;
          if (state === 'TURNED_IN') {
            Classroom.Courses.CourseWork.StudentSubmissions.return({}, String(courseId), workId, String(sub.id));
            devueltas++;
          }
          return;
        }

        if (trabajoVencido_(cw, now)) {
          Classroom.Courses.CourseWork.StudentSubmissions.patch(
            {draftGrade: 0, assignedGrade: 0},
            String(courseId), workId, String(sub.id), {updateMask: 'draftGrade,assignedGrade'}
          );
          ceros++;
        } else {
          pendientesSinVencer++;
        }
      });
    } catch (err) {
      errores.push({
        curso: courseName, courseId: String(courseId), trabajo: title, classroomId: workId,
        operacion: 'CALIFICAR/DEVOLVER', error: String(err && err.message ? err.message : err)
      });
    }
  });

  return {
    fecha: new Date(), curso: courseName, courseId: String(courseId),
    trabajosRevisados: candidates.length, temasReubicados: temasReubicados,
    completas: completas, ceros: ceros, borradoresFinalizados: borradoresFinalizados,
    devueltas: devueltas, pendientesSinVencer: pendientesSinVencer, errores: errores
  };
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

function listarCourseWork_(courseId, states) {
  const out = [];
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.list(String(courseId), {
      pageToken: token, pageSize: 100, courseWorkStates: states
    });
    (page.courseWork || []).forEach(cw => out.push(cw));
    token = page.nextPageToken;
  } while (token);
  return out;
}

function listarSubmissions_(courseId, workId) {
  const out = [];
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
      String(courseId), String(workId), {pageToken: token, pageSize: 100}
    );
    (page.studentSubmissions || []).forEach(s => out.push(s));
    token = page.nextPageToken;
  } while (token);
  return out;
}

function esTemaCategoria_(name) {
  const n = String(name || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return ['PRACTICAS', 'TAREAS', 'ACTIVIDADES EN CLASE', 'ACTIVIDADES'].includes(n);
}

function unidadPorCortes_(creationTime, exams) {
  const t = creationTime ? new Date(creationTime).getTime() : 0;
  let unit = 1;
  exams.forEach(exam => {
    if (exam.time <= t) unit = Math.max(unit, exam.unit + 1);
  });
  return unit;
}

function trabajoVencido_(cw, now) {
  if (!cw.dueDate) return false;
  const d = cw.dueDate;
  const y = Number(d.year), m = Number(d.month), day = Number(d.day);
  if (!y || !m || !day) return false;

  if (cw.dueTime) {
    const t = cw.dueTime;
    const dueMs = Date.UTC(y, m - 1, day, Number(t.hours || 0), Number(t.minutes || 0), Number(t.seconds || 0));
    return now.getTime() > dueMs;
  }

  const today = Utilities.formatDate(now, NIGHTLY_REVIEW.TZ, 'yyyy-MM-dd');
  const due = [String(y).padStart(4, '0'), String(m).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  return today > due;
}

function registrarResumenNocturno_(result) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  let sh = ss.getSheetByName(NIGHTLY_REVIEW.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(NIGHTLY_REVIEW.LOG_SHEET);
    sh.getRange(1, 1, 1, 11).setValues([[
      'Fecha', 'Curso', 'ID curso', 'Trabajos revisados', 'Temas reubicados',
      'Puntaje completo', 'Ceros por vencimiento', 'Borradores finalizados',
      'Entregas devueltas', 'Pendientes sin vencer', 'Errores'
    ]]);
    sh.setFrozenRows(1);
  }
  sh.appendRow([
    result.fecha || new Date(), result.curso || '', result.courseId || '',
    result.trabajosRevisados || 0, result.temasReubicados || 0,
    result.completas || 0, result.ceros || 0, result.borradoresFinalizados || 0,
    result.devueltas || 0, result.pendientesSinVencer || 0,
    (result.errores || []).length
  ]);
}

function finalizarRevisionNocturna_(state) {
  if (!state.errors || !state.errors.length) return;
  const lines = [];
  lines.push('La revisión nocturna académica encontró ' + state.errors.length + ' incidencia(s).');
  lines.push('Fecha: ' + state.date);
  lines.push('');
  state.errors.forEach((e, i) => {
    lines.push((i + 1) + '. Curso: ' + (e.curso || e.courseId || 'N/D'));
    if (e.trabajo) lines.push('   Trabajo: ' + e.trabajo + (e.classroomId ? ' [' + e.classroomId + ']' : ''));
    lines.push('   Operación: ' + (e.operacion || 'N/D'));
    lines.push('   Error: ' + (e.error || 'N/D'));
  });
  MailApp.sendEmail({
    to: NIGHTLY_REVIEW.ERROR_EMAIL,
    subject: '[Automatización académica] Errores revisión nocturna ' + state.date,
    body: lines.join('\n')
  });
}
