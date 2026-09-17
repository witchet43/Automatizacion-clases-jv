/**
 * Guardrails canónicos del Documento Maestro.
 * Toda operación de generación debe ejecutar preflight antes de mutar recursos
 * y postflight después de crear/actualizar recursos.
 */
const MASTER_GUARDRAILS = Object.freeze({
  MASTER_DOCUMENT_ID: '1lH7ME10VRX472PP54BdeE9evRbbjAUYowov3-slM5v8',
  PLANNING_SPREADSHEET_ID: '1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI',
  PLANNING_SHEET: 'Planeación maestra',
  PLANNING_SOURCES: Object.freeze({
    'itq - sistemas operativos': Object.freeze({spreadsheetId:'1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI', preferredSheet:'Planeación maestra'}),
    'sistemas operativos': Object.freeze({spreadsheetId:'1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI', preferredSheet:'Planeación maestra'}),
    'uaq - sistemas distribuidos': Object.freeze({spreadsheetId:'11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I', preferredSheet:'Planeación'}),
    'sistemas distribuidos': Object.freeze({spreadsheetId:'11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I', preferredSheet:'Planeación'}),
    'uaq - administracion': Object.freeze({spreadsheetId:'1G1MTtP9dRN8fM7vG7uOQoHkjbK2uOEoca3Aa2SxJqr4', preferredSheet:'Planeación'}),
    'administracion': Object.freeze({spreadsheetId:'1G1MTtP9dRN8fM7vG7uOQoHkjbK2uOEoca3Aa2SxJqr4', preferredSheet:'Planeación'}),
    'uaq - algoritmos y estructuras de datos': Object.freeze({spreadsheetId:'1Ujb02-K9k9xkEu7rPMsdV2v3E8MIFAUyP-yAmAwZwWc', preferredSheet:'Planeación'}),
    'algoritmos y estructuras de datos': Object.freeze({spreadsheetId:'1Ujb02-K9k9xkEu7rPMsdV2v3E8MIFAUyP-yAmAwZwWc', preferredSheet:'Planeación'}),
    'uaq - analisis y diseno de sistemas computacionales': Object.freeze({spreadsheetId:'1a7Icsnxciy2cK9xHOEBWBt_RbE0v9sM8ioRCfp95YAA', preferredSheet:'Planeación'}),
    'analisis y diseno de sistemas computacionales': Object.freeze({spreadsheetId:'1a7Icsnxciy2cK9xHOEBWBt_RbE0v9sM8ioRCfp95YAA', preferredSheet:'Planeación'}),
    'uaq - etica y legislacion informatica': Object.freeze({spreadsheetId:'16XoGCp7vPMD5dgvhMgQz_MUDfSvgLPrs9KfXKXwU-bQ', preferredSheet:'Planeación'}),
    'etica y legislacion informatica': Object.freeze({spreadsheetId:'16XoGCp7vPMD5dgvhMgQz_MUDfSvgLPrs9KfXKXwU-bQ', preferredSheet:'Planeación'}),
    'uaq - introduccion a las tecnologias de informacion': Object.freeze({spreadsheetId:'1j8_Qq0esbBhYOIqbkU9DywV-Zl3l-FW71KlKNRW8aS0', preferredSheet:'Planeación'}),
    'introduccion a las tecnologias de informacion': Object.freeze({spreadsheetId:'1j8_Qq0esbBhYOIqbkU9DywV-Zl3l-FW71KlKNRW8aS0', preferredSheet:'Planeación'}),
    'uaq - topico i': Object.freeze({spreadsheetId:'1Q-aVBDOli2ccjR3hgyZcpnXF5Uo6Nlh3yfW8Y7sEs5M', preferredSheet:'Planeación'}),
    'topico i': Object.freeze({spreadsheetId:'1Q-aVBDOli2ccjR3hgyZcpnXF5Uo6Nlh3yfW8Y7sEs5M', preferredSheet:'Planeación'})
  }),
  DEFAULT_STATE: 'DRAFT',
  DEFAULT_ROOM: 'LCF',
  REQUIRED_PACKAGE: ['unidad','temaSubtema','tareaPrevia','actividadEnClaseOPractica','tareaSiguiente']
});

