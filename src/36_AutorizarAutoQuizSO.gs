/**
 * Entrypoint de activación manual de una sola vez.
 * Google exige consentimiento interactivo del propietario para calendar.readonly.
 * Al ejecutar esta función desde Apps Script, se solicita ese permiso, se valida
 * el calendario real y se reinstala el monitor de un minuto.
 */
function autorizarYActivarAutoQuizSO() {
  return ejecutarConNotificacionError_('AUTORIZAR_ACTIVAR_AUTO_QUIZ_SO', {}, function () {
    const acceso = verificarAccesoCalendarAutoQuizSO();
    if (!acceso || acceso.ok !== true) throw new Error('No se pudo verificar acceso al calendario de Sistemas Operativos.');
    const monitor = instalarMonitorSolicitudesImportacion();
    registrarEstadoAutoQuizSO_('OK_AUTORIZADO', {acceso:acceso,monitor:monitor}, true);
    return {
      ok:true,
      calendarId:AUTO_SIMPLE_QUIZ_SO_POLICY.CALENDAR_ID,
      courseId:AUTO_SIMPLE_QUIZ_SO_POLICY.COURSE_ID,
      upcomingMatches:Number(acceso.upcomingMatches || 0),
      firstStart:String(acceso.firstStart || ''),
      monitor:monitor
    };
  });
}
