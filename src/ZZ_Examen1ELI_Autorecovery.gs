/**
 * Recuperación temporal y automática del Examen 1 de Ética y Legislación Informática.
 *
 * Se ejecuta al iniciar cualquier ejecución del proyecto Apps Script.
 * Reutiliza exclusivamente el Form y la actividad Classroom existentes,
 * vinculándolos por títulos exactos a la fila canónica del Quiz ID.
 * Después ejecuta el monitor de calificaciones.
 *
 * Es idempotente: no sobrescribe draftGrade/assignedGrade y solo procesa TURNED_IN.
 */
const ELI_EXAM1_AUTORECOVERY = (function () {
  try {
    const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const sh = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
    if (!sh) return false;

    recuperarExamen1EliSiNecesario_(ss, sh);
    const result = ejecutarMonitorCalificacionesQuizzes_(true);
    console.log('[ELI_EXAM1_AUTORECOVERY] ' + JSON.stringify(result));
    return true;
  } catch (err) {
    console.log('[ELI_EXAM1_AUTORECOVERY][ERROR] ' + String(err && err.message ? err.message : err));
    return false;
  }
})();
