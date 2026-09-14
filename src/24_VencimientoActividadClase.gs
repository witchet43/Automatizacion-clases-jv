/**
 * REGLA DE VENCIMIENTO PARA ACTIVIDAD EN CLASE
 *
 * Exclusiva de ACTIVIDAD. La fecha/hora máxima local es el fin de la sesión.
 * Classroom exige que el vencimiento sea futuro; por ello una actividad no se
 * crea después de que la sesión terminó ni con un vencimiento anterior al ahora.
 */
function aplicarReglaVencimientoActividadEnClase_(params) {
  return aplicarReglaVencimientoActividadEnClaseConAhora_(params, ahoraLocalActividad_());
}

function aplicarReglaVencimientoActividadEnClaseConAhora_(params, ahoraLocal) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const policy = ACADEMIC_POLICY.CLASSROOM.ACTIVITY_IN_CLASS_DUE;
  validarPoliticaVencimientoActividadEnClase_(policy);

  const fechaSesion = primerValorTextoActividad_(p.fechaSesion, p.fechaClase, p.sessionDate, p.classDate);
  const horaFinSesion = primerValorTextoActividad_(p.horaFinSesion, p.horaFinClase, p.sessionEndTime, p.classEndTime);
  if (!fechaSesion || !horaFinSesion) {
    throw new Error('ACTIVIDAD EN CLASE requiere fechaSesion y horaFinSesion para fijar el vencimiento máximo al final de la clase.');
  }

  const finSesion = parseFechaHoraLocalActividad_(fechaSesion, horaFinSesion, 'fin de sesión');
  const ahora = ahoraLocal && typeof ahoraLocal === 'object'
    ? ahoraLocal
    : parseFechaHoraLocalActividad_(String(ahoraLocal || '').slice(0,10), String(ahoraLocal || '').slice(11,16), 'hora actual');

  if (policy.PAST_SESSION_CREATION === 'BLOCK' && ahora.localComparableMs >= finSesion.localComparableMs) {
    throw new Error('No se puede crear una ACTIVIDAD EN CLASE después de que la sesión ha concluido (' + fechaSesion + ' ' + horaFinSesion + '). Classroom exige un vencimiento futuro y la política impide moverlo después del fin de clase.');
  }

  const fechaSolicitada = primerValorTextoActividad_(p.fechaLimite, p.dueDate);
  const horaSolicitada = primerValorTextoActividad_(p.horaLimite, p.dueTime);
  if ((fechaSolicitada && !horaSolicitada) || (!fechaSolicitada && horaSolicitada)) {
    throw new Error('ACTIVIDAD EN CLASE requiere fecha y hora completas cuando se especifica un vencimiento anterior al fin de sesión.');
  }

  const limiteLocal = fechaSolicitada
    ? parseFechaHoraLocalActividad_(fechaSolicitada, horaSolicitada, 'vencimiento solicitado')
    : finSesion;

  if (limiteLocal.localComparableMs > finSesion.localComparableMs) {
    throw new Error('El vencimiento de una ACTIVIDAD EN CLASE no puede ser posterior al final de la sesión (' + fechaSesion + ' ' + horaFinSesion + ').');
  }
  if (policy.DUE_MUST_BE_FUTURE === true && limiteLocal.localComparableMs <= ahora.localComparableMs) {
    throw new Error('El vencimiento de una ACTIVIDAD EN CLASE debe seguir estando en el futuro al momento de crearla. Límite solicitado: ' + limiteLocal.fecha + ' ' + limiteLocal.hora + '.');
  }

  const utc = convertirFechaHoraLocalActividadAUtc_(limiteLocal, policy.UTC_OFFSET_MINUTES);
  p.fechaSesion = fechaSesion;
  p.horaFinSesion = horaFinSesion;
  p.fechaLimiteLocal = limiteLocal.fecha;
  p.horaLimiteLocal = limiteLocal.hora;
  p.fechaLimite = utc.fecha;
  p.horaLimite = utc.hora;
  return p;
}

function ahoraLocalActividad_() {
  const policy = ACADEMIC_POLICY.CLASSROOM.ACTIVITY_IN_CLASS_DUE;
  const value = Utilities.formatDate(new Date(), policy.TIMEZONE, 'yyyy-MM-dd HH:mm');
  return parseFechaHoraLocalActividad_(value.slice(0,10), value.slice(11,16), 'hora actual');
}

function validarPoliticaVencimientoActividadEnClase_(policy) {
  if (!policy || policy.REQUIRED !== true || policy.DEFAULT !== 'SESSION_END' || policy.MAXIMUM !== 'SESSION_END' || policy.REQUIRES_SESSION_CONTEXT !== true || policy.PAST_SESSION_CREATION !== 'BLOCK' || policy.DUE_MUST_BE_FUTURE !== true) {
    throw new Error('La política canónica de ACTIVIDAD EN CLASE no exige correctamente el fin de sesión y un vencimiento futuro.');
  }
  if (policy.TIMEZONE !== 'America/Mexico_City' || Number(policy.UTC_OFFSET_MINUTES) !== -360) {
    throw new Error('La política horaria de ACTIVIDAD EN CLASE no coincide con America/Mexico_City 2026.');
  }
  return true;
}

