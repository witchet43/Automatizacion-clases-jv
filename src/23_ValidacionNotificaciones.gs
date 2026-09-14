/** Validación de runtime sin provocar un error ni enviar correo de prueba. */
function validarConfiguracionNotificacionesErrores() {
  validarContratoArquitectura_();
  validarPoliticasCanonicas_();
  const email = resolverCorreoNotificacionErrores_();
  if (!email) {
    throw new Error('No se pudo resolver un destinatario para las alertas de errores. Configure la propiedad ACADEMIC_ERROR_NOTIFICATION_EMAIL.');
  }
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === ERROR_NOTIFICATION.WATCH_HANDLER; });
  if (!triggers.length) {
    throw new Error('El vigilante de errores operativos no está instalado.');
  }
  return {
    ok: true,
    notificacion: 'EMAIL',
    destinatarioResuelto: true,
    vigilanteInstalado: true,
    falloSilenciosoPermitido: false
  };
}
