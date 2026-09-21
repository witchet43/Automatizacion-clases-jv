/**
 * Crea una TAREA histórica únicamente para reconciliación académica.
 *
 * Uso permitido:
 * - la sesión ya ocurrió y, por tanto, la regla ordinaria de vencimiento futuro
 *   impide usar crearTarea();
 * - existe una sesión canónica explícita y el tema coincide exactamente con la
 *   planeación;
 * - el recurso debe quedar DRAFT y SIN vencimiento;
 * - no publica, no modifica recursos existentes y reutiliza por título/tema.
 *
 * Esta función NO sustituye crearTarea() para trabajo ordinario.
 */
function crearTareaReconciliacionHistorica(params) {
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

  // Prohíbe introducir un vencimiento por cualquier alias conocido.
  [
    'fechaLimite','horaLimite','dueDate','dueTime','fechaLimiteLocal','horaLimiteLocal',
    'fechaSiguienteSesion','horaInicioSiguienteSesion','nextSessionDate','nextSessionStartTime'
  ].forEach(function (key) {
    if (p[key] !== undefined && p[key] !== null && String(p[key]).trim() !== '') {
      throw new Error('RECONCILIACION_SIN_VENCIMIENTO: no se permite ' + key + '.');
    }
  });

  const ctx = prepararContextoGuardrailRecurso_(p, 'TAREA');
  preflightDocumentoMaestro(ctx.guardrailRequest);
  assertAcademicAutomationWriteEnabled_();

  const normalized = normalizarCreacionDirecta_(ctx.params, 'TAREA');
  delete normalized.fechaLimite;
  delete normalized.horaLimite;
  delete normalized.dueDate;
  delete normalized.dueTime;

  const result = crearCourseWorkDirecto_(normalized);
  const verified = Classroom.Courses.CourseWork.get(String(normalized.courseId), String(result.workId));
  if (String(verified.state || '').toUpperCase() !== 'DRAFT') {
    throw new Error('RECONCILIACION_POSTFLIGHT: la TAREA no quedó DRAFT.');
  }
  if (verified.dueDate || verified.dueTime) {
    throw new Error('RECONCILIACION_POSTFLIGHT: la TAREA histórica quedó con vencimiento.');
  }

  postflightDocumentoMaestro(normalizarResultadoGuardrail_(result), ctx.guardrailRequest);
  result.reconciliationMode = true;
  result.reconciliationReason = motivo;
  result.sesionCanonica = sesion;
  result.sinVencimiento = true;
  return result;
}

function validarTareaReconciliacionHistorica() {
  if (typeof crearTareaReconciliacionHistorica !== 'function') {
    throw new Error('Falta crearTareaReconciliacionHistorica.');
  }
  return {
    ok:true,
    entrypoint:'crearTareaReconciliacionHistorica',
    uso:'SOLO_RECONCILIACION_HISTORICA',
    estado:'DRAFT',
    vencimiento:'NONE',
    requiere:['reconciliationMode=true','explicitSequenceOverride=true','sesionCanonica','reconciliationReason']
  };
}