function preflightDocumentoMaestro(request) {
  const r = request && typeof request === 'object' ? request : {};
  const materia = requiredGuard_(r.materia, 'materia');
  const tema = requiredGuard_(r.temaSubtema, 'temaSubtema');
  const operation = String(r.operation || 'GENERATE_CLASS').trim().toUpperCase();

  if (r.modifyPlanning === true && r.explicitPlanningAuthorization !== true) {
    throw new Error('BLOCKED_MASTER_RULE: la planeación no puede modificarse sin autorización explícita.');
  }
  if (r.resourceState && String(r.resourceState).toUpperCase() !== MASTER_GUARDRAILS.DEFAULT_STATE) {
    throw new Error('BLOCKED_MASTER_RULE: Classroom/Forms debe crearse en DRAFT.');
  }

  const planning = loadCanonicalPlanning_(materia);
  if (!planning.length) throw new Error('BLOCKED_MASTER_RULE: no se encontró planeación canónica para ' + materia + '.');

  const targetKey = canonicalTopicKey_(tema);
  const targetIndex = planning.findIndex(function(x) { return canonicalTopicKey_(x.tema) === targetKey; });
  if (targetIndex < 0) throw new Error('BLOCKED_MASTER_RULE: el tema solicitado no existe en la planeación canónica: ' + tema + '.');

  const expected = firstPendingCanonical_(planning, r.completedTopics || []);
  if (operation === 'GENERATE_CLASS' && expected && targetIndex !== expected.index && r.allowCanonicalOverride !== true) {
    throw new Error('BLOCKED_CANONICAL_SEQUENCE: siguiente tema permitido = ' + expected.tema + '; solicitado = ' + planning[targetIndex].tema + '.');
  }

  if (operation === 'GENERATE_CLASS') validateClassPackageRequest_(r);

  return {
    ok: true,
    preflight: 'MASTER_GUARDRAILS',
    materia: materia,
    target: planning[targetIndex],
    canonicalNext: expected ? expected.tema : null,
    resourceState: MASTER_GUARDRAILS.DEFAULT_STATE,
    room: MASTER_GUARDRAILS.DEFAULT_ROOM,
    modifyPlanning: false
  };
}

function postflightDocumentoMaestro(result, request) {
  const r = request && typeof request === 'object' ? request : {};
  const x = result && typeof result === 'object' ? result : {};
  if (x.ok === false) throw new Error('POSTFLIGHT_FAILED: la operación devolvió ok=false.');
  if (x.state && String(x.state).toUpperCase() !== MASTER_GUARDRAILS.DEFAULT_STATE) {
    throw new Error('POSTFLIGHT_FAILED: recurso creado fuera de DRAFT.');
  }
  if (r.modifyPlanning === true && r.explicitPlanningAuthorization !== true) {
    throw new Error('POSTFLIGHT_FAILED: se intentó modificar planeación sin autorización.');
  }
  return {
    ok: true,
    postflight: 'MASTER_GUARDRAILS',
    materia: String(r.materia || ''),
    temaSubtema: String(r.temaSubtema || ''),
    stateVerified: !x.state || String(x.state).toUpperCase() === MASTER_GUARDRAILS.DEFAULT_STATE
  };
}

function validarPaqueteClaseContraMaestro(request) {
  const preflight = preflightDocumentoMaestro(request);
  return {
    ok: true,
    preflight: preflight,
    requiredPackage: MASTER_GUARDRAILS.REQUIRED_PACKAGE.slice(),
    message: 'Paquete validado: Gamma por sí solo NO constituye una clase completa.'
  };
}

function validateClassPackageRequest_(r) {
  const missing = MASTER_GUARDRAILS.REQUIRED_PACKAGE.filter(function(k) {
    return !String(r[k] == null ? '' : r[k]).trim();
  });
  if (missing.length) {
    throw new Error('BLOCKED_INCOMPLETE_CLASS_PACKAGE: faltan ' + missing.join(', ') + '. Gamma por sí solo no completa la clase.');
  }
}

