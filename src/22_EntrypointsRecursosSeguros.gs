/**
 * ENTRYPOINTS CANÓNICOS PARA CREACIÓN DE RECURSOS.
 *
 * Toda creación pasa por guardrails del Documento Maestro antes de mutar
 * Classroom/Forms/Drive y por postflight después de crear/reutilizar el recurso.
 */
function crearActividad(params) {
  return ejecutarConNotificacionError_('CREAR_ACTIVIDAD', params, function () {
    const ctx = prepararContextoGuardrailRecurso_(params, 'ACTIVIDAD');
    preflightDocumentoMaestro(ctx.guardrailRequest);
    assertAcademicAutomationWriteEnabled_(ctx.params.materia);
    const actividad = aplicarReglaVencimientoActividadEnClase_(ctx.params);
    const result = crearCourseWorkDirecto_(normalizarCreacionDirecta_(actividad, 'ACTIVIDAD'));
    postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
    return result;
  });
}

function crearTarea(params) {
  return ejecutarConNotificacionError_('CREAR_TAREA', params, function () {
    const ctx = prepararContextoGuardrailRecurso_(params, 'TAREA');
    preflightDocumentoMaestro(ctx.guardrailRequest);
    assertAcademicAutomationWriteEnabled_(ctx.params.materia);
    const tarea = aplicarReglaVencimientoTarea_(ctx.params);
    const result = crearCourseWorkDirecto_(normalizarCreacionDirecta_(tarea, 'TAREA'));
    const due = asegurarVencimientoTareaCreada_(tarea.courseId, result.workId, tarea);
    verificarVencimientoTareaCreada_(tarea.courseId, result.workId, tarea);
    result.vencimientoReparado = due.reparado === true;
    result.fechaLimiteLocal = tarea.fechaLimiteLocal;
    result.horaLimiteLocal = tarea.horaLimiteLocal;
    postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
    return result;
  });
}

function crearPractica(params) {
  return ejecutarConNotificacionError_('CREAR_PRACTICA', params, function () {
    const ctx = prepararContextoGuardrailRecurso_(params, 'PRACTICA');
    preflightDocumentoMaestro(ctx.guardrailRequest);
    assertAcademicAutomationWriteEnabled_(ctx.params.materia);
    let practica = null;
    let result = null;
    try {
      practica = prepararPracticaConGoogleDoc_(normalizarSolicitudDidactica_(ctx.params,'PRACTICA'));
      result = crearCourseWorkDirecto_(normalizarCreacionDirecta_(practica, 'PRACTICA'));
      const verificacion = verificarPracticaCreada_(practica.courseId, result.workId, practica);
      result.documentId = verificacion.documentId;
      result.documentName = verificacion.documentName;
      result.documentMime = verificacion.documentMime;
      result.shareMode = verificacion.shareMode;
      result.fechaLimite = null;
      result.horaLimite = null;
      postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
      return result;
    } catch (err) {
      limpiarPracticaFallida_(String((practica && practica.courseId) || (ctx.params && ctx.params.courseId) || ''), result, practica);
      throw err;
    }
  });
}

function crearQuiz(params) {
  return ejecutarConNotificacionError_('CREAR_QUIZ', params, function () {
    const ctx = prepararContextoGuardrailRecurso_(params, 'QUIZ');
    preflightDocumentoMaestro(ctx.guardrailRequest);
    assertAcademicAutomationWriteEnabled_(ctx.params.materia);
    const result = crearEvaluacionDirecta_(normalizarCreacionDirecta_(ctx.params, 'QUIZ'));
    postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
    return result;
  });
}

/** Quiz de Asistencia: operación mínima, sin tema, unidad ni planeación ajena. */
function crearQuizSencillo(params) {
  return ejecutarConNotificacionError_('CREAR_QUIZ_SENCILLO',params,function(){
    const p=params&&typeof params==='object'?Object.assign({},params):{};
    const courseId=String(p.courseId||'').trim();
    if(!/^\d+$/.test(courseId))throw new Error('QUIZ_ASISTENCIA_REQUIERE_COURSE_ID');
    const course=Classroom.Courses.get(courseId);
    if(String(course.courseState||'')!=='ACTIVE')
      throw new Error('QUIZ_ASISTENCIA_CURSO_NO_ACTIVO');
    return crearQuizSencilloCanonico_(p);
  });
}
function crearQuizAsistencia(params) {
  return crearQuizSencillo(params);
}

function crearExamen(params) {
  return ejecutarConNotificacionError_('CREAR_EXAMEN', params, function () {
    const ctx = prepararContextoGuardrailRecurso_(params, 'EXAMEN');
    preflightDocumentoMaestro(ctx.guardrailRequest);
    assertAcademicAutomationWriteEnabled_(ctx.params.materia);
    const result = crearEvaluacionDirecta_(normalizarCreacionDirecta_(ctx.params, 'EXAMEN'));
    postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
    return result;
  });
}

