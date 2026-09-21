/**
 * Crea una ACTIVIDAD EN CLASE histórica únicamente para reconciliación académica.
 *
 * Uso permitido:
 * - la sesión canónica ya ocurrió y la regla ordinaria exige vencimiento futuro;
 * - el docente solicita generar/reconciliar el paquete faltante según estado real;
 * - materia, sesión y tema coinciden exactamente con la planeación canónica;
 * - el recurso queda DRAFT y SIN vencimiento;
 * - si requiere Google Doc, la copia para cada alumno es STUDENT_COPY;
 * - no publica ni altera recursos PUBLISHED y reutiliza un DRAFT exacto por título/tema.
 *
 * Esta función NO sustituye crearActividad() para sesiones vigentes o futuras.
 */
function crearActividadReconciliacionHistorica(params) {
  return ejecutarConNotificacionError_('CREAR_ACTIVIDAD_RECONCILIACION_HISTORICA', params, function () {
    const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
    if (p.reconciliationMode !== true) {
      throw new Error('RECONCILIACION_REQUERIDA: reconciliationMode=true es obligatorio.');
    }
    if (p.explicitSequenceOverride !== true) {
      throw new Error('RECONCILIACION_REQUERIDA: explicitSequenceOverride=true es obligatorio.');
    }
    const sesion = Number(p.sesionCanonica);
    if (!Number.isInteger(sesion) || sesion < 1) {
      throw new Error('RECONCILIACION_REQUERIDA: sesionCanonica entera explícita es obligatoria.');
    }
    const motivo = String(p.reconciliationReason || '').trim();
    if (!motivo) {
      throw new Error('RECONCILIACION_REQUERIDA: reconciliationReason es obligatorio para trazabilidad.');
    }

    // Una reconciliación histórica nunca inventa una fecha de entrega posterior.
    [
      'fechaLimite','horaLimite','dueDate','dueTime','fechaLimiteLocal','horaLimiteLocal',
      'fechaSesion','horaFinSesion','fechaClase','horaFinClase','sessionDate','classDate',
      'sessionEndTime','classEndTime'
    ].forEach(function (key) {
      if (p[key] !== undefined && p[key] !== null && String(p[key]).trim() !== '') {
        throw new Error('RECONCILIACION_SIN_VENCIMIENTO: no se permite ' + key + '.');
      }
    });

    const ctx = prepararContextoGuardrailRecurso_(p, 'ACTIVIDAD');
    // El override solo es aceptado por prepararContextoGuardrailRecurso_ cuando
    // sesionCanonica y temaSubtema coinciden exactamente con la planeación.
    preflightDocumentoMaestro(ctx.guardrailRequest);
    assertAcademicAutomationWriteEnabled_();

    const normalized = normalizarCreacionDirecta_(ctx.params, 'ACTIVIDAD');
    delete normalized.fechaLimite;
    delete normalized.horaLimite;
    delete normalized.dueDate;
    delete normalized.dueTime;

    const result = crearCourseWorkDirecto_(normalized);
    const verified = Classroom.Courses.CourseWork.get(String(normalized.courseId), String(result.workId));
    if (String(verified.state || '').toUpperCase() !== 'DRAFT') {
      throw new Error('RECONCILIACION_POSTFLIGHT: la ACTIVIDAD no quedó DRAFT.');
    }
    if (verified.dueDate || verified.dueTime) {
      throw new Error('RECONCILIACION_POSTFLIGHT: la ACTIVIDAD histórica quedó con vencimiento.');
    }
    if (requiereDocumentoEditableClassroom_(normalized)) {
      verificarTodosLosGoogleDocsEnClassroom_(verified, idsGoogleDocumentosSolicitados_(normalized));
      result.documentId = String(normalized.documentId || result.documentId || '');
      result.shareMode = 'STUDENT_COPY';
    }

    postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
    result.reconciliationMode = true;
    result.reconciliationReason = motivo;
    result.sesionCanonica = sesion;
    result.sinVencimiento = true;
    result.estado = 'DRAFT';
    return result;
  });
}

function validarActividadReconciliacionHistorica() {
  if (typeof crearActividadReconciliacionHistorica !== 'function') {
    throw new Error('Falta crearActividadReconciliacionHistorica.');
  }
  return {
    ok:true,
    entrypoint:'crearActividadReconciliacionHistorica',
    uso:'SOLO_RECONCILIACION_HISTORICA',
    estado:'DRAFT',
    vencimiento:'NONE',
    googleDocs:'STUDENT_COPY',
    requiere:['reconciliationMode=true','explicitSequenceOverride=true','sesionCanonica','reconciliationReason']
  };
}
