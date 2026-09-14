/**
 * REGLA DE VENCIMIENTO PARA ACTIVIDAD EN CLASE
 *
 * Exclusiva de ACTIVIDAD. La fecha/hora máxima local es el fin de la sesión.
 * El motor de Classroom recibe dueDate/dueTime en UTC, por lo que esta capa
 * convierte explícitamente desde America/Mexico_City usando el offset canónico.
 */
function aplicarReglaVencimientoActividadEnClase_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const policy = ACADEMIC_POLICY.CLASSROOM.ACTIVITY_IN_CLASS_DUE;
  validarPoliticaVencimientoActividadEnClase_(policy);

  const fechaSesion = primerValorTextoActividad_(p.fechaSesion, p.fechaClase, p.sessionDate, p.classDate);
  const horaFinSesion = primerValorTextoActividad_(p.horaFinSesion, p.horaFinClase, p.sessionEndTime, p.classEndTime);
  if (!fechaSesion || !horaFinSesion) {
    throw new Error('ACTIVIDAD EN CLASE requiere fechaSesion y horaFinSesion para fijar el vencimiento máximo al final de la clase.');
  }

  const finSesion = parseFechaHoraLocalActividad_(fechaSesion, horaFinSesion, 'fin de sesión');
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

  const utc = convertirFechaHoraLocalActividadAUtc_(limiteLocal, policy.UTC_OFFSET_MINUTES);
  p.fechaSesion = fechaSesion;
  p.horaFinSesion = horaFinSesion;
  p.fechaLimiteLocal = limiteLocal.fecha;
  p.horaLimiteLocal = limiteLocal.hora;
  p.fechaLimite = utc.fecha;
  p.horaLimite = utc.hora;
  return p;
}

function validarPoliticaVencimientoActividadEnClase_(policy) {
  if (!policy || policy.REQUIRED !== true || policy.DEFAULT !== 'SESSION_END' || policy.MAXIMUM !== 'SESSION_END' || policy.REQUIRES_SESSION_CONTEXT !== true) {
    throw new Error('La política canónica de ACTIVIDAD EN CLASE no exige correctamente el fin de sesión.');
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

  const fin = aplicarReglaVencimientoActividadEnClase_({fechaSesion:'2026-09-14', horaFinSesion:'19:00'});
  if (fin.fechaLimite !== '2026-09-15' || fin.horaLimite !== '01:00') {
    throw new Error('Regresión: el fin de sesión 19:00 local debe convertirse a 01:00 UTC del día siguiente.');
  }

  const antes = aplicarReglaVencimientoActividadEnClase_({
    fechaSesion:'2026-09-14', horaFinSesion:'19:00', fechaLimite:'2026-09-14', horaLimite:'18:30'
  });
  if (antes.fechaLimite !== '2026-09-15' || antes.horaLimite !== '00:30') {
    throw new Error('Regresión: un vencimiento anterior explícito debe conservarse y convertirse a UTC.');
  }

  let bloqueoPosterior = false;
  try {
    aplicarReglaVencimientoActividadEnClase_({
      fechaSesion:'2026-09-14', horaFinSesion:'19:00', fechaLimite:'2026-09-14', horaLimite:'19:01'
    });
  } catch (err) {
    bloqueoPosterior = /no puede ser posterior/i.test(String(err && err.message || err));
  }
  if (!bloqueoPosterior) throw new Error('Regresión: debe bloquearse un vencimiento posterior al fin de sesión.');

  let bloqueoSinContexto = false;
  try {
    aplicarReglaVencimientoActividadEnClase_({fechaLimite:'2026-09-14', horaLimite:'19:00'});
  } catch (err) {
    bloqueoSinContexto = /requiere fechaSesion y horaFinSesion/i.test(String(err && err.message || err));
  }
  if (!bloqueoSinContexto) throw new Error('Regresión: una actividad sin contexto de sesión debe bloquearse.');

  return {ok:true, tipo:'ACTIVIDAD', vencimiento:'SESSION_END_MAX', timezone:'America/Mexico_City'};
}
