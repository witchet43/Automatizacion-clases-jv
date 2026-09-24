/**
 * QUIZ SENCILLO CANÓNICO
 *
 * Es una tarea vacía de Classroom:
 * - título automático Quiz N, donde N es consecutivo al mayor Quiz N activo del curso;
 * - sin descripción, materiales ni puntos;
 * - asignada obligatoriamente a la Unidad N actualmente abierta en Classroom;
 * - siempre DRAFT;
 * - vencimiento en la siguiente hora natural en punto, estrictamente posterior
 *   al instante de solicitud;
 * - si ese vencimiento ya pasó al momento de crear, se bloquea y nunca se recorre.
 */
function crearQuizSencilloCanonico_(params) {
  return crearQuizAsistenciaMinimo_(params);
}

function validarPoliticaQuizSencillo_(policy) {
  if(!policy||policy.TITLE_PREFIX!=='Quiz '||
     policy.SEQUENCE_SOURCE!=='LATEST_PUBLISHED_QUIZ'||
     policy.EMPTY_ASSIGNMENT!==true||policy.STATE!=='DRAFT'||
     policy.DUE_MODE!=='NEXT_NATURAL_HOUR'||
     policy.TIMEZONE!=='America/Mexico_City'||
     Number(policy.UTC_OFFSET_MINUTES)!==-360)
    throw new Error('QUIZ_ASISTENCIA_POLITICA_INVALIDA');
  return true;
}

function resolverInstanteSolicitudQuizSencillo_(value, policy) {
  let raw = String(value || '').trim();
  if (!raw) raw = Utilities.formatDate(new Date(), policy.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error('solicitadoEnLocal debe usar YYYY-MM-DD HH:MM[:SS] o ISO equivalente.');
  const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]);
  const hours=Number(m[4]), minutes=Number(m[5]), seconds=Number(m[6] || 0);
  if (month<1||month>12||day<1||day>31||hours<0||hours>23||minutes<0||minutes>59||seconds<0||seconds>59) {
    throw new Error('solicitadoEnLocal contiene valores fuera de rango.');
  }
  const check = new Date(Date.UTC(year, month-1, day));
  if (check.getUTCFullYear()!==year || check.getUTCMonth()!==month-1 || check.getUTCDate()!==day) {
    throw new Error('solicitadoEnLocal contiene una fecha inválida.');
  }
  const localMs = Date.UTC(year, month-1, day, hours, minutes, seconds, 0);
  return {
    year:year,month:month,day:day,hours:hours,minutes:minutes,seconds:seconds,
    localMs:localMs,
    texto:formatearFechaQuizSencillo_(year,month,day)+' '+formatearHoraQuizSencillo_(hours,minutes)+':'+String(seconds).padStart(2,'0')
  };
}

function calcularSiguienteHoraNaturalQuizSencillo_(solicitud, policy) {
  const nextLocalMs = Date.UTC(solicitud.year, solicitud.month-1, solicitud.day, solicitud.hours+1, 0, 0, 0);
  const local = new Date(nextLocalMs);
  const utcMs = nextLocalMs - Number(policy.UTC_OFFSET_MINUTES) * 60000;
  const utc = new Date(utcMs);
  return {
    fechaLocal:formatearFechaQuizSencillo_(local.getUTCFullYear(),local.getUTCMonth()+1,local.getUTCDate()),
    horaLocal:formatearHoraQuizSencillo_(local.getUTCHours(),0),
    fechaUtc:formatearFechaQuizSencillo_(utc.getUTCFullYear(),utc.getUTCMonth()+1,utc.getUTCDate()),
    horaUtc:formatearHoraQuizSencillo_(utc.getUTCHours(),0),
    utcYear:utc.getUTCFullYear(),utcMonth:utc.getUTCMonth()+1,utcDay:utc.getUTCDate(),utcHours:utc.getUTCHours(),
    utcMs:utcMs
  };
}

/** Compatibilidad: solo consulta consecutivo por quiz PUBLISHED. */
function obtenerSiguienteNumeroQuizSencillo_(courseId) {
  return resolverConsecutivoQuizAsistencia_(courseId).numero;
}

function verificarQuizSencilloCreado_(work, expected) {
  const policy = ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ;
  validarPoliticaQuizSencillo_(policy);
  if (!work || !work.id) throw new Error('QUIZ SENCILLO no devolvió CourseWork válido.');
  if (String(work.state || '').toUpperCase() !== policy.STATE) throw new Error('QUIZ SENCILLO no quedó DRAFT.');
  if (String(work.title || '').trim() !== String(expected.title || '').trim()) throw new Error('El título del QUIZ SENCILLO no coincide con la secuencia esperada.');
  if (String(work.description || '').trim()) throw new Error('QUIZ SENCILLO debe quedar sin descripción.');
  if (Array.isArray(work.materials) && work.materials.length) throw new Error('QUIZ SENCILLO debe quedar sin materiales.');
  if (!String(expected.topicId || '').trim() || String(work.topicId || '') !== String(expected.topicId || '')) {
    throw new Error('QUIZ SENCILLO no quedó asignado a la unidad abierta esperada.');
  }

  const dd = work.dueDate || {};
  const dt = work.dueTime || {};
  const apiFecha = formatearFechaQuizSencillo_(Number(dd.year),Number(dd.month),Number(dd.day));
  const apiHora = formatearHoraQuizSencillo_(Number(dt.hours || 0),Number(dt.minutes || 0));
  if (apiFecha !== String(expected.fechaLimite) || apiHora !== String(expected.horaLimite)) {
    throw new Error('El vencimiento del QUIZ SENCILLO no coincide con la siguiente hora natural solicitada.');
  }
  return {workId:String(work.id),state:String(work.state),topicId:String(work.topicId || ''),dueDate:work.dueDate,dueTime:work.dueTime};
}

function claveIdempotenciaQuizSencillo_(courseId, requestId) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(courseId) + '|' + String(requestId));
  const hex = bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  return 'SIMPLE_QUIZ_REQUEST_' + hex;
}

function formatearFechaQuizSencillo_(year, month, day) {
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}

function formatearHoraQuizSencillo_(hours, minutes) {
  return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0');
}

function validarQuizSencilloCanonico() {
  validarPoliticasCanonicas_();
  validarPoliticaQuizSencillo_(ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ);
  // La unidad abierta ya no participa en Quiz de Asistencia.
  const p = ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ;
  const a = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 07:05:00',p),p);
  if (a.fechaLocal!=='2026-09-14'||a.horaLocal!=='08:00') throw new Error('Regresión: 07:05 debe vencer 08:00.');
  const b = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 09:15:00',p),p);
  if (b.fechaLocal!=='2026-09-14'||b.horaLocal!=='10:00') throw new Error('Regresión: 09:15 debe vencer 10:00.');
  const c = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 09:00:00',p),p);
  if (c.horaLocal!=='10:00') throw new Error('Regresión: una solicitud exactamente a las 09:00 debe vencer a las 10:00 por ser estrictamente posterior.');
  const d = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 23:30:00',p),p);
  if (d.fechaLocal!=='2026-09-15'||d.horaLocal!=='00:00') throw new Error('Regresión: 23:30 debe vencer 00:00 del día siguiente.');
  return {ok:true,tipo:'QUIZ_SENCILLO',secuencia:'LATEST_PUBLISHED_QUIZ_PLUS_ONE',unidad:'NO_REQUERIDA',vencimiento:'NEXT_NATURAL_HOUR',state:'DRAFT'};
}
