/**
 * ALIASES CANÓNICOS DE INTENCIÓN — QUIZ SENCILLO
 *
 * Quiz Sencillo y Quiz Simple crean el mismo recurso canónico cuando el contexto
 * académico ya está resuelto. Quiz de Asistencia crea ese mismo recurso, pero
 * primero debe resolver de forma obligatoria la clase activa desde los calendarios
 * reales de cursos ACTIVE de Classroom. No crea pipelines académicos paralelos.
 */
const QUIZ_SENCILLO_INTENT = Object.freeze({
  TYPE: 'QUIZ_SENCILLO',
  DEFAULT_ENTRYPOINT: 'crearQuizSencillo',
  ATTENDANCE_ENTRYPOINT: 'crearQuizDeAsistencia',
  SIMPLE_ALIASES: Object.freeze([
    'QUIZ SENCILLO',
    'QUIZ SIMPLE'
  ]),
  ATTENDANCE_ALIAS: 'QUIZ DE ASISTENCIA'
});

function normalizarIntentoRecursoCanonico_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function resolverIntentoRecursoCanonico_(value) {
  const normalized = normalizarIntentoRecursoCanonico_(value);
  if (normalized === QUIZ_SENCILLO_INTENT.ATTENDANCE_ALIAS) {
    return {
      tipo: QUIZ_SENCILLO_INTENT.TYPE,
      entrypoint: QUIZ_SENCILLO_INTENT.ATTENDANCE_ENTRYPOINT,
      alias: normalized,
      requiereClaseActiva: true,
      fuenteContexto: 'CLASSROOM_COURSE_CALENDAR'
    };
  }
  if (QUIZ_SENCILLO_INTENT.SIMPLE_ALIASES.indexOf(normalized) !== -1) {
    return {
      tipo: QUIZ_SENCILLO_INTENT.TYPE,
      entrypoint: QUIZ_SENCILLO_INTENT.DEFAULT_ENTRYPOINT,
      alias: normalized,
      requiereClaseActiva: false
    };
  }
  return null;
}

function validarAliasesQuizSencilloCanonicos_() {
  ['Quiz Sencillo', 'Quiz Simple'].forEach(function(alias) {
    const resolved = resolverIntentoRecursoCanonico_(alias);
    if (!resolved || resolved.tipo !== 'QUIZ_SENCILLO' || resolved.entrypoint !== 'crearQuizSencillo' || resolved.requiereClaseActiva !== false) {
      throw new Error('Alias de QUIZ SENCILLO no resuelto correctamente: ' + alias);
    }
  });

  const attendance = resolverIntentoRecursoCanonico_('Quiz de Asistencia');
  if (!attendance || attendance.tipo !== 'QUIZ_SENCILLO' || attendance.entrypoint !== 'crearQuizDeAsistencia' ||
      attendance.requiereClaseActiva !== true || attendance.fuenteContexto !== 'CLASSROOM_COURSE_CALENDAR') {
    throw new Error('Quiz de Asistencia debe resolverse mediante la clase activa de Classroom Calendar.');
  }

  if (resolverIntentoRecursoCanonico_('Quiz') !== null) {
    throw new Error('"Quiz" a secas no debe resolverse como QUIZ SENCILLO.');
  }

  return {
    ok: true,
    tipo: QUIZ_SENCILLO_INTENT.TYPE,
    simpleEntrypoint: QUIZ_SENCILLO_INTENT.DEFAULT_ENTRYPOINT,
    attendanceEntrypoint: QUIZ_SENCILLO_INTENT.ATTENDANCE_ENTRYPOINT,
    simpleAliases: QUIZ_SENCILLO_INTENT.SIMPLE_ALIASES.slice(),
    attendanceAlias: QUIZ_SENCILLO_INTENT.ATTENDANCE_ALIAS
  };
}
