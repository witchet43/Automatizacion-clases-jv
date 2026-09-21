/**
 * API interna ligera para operaciones académicas rutinarias.
 * La IA aporta intención + parámetros; las reglas viven en código canónico.
 */

/** Parámetro mínimo: {quizId}. courseId es opcional y actúa como assertion. */
function importarCalificacionesExamen(params) {
  return ejecutarConNotificacionError_('IMPORTAR_CALIFICACIONES_EXAMEN', params, function () {
    const p = normalizarParametrosOperacion_(params);
    if (!p.quizId) throw new Error('importarCalificacionesExamen requiere quizId.');
    return importarCalificacionesInstrumento_({quizId:p.quizId, courseId:p.courseId, tipoEsperado:'EXAMEN'});
  });
}

/** Motor común. Resuelve Form ID y Classroom ID a partir del Quiz ID. */
function importarCalificacionesInstrumento_(params) {
  const p = normalizarParametrosOperacion_(params);
  if (!p.quizId) throw new Error('La importación requiere quizId.');
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const item = resolverInstrumentoPorQuizId_(ss, p.quizId);

  if (p.courseId && String(p.courseId) !== item.courseId) {
    throw new Error('El Quiz ID '+p.quizId+' pertenece al curso '+item.courseId+', no al curso solicitado '+p.courseId+'.');
  }
  if (p.tipoEsperado && item.tipo !== String(p.tipoEsperado).toUpperCase()) {
    throw new Error('El instrumento '+p.quizId+' es de tipo '+item.tipo+'; se esperaba '+String(p.tipoEsperado).toUpperCase()+'.');
  }
  if (item.estado !== QUIZ_PIPELINE.CREATED) {
    throw new Error('El Quiz ID '+p.quizId+' no está en estado CREADA; estado actual: '+item.estado+'.');
  }
  if (!item.courseId || !item.workId || !item.formId) {
    throw new Error('El instrumento '+p.quizId+' no tiene completos courseId, Classroom ID y Form ID.');
  }

  const result = procesarCalificacionesQuiz_(item.courseId, item.workId, item.formId, true, p.quizId);
  const resumen = resumenImportacionCalificaciones_(result);
  if (item.colUltimaActualizacion) item.sheet.getRange(item.row,item.colUltimaActualizacion).setValue(new Date());
  if (item.colResultado) item.sheet.getRange(item.row,item.colResultado).setValue(resumen);
  SpreadsheetApp.flush();
  return {operacion:'IMPORTAR_CALIFICACIONES',quizId:p.quizId,courseId:item.courseId,workId:item.workId,tipo:item.tipo,resumen:resumen,detalle:result,estadoCalificacion:'DRAFT_ONLY'};
}

/**
 * Cierre estricto de una sola unidad. El contrato detallado vive en
 * ACADEMIC_POLICY.UNIT_GRADING y en los motores llamados por esta fachada.
 */
function cerrarUnidad(params) {
  return ejecutarConNotificacionError_('CERRAR_UNIDAD', params, function () {
    const p = normalizarParametrosOperacion_(params);
    if (!p.courseId) throw new Error('cerrarUnidad requiere courseId.');
    const unidad = normalizarUnidadOperacion_(p.unidad);
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(30000))throw new Error('CLOSE_BUSY: otro cierre académico está en curso; este intento no modificó notas.');
    try {
    const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);

    const promedios = calcularPromediosDirectoClassroomConCeros_(ss, p.courseId, unidad);
    const cierre = publicarCalificacionUnidadFinal_(
      ss,
      p.courseId,
      unidad,
      ACADEMIC_POLICY.CLASSROOM.FINAL_GRADE_PREFIX + extraerNumeroUnidad_(unidad)
    );

    return {
      operacion:'CERRAR_UNIDAD',
      modo:'UNIDAD_ESTRICTA_RECALCULABLE_DRAFT',
      courseId:String(p.courseId),
      unidad:unidad,
      preclasificacion:{movidos:0,motivo:'NO_APLICA_EN_CIERRE_ESTRICTO'},
      reubicacion:{movidos:0,motivo:'NO_APLICA_EN_CIERRE_ESTRICTO'},
      preflight:{ok:true,modo:'LECTURA_UNIDAD_ESTRICTA'},
      revision:{devueltas:0,trabajosCandidatos:0,motivo:'NO_SE_REVISA_EL_CURSO_COMPLETO'},
      instrumentos:{instrumentos:promedios.examenes.length,motivo:'LECTURA_SIN_MODIFICAR_FUENTES'},
      promedios:promedios,
      cierre:cierre,
      estadoCalificacion:'DRAFT_ONLY'
    };
    } finally {
      lock.releaseLock();
    }
  });
}

