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

function omitirVencimientoTarea_(params, motivo) {
  // No inventar plazos: conservar el recurso como DRAFT sin dueDate/dueTime.
  const p=Object.assign({},params);
  ['fechaLimite','horaLimite','fechaLimiteLocal','horaLimiteLocal','dueDate','dueTime'].forEach(function(k){delete p[k];});
  p.backfillSinVencimiento=true;
  p.vencimientoOmitidoMotivo=motivo;
  return p;
}

function aplicarReglaVencimientoTareaConAhora_(params, ahoraLocal) {
  const p=params&&typeof params==='object'?Object.assign({},params):{};
  if(p.backfillDraft===true && p.explicitSequenceOverride===true)
    return omitirVencimientoTarea_(p,'RECUPERACION_RETROSPECTIVA');

  const policy=ACADEMIC_POLICY.CLASSROOM.TASK_DUE;
  validarPoliticaVencimientoTarea_(policy);
  const fechaSiguienteSesion=primerValorTextoActividad_(
    p.fechaSiguienteSesion,p.fechaSiguienteClase,p.nextSessionDate,p.nextClassDate
  );
  const horaInicioSiguienteSesion=primerValorTextoActividad_(
    p.horaInicioSiguienteSesion,p.horaInicioSiguienteClase,p.nextSessionStartTime,p.nextClassStartTime
  );
  // Fecha y hora son OPCIONALES. Si no existe el par completo, se crea sin vencimiento.
  if(!fechaSiguienteSesion || !horaInicioSiguienteSesion)
    return omitirVencimientoTarea_(p,'SIGUIENTE_SESION_NO_DETERMINADA');

  const inicio=parseFechaHoraLocalActividad_(fechaSiguienteSesion,horaInicioSiguienteSesion,'inicio de siguiente sesión');
  const ahora=ahoraLocal&&typeof ahoraLocal==='object' ? ahoraLocal :
    parseFechaHoraLocalActividad_(String(ahoraLocal||'').slice(0,10),String(ahoraLocal||'').slice(11,16),'hora actual');
  if(ahora.localComparableMs>=inicio.localComparableMs)
    return omitirVencimientoTarea_(p,'SIGUIENTE_SESION_TRANSCURRIDA');

  const fechaSolicitada=primerValorTextoActividad_(p.fechaLimite,p.dueDate);
  const horaSolicitada=primerValorTextoActividad_(p.horaLimite,p.dueTime);
  // Un vencimiento explícito parcial tampoco impide crear un recurso educativo.
  if(Boolean(fechaSolicitada)!==Boolean(horaSolicitada))
    return omitirVencimientoTarea_(p,'VENCIMIENTO_INCOMPLETO');

  const limite=fechaSolicitada
    ? parseFechaHoraLocalActividad_(fechaSolicitada,horaSolicitada,'vencimiento solicitado')
    : inicio;
  if(limite.localComparableMs>inicio.localComparableMs)
    return omitirVencimientoTarea_(p,'VENCIMIENTO_POSTERIOR_A_CLASE');
  if(policy.DUE_MUST_BE_FUTURE===true && limite.localComparableMs<=ahora.localComparableMs)
    return omitirVencimientoTarea_(p,'VENCIMIENTO_TRANSCURRIDO');

  const utc=convertirFechaHoraLocalActividadAUtc_(limite,policy.UTC_OFFSET_MINUTES);
  p.fechaSiguienteSesion=fechaSiguienteSesion;
  p.horaInicioSiguienteSesion=horaInicioSiguienteSesion;
  p.fechaLimiteLocal=limite.fecha;
  p.horaLimiteLocal=limite.hora;
  p.fechaLimite=utc.fecha;
  p.horaLimite=utc.hora;
  p.backfillSinVencimiento=false;
  delete p.vencimientoOmitidoMotivo;
  return p;
}

function ahoraLocalTarea_() {
  const policy = ACADEMIC_POLICY.CLASSROOM.TASK_DUE;
  const value = Utilities.formatDate(new Date(), policy.TIMEZONE, 'yyyy-MM-dd HH:mm');
  return parseFechaHoraLocalActividad_(value.slice(0,10), value.slice(11,16), 'hora actual');
}

