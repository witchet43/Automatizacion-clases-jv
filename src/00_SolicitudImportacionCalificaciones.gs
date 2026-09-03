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

    sh.getRange(row, 2).setValue(IMPORT_REQUEST.PROCESSING);
    sh.getRange(row, 6).setValue(new Date());
    SpreadsheetApp.flush();

    try {
      const result = importarCalificacionesAhora();
      sh.getRange(row, 2).setValue(IMPORT_REQUEST.DONE);
      sh.getRange(row, 3).setValue('Importación ejecutada bajo demanda desde ChatGPT.');
      sh.getRange(row, 4).setValue(JSON.stringify(result).slice(0, 45000));
      sh.getRange(row, 6).setValue(new Date());
      return result;
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
