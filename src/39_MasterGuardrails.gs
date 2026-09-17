/**
 * Guardrails canónicos del Documento Maestro.
 * Toda operación de generación debe ejecutar preflight antes de mutar recursos
 * y postflight después de crear/actualizar recursos.
 */
const MASTER_GUARDRAILS = Object.freeze({
  MASTER_DOCUMENT_ID: '1lH7ME10VRX472PP54BdeE9evRbbjAUYowov3-slM5v8',
  PLANNING_SPREADSHEET_ID: '1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI',
  PLANNING_SHEET: 'Planeación maestra',
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

  const targetIndex = planning.findIndex(function(x) { return normalizeGuard_(x.tema).indexOf(normalizeGuard_(tema)) >= 0; });
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

function loadCanonicalPlanning_(materia) {
  const ss = SpreadsheetApp.openById(MASTER_GUARDRAILS.PLANNING_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(MASTER_GUARDRAILS.PLANNING_SHEET);
  if (!sheet) throw new Error('No existe hoja de planeación: ' + MASTER_GUARDRAILS.PLANNING_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(normalizeGuard_);
  const subjectCol = findHeaderGuard_(headers, ['materia','asignatura']);
  const unitCol = findHeaderGuard_(headers, ['unidad']);
  const topicCol = findHeaderGuard_(headers, ['tema/subtema','tema','subtema']);
  if (topicCol < 0) throw new Error('La planeación no contiene columna Tema/Subtema reconocible.');

  return values.slice(1).map(function(row, i) {
    return {row: i + 2, materia: subjectCol >= 0 ? row[subjectCol] : materia, unidad: unitCol >= 0 ? row[unitCol] : '', tema: row[topicCol]};
  }).filter(function(x) {
    return x.tema && (subjectCol < 0 || normalizeGuard_(x.materia) === normalizeGuard_(materia));
  });
}

function firstPendingCanonical_(planning, completedTopics) {
  const completed = (completedTopics || []).map(normalizeGuard_);
  for (var i = 0; i < planning.length; i += 1) {
    if (completed.indexOf(normalizeGuard_(planning[i].tema)) < 0) return Object.assign({index:i}, planning[i]);
  }
  return null;
}

function findHeaderGuard_(headers, candidates) {
  const normalized = candidates.map(normalizeGuard_);
  for (var i = 0; i < headers.length; i += 1) if (normalized.indexOf(headers[i]) >= 0) return i;
  return -1;
}

function requiredGuard_(value, name) {
  const s = String(value == null ? '' : value).trim();
  if (!s) throw new Error('BLOCKED_MASTER_RULE: falta ' + name + '.');
  return s;
}

function normalizeGuard_(value) {
  return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}
