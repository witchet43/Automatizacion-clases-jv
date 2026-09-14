/**
 * ENTRYPOINTS CANÓNICOS PARA CREACIÓN DE RECURSOS.
 *
 * Estas son las funciones que debe invocar la IA. Los motores *Directo_ quedan
 * como implementación interna/compatibilidad; toda entrada canónica notifica errores.
 */
function crearActividad(params) {
  return ejecutarConNotificacionError_('CREAR_ACTIVIDAD', params, function () {
    const actividad = aplicarReglaVencimientoActividadEnClase_(params);
    return crearCourseWorkDirecto_(normalizarCreacionDirecta_(actividad, 'ACTIVIDAD'));
  });
}

function crearTarea(params) {
  return ejecutarConNotificacionError_('CREAR_TAREA', params, function () {
    const tarea = aplicarReglaVencimientoTarea_(params);
    const result = crearCourseWorkDirecto_(normalizarCreacionDirecta_(tarea, 'TAREA'));
    const due = asegurarVencimientoTareaCreada_(tarea.courseId, result.workId, tarea);
    verificarVencimientoTareaCreada_(tarea.courseId, result.workId, tarea);
    result.vencimientoReparado = due.reparado === true;
    result.fechaLimiteLocal = tarea.fechaLimiteLocal;
    result.horaLimiteLocal = tarea.horaLimiteLocal;
    return result;
  });
}

function crearPractica(params) {
  return ejecutarConNotificacionError_('CREAR_PRACTICA', params, function () {
    return crearCourseWorkDirecto_(normalizarCreacionDirecta_(params, 'PRACTICA'));
  });
}

function crearQuiz(params) {
  return ejecutarConNotificacionError_('CREAR_QUIZ', params, function () {
    return crearEvaluacionDirecta_(normalizarCreacionDirecta_(params, 'QUIZ'));
  });
}

function crearExamen(params) {
  return ejecutarConNotificacionError_('CREAR_EXAMEN', params, function () {
    return crearEvaluacionDirecta_(normalizarCreacionDirecta_(params, 'EXAMEN'));
  });
}

function validarEntrypointsRecursosSeguros() {
  validarContratoArquitectura_();
  validarPoliticasCanonicas_();
  validarVencimientoActividadEnClaseCanonico();
  validarVencimientoTareaCanonico();
  const names = ['crearActividad','crearTarea','crearPractica','crearQuiz','crearExamen'];
  names.forEach(function (name) {
    if (typeof this[name] !== 'function') throw new Error('Falta entrypoint canónico: ' + name);
  }, this);
  if (!ACADEMIC_POLICY.ERROR_REPORTING || ACADEMIC_POLICY.ERROR_REPORTING.NOTIFY_ON_ERROR !== true) {
    throw new Error('La notificación de errores debe estar activa.');
  }
  return {ok:true, entrypoints:names, errorReporting:'REQUIRED', activityDue:'SESSION_END_MAX', taskDue:'NEXT_SESSION_START_MAX'};
}
