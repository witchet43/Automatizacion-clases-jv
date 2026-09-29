/**
 * FACHADAS CANÓNICAS DE IMPORTACIÓN INDIVIDUAL
 * Entrada mínima: quizId; courseId opcional como assertion.
 */
function importarCalificacionesQuiz(params) {
  return ejecutarConNotificacionError_('IMPORTAR_CALIFICACIONES_QUIZ', params, function () {
    const p = normalizarParametrosOperacion_(params);
    if (!p.quizId) throw new Error('importarCalificacionesQuiz requiere quizId.');
    return importarCalificacionesInstrumento_({quizId:p.quizId, courseId:p.courseId, tipoEsperado:'QUIZ'});
  });
}

function importarCalificacionesInstrumento(params) {
  return ejecutarConNotificacionError_('IMPORTAR_CALIFICACIONES_INSTRUMENTO', params, function () {
    const p = normalizarParametrosOperacion_(params);
    if (!p.quizId) throw new Error('importarCalificacionesInstrumento requiere quizId.');
    return importarCalificacionesInstrumento_({quizId:p.quizId, courseId:p.courseId});
  });
}
