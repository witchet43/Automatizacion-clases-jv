/**
 * Endpoint mínimo para Quiz de Asistencia.
 * Superficie expuesta deliberadamente pequeña:
 * - solo Sistemas Operativos ITQ
 * - solo crearQuizAsistencia()
 * - siempre hereda DRAFT e idempotencia del motor canónico
 */
const QUIZ_ASISTENCIA_WEB = Object.freeze({
  COURSES: Object.freeze({
    so: '875776451793',
    sistemas_operativos: '875776451793'
  })
});

function doGet(e) {
  return ejecutarQuizAsistenciaWeb_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  let params = {};
  const raw = e && e.postData ? String(e.postData.contents || '') : '';
  if (raw) {
    try { params = JSON.parse(raw); }
    catch (err) { return respuestaQuizAsistenciaWeb_({ok:false,error:'JSON_INVALIDO'}); }
  } else if (e && e.parameter) {
    params = e.parameter;
  }
  return ejecutarQuizAsistenciaWeb_(params);
}

function ejecutarQuizAsistenciaWeb_(params) {
  try {
    const p = params && typeof params === 'object' ? params : {};
    const action = String(p.action || 'quizAsistencia').trim();
    if (action !== 'quizAsistencia') throw new Error('ACCION_NO_PERMITIDA');

    const courseKey = String(p.course || 'so').trim().toLowerCase();
    const courseId = QUIZ_ASISTENCIA_WEB.COURSES[courseKey];
    if (!courseId) throw new Error('CURSO_NO_PERMITIDO');

    const requestId = String(p.requestId || '').trim();
    if (!requestId || requestId.length < 8 || requestId.length > 120) {
      throw new Error('REQUEST_ID_REQUERIDO');
    }

    const result = crearQuizAsistencia({
      courseId: courseId,
      requestId: requestId
    });

    return respuestaQuizAsistenciaWeb_(Object.assign({ok:true}, result));
  } catch (err) {
    return respuestaQuizAsistenciaWeb_({
      ok:false,
      error:String(err && err.message ? err.message : err)
    });
  }
}

function respuestaQuizAsistenciaWeb_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
