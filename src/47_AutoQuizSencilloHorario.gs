/**
 * AUTOMATIZACIÓN HORARIA CANÓNICA — QUIZ SENCILLO / QUIZ DE ASISTENCIA
 *
 * El monitor operativo corre cada minuto, pero esta operación toma como máximo
 * una decisión por hora natural y solo durante los primeros minutos de la hora.
 * En cada slot:
 * 1) resuelve la clase activa exclusivamente desde Classroom Calendar;
 * 2) si no hay clase activa, no hace nada;
 * 3) si el curso activo tiene cualquier Quiz N en DRAFT, no crea otro;
 * 4) si no existe Quiz N en DRAFT, crea el siguiente Quiz Sencillo canónico.
 *
 * Un Quiz N en DRAFT significa que el docente todavía no lo ha usado. Publicarlo
 * o eliminarlo habilita la generación automática, pero únicamente en el siguiente
 * slot horario; nunca se crean dos quizzes automáticos dentro de la misma hora.
 */
const AUTO_SIMPLE_QUIZ_HOURLY_POLICY = Object.freeze({
  ENABLED: true,
  TIMEZONE: 'America/Mexico_City',
  SOURCE: 'CLASSROOM_COURSE_CALENDAR',
  SLOT_MODE: 'NATURAL_HOUR',
  DECISION_WINDOW_MINUTES: 5,
  MAX_ONE_DECISION_PER_SLOT: true,
  NO_ACTIVE_CLASS: 'SKIP',
  DRAFT_BLOCK_MODE: 'REUSE_NEXT_CONSECUTIVE_DRAFT',
  DRAFT_TITLE_PATTERN: '^Quiz\\s+(\\d+)$',
  LAST_SLOT_PROPERTY: 'AUTO_SIMPLE_QUIZ_HOURLY_LAST_SLOT_V1',
  LAST_RESULT_PROPERTY: 'AUTO_SIMPLE_QUIZ_HOURLY_LAST_RESULT_V1'
});

function procesarAutoQuizSencilloHorario_() {
  const policy = AUTO_SIMPLE_QUIZ_HOURLY_POLICY;
  validarPoliticaAutoQuizSencilloHorario_(policy);
  if (policy.ENABLED !== true) return {procesado:false,motivo:'DESACTIVADO'};

  const ahora = new Date();
  const slot = resolverSlotAutoQuizSencilloHorario_(ahora, policy);
  if (!slot.enVentana) {
    return {
      procesado:false,
      motivo:'FUERA_VENTANA_HORARIA',
      slot:slot.id,
      minutoLocal:slot.minutoLocal
    };
  }

  const props = PropertiesService.getScriptProperties();
  const userLock = LockService.getUserLock();
  if (!userLock.tryLock(5000)) return {procesado:false,motivo:'LOCK_SLOT',slot:slot.id};
  try {
    const ultimoSlot = String(props.getProperty(policy.LAST_SLOT_PROPERTY) || '');
    if (ultimoSlot === slot.id) {
      const previo = leerResultadoAutoQuizHorario_(props, policy);
      return Object.assign({}, previo || {procesado:false,motivo:'SLOT_YA_PROCESADO'}, {
        slot:slot.id,
        reutilizado:true
      });
    }
    props.setProperty(policy.LAST_SLOT_PROPERTY, slot.id);
    props.setProperty(policy.LAST_RESULT_PROPERTY, JSON.stringify({
      procesado:false,
      estado:'PROCESANDO',
      slot:slot.id,
      iniciadoEn:new Date().toISOString()
    }));
  } finally {
    userLock.releaseLock();
  }

  try {
    let clase;
    try {
      clase = resolverClaseActivaQuizAsistencia_(ahora);
    } catch (errClase) {
      const msgClase = mensajeErrorOperacion_(errClase);
      if (/QUIZ_ASISTENCIA_SIN_CLASE_ACTIVA/.test(msgClase)) {
        const sinClase = {
          procesado:false,
          estado:'SIN_CLASE_ACTIVA',
          motivo:'SIN_CLASE_ACTIVA',
          slot:slot.id,
          solicitadoEnLocal:slot.solicitadoEnLocal,
          source:policy.SOURCE
        };
        guardarResultadoAutoQuizHorario_(props, policy, sinClase);
        return sinClase;
      }
      throw errClase;
    }

    // El motor único compara último Quiz PUBLISHED con el siguiente borrador.
    // No se consultan planeación, examen ni unidad para generar asistencia.
    const requestId = 'AUTO_HOURLY|' + slot.id + '|' +
      String(clase.courseId || '') + '|' + String(clase.eventId || '');
    const creado = crearQuizAsistencia({
      courseId: clase.courseId,
      solicitadoEnLocal: slot.solicitadoEnLocal,
      requestId: requestId
    });
    if (String(creado && creado.state || '').toUpperCase() !== 'DRAFT') {
      throw new Error('AUTO_QUIZ_HORARIO_ESTADO_INVALIDO: el Quiz Sencillo generado no quedó DRAFT.');
    }

    const resultado = {
      procesado:true,
      estado:creado.reutilizado===true?'REUTILIZADO':'GENERADO',
      slot:slot.id,
      solicitadoEnLocal:slot.solicitadoEnLocal,
      courseId:String(clase.courseId || ''),
      courseName:String(clase.courseName || ''),
      eventId:String(clase.eventId || ''),
      eventTitle:String(clase.eventTitle || ''),
      resueltoPor:'CLASSROOM_LAST_PUBLISHED_QUIZ',
      workId:String(creado.workId || ''),
      title:String(creado.title || ''),
      state:String(creado.state || ''),
      unidad:String(creado.unidad || ''),
      fechaLimiteLocal:String(creado.fechaLimiteLocal || ''),
      horaLimiteLocal:String(creado.horaLimiteLocal || ''),
      requestId:requestId
    };
    guardarResultadoAutoQuizHorario_(props, policy, resultado);
    return resultado;
  } catch (err) {
    const fallo = {
      procesado:false,
      estado:'ERROR',
      motivo:'ERROR',
      slot:slot.id,
      solicitadoEnLocal:slot.solicitadoEnLocal,
      error:mensajeErrorOperacion_(err)
    };
    guardarResultadoAutoQuizHorario_(props, policy, fallo);
    throw err;
  }
}

