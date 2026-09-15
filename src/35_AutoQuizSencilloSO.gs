/**
 * AUTOMATIZACIÓN CANÓNICA — QUIZ SENCILLO DE SISTEMAS OPERATIVOS ITQ
 *
 * El calendario de Classroom es la autoridad para decidir si existe clase.
 * El monitor existente de un minuto invoca esta revisión; no existe una regla
 * fija por día de semana. Un evento solo puede producir un Quiz Sencillo.
 */
const AUTO_SIMPLE_QUIZ_SO_POLICY = Object.freeze({
  ENABLED: true,
  COURSE_ID: '875776451793',
  COURSE_KEY: 'ITQ_SISTEMAS_OPERATIVOS',
  CALENDAR_ID: 'classroom105101248437356972360@group.calendar.google.com',
  CALENDAR_SUMMARY: 'ITQ - Sistemas Operativos Agosto - Diciembre 2026',
  EVENT_TITLE: 'ITQ | Sistemas Operativos | Aula LCF',
  TIMEZONE: 'America/Mexico_City',
  START_GRACE_MINUTES: 5,
  LOOKAHEAD_SECONDS: 30,
  EVENT_PROPERTY_PREFIX: 'AUTO_SIMPLE_QUIZ_SO_EVENT_',
  ERROR_COOLDOWN_MINUTES: 360,
  HEARTBEAT_MINUTES: 5,
  CONTROL_KEY: 'AUTO_QUIZ_SENCILLO_SO'
});

function procesarAutoQuizSencilloSO_() {
  const policy = AUTO_SIMPLE_QUIZ_SO_POLICY;
  validarPoliticaAutoQuizSencilloSO_(policy);
  if (policy.ENABLED !== true) return {procesado:false,motivo:'DESACTIVADO'};

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - policy.START_GRACE_MINUTES * 60000);
  const hasta = new Date(ahora.getTime() + policy.LOOKAHEAD_SECONDS * 1000);
  const page = Calendar.Events.list(policy.CALENDAR_ID, {
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: false,
    maxResults: 20
  });

  const eventos = (page.items || []).filter(function(evento) {
    return eventoElegibleAutoQuizSO_(evento, ahora, policy);
  });
  if (!eventos.length) return {procesado:false,motivo:'SIN_CLASE_EN_INICIO'};

  const resultados = [];
  eventos.forEach(function(evento) {
    resultados.push(procesarEventoAutoQuizSO_(evento, policy));
  });
  return {procesado:true,eventos:resultados};
}

