/**
 * REGLA DE VENCIMIENTO PARA TAREA
 *
 * Exclusiva de TAREA. La fecha/hora máxima local es el inicio de la siguiente
 * clase de la misma materia. Classroom exige que el vencimiento sea futuro;
 * por ello una tarea no se crea después de que esa siguiente clase inició ni
 * con un vencimiento anterior al ahora.
 */
function aplicarReglaVencimientoTarea_(params) {
  return aplicarReglaVencimientoTareaConAhora_(params, ahoraLocalTarea_());
}

function aplicarReglaVencimientoTareaConAhora_(params, ahoraLocal) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const policy = ACADEMIC_POLICY.CLASSROOM.TASK_DUE;
  validarPoliticaVencimientoTarea_(policy);

  const fechaSiguienteSesion = primerValorTextoActividad_(
    p.fechaSiguienteSesion,
    p.fechaSiguienteClase,
    p.nextSessionDate,
    p.nextClassDate
  );
  const horaInicioSiguienteSesion = primerValorTextoActividad_(
    p.horaInicioSiguienteSesion,
    p.horaInicioSiguienteClase,
    p.nextSessionStartTime,
    p.nextClassStartTime
  );
  if (!fechaSiguienteSesion || !horaInicioSiguienteSesion) {
    throw new Error('TAREA requiere fechaSiguienteSesion y horaInicioSiguienteSesion obtenidas de la siguiente clase canónica para fijar el vencimiento máximo al inicio de esa clase.');
  }

  const inicioSiguienteSesion = parseFechaHoraLocalActividad_(fechaSiguienteSesion, horaInicioSiguienteSesion, 'inicio de siguiente sesión');
  const ahora = ahoraLocal && typeof ahoraLocal === 'object'
    ? ahoraLocal
    : parseFechaHoraLocalActividad_(String(ahoraLocal || '').slice(0,10), String(ahoraLocal || '').slice(11,16), 'hora actual');

  if (policy.PAST_NEXT_SESSION_CREATION === 'BLOCK' && ahora.localComparableMs >= inicioSiguienteSesion.localComparableMs) {
    throw new Error('No se puede crear una TAREA después de que la siguiente clase ha iniciado (' + fechaSiguienteSesion + ' ' + horaInicioSiguienteSesion + '). Classroom exige un vencimiento futuro y la política impide moverlo después del inicio de esa clase.');
  }

  const fechaSolicitada = primerValorTextoActividad_(p.fechaLimite, p.dueDate);
  const horaSolicitada = primerValorTextoActividad_(p.horaLimite, p.dueTime);
  if ((fechaSolicitada && !horaSolicitada) || (!fechaSolicitada && horaSolicitada)) {
    throw new Error('TAREA requiere fecha y hora completas cuando se especifica un vencimiento anterior al inicio de la siguiente clase.');
  }

  const limiteLocal = fechaSolicitada
    ? parseFechaHoraLocalActividad_(fechaSolicitada, horaSolicitada, 'vencimiento solicitado')
    : inicioSiguienteSesion;

  if (limiteLocal.localComparableMs > inicioSiguienteSesion.localComparableMs) {
    throw new Error('El vencimiento de una TAREA no puede ser posterior al inicio de la siguiente clase (' + fechaSiguienteSesion + ' ' + horaInicioSiguienteSesion + ').');
  }
  if (policy.DUE_MUST_BE_FUTURE === true && limiteLocal.localComparableMs <= ahora.localComparableMs) {
    throw new Error('El vencimiento de una TAREA debe seguir estando en el futuro al momento de crearla. Límite solicitado: ' + limiteLocal.fecha + ' ' + limiteLocal.hora + '.');
  }

  const utc = convertirFechaHoraLocalActividadAUtc_(limiteLocal, policy.UTC_OFFSET_MINUTES);
  p.fechaSiguienteSesion = fechaSiguienteSesion;
  p.horaInicioSiguienteSesion = horaInicioSiguienteSesion;
  p.fechaLimiteLocal = limiteLocal.fecha;
  p.horaLimiteLocal = limiteLocal.hora;
  p.fechaLimite = utc.fecha;
  p.horaLimite = utc.hora;
  return p;
}

function ahoraLocalTarea_() {
  const policy = ACADEMIC_POLICY.CLASSROOM.TASK_DUE;
  const value = Utilities.formatDate(new Date(), policy.TIMEZONE, 'yyyy-MM-dd HH:mm');
  return parseFechaHoraLocalActividad_(value.slice(0,10), value.slice(11,16), 'hora actual');
}

function validarPoliticaVencimientoTarea_(policy) {
  if (!policy || policy.REQUIRED !== true || policy.DEFAULT !== 'NEXT_SESSION_START' || policy.MAXIMUM !== 'NEXT_SESSION_START' || policy.REQUIRES_NEXT_SESSION_CONTEXT !== true || policy.PAST_NEXT_SESSION_CREATION !== 'BLOCK' || policy.DUE_MUST_BE_FUTURE !== true) {
    throw new Error('La política canónica de TAREA no exige correctamente el inicio de la siguiente clase y un vencimiento futuro.');
  }
  if (policy.TIMEZONE !== 'America/Mexico_City' || Number(policy.UTC_OFFSET_MINUTES) !== -360) {
    throw new Error('La política horaria de TAREA no coincide con America/Mexico_City 2026.');
  }
  return true;
}

