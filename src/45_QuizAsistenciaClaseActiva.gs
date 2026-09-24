/**
 * QUIZ DE ASISTENCIA — RESOLUCIÓN CANÓNICA DE CLASE ACTIVA
 *
 * La frase "Quiz de Asistencia" no recibe materia ni courseId del docente.
 * El contexto se obtiene exclusivamente de los calendarios asociados a cursos
 * ACTIVE de Google Classroom. Debe existir exactamente una clase activa en el
 * instante de solicitud; de lo contrario la creación se bloquea.
 */
const QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY = Object.freeze({
  TIMEZONE: 'America/Mexico_City',
  SOURCE: 'CLASSROOM_COURSE_CALENDAR',
  COURSE_STATE: 'ACTIVE',
  REQUIRE_EXACTLY_ONE_ACTIVE_CLASS: true,
  REQUIRE_TIMED_EVENT: true,
  REQUIRE_AULA_IN_SUMMARY: true,
  REQUIRE_TEMA_SUBTEMA_IN_DESCRIPTION: true,
  ACTIVE_INTERVAL: '[START,END)',
  SEARCH_WINDOW_HOURS: 12,
  MAX_EVENTS_PER_PAGE: 100
});

function crearQuizDeAsistencia() {
  const ahora = new Date();
  let clase;
  try {
    clase = resolverClaseActivaQuizAsistencia_(ahora);
  } catch (err) {
    try {
      notificarErrorScript_('CREAR_QUIZ_ASISTENCIA', err, {
        fuente: QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.SOURCE,
        solicitadoEnLocal: Utilities.formatDate(ahora, QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
      });
    } catch (notifyErr) {
      console.error('No fue posible notificar bloqueo de Quiz de Asistencia: ' + mensajeErrorOperacion_(notifyErr));
    }
    throw err;
  }

  const solicitadoEnLocal = Utilities.formatDate(
    ahora,
    QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.TIMEZONE,
    'yyyy-MM-dd HH:mm:ss'
  );

  const result = crearQuizAsistencia({
    courseId: clase.courseId,
    solicitadoEnLocal: solicitadoEnLocal,
    requestId: 'ATTENDANCE|' + String(clase.courseId) + '|' + String(clase.eventId) +
      '|' + solicitadoEnLocal
  });
  return Object.assign({}, result, {
    resueltoPor: QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.SOURCE,
    claseActiva: {
      courseId: clase.courseId,
      courseName: clase.courseName,
      calendarId: clase.calendarId,
      eventId: clase.eventId,
      eventTitle: clase.eventTitle,
      inicio: clase.inicio,
      fin: clase.fin,
      unidad: clase.unidad,
      temaSubtema: clase.temaSubtema
    }
  });
}

function resolverClaseActivaQuizAsistencia_(ahora) {
  validarPoliticaQuizAsistenciaClaseActiva_(QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY);
  const instant = ahora instanceof Date ? new Date(ahora.getTime()) : new Date(ahora);
  if (!Number.isFinite(instant.getTime())) throw new Error('QUIZ_ASISTENCIA_INSTANTE_INVALIDO.');

  const cursos = listarCursosActivosQuizAsistencia_();
  const validas = [];

  cursos.forEach(function(course) {
    const calendarId = resolverCalendarIdCurso_(course);
    if (!calendarId) return;
    const eventos = listarEventosCercanosQuizAsistencia_(calendarId, instant);
    eventos.forEach(function(evento) {
      if (!eventoEstaActivoEnInstante_(evento, instant)) return;
      if (!eventoPareceClaseCanonica_(evento)) return;

      const temaSubtema = extraerCampoDescripcionClase_(evento.description, 'Tema/Subtema');
      const unidad = extraerCampoDescripcionClase_(evento.description, 'Unidad');
      const base = {
        courseId: String(course.id || ''),
        courseName: String(course.name || ''),
        calendarId: calendarId,
        eventId: String(evento.id || ''),
        eventTitle: String(evento.summary || ''),
        inicio: String(evento.start && evento.start.dateTime || ''),
        fin: String(evento.end && evento.end.dateTime || ''),
        unidad: unidad,
        temaSubtema: temaSubtema
      };

      if (!temaSubtema) {
        clasesSinTema.push(base);
        return;
      }
      validas.push(base);
    });
  });

  if (validas.length === 0) {
    throw new Error('QUIZ_ASISTENCIA_SIN_CLASE_ACTIVA: no existe una clase canónica activa en este momento. No se genera el quiz.');
  }

  if (validas.length !== 1) {
    const nombres = validas.map(function(x) { return x.courseName + ' [' + x.eventTitle + ']'; }).join(' | ');
    throw new Error('QUIZ_ASISTENCIA_CLASE_AMBIGUA: se encontraron ' + validas.length + ' clases activas simultáneas (' + nombres + '). No se genera el quiz.');
  }

  return validas[0];
}

function listarCursosActivosQuizAsistencia_() {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.list({
      pageSize: 100,
      pageToken: token,
      courseStates: [QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.COURSE_STATE]
    });
    (page.courses || []).forEach(function(course) { out.push(course); });
    token = page.nextPageToken;
  } while (token);
  return out;
}

function resolverCalendarIdCurso_(course) {
  let id = String(course && course.calendarId || '').trim();
  if (id) return id;
  const courseId = String(course && course.id || '').trim();
  if (!courseId) return '';
  const full = Classroom.Courses.get(courseId);
  return String(full && full.calendarId || '').trim();
}

