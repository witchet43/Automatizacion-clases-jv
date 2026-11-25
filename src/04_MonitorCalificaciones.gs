function instalarMonitorCalificacionesQuizzes() {
  // La importación de calificaciones es bajo demanda. Eliminamos cualquier
  // trigger histórico que ejecute el monitor cada minuto para evitar consumo
  // innecesario de cuotas y consultas repetitivas.
  const removed = [];
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'monitorearCalificacionesQuizzesCadaMinuto')
    .forEach(t => {
      removed.push(t.getUniqueId());
      ScriptApp.deleteTrigger(t);
    });
  return {
    modo: 'BAJO_DEMANDA',
    triggersEliminados: removed.length,
    instruccion: 'Usar importarCalificacionesAhora() únicamente cuando el docente solicite Importar calificaciones.'
  };
}

function auditarMonitorCalificacionesQuizzes() {
  return ejecutarMonitorCalificacionesQuizzes_(false);
}

/**
 * Punto de entrada canónico para una importación solicitada por el docente.
 * Procesa todos los quizzes en estado CREADA, empata exclusivamente por correo
 * exacto, importa aunque no se haya marcado TURNED_IN en Classroom,
 * escribe solo draftGrade y no devuelve ni publica entregas.
 */
function importarCalificacionesAhora() {
  return ejecutarMonitorCalificacionesQuizzes_(true);
}

/**
 * Compatibilidad con triggers históricos: no hace polling ni consume recursos.
 * instalarMonitorCalificacionesQuizzes() elimina estos triggers.
 */
function monitorearCalificacionesQuizzesCadaMinuto() {
  return {
    deshabilitado: true,
    motivo: 'La importación de calificaciones ahora es bajo demanda.'
  };
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
        'Importación manual: ' + result.actualizadas + ' actualizadas; ' +
        result.yaCalificadas + ' ya calificadas; ' +
        result.sinCorrespondencia.length + ' sin correspondencia; ' +
        result.noTurnedIn + ' sin marcar entregado (no bloquean importación); ' +
        result.sinPuntajeForms.length + ' respuesta(s) sin puntaje completo en Forms.' +
        (result.ajuste ? ' Ajuste aplicado: +' + result.ajuste + ' puntos.' : '')
      );
    }
  }

  console.log(JSON.stringify({aplicar: aplicar, quizzes: out}, null, 2));
  return {aplicar: aplicar, quizzes: out};
}

