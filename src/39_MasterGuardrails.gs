/**
 * Guardrails canónicos del Documento Maestro.
 * Toda operación de generación debe ejecutar preflight antes de mutar recursos
 * y postflight después de crear/actualizar recursos.
 */
const MASTER_GUARDRAILS = Object.freeze({
  MASTER_DOCUMENT_ID: '1lH7ME10VRX472PP54BdeE9evRbbjAUYowov3-slM5v8',
  PLANNING_SPREADSHEET_ID: '1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI',
  PLANNING_SHEET: 'Planeación maestra',
  SUBJECT_PLANNING: Object.freeze({
    'sistemas distribuidos': Object.freeze({spreadsheetId:'11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I', sheet:'Planeación', headerRow:6})
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
  if (r.modifyPlanning === true && r.explicitPlanningAuthorization !== true) throw new Error('BLOCKED_MASTER_RULE: la planeación no puede modificarse sin autorización explícita.');
  if (r.resourceState && String(r.resourceState).toUpperCase() !== MASTER_GUARDRAILS.DEFAULT_STATE) throw new Error('BLOCKED_MASTER_RULE: Classroom/Forms debe crearse en DRAFT.');
  const planning = loadCanonicalPlanning_(materia);
  if (!planning.length) throw new Error('BLOCKED_MASTER_RULE: no se encontró planeación canónica para ' + materia + '.');
  const targetKey = canonicalTopicKey_(tema);
  const targetIndex = planning.findIndex(function(x) { return canonicalTopicKey_(x.tema) === targetKey; });
  if (targetIndex < 0) throw new Error('BLOCKED_MASTER_RULE: el tema solicitado no existe en la planeación canónica: ' + tema + '.');
  const expected = firstPendingCanonical_(planning, r.completedTopics || []);
  if (operation === 'GENERATE_CLASS' && expected && targetIndex !== expected.index && r.allowCanonicalOverride !== true) throw new Error('BLOCKED_CANONICAL_SEQUENCE: siguiente tema permitido = ' + expected.tema + '; solicitado = ' + planning[targetIndex].tema + '.');
  if (operation === 'GENERATE_CLASS') validateClassPackageRequest_(r);
  return {ok:true,preflight:'MASTER_GUARDRAILS',materia:materia,target:planning[targetIndex],canonicalNext:expected?expected.tema:null,resourceState:MASTER_GUARDRAILS.DEFAULT_STATE,room:planning[targetIndex].aula||MASTER_GUARDRAILS.DEFAULT_ROOM,modifyPlanning:false};
}

function postflightDocumentoMaestro(result, request) {
  const r=request&&typeof request==='object'?request:{}; const x=result&&typeof result==='object'?result:{};
  if(x.ok===false) throw new Error('POSTFLIGHT_FAILED: la operación devolvió ok=false.');
  if(x.state&&String(x.state).toUpperCase()!==MASTER_GUARDRAILS.DEFAULT_STATE) throw new Error('POSTFLIGHT_FAILED: recurso creado fuera de DRAFT.');
  if(r.modifyPlanning===true&&r.explicitPlanningAuthorization!==true) throw new Error('POSTFLIGHT_FAILED: se intentó modificar planeación sin autorización.');
  return {ok:true,postflight:'MASTER_GUARDRAILS',materia:String(r.materia||''),temaSubtema:String(r.temaSubtema||''),stateVerified:!x.state||String(x.state).toUpperCase()===MASTER_GUARDRAILS.DEFAULT_STATE};
}

function validarPaqueteClaseContraMaestro(request){const preflight=preflightDocumentoMaestro(request);return{ok:true,preflight:preflight,requiredPackage:MASTER_GUARDRAILS.REQUIRED_PACKAGE.slice(),message:'Paquete validado: Gamma por sí solo NO constituye una clase completa.'};}
function validateClassPackageRequest_(r){const missing=MASTER_GUARDRAILS.REQUIRED_PACKAGE.filter(function(k){return !String(r[k]==null?'':r[k]).trim();});if(missing.length)throw new Error('BLOCKED_INCOMPLETE_CLASS_PACKAGE: faltan '+missing.join(', ')+'. Gamma por sí solo no completa la clase.');}

function planningSourceFor_(materia){const specific=MASTER_GUARDRAILS.SUBJECT_PLANNING[normalizeGuard_(materia)];return specific||{spreadsheetId:MASTER_GUARDRAILS.PLANNING_SPREADSHEET_ID,sheet:MASTER_GUARDRAILS.PLANNING_SHEET,headerRow:1};}
function loadCanonicalPlanning_(materia){
  const source=planningSourceFor_(materia); const ss=SpreadsheetApp.openById(source.spreadsheetId); const sheet=ss.getSheetByName(source.sheet); if(!sheet)throw new Error('No existe hoja de planeación: '+source.sheet);
  const values=sheet.getDataRange().getDisplayValues(); const headerIndex=Math.max(0,(source.headerRow||1)-1); if(values.length<=headerIndex+1)return[];
  const headers=values[headerIndex].map(normalizeGuard_); const subjectCol=findHeaderGuard_(headers,['materia','asignatura']); const unitCol=findHeaderGuard_(headers,['unidad']); const topicCol=findHeaderGuard_(headers,['tema / alcance','tema/alcance','tema / subtema','tema/subtema','tema','subtema']); const classCol=findHeaderGuard_(headers,['clase','sesion','sesión']); const roomCol=findHeaderGuard_(headers,['aula']);
  if(topicCol<0)throw new Error('La planeación no contiene columna Tema / alcance reconocible.');
  return values.slice(headerIndex+1).map(function(row,i){return{row:i+headerIndex+2,clase:classCol>=0?row[classCol]:'',materia:subjectCol>=0?row[subjectCol]:materia,unidad:unitCol>=0?row[unitCol]:'',tema:row[topicCol],aula:roomCol>=0?row[roomCol]:''};}).filter(function(x){return x.tema&&(subjectCol<0||normalizeGuard_(x.materia)===normalizeGuard_(materia));});
}
function firstPendingCanonical_(planning,completedTopics){const completed=(completedTopics||[]).map(canonicalTopicKey_);for(var i=0;i<planning.length;i+=1)if(completed.indexOf(canonicalTopicKey_(planning[i].tema))<0)return Object.assign({index:i},planning[i]);return null;}
function findHeaderGuard_(headers,candidates){const normalized=candidates.map(normalizeGuard_);for(var i=0;i<headers.length;i+=1)if(normalized.indexOf(headers[i])>=0)return i;return-1;}
function canonicalTopicKey_(value){return normalizeGuard_(value).replace(/^\d+(?:\.\d+)*(?:\s*[–—-]\s*|\s+)/,'').replace(/^evaluacion\s+u\d+\s*[–—-]?\s*/,'evaluacion ').trim();}
function requiredGuard_(value,name){const s=String(value==null?'':value).trim();if(!s)throw new Error('BLOCKED_MASTER_RULE: falta '+name+'.');return s;}
function normalizeGuard_(value){return String(value==null?'':value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
