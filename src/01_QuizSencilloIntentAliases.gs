/**
 * ALIASES CANÓNICOS DE INTENCIÓN — QUIZ SENCILLO
 *
 * Estas expresiones del docente son equivalentes y deben resolverse al mismo
 * tipo de recurso y al mismo entrypoint canónico. No crean pipelines paralelos.
 * La creación real permanece en crearQuizSencillo(params).
 */
const QUIZ_SENCILLO_INTENT = Object.freeze({
  TYPE: 'QUIZ_SENCILLO',
  ENTRYPOINT: 'crearQuizSencillo',
  ALIASES: Object.freeze([
    'QUIZ SENCILLO',
    'QUIZ SIMPLE',
    'QUIZ DE ASISTENCIA'
  ])
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
  if (QUIZ_SENCILLO_INTENT.ALIASES.indexOf(normalized) !== -1) {
    return {
      tipo: QUIZ_SENCILLO_INTENT.TYPE,
      entrypoint: QUIZ_SENCILLO_INTENT.ENTRYPOINT,
      alias: normalized
    };
  }
  return null;
}

function validarAliasesQuizSencilloCanonicos_() {
  ['Quiz Sencillo', 'Quiz Simple', 'Quiz de Asistencia'].forEach(function(alias) {
    const resolved = resolverIntentoRecursoCanonico_(alias);
    if (!resolved || resolved.tipo !== 'QUIZ_SENCILLO' || resolved.entrypoint !== 'crearQuizSencillo') {
      throw new Error('Alias de QUIZ SENCILLO no resuelto correctamente: ' + alias);
    }
  });

  if (resolverIntentoRecursoCanonico_('Quiz') !== null) {
    throw new Error('"Quiz" a secas no debe resolverse como QUIZ SENCILLO.');
  }

  return {
    ok: true,
    tipo: QUIZ_SENCILLO_INTENT.TYPE,
    entrypoint: QUIZ_SENCILLO_INTENT.ENTRYPOINT,
    aliases: QUIZ_SENCILLO_INTENT.ALIASES.slice()
  };
}
