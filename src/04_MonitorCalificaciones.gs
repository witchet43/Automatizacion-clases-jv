function instalarMonitorCalificacionesQuizzes() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'monitorearCalificacionesQuizzesCadaMinuto').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monitorearCalificacionesQuizzesCadaMinuto').timeBased().everyMinutes(1).create();
  return auditarMonitorCalificacionesQuizzes();
}
function auditarMonitorCalificacionesQuizzes() { return ejecutarMonitorCalificacionesQuizzes_(false); }
function monitorearCalificacionesQuizzesCadaMinuto() { return ejecutarMonitorCalificacionesQuizzes_(true); }
function ejecutarMonitorCalificacionesQuizzes_(aplicar) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  const data = sh.getDataRange().getValues();
  const h = {}; data[0].forEach((v, i) => h[String(v)] = i);
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i], estado = String(r[h['Estado']] || '').trim().toUpperCase();
    const courseId = String(r[h['ID del curso']] || '').trim();
    const workId = String(r[h['ID actividad Classroom']] || '').trim();
    const formId = String(r[h['ID del Form']] || '').trim();
    if (estado !== 'CREADA' || !courseId || !workId || !formId) continue;
    const result = procesarCalificacionesQuiz_(courseId, workId, formId, aplicar);
    result.quizId = String(r[h['Quiz ID']] || '');
    out.push(result);
    if (aplicar) {
      sh.getRange(i + 1, h['Última actualización'] + 1).setValue(new Date());
      sh.getRange(i + 1, h['Resultado / error'] + 1).setValue('Monitor: ' + result.actualizadas + ' actualizadas; ' + result.yaCalificadas + ' ya calificadas; ' + result.sinCorrespondencia.length + ' sin correspondencia.');
    }
  }
  console.log(JSON.stringify({aplicar: aplicar, quizzes: out}, null, 2));
  return {aplicar: aplicar, quizzes: out};
}
function procesarCalificacionesQuiz_(courseId, workId, formId, aplicar) {
  const cw = Classroom.Courses.CourseWork.get(courseId, workId);
  if (!cw.associatedWithDeveloper) return {administrable:false, actualizadas:0, yaCalificadas:0, pendientes:[], sinCorrespondencia:[], motivo:'No creada por este proyecto API'};
  const respuestas = {};
  FormApp.openById(formId).getResponses().forEach(r => {
    const email = String(r.getRespondentEmail() || '').trim().toLowerCase();
    if (!email) return;
    const score = r.getGradableItemResponses().reduce((s, x) => s + Number(x.getScore() || 0), 0);
    if (!respuestas[email] || r.getTimestamp() > respuestas[email].fecha) respuestas[email] = {score:score, fecha:r.getTimestamp()};
  });
  const alumnos = []; let token;
  do { const p = Classroom.Courses.Students.list(courseId, {pageToken:token}); (p.students || []).forEach(x => alumnos.push(x)); token = p.nextPageToken; } while (token);
  const byEmail = {}; alumnos.forEach(x => { const e = String((x.profile && x.profile.emailAddress) || '').trim().toLowerCase(); if (e) byEmail[e] = x; });
  const map = {}, ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID), ms = ss.getSheetByName('Correspondencia de correos');
  if (ms && ms.getLastRow() > 1) ms.getRange(2,1,ms.getLastRow()-1,7).getDisplayValues().forEach(r => {
    if (String(r[0]).trim() !== courseId || String(r[5]).trim().toUpperCase() !== 'ACTIVA') return;
    const c = String(r[3] || '').trim().toLowerCase(), f = String(r[4] || '').trim().toLowerCase();
    if (c) map[c] = c; if (f && c) map[f] = c;
  });
  const subs = []; token = null;
  try {
    do { const p = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, workId, {pageToken:token}); (p.studentSubmissions || []).forEach(x => subs.push(x)); token = p.nextPageToken; } while (token);
  } catch (e) {
    if (String(e).indexOf('Precondition check failed') >= 0) return {administrable:true, actualizadas:0, yaCalificadas:0, pendientes:[], sinCorrespondencia:[], motivo:'Actividad DRAFT; esperando publicación.'};
    throw e;
  }
  const byUser = {}; subs.forEach(x => byUser[String(x.userId)] = x);
  const pendientes = [], sinCorrespondencia = []; let actualizadas = 0, yaCalificadas = 0;
  Object.keys(respuestas).sort().forEach(fe => {
    const ce = byEmail[fe] ? fe : (map[fe] || ''), alumno = byEmail[ce];
    if (!alumno) { sinCorrespondencia.push({correoForms:fe, motivo:'Alumno no encontrado'}); return; }
    const sub = byUser[String(alumno.userId)];
    if (!sub) { sinCorrespondencia.push({correoForms:fe, correoClassroom:ce, motivo:'Entrega no encontrada'}); return; }
    if (String(sub.state || '').toUpperCase() !== 'TURNED_IN') return;
    if (sub.draftGrade !== undefined && sub.draftGrade !== null) { yaCalificadas++; return; }
    const item = {alumno:alumno.profile.name.fullName, correoForms:fe, correoClassroom:ce, puntos:respuestas[fe].score, submissionId:sub.id};
    pendientes.push(item);
    if (aplicar) { Classroom.Courses.CourseWork.StudentSubmissions.patch({draftGrade:item.puntos}, courseId, workId, sub.id, {updateMask:'draftGrade'}); actualizadas++; }
  });
  return {administrable:true, respuestasForms:Object.keys(respuestas).length, alumnosClassroom:alumnos.length, entregasClassroom:subs.length, actualizadas:actualizadas, yaCalificadas:yaCalificadas, pendientes:pendientes, sinCorrespondencia:sinCorrespondencia};
}

// Monitor de calificaciones cada minuto