function politicaCalificacionUnidad_(courseId) {
  return Object.freeze({
    examWeight: ACADEMIC_POLICY.UNIT_GRADING.EXAM_WEIGHT,
    nonExamWeight: ACADEMIC_POLICY.UNIT_GRADING.NON_EXAM_WEIGHT
  });
}

function resolverInstrumentoPorQuizId_(ss, quizId) {
  const sh = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  if (!sh) throw new Error('No existe la hoja '+QUIZ_PIPELINE.QUIZZES_SHEET+'.');
  const data = sh.getDataRange().getValues();
  if (!data.length) throw new Error('La hoja '+QUIZ_PIPELINE.QUIZZES_SHEET+' está vacía.');
  const h = {};
  data[0].forEach((v,i)=>h[String(v)]=i);
  ['Quiz ID','Estado','ID del curso','ID actividad Classroom','ID del Form','Tipo instrumento'].forEach(name=>{
    if (h[name]===undefined) throw new Error('Falta la columna requerida en Quizzes: '+name+'.');
  });
  for (let i=1;i<data.length;i++) {
    if (String(data[i][h['Quiz ID']]||'').trim()!==String(quizId).trim()) continue;
    return {
      sheet:sh,row:i+1,
      courseId:String(data[i][h['ID del curso']]||'').trim(),
      workId:String(data[i][h['ID actividad Classroom']]||'').trim(),
      formId:String(data[i][h['ID del Form']]||'').trim(),
      tipo:String(data[i][h['Tipo instrumento']]||'').trim().toUpperCase(),
      estado:String(data[i][h['Estado']]||'').trim().toUpperCase(),
      colUltimaActualizacion:h['Última actualización']===undefined?0:h['Última actualización']+1,
      colResultado:h['Resultado / error']===undefined?0:h['Resultado / error']+1
    };
  }
  throw new Error('No se encontró el Quiz ID objetivo: '+quizId+'.');
}

function resumenImportacionCalificaciones_(result) {
  return 'Importación manual en DRAFT: '+result.actualizadas+' actualizadas; '+result.yaCalificadas+' ya calificadas; '+result.sinCorrespondencia.length+' sin correspondencia; '+result.noTurnedIn+' sin marcar entregado en Classroom (no bloquean importación).'+(result.ajuste?' Ajuste aplicado: +'+result.ajuste+' puntos.':'');
}

function normalizarParametrosOperacion_(params) {
  if (params===null||params===undefined) return {};
  if (typeof params==='string'||typeof params==='number') return {courseId:String(params)};
  return params;
}

function normalizarUnidadOperacion_(unidad) {
  const raw=String(unidad===undefined||unidad===null?'':unidad).trim();
  if(!raw) throw new Error('La operación requiere unidad.');
  const n=extraerNumeroUnidad_(raw);
  if(!n) throw new Error('No se pudo identificar el número de unidad en: '+raw+'.');
  return ACADEMIC_POLICY.NAMING.UNIT_PREFIX+n;
}

function validarContratoOperacionesAcademicas() {
  validarContratoArquitectura_();
  validarPoliticasCanonicas_();
  const p=politicaCalificacionUnidad_('');
  const draftPolicy=politicaCalificacionAutomaticaDraft_();
  if(Math.abs((p.examWeight+p.nonExamWeight)-1)>0.000001) throw new Error('La política de calificación no suma 100%.');
  if(normalizarUnidadOperacion_('1')!=='Unidad 1') throw new Error('Falló normalización de unidad numérica.');
  if(normalizarUnidadOperacion_('Unidad 2')!=='Unidad 2') throw new Error('Falló normalización de unidad textual.');
  if(draftPolicy.campoEscritura!=='draftGrade'||draftPolicy.assignedGradeAutomatico!==false||draftPolicy.returnAutomatico!==false) {
    throw new Error('La política global DRAFT de calificaciones automáticas es inválida.');
  }
  return {ok:true,operaciones:['importarCalificacionesExamen','cerrarUnidad'],politica:p,calificaciones:draftPolicy,cierre:'UNIDAD_ESTRICTA_RECALCULABLE_DRAFT',fuentePoliticas:'ACADEMIC_POLICY',errorReporting:'REQUIRED'};
}