/** Vincula el evento real a UNA sesión oficial, sin alterar la planeación. */
function resolverTemaCanonicoAutoQuizHorario_(clase) {
  const c = clase && typeof clase === 'object' ? clase : {};
  const courseName = String(c.courseName || '').trim();
  const calendarId = String(c.calendarId || '').trim();
  const eventId = String(c.eventId || '').trim();
  const start = new Date(String(c.inicio || ''));
  if (!courseName || !calendarId || !eventId || !Number.isFinite(start.getTime())) {
    throw new Error('AUTO_QUIZ_CONTEXT_INVALIDO: faltan curso, evento o fecha verificable.');
  }
  const evento = Calendar.Events.get(calendarId, eventId);
  const fecha = Utilities.formatDate(start, AUTO_SIMPLE_QUIZ_HOURLY_POLICY.TIMEZONE, 'dd/MM/yyyy');
  const plan = leerPlaneacionSiguienteClase_(courseName);
  const filas = plan.rows.filter(function(row) {
    const valor = String(row.date || '').trim();
    if (valor === fecha) return true;
    // La planeación ITQ SO conserva fechas históricas MM/DD sin año.
    // El año procede exclusivamente del evento real de Calendar; no se infiere.
    if (!/sistemas operativos/i.test(courseName)) return false;
    const md = valor.match(/^(\d{1,2})\/(\d{1,2})$/);
    const dmy = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return Boolean(md && dmy &&
      Number(md[1]) === Number(dmy[2]) && Number(md[2]) === Number(dmy[1]));
  });
  if (filas.length !== 1) throw new Error('AUTO_QUIZ_PLANEACION_AMBIGUA: '+courseName+' '+fecha+' tiene '+filas.length+' sesiones; no se genera Quiz.');
  const fila = filas[0];
  // Si el calendario expone el número de clase, verificarlo también. Los
  // eventos históricos pueden tener campos aplanados en una sola línea.
  const numeroEvento = String(evento.description || '').match(/(?:^|\\n)\\s*Clase:\\s*(\\d+)\\b/i);
  if (numeroEvento && Number(numeroEvento[1]) !== Number(fila.session)) {
    throw new Error('AUTO_QUIZ_SESION_NO_COINCIDE: Calendar indica '+numeroEvento[1]+' y la planeación '+fila.session+'.');
  }
  const temaSubtema = String(fila.topic || '').trim();
  if (!temaSubtema || !Number.isInteger(Number(fila.session))) {
    throw new Error('AUTO_QUIZ_TEMA_CANONICO_FALTANTE: '+courseName+' '+fecha+'.');
  }
  const unidadCalendario = String(c.unidad || '').match(/\\b(\\d+)\\b/);
  const unidadPlaneacion = String(fila.unit || '').match(/\\b(\\d+)\\b/);
  if (unidadCalendario && unidadPlaneacion && unidadCalendario[1] !== unidadPlaneacion[1]) {
    throw new Error('AUTO_QUIZ_UNIDAD_NO_COINCIDE: Calendar y planeación discrepan en '+fecha+'.');
  }
  return {sesion:Number(fila.session),temaSubtema:temaSubtema,fecha:fecha,temaCalendar:String(c.temaSubtema || '')};
}

