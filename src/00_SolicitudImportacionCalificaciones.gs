// Monitor administrativo protegido. No crea recursos didácticos; esas operaciones usan el Web App canónico.
const IMPORT_REQUEST = Object.freeze({
  SHEET: 'Configuración Quizzes',
  KEY: 'SOLICITUD_IMPORTAR_CALIFICACIONES',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR'
});

function desinstalarMonitorSolicitudesImportacion_() {
  let removed=0;
  ScriptApp.getProjectTriggers()
    .filter(function(t){return t.getHandlerFunction()==='procesarSolicitudesImportacion';})
    .forEach(function(t){ScriptApp.deleteTrigger(t);removed++;});
  return removed;
}

function instalarMonitorSolicitudesImportacion() {
  const removed=desinstalarMonitorSolicitudesImportacion_();
  return {ok:true,instalado:false,descomisionado:true,triggersEliminados:removed,
    motivo:'Las operaciones administrativas se ejecutan bajo demanda; no existe polling cada minuto.'};
}

/** Compatibilidad con triggers heredados: se elimina y no toca Sheets/locks. */
function procesarSolicitudesImportacion() {
  return {ok:true,descomisionado:true,
    triggersEliminados:desinstalarMonitorSolicitudesImportacion_(),
    recursosModificados:0};
}

function procesarSolicitudImportacionCalificaciones_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(IMPORT_REQUEST.SHEET);
  if (!sh) throw new Error('No existe la hoja ' + IMPORT_REQUEST.SHEET + '.');

  const row = buscarFilaSolicitud_(sh, IMPORT_REQUEST.KEY, 6);
  if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== IMPORT_REQUEST.REQUESTED) {
    return {procesado: false, motivo:'SIN_SOLICITUD_PENDIENTE', estado:estado};
  }

  const quizId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  if (!quizId) throw new Error('Falta el Quiz ID objetivo de la importación.');

  sh.getRange(row, 2).setValue(IMPORT_REQUEST.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = importarCalificacionesInstrumento_({quizId: quizId});
    sh.getRange(row, 2).setValue(IMPORT_REQUEST.DONE);
    sh.getRange(row, 3).setValue('Importación ejecutada bajo demanda para ' + quizId + ' en DRAFT.');
    sh.getRange(row, 6).setValue(new Date());
    return result;
  } catch (err) {
    sh.getRange(row, 2).setValue(IMPORT_REQUEST.ERROR);
    sh.getRange(row, 3).setValue(mensajeErrorOperacion_(err));
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}

function ejecutarAdaptadorSolicitud_(nombre, fn) {
  try { return fn(); }
  catch (err) {
    notificarErrorScript_('ADAPTADOR_' + String(nombre || '').toUpperCase().replace(/\s+/g, '_'), err, {operacion:nombre});
    console.error('Solicitud de ' + nombre + ': ' + mensajeErrorOperacion_(err));
    return {procesado: false, error: mensajeErrorOperacion_(err)};
  }
}

function buscarFilaSolicitud_(sheet, key, columns) {
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), columns || 2).getDisplayValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === String(key)) return i + 1;
  }
  return -1;
}

function mensajeErrorOperacion_(err) {
  return String(err && err.message ? err.message : err);
}
