function instalarMonitorCalificacionesQuizzes() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'monitorearCalificacionesQuizzesCadaMinuto')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monitorearCalificacionesQuizzesCadaMinuto')
    .timeBased()
    .everyMinutes(1)
    .create();
  return auditarMonitorCalificacionesQuizzes();
}

function auditarMonitorCalificacionesQuizzes() {
  return ejecutarMonitorCalificacionesQuizzes_(false);
}

/**
 * Punto de entrada canónico para una importación solicitada por el docente.
 *
 * Uso: seleccionar importarCalificacionesAhora en Apps Script y pulsar Ejecutar.
 * Procesa todos los quizzes en estado CREADA, empata exclusivamente por correo
 * exacto, escribe solo draftGrade y no devuelve ni publica entregas.
 */
function importarCalificacionesAhora() {
  return ejecutarMonitorCalificacionesQuizzes_(true);
}

function monitorearCalificacionesQuizzesCadaMinuto() {
  return ejecutarMonitorCalificacionesQuizzes_(true);
}

function ejecutarMonitorCalificacionesQuizzes_(aplicar) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);

  const data = sh.getDataRange().getValues();
  const h = {};
  data[0].forEach((v, i) => h[String(v)] = i);
  const out = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const estado = String(r[h['Estado']] || '').trim().toUpperCase();
    const courseId = String(r[h['ID del curso']] || '').trim();
    const workId = String(r[h['ID actividad Classroom']] || '').trim();
    const formId = String(r[h['ID del Form']] || '').trim();
    const quizId = String(r[h['Quiz ID']] || '').trim();

    if (estado !== 'CREADA' || !courseId || !workId || !formId) continue;

    const result = procesarCalificacionesQuiz_(courseId, workId, formId, aplicar, quizId);
    result.quizId = quizId;
    out.push(result);

    if (aplicar) {
      sh.getRange(i + 1, h['Última actualización'] + 1).setValue(new Date());
      sh.getRange(i + 1, h['Resultado / error'] + 1).setValue(
        'Monitor: ' + result.actualizadas + ' actualizadas; ' +
        result.yaCalificadas + ' ya calificadas; ' +
        result.sinCorrespondencia.length + ' sin correspondencia; ' +
        result.noTurnedIn + ' no TURNED_IN.' +
        (result.ajuste ? ' Ajuste aplicado: +' + result.ajuste + ' puntos.' : '')
      );
    }
  }

  console.log(JSON.stringify({aplicar: aplicar, quizzes: out}, null, 2));
  return {aplicar: aplicar, quizzes: out};
}

function procesarCalificacionesQuiz_(courseId, workId, formId, aplicar, quizId) {
  const cw = Classroom.Courses.CourseWork.get(courseId, workId);
  const ajuste = obtenerAjusteCalificacionQuiz_(quizId);
  const maxPoints = Number(cw.maxPoints || 100);
  const respuestas = {};

  FormApp.openById(formId).getResponses().forEach(r => {
    const email = String(r.getRespondentEmail() || '').trim().toLowerCase();
    if (!email) return;

    const scoreForms = r.getGradableItemResponses().reduce((s, x) => {
      const value = x.getScore();
      return s + ((value === null || value === undefined) ? 0 : Number(value));
    }, 0);

    const scoreFinal = Math.min(maxPoints, scoreForms + ajuste);

    if (!respuestas[email] || r.getTimestamp() > respuestas[email].fecha) {
      respuestas[email] = {
        scoreForms: scoreForms,
        score: scoreFinal,
        fecha: r.getTimestamp()
      };
    }
  });

  const alumnos = [];
  let token;
  do {
    const p = Classroom.Courses.Students.list(courseId, {pageToken: token});
    (p.students || []).forEach(x => alumnos.push(x));
    token = p.nextPageToken;
  } while (token);

  const byEmail = {};
  alumnos.forEach(x => {
    const e = String((x.profile && x.profile.emailAddress) || '').trim().toLowerCase();
    if (e) byEmail[e] = x;
  });

  if (alumnos.length && Object.keys(byEmail).length !== alumnos.length) {
    throw new Error(
      'Classroom no devolvió el correo de todos los alumnos. ' +
      'No se importará ninguna calificación sin correspondencia exacta por correo.'
    );
  }

  const map = {};
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const ms = ss.getSheetByName('Correspondencia de correos');
  if (ms && ms.getLastRow() > 1) {
    ms.getRange(2, 1, ms.getLastRow() - 1, 7).getDisplayValues().forEach(r => {
      if (String(r[0]).trim() !== courseId || String(r[5]).trim().toUpperCase() !== 'ACTIVA') return;
      const c = String(r[3] || '').trim().toLowerCase();
      const f = String(r[4] || '').trim().toLowerCase();
      if (c) map[c] = c;
      if (f && c) map[f] = c;
    });
  }

  const subs = [];
  token = null;
  do {
    const p = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, workId, {pageToken: token});
    (p.studentSubmissions || []).forEach(x => subs.push(x));
    token = p.nextPageToken;
  } while (token);

  const byUser = {};
  subs.forEach(x => byUser[String(x.userId)] = x);

  const pendientes = [];
  const sinCorrespondencia = [];
  let actualizadas = 0;
  let yaCalificadas = 0;
  let noTurnedIn = 0;

  Object.keys(respuestas).sort().forEach(fe => {
    const ce = byEmail[fe] ? fe : (map[fe] || '');
    const alumno = byEmail[ce];

    if (!alumno) {
      sinCorrespondencia.push({correoForms: fe, motivo: 'Alumno no encontrado'});
      return;
    }

    const sub = byUser[String(alumno.userId)];
    if (!sub) {
      sinCorrespondencia.push({
        correoForms: fe,
        correoClassroom: ce,
        motivo: 'Entrega no encontrada'
      });
      return;
    }

    if (String(sub.state || '').toUpperCase() !== 'TURNED_IN') {
      noTurnedIn++;
      return;
    }

    const tieneDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
    const tieneAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;
    if (tieneDraft || tieneAssigned) {
      yaCalificadas++;
      return;
    }

    const item = {
      alumno: alumno.profile.name.fullName,
      correoForms: fe,
      correoClassroom: ce,
      puntosForms: respuestas[fe].scoreForms,
      ajuste: ajuste,
      puntos: respuestas[fe].score,
      submissionId: sub.id,
      actividadAsociadaAlProyecto: Boolean(cw.associatedWithDeveloper)
    };
    pendientes.push(item);

    if (aplicar) {
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        {draftGrade: item.puntos},
        courseId,
        workId,
        sub.id,
        {updateMask: 'draftGrade'}
      );
      actualizadas++;
    }
  });

  return {
    administrable: true,
    associatedWithDeveloper: Boolean(cw.associatedWithDeveloper),
    respuestasForms: Object.keys(respuestas).length,
    alumnosClassroom: alumnos.length,
    entregasClassroom: subs.length,
    actualizadas: actualizadas,
    yaCalificadas: yaCalificadas,
    noTurnedIn: noTurnedIn,
    ajuste: ajuste,
    pendientes: pendientes,
    sinCorrespondencia: sinCorrespondencia
  };
}

function obtenerAjusteCalificacionQuiz_(quizId) {
  // Excepción académica autorizada por el docente el 02/09/2026:
  // las 4 preguntas de respuesta inequívoca se ignoran para evaluación manual
  // y se otorgan 16 puntos en bloque sobre la nota registrada por Forms.
  if (String(quizId || '').trim() === 'EXAM-20260831-ELI-U1-001') return 16;
  return 0;
}

// Monitor de calificaciones cada minuto