/**
 * Convierte cualquier solicitud de recurso en contexto académico verificable.
 * materia puede inferirse únicamente del curso real de Classroom; el tema
 * canónico nunca se infiere del título del recurso.
 */
function prepararContextoGuardrailRecurso_(params, tipo) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const courseId = String(p.courseId || '').trim();
  let materia = String(p.materia || '').trim();
  if (!materia && courseId) {
    const course = Classroom.Courses.get(courseId);
    materia = String(course.name || '').trim();
  }
  const temaSubtema = String(p.temaSubtema || p.temaCanonico || '').trim();
  if (!materia) throw new Error('BLOCKED_MASTER_CONTEXT: falta materia y no puede resolverse desde courseId.');
  if (!temaSubtema) throw new Error('BLOCKED_MASTER_CONTEXT: falta temaSubtema/temaCanonico. No se permite inferirlo del título del recurso.');

  // La reconciliación retrospectiva o la preparación de una sesión futura puede
  // pedir una excepción de secuencia SOLO con sesión explícita y concordancia
  // exacta contra la planeación; no acredita impartición histórica.
  const requestedOverride = p.explicitSequenceOverride === true;
  if (requestedOverride) {
    const n = Number(p.sesionCanonica);
    if (!Number.isInteger(n) || n < 1) throw new Error('BLOCKED_SEQUENCE: reconciliación exige sesionCanonica entera explícita.');
    const match = loadCanonicalPlanning_(materia).find(function(row) { return Number(row.clase) === n; });
    if (!match || normalizeGuard_(match.tema) !== normalizeGuard_(temaSubtema)) {
      throw new Error('BLOCKED_SEQUENCE: sesionCanonica y temaSubtema no coinciden exactamente con la planeación.');
    }
  }
  p.materia = materia;
  p.temaSubtema = temaSubtema;
  p.resourceState = 'DRAFT';

  return {
    params: p,
    guardrailRequest: {
      operation: 'RESOURCE_CREATE',
      materia: materia,
      temaSubtema: temaSubtema,
      resourceType: String(tipo || '').toUpperCase(),
      resourceState: 'DRAFT',
      modifyPlanning: false,
      explicitPlanningAuthorization: false,
      explicitSequenceOverride: requestedOverride
    }
  };
}

function normalizarResultadoGuardrail_(result) {
  const r = result && typeof result === 'object' ? result : {};
  return {
    ok: r.ok !== false,
    state: String(r.state || r.estado || 'DRAFT'),
    workId: String(r.workId || ''),
    formId: String(r.formId || ''),
    courseId: String(r.courseId || ''),
    documentId: String(r.documentId || ''),
    shareMode: String(r.shareMode || '')
  };
}

function validarEntrypointsRecursosSeguros() {
  validarContratoArquitectura_();
  validarPoliticasCanonicas_();
  validarVencimientoActividadEnClaseCanonico();
  validarVencimientoTareaCanonico();
  validarPracticaCanonica();
  validarQuizSencilloCanonico();
  validarDidacticaTransversal();
  if (typeof preflightDocumentoMaestro !== 'function' || typeof postflightDocumentoMaestro !== 'function') {
    throw new Error('MASTER_GUARDRAILS_REQUIRED: faltan preflight/postflight del Documento Maestro.');
  }
  const names = ['crearActividad','crearTarea','crearPractica','crearQuiz','crearQuizSencillo','crearQuizAsistencia','crearExamen'];
  names.forEach(function (name) {
    if (typeof this[name] !== 'function') throw new Error('Falta entrypoint canónico: ' + name);
  }, this);
  if (!ACADEMIC_POLICY.ERROR_REPORTING || ACADEMIC_POLICY.ERROR_REPORTING.NOTIFY_ON_ERROR !== true) {
    throw new Error('La notificación de errores debe estar activa.');
  }
  return {
    ok:true,
    entrypoints:names,
    masterGuardrails:'REQUIRED',
    academicReadinessGate:'8_PLANNINGS_READ_ONLY_REQUIRED',
    masterContext:'materia+temaSubtema',
    resourceState:'DRAFT',
    errorReporting:'REQUIRED',
    activityDue:'SESSION_END_MAX',
    taskDue:'NEXT_SESSION_START_MAX',
    practice:'GOOGLE_DOC_STUDENT_COPY_NO_DUE',
    simpleQuiz:'CLASSROOM_SEQUENCE_NEXT_NATURAL_HOUR'
  };
}
