const IMPORT_REQUEST = Object.freeze({
  SHEET: 'Configuración Quizzes',
  KEY: 'SOLICITUD_IMPORTAR_CALIFICACIONES',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR'
});

function instalarMonitorSolicitudesImportacion() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarSolicitudesImportacion')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarSolicitudesImportacion').timeBased().everyMinutes(1).create();
  return {instalado: true, handler: 'procesarSolicitudesImportacion'};
}

function procesarSolicitudesImportacion() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {procesado: false, motivo: 'LOCK'};
  try {
    const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const sh = ss.getSheetByName(IMPORT_REQUEST.SHEET);
    if (!sh) throw new Error('No existe la hoja ' + IMPORT_REQUEST.SHEET);

    const lastRow = Math.max(sh.getLastRow(), 1);
    const values = sh.getRange(1, 1, lastRow, 6).getDisplayValues();
    let row = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === IMPORT_REQUEST.KEY) {
        row = i + 1;
        break;
      }
    }
    if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

    const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
    if (estado !== IMPORT_REQUEST.REQUESTED) {
      return {procesado: false, motivo: 'SIN_SOLICITUD_PENDIENTE', estado: estado};
    }

    const targetQuizId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
    if (!targetQuizId) {
      throw new Error('Falta el Quiz ID objetivo de la importación.');
    }

    sh.getRange(row, 2).setValue(IMPORT_REQUEST.PROCESSING);
    sh.getRange(row, 6).setValue(new Date());
    SpreadsheetApp.flush();

    try {
      const quizSheet = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
      if (!quizSheet) throw new Error('No existe la hoja ' + QUIZ_PIPELINE.QUIZZES_SHEET);
      const data = quizSheet.getDataRange().getValues();
      const h = {};
      data[0].forEach((v, i) => h[String(v)] = i);

      let quizRow = -1;
      let q = null;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][h['Quiz ID']] || '').trim() === targetQuizId) {
          quizRow = i + 1;
          q = data[i];
          break;
        }
      }
      if (!q) throw new Error('No se encontró el Quiz ID objetivo: ' + targetQuizId);

      const estadoQuiz = String(q[h['Estado']] || '').trim().toUpperCase();
      if (estadoQuiz !== QUIZ_PIPELINE.CREATED) {
        throw new Error('El Quiz ID ' + targetQuizId + ' no está en estado CREADA; estado actual: ' + estadoQuiz);
      }

      const courseId = String(q[h['ID del curso']] || '').trim();
      const workId = String(q[h['ID actividad Classroom']] || '').trim();
      const formId = String(q[h['ID del Form']] || '').trim();
      if (!courseId || !workId || !formId) {
        throw new Error('Faltan IDs de curso, Classroom o Form para ' + targetQuizId);
      }

      const result = procesarCalificacionesQuiz_(courseId, workId, formId, true, targetQuizId);
      const resumen =
        'Importación manual: ' + result.actualizadas + ' actualizadas; ' +
        result.yaCalificadas + ' ya calificadas; ' +
        result.sinCorrespondencia.length + ' sin correspondencia; ' +
        result.noTurnedIn + ' no TURNED_IN.' +
        (result.ajuste ? ' Ajuste aplicado: +' + result.ajuste + ' puntos.' : '');

      quizSheet.getRange(quizRow, h['Última actualización'] + 1).setValue(new Date());
      quizSheet.getRange(quizRow, h['Resultado / error'] + 1).setValue(resumen);

      sh.getRange(row, 2).setValue(IMPORT_REQUEST.DONE);
      sh.getRange(row, 3).setValue('Importación ejecutada bajo demanda para ' + targetQuizId + '.');
      sh.getRange(row, 6).setValue(new Date());
      return {quizId: targetQuizId, resumen: resumen, detalle: result};
    } catch (err) {
      sh.getRange(row, 2).setValue(IMPORT_REQUEST.ERROR);
      sh.getRange(row, 3).setValue(String(err && err.message ? err.message : err));
      sh.getRange(row, 6).setValue(new Date());
      throw err;
    }
  } finally {
    lock.releaseLock();
  }
}