function procesarCalificacionesQuiz_(courseId, workId, formId, aplicar, quizId) {
  const cw = Classroom.Courses.CourseWork.get(courseId, workId);
  // Una respuesta de Forms con puntaje verificable no depende de que el alumno
  // haya pulsado "Entregar" en Classroom. Esta política es transversal para
  // los instrumentos importados desde Google Forms (quizzes y exámenes).
  const importPolicy = ACADEMIC_POLICY.FORMS_GRADE_IMPORT;
  if (importPolicy.REQUIRE_CLASSROOM_TURNED_IN !== false ||
      importPolicy.REQUIRE_COMPLETE_FORMS_SCORE !== true ||
      importPolicy.REQUIRE_EXACT_EMAIL_IDENTITY !== true ||
      importPolicy.WRITE_ONLY_DRAFT_GRADE !== true ||
      importPolicy.PRESERVE_EXISTING_GRADE !== true ||
      importPolicy.NEVER_RETURN_SUBMISSION !== true) {
    throw new Error('La política canónica de importación Forms→Classroom es inválida.');
  }
  const ajuste = obtenerAjusteCalificacionQuiz_(quizId);
  const maxPoints = Number(cw.maxPoints || 100);
  const respuestas = {};

  FormApp.openById(formId).getResponses().forEach(r => {
    const email = String(r.getRespondentEmail() || '').trim().toLowerCase();
    if (!email) return;

    const lectura = puntajeSeguroRespuestaForms_(r);
    const scoreFinal = lectura.completo
      ? Math.min(maxPoints, lectura.scoreForms + ajuste)
      : null;

    if (!respuestas[email] || r.getTimestamp() > respuestas[email].fecha) {
      respuestas[email] = {
        scoreForms: lectura.completo ? lectura.scoreForms : null,
        score: scoreFinal,
        fecha: r.getTimestamp(),
        completo: lectura.completo,
        reactivosConPuntaje: lectura.reactivosConPuntaje,
        reactivosSinPuntaje: lectura.reactivosSinPuntaje,
        reactivosGradables: lectura.reactivosGradables
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
  const sinPuntajeForms = [];
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

    const respuesta = respuestas[fe];
    if (!respuesta.completo) {
      sinPuntajeForms.push({
        alumno: alumno.profile && alumno.profile.name ? alumno.profile.name.fullName : ce,
        correoForms: fe,
        reactivosGradables: respuesta.reactivosGradables,
        reactivosConPuntaje: respuesta.reactivosConPuntaje,
        reactivosSinPuntaje: respuesta.reactivosSinPuntaje,
        motivo: 'Forms no devolvió puntaje para todos los reactivos gradables; no se convierte a 0.'
      });
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

    // La falta de TURNED_IN se registra para auditoría; nunca impide importar.
    if (String(sub.state || '').toUpperCase() !== 'TURNED_IN') noTurnedIn++;

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
      puntosForms: respuesta.scoreForms,
      ajuste: ajuste,
      puntos: respuesta.score,
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
    noTurnedInNoBloqueaImportacion: true,
    ajuste: ajuste,
    pendientes: pendientes,
    sinCorrespondencia: sinCorrespondencia,
    sinPuntajeForms: sinPuntajeForms
  };
}

function obtenerAjusteCalificacionQuiz_(quizId) {
  if (String(quizId || '').trim() === 'EXAM-20260831-ELI-U1-001') return 16;
  return 0;
}


/** Exact activity import. Never use title matching or a global monitor. */
function importarCalificacionesFormsActividad_(courseId, workId) {
  const cw = Classroom.Courses.CourseWork.get(courseId, workId);
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  const rows = sh ? sh.getDataRange().getDisplayValues() : [];
  const h = rows[0] || [];
  const registry = rows.slice(1).filter(r =>
    String(r[h.indexOf('ID del curso')]).trim() === courseId &&
    String(r[h.indexOf('ID actividad Classroom')]).trim() === workId &&
    String(r[h.indexOf('ID del Form')] || '').trim());
  const registeredIds = [...new Set(registry.map(r => String(r[h.indexOf('ID del Form')]).trim()))];
  if (registeredIds.length > 1) throw new Error('FORMS_LINK_AMBIGUOUS');
  const links = (cw.materials || []).map(m => m.form && m.form.formUrl || m.link && m.link.url || '')
    .filter(u => /^https:\/\/docs\.google\.com\/forms\/|^https:\/\/forms\.gle\//i.test(u));
  const forms = [];
  links.forEach(url => {
    let form;
    try { form = FormApp.openByUrl(url); } catch (err) {
      if (!registeredIds.length) throw new Error('FORMS_LINK_NOT_RESOLVABLE');
      const candidate = FormApp.openById(registeredIds[0]);
      const clean = u => String(u).split('?')[0].replace(/\/$/, '');
      if (![candidate.getPublishedUrl(), candidate.getEditUrl()].some(u => clean(u) === clean(url)))
        throw new Error('FORMS_REGISTRY_LINK_MISMATCH');
      form = candidate;
    }
    forms.push(form);
  });
  if (registeredIds.length) forms.push(FormApp.openById(registeredIds[0]));
  const ids = [...new Set(forms.map(f => f.getId()))];
  if (ids.length !== 1) throw new Error(ids.length ? 'FORMS_LINK_AMBIGUOUS' : 'FORMS_LINK_MISSING');
  const form = forms[0];
  if (!form.isQuiz()) throw new Error('FORMS_NOT_QUIZ');
  const max = Number(cw.maxPoints);
  if (!Number.isFinite(max) || max <= 0) throw new Error('CLASSROOM_MAX_POINTS_INVALID');
  const expected = {};
  const casts = {CHECKBOX:'asCheckboxItem',MULTIPLE_CHOICE:'asMultipleChoiceItem',LIST:'asListItem',
    TEXT:'asTextItem',PARAGRAPH_TEXT:'asParagraphTextItem',SCALE:'asScaleItem',
    DATE:'asDateItem',DATETIME:'asDateTimeItem',TIME:'asTimeItem',DURATION:'asDurationItem',
    GRID:'asGridItem',CHECKBOX_GRID:'asCheckboxGridItem',FILE_UPLOAD:'asFileUploadItem',
    RATING:'asRatingItem'};
  form.getItems().forEach(item => {
    const cast = casts[String(item.getType())];
    if (!cast) {
      if (!['IMAGE','VIDEO','SECTION_HEADER','PAGE_BREAK'].includes(String(item.getType())))
        throw new Error('FORMS_ITEM_TYPE_UNSUPPORTED');
      return;
    }
    const typed = typeof item[cast] === 'function' && item[cast]();
    if (!typed || typeof typed.getPoints !== 'function') throw new Error('FORMS_POINTS_UNAVAILABLE');
    const points = typed.getPoints();
    if (!Number.isFinite(points) || points < 0) throw new Error('FORMS_POINTS_INVALID');
    if (points > 0) expected[String(item.getId())] = points;
  });
  const total = Object.values(expected).reduce((a,b)=>a+b,0);
  if (!total) throw new Error('FORMS_MAX_POINTS_INVALID');
  const students = [];
  const subs = [];
  let token;
  do {
    const p = Classroom.Courses.Students.list(courseId, token ? {pageToken:token} : {});
    students.push(...(p.students || [])); token = p.nextPageToken;
  } while (token);
  token = null;
  do {
    const p = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId,workId,token ? {pageToken:token} : {});
    subs.push(...(p.studentSubmissions || [])); token = p.nextPageToken;
  } while (token);
  const email = s => String(s || '').trim().toLowerCase();
  const byEmail = new Map(), byUser = new Map();
  students.forEach(s => {
    const e = email(s.profile && s.profile.emailAddress);
    if (!e || byEmail.has(e)) throw new Error('CLASSROOM_IDENTITY_AMBIGUOUS');
    byEmail.set(e,s);
  });
  subs.forEach(s => {
    if (byUser.has(String(s.userId))) throw new Error('CLASSROOM_SUBMISSION_AMBIGUOUS');
    byUser.set(String(s.userId),s);
  });
  const responses = form.getResponses();
  const latest = new Map(), ambiguous = new Set();
  let missingIdentity = 0;
  responses.forEach(r => {
    const e = email(r.getRespondentEmail());
    if (!e) { missingIdentity++; return; }
    const prev = latest.get(e);
    if (!prev || r.getTimestamp() > prev.getTimestamp()) { latest.set(e,r); ambiguous.delete(e); }
    else if (+r.getTimestamp() === +prev.getTimestamp()) ambiguous.add(e);
  });
  const detail = [];
  let imported = 0, unchanged = 0, errors = 0, skipped = 0, withoutTurnedIn = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    latest.forEach((r,e) => {
      const student = byEmail.get(e);
      const sub = student && byUser.get(String(student.userId));
      const record = {userId:student ? String(student.userId) : null};
      const omit = reason => { skipped++; detail.push({...record,status:reason}); };
      if (!student || !sub) return omit('IDENTITY_OR_SUBMISSION_NOT_FOUND');
      if (ambiguous.has(e)) return omit('AMBIGUOUS_RESPONSE');
      const scores = {};
      r.getGradableItemResponses().forEach(ir => {
        const id = String(ir.getItem().getId());
        if (Object.prototype.hasOwnProperty.call(expected,id)) {
          const value = ir.getScore();
          scores[id] = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= expected[id] ? value : null;
        }
      });
      if (Object.keys(expected).some(id => typeof scores[id] !== 'number')) return omit('INCOMPLETE_FORMS_SCORE');
      const score = Object.values(scores).reduce((a,b)=>a+b,0);
      const grade = Math.round(score / total * max * 100)/100;
      try {
        const api = Classroom.Courses.CourseWork.StudentSubmissions;
        const before = api.get(courseId,workId,sub.id);
        if (before.state !== 'TURNED_IN') withoutTurnedIn++;
        const hasDraft = before.draftGrade !== null && before.draftGrade !== undefined;
        const hasAssigned = before.assignedGrade !== null && before.assignedGrade !== undefined;
        // Explicit teacher-authorized recovery, scoped to the exact linked form and replacement coursework.
        const recovery = courseId === '871158187513' && workId === '883667917533' &&
          ids[0] === '1gk6YnsPlhPC_WeDvYFntvv7jF7jDFjQqc1JkQdUhI2E';
        const matches = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value-grade)<0.001;
        if (hasDraft && matches(before.draftGrade)) {
          unchanged++; detail.push({...record,status:'ALREADY_MATCHES',grade,verified:true});
          return;
        }
        if (hasAssigned || (hasDraft && !recovery)) return omit('EXISTING_GRADE_PRESERVED');
        api.patch({draftGrade:grade},courseId,workId,sub.id,{updateMask:'draftGrade'});
        const after = api.get(courseId,workId,sub.id);
        if (!matches(after.draftGrade) || after.assignedGrade !== before.assignedGrade || after.state !== before.state)
          throw new Error('GRADE_READBACK_MISMATCH');
        imported++; detail.push({...record,status:'IMPORTED',grade,verified:true});
      } catch (err) {
        errors++; detail.push({...record,status:'WRITE_OR_VERIFICATION_ERROR'});
      }
    });
  } finally { lock.releaseLock(); }
  const noResponse = students.filter(s => !latest.has(email(s.profile.emailAddress))).length;
  return {courseId,courseWorkId:workId,formId:ids[0],maxPoints:max,formsMaxPoints:total,
    responses:responses.length,uniqueRespondents:latest.size,missingIdentity,students:students.length,
    submissions:subs.length,imported,unchanged,skipped,errors,noResponse,withoutTurnedIn,
    gradeState:'DRAFT_ONLY',verifiedMatches:imported+unchanged,complete:imported+unchanged===students.length && errors===0 && skipped===0 && missingIdentity===0 && noResponse===0,detail};
}