function procesarEventoAutoQuizSO_(evento, policy) {
  const inicioTexto = String(evento && evento.start && evento.start.dateTime || '').trim();
  if (!inicioTexto) throw new Error('El evento de Sistemas Operativos no tiene start.dateTime.');

  const eventKey = claveEventoAutoQuizSO_(evento, policy);
  const properties = PropertiesService.getScriptProperties();
  const previo = properties.getProperty(eventKey);
  if (previo) {
    try {
      const saved = JSON.parse(previo);
      const work = Classroom.Courses.CourseWork.get(policy.COURSE_ID, String(saved.workId));
      if (String(work.state || '').toUpperCase() !== 'DELETED') {
        return Object.assign({}, saved, {reutilizado:true});
      }
    } catch (ignore) {
      properties.deleteProperty(eventKey);
    }
  }

  const inicio = new Date(inicioTexto);
  if (!Number.isFinite(inicio.getTime())) throw new Error('Fecha de inicio inválida en el evento de Sistemas Operativos.');
  const solicitadoEnLocal = Utilities.formatDate(inicio, policy.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const requestId = 'AUTO_SO_CALENDAR_EVENT|' + String(evento.id || '') + '|' + inicioTexto;

  const result = crearQuizSencillo({
    courseId: policy.COURSE_ID,
    solicitadoEnLocal: solicitadoEnLocal,
    requestId: requestId
  });

  const expectedDue = calcularSiguienteHoraNaturalQuizSencillo_(
    resolverInstanteSolicitudQuizSencillo_(solicitadoEnLocal, ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ),
    ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ
  );
  if (String(result.fechaLimiteLocal || '') !== expectedDue.fechaLocal ||
      String(result.horaLimiteLocal || '') !== expectedDue.horaLocal) {
    throw new Error('El Quiz Sencillo automático no quedó con el vencimiento esperado para el inicio de la clase.');
  }
  if (String(result.state || '').toUpperCase() !== 'DRAFT') {
    throw new Error('El Quiz Sencillo automático no quedó DRAFT.');
  }

  const registro = {
    eventId: String(evento.id || ''),
    eventStart: inicioTexto,
    eventTitle: String(evento.summary || ''),
    courseId: policy.COURSE_ID,
    workId: String(result.workId || ''),
    title: String(result.title || ''),
    state: String(result.state || ''),
    fechaLimiteLocal: String(result.fechaLimiteLocal || ''),
    horaLimiteLocal: String(result.horaLimiteLocal || ''),
    requestId: requestId,
    procesadoEn: new Date().toISOString()
  };
  if (!registro.workId) throw new Error('El Quiz Sencillo automático no devolvió workId.');
  properties.setProperty(eventKey, JSON.stringify(registro));
  return Object.assign({}, registro, {reutilizado:false});
}

function eventoElegibleAutoQuizSO_(evento, ahora, policy) {
  if (!evento || String(evento.status || 'confirmed').toLowerCase() === 'cancelled') return false;
  if (String(evento.summary || '').trim() !== policy.EVENT_TITLE) return false;
  const raw = String(evento.start && evento.start.dateTime || '').trim();
  if (!raw) return false;
  const inicio = new Date(raw);
  if (!Number.isFinite(inicio.getTime())) return false;
  const delta = ahora.getTime() - inicio.getTime();
  return delta >= 0 && delta <= policy.START_GRACE_MINUTES * 60000;
}

function claveEventoAutoQuizSO_(evento, policy) {
  const raw = String(evento && evento.id || '') + '|' + String(evento && evento.start && evento.start.dateTime || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  const hex = bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  return policy.EVENT_PROPERTY_PREFIX + hex;
}

function validarPoliticaAutoQuizSencilloSO_(policy) {
  if (!policy || policy.ENABLED !== true || policy.COURSE_ID !== '875776451793' ||
      policy.CALENDAR_ID !== 'classroom105101248437356972360@group.calendar.google.com' ||
      policy.EVENT_TITLE !== 'ITQ | Sistemas Operativos | Aula LCF' ||
      policy.TIMEZONE !== 'America/Mexico_City' || Number(policy.START_GRACE_MINUTES) !== 5 ||
      Number(policy.LOOKAHEAD_SECONDS) !== 30 || Number(policy.HEARTBEAT_MINUTES) !== 5 ||
      policy.CONTROL_KEY !== 'AUTO_QUIZ_SENCILLO_SO') {
    throw new Error('La política de automatización del Quiz Sencillo de Sistemas Operativos fue debilitada.');
  }
  return true;
}

function procesarAutoQuizSencilloSOSeguro_() {
  try {
    const result = procesarAutoQuizSencilloSO_();
    PropertiesService.getScriptProperties().deleteProperty('AUTO_SIMPLE_QUIZ_SO_LAST_ERROR_AT');
    try { registrarEstadoAutoQuizSO_('OK', result, false); } catch (auditErr) { console.error('Heartbeat Auto Quiz SO: ' + mensajeErrorOperacion_(auditErr)); }
    return result;
  } catch (err) {
    const properties = PropertiesService.getScriptProperties();
    const key = 'AUTO_SIMPLE_QUIZ_SO_LAST_ERROR_AT';
    const previo = Number(properties.getProperty(key) || 0);
    const ahora = Date.now();
    const cooldown = AUTO_SIMPLE_QUIZ_SO_POLICY.ERROR_COOLDOWN_MINUTES * 60000;
    try { registrarEstadoAutoQuizSO_('ERROR', {error:mensajeErrorOperacion_(err)}, true); } catch (auditErr) { console.error('Heartbeat Auto Quiz SO: ' + mensajeErrorOperacion_(auditErr)); }
    if (!previo || ahora - previo >= cooldown) {
      properties.setProperty(key, String(ahora));
      notificarErrorScript_('AUTO_QUIZ_SENCILLO_SO', err, {
        courseId:AUTO_SIMPLE_QUIZ_SO_POLICY.COURSE_ID,
        calendarId:AUTO_SIMPLE_QUIZ_SO_POLICY.CALENDAR_ID
      });
    }
    console.error('Auto Quiz Sencillo SO: ' + mensajeErrorOperacion_(err));
    return {procesado:false,motivo:'ERROR',error:mensajeErrorOperacion_(err)};
  }
}

function registrarEstadoAutoQuizSO_(estado, detalle, force) {
  const p = AUTO_SIMPLE_QUIZ_SO_POLICY;
  const properties = PropertiesService.getScriptProperties();
  const heartbeatKey = 'AUTO_SIMPLE_QUIZ_SO_LAST_HEARTBEAT_AT';
  const ahoraMs = Date.now();
  const previo = Number(properties.getProperty(heartbeatKey) || 0);
  if (force !== true && previo && ahoraMs - previo < p.HEARTBEAT_MINUTES * 60000) return {actualizado:false};

  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe la hoja Configuración Quizzes para heartbeat de Auto Quiz SO.');
  const last = Math.max(sh.getLastRow(), 1);
  const values = sh.getRange(1, 1, last, 1).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === p.CONTROL_KEY) { row = i + 1; break; }
  }
  if (row < 0) row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 8).setValues([[
    p.CONTROL_KEY,
    String(estado || ''),
    JSON.stringify(detalle || {}),
    p.COURSE_ID,
    p.ENABLED ? 'ACTIVA' : 'INACTIVA',
    new Date(),
    p.CALENDAR_SUMMARY,
    p.EVENT_TITLE
  ]]);
  SpreadsheetApp.flush();
  properties.setProperty(heartbeatKey, String(ahoraMs));
  return {actualizado:true,row:row};
}

