/**
 * NOTIFICACIÓN CANÓNICA DE ERRORES DE SCRIPTS
 *
 * Regla: ningún error de una operación canónica debe quedar silencioso.
 * Canal primario: correo. Además se conserva bitácora mínima y último error.
 */
const ERROR_NOTIFICATION = Object.freeze({
  EMAIL_PROPERTY: 'ACADEMIC_ERROR_NOTIFICATION_EMAIL',
  LAST_ERROR_PROPERTY: 'ACADEMIC_LAST_SCRIPT_ERROR',
  NOTIFIED_KEYS_PROPERTY: 'ACADEMIC_NOTIFIED_ERROR_KEYS_V1',
  LOG_SHEET: 'Errores scripts',
  WATCH_HANDLER: 'vigilarErroresOperativos',
  MAX_NOTIFIED_KEYS: 120
});

function ejecutarConNotificacionError_(operacion, contexto, fn) {
  try {
    return fn();
  } catch (err) {
    notificarErrorScript_(operacion, err, contexto);
    throw err;
  }
}

function notificarErrorScript_(operacion, err, contexto) {
  const evento = construirEventoErrorScript_(operacion, err, contexto);
  console.error('[ERROR_SCRIPT_ACADEMICO] ' + JSON.stringify(evento));

  try {
    PropertiesService.getScriptProperties().setProperty(
      ERROR_NOTIFICATION.LAST_ERROR_PROPERTY,
      JSON.stringify(evento)
    );
  } catch (propErr) {
    console.error('[ERROR_NOTIFICACION_PROPIEDAD] ' + mensajeErrorOperacionSeguro_(propErr));
  }

  let email = '';
  let emailEnviado = false;
  try {
    email = resolverCorreoNotificacionErrores_();
    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: '[Automatización académica] Error: ' + evento.operacion,
        body: construirCorreoErrorScript_(evento)
      });
      emailEnviado = true;
    }
  } catch (mailErr) {
    console.error('[ERROR_NOTIFICACION_CORREO] ' + mensajeErrorOperacionSeguro_(mailErr));
  }

  try {
    registrarErrorScript_(evento, emailEnviado);
  } catch (logErr) {
    console.error('[ERROR_NOTIFICACION_BITACORA] ' + mensajeErrorOperacionSeguro_(logErr));
  }

  return {notificado: emailEnviado, canal: emailEnviado ? 'EMAIL' : 'LOG_ONLY'};
}

function construirEventoErrorScript_(operacion, err, contexto) {
  const message = mensajeErrorOperacionSeguro_(err);
  const stack = err && err.stack ? String(err.stack).slice(0, 4000) : '';
  return {
    fecha: new Date().toISOString(),
    operacion: String(operacion || 'OPERACION_DESCONOCIDA').trim(),
    error: message,
    contexto: contextoSeguroError_(contexto),
    stack: stack
  };
}

function contextoSeguroError_(contexto) {
  if (!contexto || typeof contexto !== 'object') return {};
  const permitidas = [
    'courseId','unidad','quizId','titulo','tipo','workId','formId',
    'classroomId','materia','tema','operacion','fila','sheet'
  ];
  const out = {};
  permitidas.forEach(function (key) {
    if (contexto[key] === undefined || contexto[key] === null || contexto[key] === '') return;
    const value = String(contexto[key]);
    out[key] = value.length > 240 ? value.slice(0, 240) + '…' : value;
  });
  return out;
}

function mensajeErrorOperacionSeguro_(err) {
  return String(err && err.message ? err.message : err || 'Error desconocido');
}

function resolverCorreoNotificacionErrores_() {
  const props = PropertiesService.getScriptProperties();
  const configured = String(props.getProperty(ERROR_NOTIFICATION.EMAIL_PROPERTY) || '').trim();
  if (configured) return configured;

  try {
    const effective = String(Session.getEffectiveUser().getEmail() || '').trim();
    if (effective) return effective;
  } catch (_) {}

  try {
    const active = String(Session.getActiveUser().getEmail() || '').trim();
    if (active) return active;
  } catch (_) {}

  // Compatibilidad temporal con la configuración nocturna existente.
  try {
    if (typeof NIGHTLY_REVIEW !== 'undefined') {
      const legacy = String(NIGHTLY_REVIEW.ERROR_EMAIL || '').trim();
      if (legacy) return legacy;
    }
  } catch (_) {}

  return '';
}

function configurarCorreoNotificacionesErrores(email) {
  const value = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Se requiere un correo válido para notificaciones de errores.');
  }
  PropertiesService.getScriptProperties().setProperty(ERROR_NOTIFICATION.EMAIL_PROPERTY, value);
  return {configurado: true, canal: 'EMAIL'};
}

function obtenerEstadoNotificacionesErrores() {
  const policy = ACADEMIC_POLICY.ERROR_REPORTING || {};
  return {
    activo: policy.NOTIFY_ON_ERROR === true,
    falloSilenciosoPermitido: policy.SILENT_FAILURE_ALLOWED === true,
    canalPrimario: policy.PRIMARY_CHANNEL || '',
    correoResuelto: Boolean(resolverCorreoNotificacionErrores_()),
    vigilanteLegado: policy.LEGACY_ERROR_WATCH === true
  };
}