function verificarVencimientoTareaCreada_(courseId, workId, tarea) {
  const work = Classroom.Courses.CourseWork.get(String(courseId), String(workId));
  const dueDate = work && work.dueDate ? work.dueDate : null;
  const dueTime = work && work.dueTime ? work.dueTime : null;
  if (!dueDate || !dueTime) throw new Error('La TAREA creada/reutilizada no contiene vencimiento obligatorio: ' + workId + '.');

  const expectedDate = String(tarea.fechaLimite || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const expectedTime = String(tarea.horaLimite || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!expectedDate || !expectedTime) throw new Error('No existe vencimiento UTC esperado para verificar la TAREA.');

  const coincide = Number(dueDate.year) === Number(expectedDate[1]) &&
    Number(dueDate.month) === Number(expectedDate[2]) &&
    Number(dueDate.day) === Number(expectedDate[3]) &&
    Number(dueTime.hours || 0) === Number(expectedTime[1]) &&
    Number(dueTime.minutes || 0) === Number(expectedTime[2]);
  if (!coincide) {
    throw new Error('La TAREA creada/reutilizada no coincide con el vencimiento canónico esperado al inicio de la siguiente clase. workId=' + workId + '.');
  }
  if (String(work.state || '').toUpperCase() !== 'DRAFT') throw new Error('La TAREA creada/reutilizada no quedó DRAFT: ' + workId + '.');
  return work;
}

function validarVencimientoTareaCanonico() {
  validarPoliticasCanonicas_();
  const ahoraPrueba = parseFechaHoraLocalActividad_('2026-09-14', '14:00', 'ahora de prueba');

  const inicio = aplicarReglaVencimientoTareaConAhora_({
    fechaSiguienteSesion:'2026-09-15', horaInicioSiguienteSesion:'07:00'
  }, ahoraPrueba);
  if (inicio.fechaLimite !== '2026-09-15' || inicio.horaLimite !== '13:00') {
    throw new Error('Regresión: el inicio de siguiente clase 07:00 local debe convertirse a 13:00 UTC.');
  }

  const antes = aplicarReglaVencimientoTareaConAhora_({
    fechaSiguienteSesion:'2026-09-15', horaInicioSiguienteSesion:'07:00', fechaLimite:'2026-09-15', horaLimite:'06:30'
  }, ahoraPrueba);
  if (antes.fechaLimite !== '2026-09-15' || antes.horaLimite !== '12:30') {
    throw new Error('Regresión: un vencimiento anterior explícito de TAREA debe conservarse y convertirse a UTC.');
  }

  let bloqueoPosterior = false;
  try {
    aplicarReglaVencimientoTareaConAhora_({
      fechaSiguienteSesion:'2026-09-15', horaInicioSiguienteSesion:'07:00', fechaLimite:'2026-09-15', horaLimite:'07:01'
    }, ahoraPrueba);
  } catch (err) {
    bloqueoPosterior = /no puede ser posterior/i.test(String(err && err.message || err));
  }
  if (!bloqueoPosterior) throw new Error('Regresión: debe bloquearse un vencimiento de TAREA posterior al inicio de la siguiente clase.');

  let bloqueoClaseIniciada = false;
  try {
    aplicarReglaVencimientoTareaConAhora_({
      fechaSiguienteSesion:'2026-09-15', horaInicioSiguienteSesion:'07:00'
    }, parseFechaHoraLocalActividad_('2026-09-15','07:01','ahora posterior'));
  } catch (err) {
    bloqueoClaseIniciada = /siguiente clase ha iniciado/i.test(String(err && err.message || err));
  }
  if (!bloqueoClaseIniciada) throw new Error('Regresión: debe bloquearse la creación de TAREA cuando la siguiente clase ya inició.');

  let bloqueoVencimientoPasado = false;
  try {
    aplicarReglaVencimientoTareaConAhora_({
      fechaSiguienteSesion:'2026-09-15', horaInicioSiguienteSesion:'07:00', fechaLimite:'2026-09-14', horaLimite:'13:59'
    }, ahoraPrueba);
  } catch (err) {
    bloqueoVencimientoPasado = /debe seguir estando en el futuro/i.test(String(err && err.message || err));
  }
  if (!bloqueoVencimientoPasado) throw new Error('Regresión: debe bloquearse un vencimiento de TAREA que ya pasó.');

  let bloqueoSinContexto = false;
  try {
    aplicarReglaVencimientoTareaConAhora_({fechaLimite:'2026-09-15', horaLimite:'07:00'}, ahoraPrueba);
  } catch (err) {
    bloqueoSinContexto = /requiere fechaSiguienteSesion y horaInicioSiguienteSesion/i.test(String(err && err.message || err));
  }
  if (!bloqueoSinContexto) throw new Error('Regresión: una TAREA sin contexto de siguiente clase debe bloquearse.');

  return {ok:true, tipo:'TAREA', vencimiento:'NEXT_SESSION_START_MAX_FUTURE', timezone:'America/Mexico_City'};
}