function verificarAccesoCalendarAutoQuizSO() {
  validarPoliticaAutoQuizSencilloSO_(AUTO_SIMPLE_QUIZ_SO_POLICY);
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + 14 * 24 * 60 * 60000);
  const page = Calendar.Events.list(AUTO_SIMPLE_QUIZ_SO_POLICY.CALENDAR_ID, {
    timeMin: ahora.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: false,
    maxResults: 50
  });
  const matches = (page.items || []).filter(function(evento) {
    return String(evento.summary || '').trim() === AUTO_SIMPLE_QUIZ_SO_POLICY.EVENT_TITLE;
  });
  return {
    ok:true,
    calendarId:AUTO_SIMPLE_QUIZ_SO_POLICY.CALENDAR_ID,
    courseId:AUTO_SIMPLE_QUIZ_SO_POLICY.COURSE_ID,
    eventTitle:AUTO_SIMPLE_QUIZ_SO_POLICY.EVENT_TITLE,
    upcomingMatches:matches.length,
    firstStart:matches.length ? String(matches[0].start && matches[0].start.dateTime || '') : ''
  };
}

function validarAutoQuizSencilloSOCanonico() {
  const p = AUTO_SIMPLE_QUIZ_SO_POLICY;
  validarPoliticaAutoQuizSencilloSO_(p);
  const base = {status:'confirmed',summary:p.EVENT_TITLE,start:{dateTime:'2026-09-15T07:00:00-06:00'},id:'evt-test'};
  if (!eventoElegibleAutoQuizSO_(base, new Date('2026-09-15T07:02:00-06:00'), p)) {
    throw new Error('Regresión: una clase a 07:00 debe ser elegible a las 07:02.');
  }
  if (eventoElegibleAutoQuizSO_(base, new Date('2026-09-15T07:06:00-06:00'), p)) {
    throw new Error('Regresión: una clase a 07:00 no debe generar quiz después de la ventana de 5 minutos.');
  }
  const wrong = {status:'confirmed',summary:'Otro evento',start:{dateTime:'2026-09-15T07:00:00-06:00'},id:'evt-wrong'};
  if (eventoElegibleAutoQuizSO_(wrong, new Date('2026-09-15T07:02:00-06:00'), p)) {
    throw new Error('Regresión: un evento con título distinto no puede generar Quiz Sencillo.');
  }
  const due = calcularSiguienteHoraNaturalQuizSencillo_(
    resolverInstanteSolicitudQuizSencillo_('2026-09-15 07:00:00', ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ),
    ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ
  );
  if (due.fechaLocal !== '2026-09-15' || due.horaLocal !== '08:00') {
    throw new Error('Regresión: una clase a las 07:00 debe producir vencimiento 08:00.');
  }
  return {ok:true,source:'CLASSROOM_CALENDAR',graceMinutes:p.START_GRACE_MINUTES,due:'NEXT_NATURAL_HOUR',state:'DRAFT',heartbeatMinutes:p.HEARTBEAT_MINUTES};
}
