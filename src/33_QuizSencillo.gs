/**
 * QUIZ SENCILLO CANÓNICO
 *
 * Es una tarea vacía de Classroom:
 * - título automático Quiz N, donde N es consecutivo al mayor Quiz N activo del curso;
 * - sin descripción, materiales, puntos ni tema;
 * - siempre DRAFT;
 * - vencimiento en la siguiente hora natural en punto, estrictamente posterior
 *   al instante de solicitud;
 * - si ese vencimiento ya pasó al momento de crear, se bloquea y nunca se recorre.
 */
function crearQuizSencilloCanonico_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const policy = ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ;
  validarPoliticaQuizSencillo_(policy);

  p.courseId = String(p.courseId || '').trim();
  if (!p.courseId) throw new Error('QUIZ SENCILLO requiere courseId.');

  const solicitud = resolverInstanteSolicitudQuizSencillo_(p.solicitadoEnLocal || p.requestedAtLocal, policy);
  const requestId = String(p.requestId || (p.courseId + '|' + solicitud.texto)).trim();
  const propertyKey = claveIdempotenciaQuizSencillo_(p.courseId, requestId);
  const properties = PropertiesService.getScriptProperties();

  const previo = properties.getProperty(propertyKey);
  if (previo) {
    try {
      const saved = JSON.parse(previo);
      const work = Classroom.Courses.CourseWork.get(String(saved.courseId), String(saved.workId));
      const verificado = verificarQuizSencilloCreado_(work, saved);
      return Object.assign({}, saved, verificado, {reutilizado:true, requestId:requestId});
    } catch (ignorePrevio) {
      properties.deleteProperty(propertyKey);
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const recheck = properties.getProperty(propertyKey);
    if (recheck) {
      const saved = JSON.parse(recheck);
      const work = Classroom.Courses.CourseWork.get(String(saved.courseId), String(saved.workId));
      const verificado = verificarQuizSencilloCreado_(work, saved);
      return Object.assign({}, saved, verificado, {reutilizado:true, requestId:requestId});
    }

    const vencimiento = calcularSiguienteHoraNaturalQuizSencillo_(solicitud, policy);
    if (Date.now() >= vencimiento.utcMs) {
      throw new Error('El vencimiento calculado del QUIZ SENCILLO (' + vencimiento.fechaLocal + ' ' + vencimiento.horaLocal + ') ya pasó antes de poder crearlo. La política impide recorrerlo a la hora siguiente.');
    }

    const numero = obtenerSiguienteNumeroQuizSencillo_(p.courseId, policy);
    const titulo = policy.TITLE_PREFIX + numero;

    const body = {
      title: titulo,
      workType: 'ASSIGNMENT',
      state: policy.STATE,
      dueDate: {
        year: vencimiento.utcYear,
        month: vencimiento.utcMonth,
        day: vencimiento.utcDay
      },
      dueTime: {
        hours: vencimiento.utcHours,
        minutes: 0
      }
    };

    const created = Classroom.Courses.CourseWork.create(body, p.courseId);
    const work = Classroom.Courses.CourseWork.get(p.courseId, String(created.id));
    const expected = {
      courseId:p.courseId,
      workId:String(work.id),
      title:titulo,
      numero:numero,
      state:policy.STATE,
      fechaLimiteLocal:vencimiento.fechaLocal,
      horaLimiteLocal:vencimiento.horaLocal,
      fechaLimite:vencimiento.fechaUtc,
      horaLimite:vencimiento.horaUtc,
      requestId:requestId,
      solicitadoEnLocal:solicitud.texto
    };
    const verificado = verificarQuizSencilloCreado_(work, expected);

    registrarAuditoriaCourseWorkDirecto_({
      courseId:p.courseId,
      unidad:'',
      titulo:titulo,
      descripcion:'',
      fechaLimite:vencimiento.fechaUtc,
      horaLimite:vencimiento.horaUtc,
      tipo:'QUIZ_SENCILLO'
    }, work, '', 'CREADO');

    const result = Object.assign({}, expected, verificado, {reutilizado:false});
    properties.setProperty(propertyKey, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function validarPoliticaQuizSencillo_(policy) {
  if (!policy || policy.TITLE_PREFIX !== 'Quiz ' || policy.SEQUENCE_SOURCE !== 'CLASSROOM' ||
      policy.EMPTY_ASSIGNMENT !== true || policy.STATE !== 'DRAFT' ||
      policy.DUE_MODE !== 'NEXT_NATURAL_HOUR' || policy.DUE_STRICTLY_AFTER_REQUEST !== true ||
      policy.PAST_DUE_CREATION !== 'BLOCK' || policy.TIMEZONE !== 'America/Mexico_City' ||
      Number(policy.UTC_OFFSET_MINUTES) !== -360) {
    throw new Error('La política canónica de QUIZ SENCILLO fue debilitada.');
  }
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

function obtenerSiguienteNumeroQuizSencillo_(courseId, policy) {
  let max = 0;
  const re = /^Quiz\s+(\d+)$/i;
  ['PUBLISHED','DRAFT'].forEach(function(state) {
    let token;
    do {
      const page = Classroom.Courses.CourseWork.list(String(courseId), {
        pageSize:100,
        pageToken:token,
        courseWorkStates:state
      });
      (page.courseWork || []).forEach(function(work) {
        const m = String(work.title || '').trim().match(re);
        if (!m) return;
        const n = Number(m[1]);
        if (Number.isInteger(n) && n > max) max = n;
      });
      token = page.nextPageToken;
    } while (token);
  });
  return max + 1;
}

function verificarQuizSencilloCreado_(work, expected) {
  const policy = ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ;
  validarPoliticaQuizSencillo_(policy);
  if (!work || !work.id) throw new Error('QUIZ SENCILLO no devolvió CourseWork válido.');
  if (String(work.state || '').toUpperCase() !== policy.STATE) throw new Error('QUIZ SENCILLO no quedó DRAFT.');
  if (String(work.title || '').trim() !== String(expected.title || '').trim()) throw new Error('El título del QUIZ SENCILLO no coincide con la secuencia esperada.');
  if (String(work.description || '').trim()) throw new Error('QUIZ SENCILLO debe quedar sin descripción.');
  if (Array.isArray(work.materials) && work.materials.length) throw new Error('QUIZ SENCILLO debe quedar sin materiales.');

  const dd = work.dueDate || {};
  const dt = work.dueTime || {};
  const apiFecha = formatearFechaQuizSencillo_(Number(dd.year),Number(dd.month),Number(dd.day));
  const apiHora = formatearHoraQuizSencillo_(Number(dt.hours || 0),Number(dt.minutes || 0));
  if (apiFecha !== String(expected.fechaLimite) || apiHora !== String(expected.horaLimite)) {
    throw new Error('El vencimiento del QUIZ SENCILLO no coincide con la siguiente hora natural solicitada.');
  }
  return {workId:String(work.id),state:String(work.state),dueDate:work.dueDate,dueTime:work.dueTime};
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
  const p = ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ;
  const a = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 07:05:00',p),p);
  if (a.fechaLocal!=='2026-09-14'||a.horaLocal!=='08:00') throw new Error('Regresión: 07:05 debe vencer 08:00.');
  const b = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 09:15:00',p),p);
  if (b.fechaLocal!=='2026-09-14'||b.horaLocal!=='10:00') throw new Error('Regresión: 09:15 debe vencer 10:00.');
  const c = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 09:00:00',p),p);
  if (c.horaLocal!=='10:00') throw new Error('Regresión: una solicitud exactamente a las 09:00 debe vencer a las 10:00 por ser estrictamente posterior.');
  const d = calcularSiguienteHoraNaturalQuizSencillo_(resolverInstanteSolicitudQuizSencillo_('2026-09-14 23:30:00',p),p);
  if (d.fechaLocal!=='2026-09-15'||d.horaLocal!=='00:00') throw new Error('Regresión: 23:30 debe vencer 00:00 del día siguiente.');
  return {ok:true,tipo:'QUIZ_SENCILLO',secuencia:'CLASSROOM_MAX_PLUS_ONE',vencimiento:'NEXT_NATURAL_HOUR',state:'DRAFT'};
}