function esUnidadSinQuizHorario_(mensaje) {
  return /^(?:QUIZ_UNIDAD_CERRADA|QUIZ_SIN_UNIDAD_ABIERTA):/.test(String(mensaje||''));
}

function procesarAutoQuizSencilloHorarioSeguro_() {
  try {
    return procesarAutoQuizSencilloHorario_();
  } catch (err) {
    try {
      if (!errorAcademicoYaNotificadoEnEstaEjecucion_(err)) {
      notificarErrorScript_('AUTO_QUIZ_SENCILLO_HORARIO', err, {
        source:AUTO_SIMPLE_QUIZ_HOURLY_POLICY.SOURCE,
        slot:String(PropertiesService.getScriptProperties().getProperty(AUTO_SIMPLE_QUIZ_HOURLY_POLICY.LAST_SLOT_PROPERTY) || '')
      });
      marcarErrorAcademicoNotificadoEnEstaEjecucion_(err);
      }
    } catch (notifyErr) {
      console.error('No fue posible notificar error de Auto Quiz Horario: ' + mensajeErrorOperacion_(notifyErr));
    }
    console.error('Auto Quiz Sencillo Horario: ' + mensajeErrorOperacion_(err));
    return {procesado:false,motivo:'ERROR',error:mensajeErrorOperacion_(err)};
  }
}

function resolverSlotAutoQuizSencilloHorario_(ahora, policy) {
  const instant = ahora instanceof Date ? new Date(ahora.getTime()) : new Date(ahora);
  if (!Number.isFinite(instant.getTime())) throw new Error('AUTO_QUIZ_HORARIO_INSTANTE_INVALIDO.');
  const fecha = Utilities.formatDate(instant, policy.TIMEZONE, 'yyyy-MM-dd');
  const hora = Utilities.formatDate(instant, policy.TIMEZONE, 'HH');
  const minuto = Number(Utilities.formatDate(instant, policy.TIMEZONE, 'mm'));
  return {
    id:fecha + 'T' + hora + ':00',
    fechaLocal:fecha,
    horaLocal:hora + ':00',
    minutoLocal:minuto,
    enVentana:minuto >= 0 && minuto < Number(policy.DECISION_WINDOW_MINUTES),
    solicitadoEnLocal:Utilities.formatDate(instant, policy.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
  };
}

function listarQuizSencilloDraftsCurso_(courseId, policy) {
  const id = String(courseId || '').trim();
  if (!id) throw new Error('AUTO_QUIZ_HORARIO_REQUIERE_COURSE_ID.');
  const re = new RegExp(policy.DRAFT_TITLE_PATTERN, 'i');
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.CourseWork.list(id, {
      pageSize:100,
      pageToken:token,
      courseWorkStates:['DRAFT']
    });
    (page.courseWork || []).forEach(function(work) {
      const title = String(work.title || '').trim();
      const match = title.match(re);
      if (!match) return;
      out.push({
        workId:String(work.id || ''),
        title:title,
        numero:Number(match[1]),
        state:String(work.state || ''),
        topicId:String(work.topicId || ''),
        creationTime:String(work.creationTime || '')
      });
    });
    token = page.nextPageToken;
  } while (token);
  out.sort(function(a,b) {
    if (b.numero !== a.numero) return b.numero - a.numero;
    return (Date.parse(b.creationTime || '') || 0) - (Date.parse(a.creationTime || '') || 0);
  });
  return out;
}

function guardarResultadoAutoQuizHorario_(props, policy, result) {
  props.setProperty(policy.LAST_RESULT_PROPERTY, JSON.stringify(result || {}));
  return result;
}