function resolvePlanningSource_(materia) {
  const key = normalizeGuard_(materia);
  const source = MASTER_GUARDRAILS.PLANNING_SOURCES[key];
  if (!source) {
    throw new Error('BLOCKED_MASTER_RULE: no existe una fuente de planeación canónica configurada para ' + materia + '.');
  }
  return source;
}

function loadCanonicalPlanning_(materia) {
  const source = resolvePlanningSource_(materia);
  const ss = SpreadsheetApp.openById(source.spreadsheetId);
  let sheet = ss.getSheetByName(source.preferredSheet);
  if (!sheet) {
    const sheets = ss.getSheets();
    if (sheets.length === 1) sheet = sheets[0];
  }
  if (!sheet) throw new Error('No existe hoja de planeación canónica para ' + materia + '.');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  let headerIndex = -1;
  const scanLimit = Math.min(values.length, 12);
  for (let i = 0; i < scanLimit; i += 1) {
    const candidateHeaders = values[i].map(normalizeGuard_);
    if (findHeaderGuard_(candidateHeaders, ['tema / alcance','tema/alcance','tema / subtema','tema/subtema','tema','subtema']) >= 0) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) throw new Error('La planeación no contiene una fila de encabezados con Tema / alcance reconocible.');

  const headers = values[headerIndex].map(normalizeGuard_);
  const subjectCol = findHeaderGuard_(headers, ['materia','asignatura']);
  const unitCol = findHeaderGuard_(headers, ['unidad']);
  const topicCol = findHeaderGuard_(headers, ['tema / alcance','tema/alcance','tema / subtema','tema/subtema','tema','subtema']);
  const classCol = findHeaderGuard_(headers, ['clase','sesion','sesión']);
  if (topicCol < 0) throw new Error('La planeación no contiene columna Tema / alcance reconocible.');

  return values.slice(headerIndex + 1).map(function(row, i) {
    return {
      row: headerIndex + i + 2,
      clase: classCol >= 0 ? row[classCol] : '',
      materia: subjectCol >= 0 ? row[subjectCol] : materia,
      unidad: unitCol >= 0 ? row[unitCol] : '',
      tema: row[topicCol]
    };
  }).filter(function(x) {
    return x.tema && (subjectCol < 0 || normalizeGuard_(x.materia) === normalizeGuard_(materia));
  });
}

function firstPendingCanonical_(planning, completedTopics) {
  const completed = (completedTopics || []).map(canonicalTopicKey_);
  for (var i = 0; i < planning.length; i += 1) {
    if (completed.indexOf(canonicalTopicKey_(planning[i].tema)) < 0) return Object.assign({index:i}, planning[i]);
  }
  return null;
}

function findHeaderGuard_(headers, candidates) {
  const normalized = candidates.map(normalizeGuard_);
  for (var i = 0; i < headers.length; i += 1) if (normalized.indexOf(headers[i]) >= 0) return i;
  return -1;
}

function canonicalTopicKey_(value) {
  return normalizeGuard_(value)
    .replace(/^\d+(?:\.\d+)*(?:\s*[–—-]\s*|\s+)/, '')
    .replace(/^evaluacion\s+u\d+\s*[–—-]?\s*/, 'evaluacion ')
    .trim();
}

function requiredGuard_(value, name) {
  const s = String(value == null ? '' : value).trim();
  if (!s) throw new Error('BLOCKED_MASTER_RULE: falta ' + name + '.');
  return s;
}

function normalizeGuard_(value) {
  return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function validarFuentesPlaneacionGuardrail_() {
  const sd = resolvePlanningSource_('UAQ - Sistemas Distribuidos');
  const so = resolvePlanningSource_('ITQ - Sistemas Operativos');
  if (sd.spreadsheetId !== '11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I') throw new Error('Regresión: fuente de Sistemas Distribuidos incorrecta.');
  if (so.spreadsheetId !== '1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI') throw new Error('Regresión: fuente de Sistemas Operativos incorrecta.');
  return {ok:true, materiasConfiguradas:Object.keys(MASTER_GUARDRAILS.PLANNING_SOURCES).length};
}