function validarPoliticaVencimientoTarea_(policy) {
  if(!policy || policy.REQUIRED!==false || policy.DEFAULT!=='NEXT_SESSION_START' ||
     policy.MAXIMUM!=='NEXT_SESSION_START' || policy.REQUIRES_NEXT_SESSION_CONTEXT!==false ||
     policy.PAST_NEXT_SESSION_CREATION!=='OMIT_DUE' || policy.DUE_MUST_BE_FUTURE!==true ||
     policy.MISSING_NEXT_SESSION_CONTEXT!=='OMIT_DUE' || policy.PAST_DUE!=='OMIT_DUE')
    throw new Error('TASK_DUE_POLICY_INVALID: fecha opcional, vencimiento solo futuro y omisión retrospectiva son obligatorios.');
  if(policy.TIMEZONE!=='America/Mexico_City' || Number(policy.UTC_OFFSET_MINUTES)!==-360)
    throw new Error('TASK_DUE_TIMEZONE_INVALID: America/Mexico_City 2026.');
  return true;
}

function verificarVencimientoTareaCreada_(courseId, workId, tarea) {
  const work = Classroom.Courses.CourseWork.get(String(courseId), String(workId));
  const dueDate = work && work.dueDate ? work.dueDate : null;
  const dueTime = work && work.dueTime ? work.dueTime : null;
  if(tarea&&tarea.backfillSinVencimiento===true) {
    // Los borradores ya existentes se reutilizan, nunca se alteran sus plazos manuales.
    if(String(work.state||'').toUpperCase()!=='DRAFT')
      throw new Error('TASK_NOT_DRAFT: '+workId);
    return work;
  }
  if(!dueDate || !dueTime)throw new Error('TASK_DUE_MISSING_AFTER_CREATION: '+workId);

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
  const ahora=parseFechaHoraLocalActividad_('2026-09-14','14:00','ahora de prueba');
  const caso=aplicarReglaVencimientoTareaConAhora_({
    fechaSiguienteSesion:'2026-09-15',horaInicioSiguienteSesion:'07:00'
  },ahora);
  if(caso.fechaLimite!=='2026-09-15'||caso.horaLimite!=='13:00'||caso.backfillSinVencimiento!==false)
    throw new Error('TASK_DUE_REGRESSION_VALID_FUTURE');
  const missing=aplicarReglaVencimientoTareaConAhora_({},ahora);
  if(missing.backfillSinVencimiento!==true||missing.fechaLimite||missing.horaLimite)
    throw new Error('TASK_DUE_REGRESSION_OPTIONAL_CONTEXT');
  const past=aplicarReglaVencimientoTareaConAhora_({
    fechaSiguienteSesion:'2026-09-13',horaInicioSiguienteSesion:'07:00'
  },ahora);
  if(past.backfillSinVencimiento!==true||past.vencimientoOmitidoMotivo!=='SIGUIENTE_SESION_TRANSCURRIDA')
    throw new Error('TASK_DUE_REGRESSION_PAST_SESSION');
  const late=aplicarReglaVencimientoTareaConAhora_({
    fechaSiguienteSesion:'2026-09-15',horaInicioSiguienteSesion:'07:00',
    fechaLimite:'2026-09-14',horaLimite:'13:59'
  },ahora);
  if(late.backfillSinVencimiento!==true||late.vencimientoOmitidoMotivo!=='VENCIMIENTO_TRANSCURRIDO')
    throw new Error('TASK_DUE_REGRESSION_PAST_DUE');
  const partial=aplicarReglaVencimientoTareaConAhora_({fechaSiguienteSesion:'2026-09-15'},ahora);
  if(partial.backfillSinVencimiento!==true)throw new Error('TASK_DUE_REGRESSION_PARTIAL_CONTEXT');
  const noFuture=aplicarReglaVencimientoTareaConAhora_({
    fechaSiguienteSesion:'2026-09-15',horaInicioSiguienteSesion:'07:00',
    fechaLimite:'2026-09-15',horaLimite:'07:10'
  },ahora);
  if(noFuture.vencimientoOmitidoMotivo!=='VENCIMIENTO_POSTERIOR_A_CLASE')
    throw new Error('TASK_DUE_REGRESSION_PAST_CEILING');
  return {ok:true,tipo:'TAREA',vencimiento:'NEXT_SESSION_START_IF_FUTURE_ELSE_NONE',timezone:'America/Mexico_City'};
}
