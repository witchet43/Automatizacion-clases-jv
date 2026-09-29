/**
 * Servicio HTTP mínimo para Quiz de Asistencia.
 *
 * Única operación expuesta:
 *   action=quizAsistencia
 *
 * Cursos permitidos: registro fijo del periodo julio-diciembre 2026.
 * La lógica académica NO vive aquí: delega a crearQuizAsistenciaRapido(courseId),
 * que conserva consecutivo, DRAFT e idempotencia.
 */
const QUIZ_ASISTENCIA_WEB = Object.freeze({
  COURSES: Object.freeze({
    'sistemas-distribuidos': '871158466533',
    'analisis-diseno-sistemas-computacionales': '871158479566',
    'introduccion-tecnologias-informacion': '871156721160',
    'administracion': '871158187513',
    'etica-legislacion-informatica': '871149624583',
    'algoritmos-estructuras-datos': '871156334717',
    'sistemas-operativos': '875776451793',
    'so': '875776451793'
  })
});

function doGet(e) {
  return ejecutarQuizAsistenciaWeb_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  let params = {};
  const raw = e && e.postData ? String(e.postData.contents || '') : '';
  if (raw) {
    try {
      params = JSON.parse(raw);
    } catch (err) {
      return respuestaQuizAsistenciaWeb_({ok:false,error:'JSON_INVALIDO'});
    }
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

    const courseKey = String(p.course || 'sistemas-operativos')
      .trim()
      .toLowerCase();

    const courseId = QUIZ_ASISTENCIA_WEB.COURSES[courseKey];
    if (!courseId) throw new Error('CURSO_NO_PERMITIDO');

    const result = crearQuizAsistenciaRapido(courseId);

    return respuestaQuizAsistenciaWeb_(Object.assign({
      ok:true,
      transport:'WEB_APP',
      courseKey:courseKey
    }, result));
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
