/** Utilidades seguras para leer puntajes de Google Forms. */
function puntajeSeguroRespuestaForms_(response) {
  const gradables = response.getGradableItemResponses();
  let scoreForms = 0;
  let reactivosConPuntaje = 0;
  let reactivosSinPuntaje = 0;

  gradables.forEach(itemResponse => {
    const value = itemResponse.getScore();
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      reactivosSinPuntaje++;
      return;
    }
    reactivosConPuntaje++;
    scoreForms += Number(value);
  });

  return {
    completo: reactivosSinPuntaje === 0,
    scoreForms: reactivosSinPuntaje === 0 ? scoreForms : null,
    reactivosGradables: gradables.length,
    reactivosConPuntaje: reactivosConPuntaje,
    reactivosSinPuntaje: reactivosSinPuntaje
  };
}

function respuestasFormsSegurasPorCorreo_(formId) {
  const out = {};
  FormApp.openById(String(formId)).getResponses().forEach(response => {
    const email = String(response.getRespondentEmail() || '').trim().toLowerCase();
    if (!email) return;
    const lectura = puntajeSeguroRespuestaForms_(response);
    const actual = out[email];
    if (!actual || response.getTimestamp() > actual.fecha) {
      out[email] = {
        fecha: response.getTimestamp(),
        completo: lectura.completo,
        scoreForms: lectura.scoreForms,
        reactivosGradables: lectura.reactivosGradables,
        reactivosConPuntaje: lectura.reactivosConPuntaje,
        reactivosSinPuntaje: lectura.reactivosSinPuntaje
      };
    }
  });
  return out;
}

/**
 * Reconciliación explícita y acotada de calificaciones ya importadas.
 * Solo modifica los correos solicitados y únicamente cuando Forms devuelve
 * un puntaje completo y verificable. Sobrescribe draftGrade + assignedGrade
 * porque corrige una importación previa incorrecta, no una importación ordinaria.
 */
function reconciliarCalificacionesImportadas(params) {
  const p = params || {};
  const quizId = String(p.quizId || '').trim();
  const correos = (p.correos || []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
  if (!quizId) throw new Error('reconciliarCalificacionesImportadas requiere quizId.');
  if (!correos.length) throw new Error('reconciliarCalificacionesImportadas requiere al menos un correo.');

  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const item = resolverInstrumentoPorQuizId_(ss, quizId);
  const cw = Classroom.Courses.CourseWork.get(String(item.courseId), String(item.workId));
  const maxPoints = Number(cw.maxPoints || 100);
  const ajuste = obtenerAjusteCalificacionQuiz_(quizId);
  const respuestas = respuestasFormsSegurasPorCorreo_(item.formId);
  const alumnos = listarAlumnosPromedio_(item.courseId);
  const byEmail = {};
  alumnos.forEach(a => {
    const email = String(a.profile && a.profile.emailAddress || '').trim().toLowerCase();
    if (email) byEmail[email] = a;
  });
  const subs = entregasPorAlumnoPromedio_(item.courseId, item.workId);

  const detalle = [];
  let corregidas = 0;

  correos.forEach(email => {
    const respuesta = respuestas[email];
    if (!respuesta) {
      detalle.push({correo: email, estado: 'SIN_RESPUESTA_FORMS'});
      return;
    }
    if (!respuesta.completo) {
      detalle.push({
        correo: email,
        estado: 'PUNTAJE_FORMS_INCOMPLETO',
        reactivosGradables: respuesta.reactivosGradables,
        reactivosConPuntaje: respuesta.reactivosConPuntaje,
        reactivosSinPuntaje: respuesta.reactivosSinPuntaje
      });
      return;
    }

    const alumno = byEmail[email];
    if (!alumno) {
      detalle.push({correo: email, estado: 'SIN_ALUMNO_CLASSROOM'});
      return;
    }
    const sub = subs[String(alumno.userId)];
    if (!sub) {
      detalle.push({correo: email, alumno: alumno.profile.name.fullName, estado: 'SIN_SUBMISSION_CLASSROOM'});
      return;
    }

    const score = Math.min(maxPoints, Number(respuesta.scoreForms) + ajuste);
    const draftAnterior = sub.draftGrade === undefined || sub.draftGrade === null ? null : Number(sub.draftGrade);
    const assignedAnterior = sub.assignedGrade === undefined || sub.assignedGrade === null ? null : Number(sub.assignedGrade);
    const necesitaCorreccion = draftAnterior !== score || assignedAnterior !== score;

    if (necesitaCorreccion) {
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        {draftGrade: score, assignedGrade: score},
        String(item.courseId), String(item.workId), String(sub.id),
        {updateMask: 'draftGrade,assignedGrade'}
      );
      corregidas++;
    }

    detalle.push({
      correo: email,
      alumno: alumno.profile.name.fullName,
      estado: necesitaCorreccion ? 'CORREGIDA' : 'YA_COINCIDIA',
      forms: score,
      draftAnterior: draftAnterior,
      assignedAnterior: assignedAnterior,
      reactivosGradables: respuesta.reactivosGradables,
      reactivosSinPuntaje: respuesta.reactivosSinPuntaje
    });
  });

  const verify = entregasPorAlumnoPromedio_(item.courseId, item.workId);
  detalle.forEach(d => {
    if (d.estado !== 'CORREGIDA' && d.estado !== 'YA_COINCIDIA') return;
    const alumno = byEmail[d.correo];
    const sub = verify[String(alumno.userId)];
    const assigned = sub && sub.assignedGrade !== undefined && sub.assignedGrade !== null ? Number(sub.assignedGrade) : null;
    d.verificadoAssigned = assigned;
    if (assigned !== d.forms) throw new Error('Falló verificación de reconciliación para ' + d.correo + '.');
  });

  return {
    operacion: 'RECONCILIAR_IMPORTACION',
    quizId: quizId,
    courseId: item.courseId,
    workId: item.workId,
    solicitadas: correos.length,
    corregidas: corregidas,
    detalle: detalle
  };
}

function procesarSolicitudReconciliarImportacion_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe Configuración Quizzes.');
  const row = buscarFilaSolicitud_(sh, 'SOLICITUD_RECONCILIAR_IMPORTACION', 8);
  if (row < 0) return {procesado:false,motivo:'SIN_SOLICITUD_CONFIGURADA'};
  const estado = String(sh.getRange(row,2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== 'SOLICITAR') return {procesado:false,motivo:'SIN_SOLICITUD_PENDIENTE',estado:estado};

  const quizId = String(sh.getRange(row,4).getDisplayValue() || '').trim();
  const correos = String(sh.getRange(row,8).getDisplayValue() || '')
    .split(/[;,\n]/)
    .map(x => x.trim())
    .filter(Boolean);

  sh.getRange(row,2).setValue('PROCESANDO');
  sh.getRange(row,6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = reconciliarCalificacionesImportadas({quizId:quizId, correos:correos});
    sh.getRange(row,2).setValue('PROCESADO');
    sh.getRange(row,3).setValue(
      'Reconciliación completada: ' + result.corregidas + '/' + result.solicitadas +
      ' corregidas. ' + JSON.stringify(result.detalle).slice(0,3500)
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
