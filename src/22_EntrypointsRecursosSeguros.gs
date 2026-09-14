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
    return crearCourseWorkDirecto_(normalizarCreacionDirecta_(params, 'TAREA'));
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
  const names = ['crearActividad','crearTarea','crearPractica','crearQuiz','crearExamen'];
  names.forEach(function (name) {
    if (typeof this[name] !== 'function') throw new Error('Falta entrypoint canónico: ' + name);
  }, this);
  if (!ACADEMIC_POLICY.ERROR_REPORTING || ACADEMIC_POLICY.ERROR_REPORTING.NOTIFY_ON_ERROR !== true) {
    throw new Error('La notificación de errores debe estar activa.');
  }
  return {ok:true, entrypoints:names, errorReporting:'REQUIRED', activityDue:'SESSION_END_MAX'};
}
