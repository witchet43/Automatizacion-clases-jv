/**
 * Guardrails canónicos del Documento Maestro.
 * Toda operación de generación debe ejecutar preflight antes de mutar recursos
 * y postflight después de crear/actualizar recursos.
 *
 * ESTABILIZACIÓN 2026-09-17:
 * - cada materia declara explícitamente hoja, fila de encabezados y columnas;
 * - existe validación read-only de las 8 planeaciones;
 * - toda escritura académica pasa por un readiness gate;
 * - dry-run nunca crea ni modifica recursos.
 */
const MASTER_GUARDRAILS = Object.freeze({
  MASTER_DOCUMENT_ID: '1lH7ME10VRX472PP54BdeE9evRbbjAUYowov3-slM5v8',
  PLANNING_SPREADSHEET_ID: '1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI',
  PLANNING_SHEET: 'Planeación maestra',
  PLANNING_SOURCES: Object.freeze({
    'itq - sistemas operativos': Object.freeze({spreadsheetId:'1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI',preferredSheet:'Planeación maestra',headerRow:1,columns:Object.freeze({session:'Clase',unit:'Unidad',topic:'Tema / alcance'})}),
    'sistemas operativos': Object.freeze({spreadsheetId:'1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI',preferredSheet:'Planeación maestra',headerRow:1,columns:Object.freeze({session:'Clase',unit:'Unidad',topic:'Tema / alcance'})}),
    'uaq - sistemas distribuidos': Object.freeze({spreadsheetId:'11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'sistemas distribuidos': Object.freeze({spreadsheetId:'11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'uaq - administracion': Object.freeze({spreadsheetId:'1G1MTtP9dRN8fM7vG7uOQoHkjbK2uOEoca3Aa2SxJqr4',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'administracion': Object.freeze({spreadsheetId:'1G1MTtP9dRN8fM7vG7uOQoHkjbK2uOEoca3Aa2SxJqr4',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'uaq - algoritmos y estructuras de datos': Object.freeze({spreadsheetId:'1Ujb02-K9k9xkEu7rPMsdV2v3E8MIFAUyP-yAmAwZwWc',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'algoritmos y estructuras de datos': Object.freeze({spreadsheetId:'1Ujb02-K9k9xkEu7rPMsdV2v3E8MIFAUyP-yAmAwZwWc',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'uaq - analisis y diseno de sistemas computacionales': Object.freeze({spreadsheetId:'1a7Icsnxciy2cK9xHOEBWBt_RbE0v9sM8ioRCfp95YAA',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema específico de la sesión'})}),
    'analisis y diseno de sistemas computacionales': Object.freeze({spreadsheetId:'1a7Icsnxciy2cK9xHOEBWBt_RbE0v9sM8ioRCfp95YAA',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema específico de la sesión'})}),
    'uaq - etica y legislacion informatica': Object.freeze({spreadsheetId:'16XoGCp7vPMD5dgvhMgQz_MUDfSvgLPrs9KfXKXwU-bQ',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'etica y legislacion informatica': Object.freeze({spreadsheetId:'16XoGCp7vPMD5dgvhMgQz_MUDfSvgLPrs9KfXKXwU-bQ',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'uaq - introduccion a las tecnologias de informacion': Object.freeze({spreadsheetId:'1j8_Qq0esbBhYOIqbkU9DywV-Zl3l-FW71KlKNRW8aS0',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'introduccion a las tecnologias de informacion': Object.freeze({spreadsheetId:'1j8_Qq0esbBhYOIqbkU9DywV-Zl3l-FW71KlKNRW8aS0',preferredSheet:'Planeación',headerRow:6,columns:Object.freeze({session:'Sesión',unit:'Unidad',topic:'Tema / subtema'})}),
    'uaq - topico i': Object.freeze({spreadsheetId:'1Q-aVBDOli2ccjR3hgyZcpnXF5Uo6Nlh3yfW8Y7sEs5M',preferredSheet:'Planeación por sesión',headerRow:1,columns:Object.freeze({session:'Sesión',unit:'Unidad / bloque',topic:'Tema / subtema canónico'})}),
    'topico i': Object.freeze({spreadsheetId:'1Q-aVBDOli2ccjR3hgyZcpnXF5Uo6Nlh3yfW8Y7sEs5M',preferredSheet:'Planeación por sesión',headerRow:1,columns:Object.freeze({session:'Sesión',unit:'Unidad / bloque',topic:'Tema / subtema canónico'})})
  }),
  VALIDATION_COURSES: Object.freeze([
    'ITQ - Sistemas Operativos',
    'UAQ - Sistemas Distribuidos',
    'UAQ - Administración',
    'UAQ - Algoritmos y Estructuras de Datos',
    'UAQ - Análisis y Diseño de Sistemas Computacionales',
    'UAQ - Ética y Legislación Informática',
    'UAQ - Introducción a las Tecnologías de Información',
    'UAQ - Tópico I'
  ]),
  DEFAULT_STATE: 'DRAFT',
  DEFAULT_ROOM: 'LCF',
  REQUIRED_PACKAGE: ['unidad','temaSubtema','tareaPrevia','actividadEnClaseOPractica','tareaSiguiente'],
  READINESS_CACHE_KEY: 'ACADEMIC_PLANNING_READINESS_V2',
  READINESS_CACHE_SECONDS: 600
});

function preflightDocumentoMaestro(request) {
  const r = request && typeof request === 'object' ? request : {};
  const materia = requiredGuard_(r.materia, 'materia');
  const tema = requiredGuard_(r.temaSubtema, 'temaSubtema');
  const operation = String(r.operation || 'GENERATE_CLASS').trim().toUpperCase();
  if (r.modifyPlanning === true && r.explicitPlanningAuthorization !== true) throw new Error('BLOCKED_MASTER_RULE: la planeación no puede modificarse sin autorización explícita.');
  if (r.resourceState && String(r.resourceState).toUpperCase() !== MASTER_GUARDRAILS.DEFAULT_STATE) throw new Error('BLOCKED_MASTER_RULE: Classroom/Forms debe crearse en DRAFT.');
  const planning = loadCanonicalPlanning_(materia);
  const sessionRequested=String(r.sesionCanonica||r.sesion||'').trim();
  const target = sessionRequested && (operation==='GENERATE_CLASS'||operation==='GENERATE_CLASS_PACKAGE')
    ? planning.find(function(x){return String(x.clase||'').trim()===sessionRequested &&
        normalizeGuard_(x.tema)===normalizeGuard_(tema);})||null
    : findPlanningTopic_(planning, tema);
  if (!target) throw new Error('BLOCKED_MASTER_RULE: el tema no existe en la planeación canónica: ' + tema + '.');
  const isClassPackage = operation === 'GENERATE_CLASS' || operation === 'GENERATE_CLASS_PACKAGE';
  // Para generar una CLASE, la secuencia jamás depende de completedTopics
  // informados por el prompt, de la fecha de hoy ni de la propiedad de progreso.
  // Se coteja el CourseWork real y la Gamma verificada ANTES de cualquier escritura.
  const real = isClassPackage ? resolverSiguienteClase(materia,r.sesionCanonica||r.sesion,{
    reconciliationMode:r.reconciliationMode===true,
    reconciliationReason:r.reconciliationReason,
    explicitTarget:!!sessionRequested
  }) : null;
  if(isClassPackage && real.complete)throw new Error('BLOCKED_SEQUENCE_REAL_STATE: no queda una sesión canónica pendiente.');
  const expected = isClassPackage
    ? {tema:real.target.topic,clase:real.target.session,unidad:real.target.unit}
    : target; // RESOURCE_CREATE con tema explícito no infiere la próxima sesión.
  if(expected && normalizeGuard_(expected.tema)!==normalizeGuard_(target.tema) &&
     (isClassPackage || r.explicitSequenceOverride!==true))
    throw new Error('BLOCKED_SEQUENCE: el siguiente tema canónico por estado real es "'+expected.tema+'", no "'+target.tema+'".');
  if(isClassPackage) {
    if(real.sequenceSource!=='CLASSROOM_GAMMA_REAL_STATE'||String(real.target.session)!==String(target.clase))
      throw new Error('BLOCKED_SEQUENCE_REAL_STATE: sesión canónica o evidencia de progreso incongruente.');
    validateClassPackageRequest_(r);
  }
  const source = resolvePlanningSource_(materia);
  return {ok:true,masterDocumentId:MASTER_GUARDRAILS.MASTER_DOCUMENT_ID,planningSpreadsheetId:source.spreadsheetId,planningSheet:source.preferredSheet,target:target,canonicalNext:expected||target,resourceState:MASTER_GUARDRAILS.DEFAULT_STATE,room:r.room||MASTER_GUARDRAILS.DEFAULT_ROOM};
}

function validarPaqueteClaseContraMaestro(request) {const preflight=preflightDocumentoMaestro(request);return{ok:true,preflight:preflight,requiredPackage:MASTER_GUARDRAILS.REQUIRED_PACKAGE.slice(),message:'Paquete validado: Gamma por sí solo NO constituye una clase completa.'};}
function validateClassPackageRequest_(r){const missing=MASTER_GUARDRAILS.REQUIRED_PACKAGE.filter(function(k){return !String(r[k]==null?'':r[k]).trim();});if(missing.length)throw new Error('BLOCKED_INCOMPLETE_CLASS_PACKAGE: faltan '+missing.join(', ')+'. Gamma por sí solo no completa la clase.');}
function resolvePlanningSource_(materia){const key=normalizeGuard_(materia),source=MASTER_GUARDRAILS.PLANNING_SOURCES[key];if(!source)throw new Error('BLOCKED_MASTER_RULE: no existe una fuente de planeación canónica configurada para '+materia+'.');return source;}

function loadCanonicalPlanning_(materia){
  const source=resolvePlanningSource_(materia);
  const ss=SpreadsheetApp.openById(source.spreadsheetId);
  const sheet=ss.getSheetByName(source.preferredSheet);
  if(!sheet)throw new Error('No existe hoja de planeación canónica "'+source.preferredSheet+'" para '+materia+'.');
  const values=sheet.getDataRange().getDisplayValues();
  const headerRow=Number(source.headerRow||0);
  if(!headerRow||values.length<headerRow)throw new Error('SCHEMA_PLANNING_INVALID: fila de encabezados inválida para '+materia+'.');
  const headers=(values[headerRow-1]||[]).map(normalizeGuard_);
  const cols=source.columns||{};
  const sessionCol=columnIndexBySchema_(headers,cols.session,'session',materia);
  const unitCol=columnIndexBySchema_(headers,cols.unit,'unit',materia);
  const topicCol=columnIndexBySchema_(headers,cols.topic,'topic',materia);
  return values.slice(headerRow).map(function(row,i){
    return{row:headerRow+i+1,clase:row[sessionCol],materia:materia,unidad:row[unitCol],tema:row[topicCol]};
  }).filter(function(x){return String(x.tema||'').trim()!=='';});
}

function columnIndexBySchema_(normalizedHeaders, exactHeader, logicalName, materia){
  const target=normalizeGuard_(exactHeader);
  const idx=normalizedHeaders.indexOf(target);
  if(idx<0)throw new Error('SCHEMA_PLANNING_INVALID: '+materia+' requiere columna '+logicalName+' "'+exactHeader+'".');
  return idx;
}

function validarPlaneacionCanonicaReadOnly_(materia){
  const source=resolvePlanningSource_(materia);
  const rows=loadCanonicalPlanning_(materia);
  if(!rows.length)throw new Error('SCHEMA_PLANNING_EMPTY: '+materia+' no contiene sesiones canónicas.');
  const first=rows[0];
  if(!String(first.clase||'').trim()||!String(first.unidad||'').trim()||!String(first.tema||'').trim())throw new Error('SCHEMA_PLANNING_INCOMPLETE: '+materia+' no expone sesión, unidad y tema en su primera fila de datos.');
  return{ok:true,materia:materia,spreadsheetId:source.spreadsheetId,sheet:source.preferredSheet,headerRow:source.headerRow,columns:source.columns,rowCount:rows.length,first:{session:first.clase,unit:first.unidad,topic:first.tema}};
}

function validarPlaneacionesCanonicasReadOnly_(){
  const results=[],errors=[];
  MASTER_GUARDRAILS.VALIDATION_COURSES.forEach(function(materia){
    try{results.push(validarPlaneacionCanonicaReadOnly_(materia));}
    catch(err){errors.push({materia:materia,error:String(err&&err.message||err)});}
  });
  if(errors.length)throw new Error('ACADEMIC_READINESS_BLOCKED: '+JSON.stringify(errors));
  return{ok:true,mode:'READ_ONLY',validated:results.length,results:results};
}

function validarPlaneacionesCanonicasReadOnly(){
  return validarPlaneacionesCanonicasReadOnly_();
}

/** Readiness del curso objetivo. La auditoría global de ocho materias se
 * mantiene disponible de forma independiente, sin bloquear otros cursos. */
function assertAcademicAutomationWriteEnabled_(materia){
  const subject=requiredGuard_(materia,'materia');
  const cache=CacheService.getScriptCache();
  const key=MASTER_GUARDRAILS.READINESS_CACHE_KEY+'|'+normalizeGuard_(subject);
  if(String(cache.get(key)||'')==='OK')return true;
  validarPlaneacionCanonicaReadOnly_(subject);
  cache.put(key,'OK',MASTER_GUARDRAILS.READINESS_CACHE_SECONDS);
  return true;
}

/** Dry-run puro: solo lee planeación y valida identidad/secuencia. No crea ni modifica recursos. */
function dryRunPreflightAcademico(params){
  const p=params&&typeof params==='object'?Object.assign({},params):{};
  const materia=requiredGuard_(p.materia,'materia');
  const planning=loadCanonicalPlanning_(materia);
  let target=null;
  if(String(p.temaSubtema||'').trim())target=findPlanningTopic_(planning,p.temaSubtema);
  else {
    const real=resolverSiguienteClase(materia,p.sesionCanonica||p.sesion,{
      reconciliationMode:p.reconciliationMode===true,
      reconciliationReason:p.reconciliationReason
    });
    if(real.complete)throw new Error('DRY_RUN_NO_TARGET: todas las sesiones tienen evidencia real.');
    target=findPlanningTopic_(planning,real.target.topic);
  }
  if(!target)throw new Error('DRY_RUN_NO_TARGET: no se pudo resolver sesión objetivo para '+materia+'.');
  const preflight=preflightDocumentoMaestro({
    operation:'DRY_RUN',
    materia:materia,
    temaSubtema:target.tema,
    completedTopics:p.completedTopics||[],
    resourceState:'DRAFT',
    modifyPlanning:false,
    explicitPlanningAuthorization:false,
    explicitSequenceOverride:p.explicitSequenceOverride===true
  });
  return{ok:true,dryRun:true,writes:false,materia:materia,target:preflight.target,canonicalNext:preflight.canonicalNext,planningSheet:preflight.planningSheet,planningSpreadsheetId:preflight.planningSpreadsheetId};
}

/** Regresión integral read-only de las ocho materias + caso explícito Tópico I. */
function validarReadinessAcademicoCompleto(){
  const schemas=validarPlaneacionesCanonicasReadOnly_();
  const topico=dryRunPreflightAcademico({materia:'UAQ - Tópico I',temaSubtema:'Visión del producto y forma de trabajo',completedTopics:[],explicitSequenceOverride:false});
  if(!topico.ok||normalizeGuard_(topico.target.tema)!=='vision del producto y forma de trabajo')throw new Error('REGRESSION_TOPICO_I: no resolvió Tema / subtema canónico.');
  return{ok:true,writes:false,schemas:schemas,topicoI:topico};
}

function findPlanningTopic_(planning,tema){const n=normalizeGuard_(tema);return planning.find(function(x){return normalizeGuard_(x.tema)===n;})||null;}
function firstPendingCanonical_(planning,completedTopics){const done={};(completedTopics||[]).forEach(function(t){done[normalizeGuard_(t)]=true;});return planning.find(function(x){return !done[normalizeGuard_(x.tema)];})||null;}
function findHeaderGuard_(headers,candidates){for(let i=0;i<candidates.length;i+=1){const idx=headers.indexOf(normalizeGuard_(candidates[i]));if(idx>=0)return idx;}return-1;}
function normalizeGuard_(value){return String(value==null?'':value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
function requiredGuard_(value,name){const s=String(value==null?'':value).trim();if(!s)throw new Error('BLOCKED_MASTER_RULE: falta '+name+'.');return s;}