function listarEventosCercanosQuizAsistencia_(calendarId, ahora) {
  const p = QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY;
  const span = Number(p.SEARCH_WINDOW_HOURS) * 60 * 60 * 1000;
  const desde = new Date(ahora.getTime() - span);
  const hasta = new Date(ahora.getTime() + span);
  let token;
  const out = [];
  do {
    const page = Calendar.Events.list(calendarId, {
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: p.MAX_EVENTS_PER_PAGE,
      pageToken: token
    });
    (page.items || []).forEach(function(evento) { out.push(evento); });
    token = page.nextPageToken;
  } while (token);
  return out;
}

function eventoEstaActivoEnInstante_(evento, ahora) {
  if (!evento || String(evento.status || 'confirmed').toLowerCase() === 'cancelled') return false;
  const startRaw = String(evento.start && evento.start.dateTime || '').trim();
  const endRaw = String(evento.end && evento.end.dateTime || '').trim();
  if (!startRaw || !endRaw) return false;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) return false;
  const now = ahora.getTime();
  return start.getTime() <= now && now < end.getTime();
}

function eventoPareceClaseCanonica_(evento) {
  const summary = normalizarTextoQuizAsistencia_(evento && evento.summary);
  if (!summary || summary.indexOf('aula') < 0) return false;
  const startRaw = String(evento && evento.start && evento.start.dateTime || '').trim();
  const endRaw = String(evento && evento.end && evento.end.dateTime || '').trim();
  return !!startRaw && !!endRaw;
}

function extraerCampoDescripcionClase_(description, field) {
  const wanted = normalizarTextoQuizAsistencia_(field).replace(/\s+/g, '');
  const lines = String(description || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const clean = String(lines[i] || '')
      .replace(/\*\*/g, '')
      .replace(/^\s*[•*\-]\s*/, '')
      .trim();
    const idx = clean.indexOf(':');
    if (idx < 0) continue;
    const key = normalizarTextoQuizAsistencia_(clean.slice(0, idx)).replace(/\s+/g, '');
    if (key === wanted) return clean.slice(idx + 1).trim();
  }
  return '';
}

function normalizarTextoQuizAsistencia_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function validarPoliticaQuizAsistenciaClaseActiva_(policy) {
  if (!policy || policy.TIMEZONE !== 'America/Mexico_City' ||
      policy.SOURCE !== 'CLASSROOM_COURSE_CALENDAR' || policy.COURSE_STATE !== 'ACTIVE' ||
      policy.REQUIRE_EXACTLY_ONE_ACTIVE_CLASS !== true || policy.REQUIRE_TIMED_EVENT !== true ||
      policy.REQUIRE_AULA_IN_SUMMARY !== true || policy.REQUIRE_TEMA_SUBTEMA_IN_DESCRIPTION !== true ||
      policy.ACTIVE_INTERVAL !== '[START,END)' || Number(policy.SEARCH_WINDOW_HOURS) !== 12) {
    throw new Error('La política de Quiz de Asistencia con clase activa fue debilitada.');
  }
  return true;
}

function diagnosticarQuizAsistenciaClaseActiva() {
  const ahora = new Date();
  try {
    const clase = resolverClaseActivaQuizAsistencia_(ahora);
    return {
      ok: true,
      claseActiva: true,
      solicitadoEnLocal: Utilities.formatDate(ahora, QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      source: QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.SOURCE,
      clase: clase
    };
  } catch (err) {
    const msg = mensajeErrorOperacion_(err);
    if (/QUIZ_ASISTENCIA_SIN_CLASE_ACTIVA/.test(msg)) {
      return {
        ok: true,
        claseActiva: false,
        solicitadoEnLocal: Utilities.formatDate(ahora, QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
        source: QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.SOURCE,
        motivo: msg
      };
    }
    throw err;
  }
}

function validarQuizAsistenciaClaseActivaCanonica() {
  validarPoliticaQuizAsistenciaClaseActiva_(QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY);
  const evento = {
    status: 'confirmed',
    summary: 'UAQ | Sistemas Distribuidos | Aula A22',
    description: 'Unidad: Unidad 2\nTema/Subtema: 2.2.4 Mensajes de requerimiento HTTP',
    start: {dateTime: '2026-09-17T11:00:00-06:00'},
    end: {dateTime: '2026-09-17T13:00:00-06:00'}
  };
  if (!eventoEstaActivoEnInstante_(evento, new Date('2026-09-17T12:31:00-06:00'))) {
    throw new Error('Regresión: 12:31 debe estar dentro de la clase 11:00–13:00.');
  }
  if (eventoEstaActivoEnInstante_(evento, new Date('2026-09-17T13:00:00-06:00'))) {
    throw new Error('Regresión: el instante exacto de fin no debe considerarse clase activa.');
  }
  if (!eventoPareceClaseCanonica_(evento)) throw new Error('Regresión: el evento canónico con aula debe reconocerse como clase.');
  if (extraerCampoDescripcionClase_(evento.description, 'Tema/Subtema') !== '2.2.4 Mensajes de requerimiento HTTP') {
    throw new Error('Regresión: no se extrajo Tema/Subtema del evento canónico.');
  }
  return {
    ok: true,
    source: QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.SOURCE,
    activeInterval: QUIZ_ASISTENCIA_ACTIVE_CLASS_POLICY.ACTIVE_INTERVAL,
    noActiveClass: 'BLOCK',
    ambiguousClass: 'BLOCK',
    missingTopic: 'BLOCK'
  };
}