function leerResultadoAutoQuizHorario_(props, policy) {
  const raw = String(props.getProperty(policy.LAST_RESULT_PROPERTY) || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (err) { return {procesado:false,motivo:'RESULTADO_ILEGIBLE',raw:raw}; }
}

/** Diagnóstico de una sesión histórica sin crear Quiz ni alterar slots. */
function verificarCorreccionAutoQuizHorario(params) {
  const p=params&&typeof params==='object'?params:{};
  const courseId=String(p.courseId||'').trim();
  if(!/^\d+$/.test(courseId))throw new Error('DIAG_AUTO_QUIZ_REQUIERE_CURSO');
  const course=Classroom.Courses.get(courseId);
  if(String(course.courseState||'')!=='ACTIVE')
    throw new Error('DIAG_AUTO_QUIZ_CURSO_NO_ACTIVO');
  const next=resolverConsecutivoQuizAsistencia_(courseId);
  return {ok:true,writes:false,quizCreated:false,courseId:courseId,
    nextTitle:next.title,existingDraftId:next.existing?next.existing.id:null,
    source:'LAST_PUBLISHED_QUIZ'};
}

function diagnosticarAutoQuizSencilloHorario() {
  const p = AUTO_SIMPLE_QUIZ_HOURLY_POLICY;
  validarPoliticaAutoQuizSencilloHorario_(p);
  const ahora = new Date();
  const slot = resolverSlotAutoQuizSencilloHorario_(ahora, p);
  const props = PropertiesService.getScriptProperties();
  let clase = null;
  let drafts = [];
  let motivo = '';
  try {
    clase = resolverClaseActivaQuizAsistencia_(ahora);
    drafts = listarQuizSencilloDraftsCurso_(clase.courseId, p);
  } catch (err) {
    motivo = mensajeErrorOperacion_(err);
  }
  return {
    ok:true,
    enabled:p.ENABLED,
    slot:slot,
    claseActiva:clase,
    draftQuizCount:drafts.length,
    drafts:drafts,
    motivo:motivo,
    lastSlot:String(props.getProperty(p.LAST_SLOT_PROPERTY) || ''),
    lastResult:leerResultadoAutoQuizHorario_(props, p)
  };
}

function validarPoliticaAutoQuizSencilloHorario_(policy) {
  if (!policy || policy.ENABLED !== true || policy.TIMEZONE !== 'America/Mexico_City' ||
      policy.SOURCE !== 'CLASSROOM_COURSE_CALENDAR' || policy.SLOT_MODE !== 'NATURAL_HOUR' ||
      Number(policy.DECISION_WINDOW_MINUTES) !== 5 || policy.MAX_ONE_DECISION_PER_SLOT !== true ||
      policy.NO_ACTIVE_CLASS !== 'SKIP' ||
      policy.DRAFT_BLOCK_MODE !== 'REUSE_NEXT_CONSECUTIVE_DRAFT' ||
      policy.DRAFT_TITLE_PATTERN !== '^Quiz\\s+(\\d+)$') {
    throw new Error('La política de automatización horaria del Quiz Sencillo fue debilitada.');
  }
  return true;
}

function validarAutoQuizSencilloHorarioCanonico() {
  const p = AUTO_SIMPLE_QUIZ_HOURLY_POLICY;
  validarPoliticaAutoQuizSencilloHorario_(p);
  const a = resolverSlotAutoQuizSencilloHorario_(new Date('2026-09-17T07:00:00-06:00'), p);
  if (a.id !== '2026-09-17T07:00' || a.enVentana !== true) throw new Error('Regresión: 07:00 debe abrir el slot 07:00.');
  const b = resolverSlotAutoQuizSencilloHorario_(new Date('2026-09-17T07:04:59-06:00'), p);
  if (b.enVentana !== true) throw new Error('Regresión: 07:04 debe permanecer dentro de la ventana horaria.');
  const c = resolverSlotAutoQuizSencilloHorario_(new Date('2026-09-17T07:05:00-06:00'), p);
  if (c.enVentana !== false) throw new Error('Regresión: 07:05 debe quedar fuera de la ventana horaria.');
  const re = new RegExp(p.DRAFT_TITLE_PATTERN, 'i');
  if (!re.test('Quiz 2') || re.test('Quiz de práctica')) throw new Error('Regresión: solo títulos canónicos Quiz N bloquean la generación horaria.');
  return {
    ok:true,
    frecuencia:'UNA_DECISION_POR_HORA_NATURAL',
    ventanaMinutos:p.DECISION_WINDOW_MINUTES,
    claseActiva:'CLASSROOM_COURSE_CALENDAR',
    draftBlock:'ANY_ACTIVE_COURSE_DRAFT_QUIZ_N',
    noActiveClass:'SKIP',
    maxPerHour:1
  };
}