function primerValorTextoActividad_() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function parseFechaHoraLocalActividad_(fecha, hora, etiqueta) {
  const dm = String(fecha || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(hora || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dm) throw new Error((etiqueta || 'fecha') + ': la fecha debe usar YYYY-MM-DD.');
  if (!tm) throw new Error((etiqueta || 'hora') + ': la hora debe usar HH:MM.');

  const year = Number(dm[1]), month = Number(dm[2]), day = Number(dm[3]);
  const hours = Number(tm[1]), minutes = Number(tm[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error((etiqueta || 'fecha/hora') + ': valor fuera de rango.');
  }

  const comparable = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error((etiqueta || 'fecha') + ': fecha inválida.');
  }
  return {
    fecha: formatearFechaActividad_(year, month, day),
    hora: formatearHoraActividad_(hours, minutes),
    year: year, month: month, day: day, hours: hours, minutes: minutes,
    localComparableMs: comparable
  };
}

function convertirFechaHoraLocalActividadAUtc_(local, offsetMinutes) {
  const offset = Number(offsetMinutes);
  if (!Number.isFinite(offset)) throw new Error('Offset UTC inválido para ACTIVIDAD EN CLASE.');
  const utcMs = Date.UTC(local.year, local.month - 1, local.day, local.hours, local.minutes, 0, 0) - offset * 60000;
  const d = new Date(utcMs);
  return {
    fecha: formatearFechaActividad_(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    hora: formatearHoraActividad_(d.getUTCHours(), d.getUTCMinutes())
  };
}

function formatearFechaActividad_(year, month, day) {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function formatearHoraActividad_(hours, minutes) {
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

function validarVencimientoActividadEnClaseCanonico() {
  validarPoliticasCanonicas_();
  const ahoraPrueba = parseFechaHoraLocalActividad_('2026-09-14', '07:00', 'ahora de prueba');

  const fin = aplicarReglaVencimientoActividadEnClaseConAhora_({fechaSesion:'2026-09-14', horaFinSesion:'19:00'}, ahoraPrueba);
  if (fin.fechaLimite !== '2026-09-15' || fin.horaLimite !== '01:00') {
    throw new Error('Regresión: el fin de sesión 19:00 local debe convertirse a 01:00 UTC del día siguiente.');
  }

  const antes = aplicarReglaVencimientoActividadEnClaseConAhora_({
    fechaSesion:'2026-09-14', horaFinSesion:'19:00', fechaLimite:'2026-09-14', horaLimite:'18:30'
  }, ahoraPrueba);
  if (antes.fechaLimite !== '2026-09-15' || antes.horaLimite !== '00:30') {
    throw new Error('Regresión: un vencimiento anterior explícito debe conservarse y convertirse a UTC.');
  }

  let bloqueoPosterior = false;
  try {
    aplicarReglaVencimientoActividadEnClaseConAhora_({
      fechaSesion:'2026-09-14', horaFinSesion:'19:00', fechaLimite:'2026-09-14', horaLimite:'19:01'
    }, ahoraPrueba);
  } catch (err) {
    bloqueoPosterior = /no puede ser posterior/i.test(String(err && err.message || err));
  }
  if (!bloqueoPosterior) throw new Error('Regresión: debe bloquearse un vencimiento posterior al fin de sesión.');

  let bloqueoSesionTerminada = false;
  try {
    aplicarReglaVencimientoActividadEnClaseConAhora_({fechaSesion:'2026-09-14', horaFinSesion:'08:00'}, parseFechaHoraLocalActividad_('2026-09-14','08:01','ahora posterior'));
  } catch (err) {
    bloqueoSesionTerminada = /sesión ha concluido/i.test(String(err && err.message || err));
  }
  if (!bloqueoSesionTerminada) throw new Error('Regresión: debe bloquearse la creación cuando la sesión ya terminó.');

  let bloqueoVencimientoPasado = false;
  try {
    aplicarReglaVencimientoActividadEnClaseConAhora_({
      fechaSesion:'2026-09-14', horaFinSesion:'19:00', fechaLimite:'2026-09-14', horaLimite:'06:59'
    }, ahoraPrueba);
  } catch (err) {
    bloqueoVencimientoPasado = /debe seguir estando en el futuro/i.test(String(err && err.message || err));
  }
  if (!bloqueoVencimientoPasado) throw new Error('Regresión: debe bloquearse un vencimiento que ya pasó.');

  let bloqueoSinContexto = false;
  try {
    aplicarReglaVencimientoActividadEnClaseConAhora_({fechaLimite:'2026-09-14', horaLimite:'19:00'}, ahoraPrueba);
  } catch (err) {
    bloqueoSinContexto = /requiere fechaSesion y horaFinSesion/i.test(String(err && err.message || err));
  }
  if (!bloqueoSinContexto) throw new Error('Regresión: una actividad sin contexto de sesión debe bloquearse.');

  return {ok:true, tipo:'ACTIVIDAD', vencimiento:'SESSION_END_MAX_FUTURE', timezone:'America/Mexico_City'};
}