function construirCorreoErrorScript_(evento) {
  const lines = [
    'Se detectó un error en la automatización académica.',
    '',
    'Fecha: ' + evento.fecha,
    'Operación: ' + evento.operacion,
    'Error: ' + evento.error
  ];
  const keys = Object.keys(evento.contexto || {});
  if (keys.length) {
    lines.push('', 'Contexto:');
    keys.forEach(function (key) { lines.push('- ' + key + ': ' + evento.contexto[key]); });
  }
  if (evento.stack) lines.push('', 'Stack:', evento.stack);
  lines.push('', 'El error quedó registrado; la operación no debe considerarse completada hasta corregirlo y verificarla.');
  return lines.join('\n');
}

function registrarErrorScript_(evento, emailEnviado) {
  if (!ACADEMIC_POLICY.ERROR_REPORTING || ACADEMIC_POLICY.ERROR_REPORTING.AUDIT_LOG !== true) return;
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  let sh = ss.getSheetByName(ERROR_NOTIFICATION.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ERROR_NOTIFICATION.LOG_SHEET);
    sh.appendRow(['Fecha','Operación','Error','Contexto','Correo enviado']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([
    new Date(evento.fecha),
    evento.operacion,
    evento.error,
    JSON.stringify(evento.contexto || {}),
    emailEnviado ? 'SÍ' : 'NO'
  ]);
}

function instalarMonitorErroresAcademicos() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === ERROR_NOTIFICATION.WATCH_HANDLER; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(ERROR_NOTIFICATION.WATCH_HANDLER).timeBased().everyMinutes(1).create();
  return {instalado: true, handler: ERROR_NOTIFICATION.WATCH_HANDLER, frecuenciaMinutos: 1};
}

/** Capa secundaria: detecta ERROR escrito por flujos legados que capturan excepciones. */
function vigilarErroresOperativos() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const nuevos = [];
  nuevos.push.apply(nuevos, detectarErroresTabla_(ss, 'Quizzes', 'Estado', 'Resultado / error', ['Quiz ID','ID del curso','Título']));
  nuevos.push.apply(nuevos, detectarErroresTabla_(ss, 'Tareas', 'Estado solicitud', 'Resultado', ['ID curso','Título','Tipo de actividad']));
  nuevos.push.apply(nuevos, detectarErroresConfiguracion_(ss));

  let notificados = 0;
  nuevos.forEach(function (item) {
    if (errorOperativoYaNotificado_(item.key)) return;
    const result = notificarErrorScript_(
      'ERROR_OPERATIVO_' + item.sheet.toUpperCase().replace(/\s+/g, '_'),
      new Error(item.error || 'La fila quedó en estado ERROR.'),
      item.contexto
    );
    if (result.notificado) {
      marcarErrorOperativoNotificado_(item.key);
      notificados++;
    }
  });
  return {detectados: nuevos.length, notificados: notificados};
}

function detectarErroresTabla_(ss, sheetName, stateHeader, errorHeader, contextHeaders) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getDisplayValues();
  const headers = values[0].map(function (x) { return String(x || '').trim(); });
  const stateCol = headers.indexOf(stateHeader);
  if (stateCol < 0) return [];
  const errorCol = headers.indexOf(errorHeader);
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][stateCol] || '').trim().toUpperCase() !== 'ERROR') continue;
    const contexto = {sheet: sheetName, fila: i + 1};
    (contextHeaders || []).forEach(function (h) {
      const c = headers.indexOf(h);
      if (c >= 0 && values[i][c]) {
        if (/curso/i.test(h)) contexto.courseId = values[i][c];
        else if (/quiz/i.test(h)) contexto.quizId = values[i][c];
        else if (/t[ií]tulo/i.test(h)) contexto.titulo = values[i][c];
        else contexto.tipo = values[i][c];
      }
    });
    const error = errorCol >= 0 ? String(values[i][errorCol] || '').trim() : 'Estado ERROR';
    out.push({
      sheet: sheetName,
      error: error,
      contexto: contexto,
      key: sheetName + '|' + (i + 1) + '|' + error
    });
  }
  return out;
}

function detectarErroresConfiguracion_(ss) {
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(1, 1, sh.getLastRow(), Math.min(Math.max(sh.getLastColumn(), 6), 10)).getDisplayValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1] || '').trim().toUpperCase() !== 'ERROR') continue;
    const keyName = String(values[i][0] || '').trim();
    const error = String(values[i][2] || '').trim() || 'Solicitud en ERROR';
    out.push({
      sheet: 'Configuración Quizzes',
      error: error,
      contexto: {sheet:'Configuración Quizzes', fila:i + 1, operacion:keyName, quizId:String(values[i][3] || '').trim()},
      key: 'Configuración Quizzes|' + (i + 1) + '|' + keyName + '|' + error
    });
  }
  return out;
}

function errorOperativoYaNotificado_(key) {
  return obtenerClavesErroresNotificados_().indexOf(String(key)) >= 0;
}

function marcarErrorOperativoNotificado_(key) {
  const props = PropertiesService.getScriptProperties();
  const keys = obtenerClavesErroresNotificados_();
  keys.push(String(key));
  const unique = Array.from(new Set(keys)).slice(-ERROR_NOTIFICATION.MAX_NOTIFIED_KEYS);
  props.setProperty(ERROR_NOTIFICATION.NOTIFIED_KEYS_PROPERTY, JSON.stringify(unique));
}

function obtenerClavesErroresNotificados_() {
  const raw = PropertiesService.getScriptProperties().getProperty(ERROR_NOTIFICATION.NOTIFIED_KEYS_PROPERTY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_) {
    return [];
  }
}
