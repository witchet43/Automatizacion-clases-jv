/** Diagnóstico mínimo de identidad de ejecución para autorizaciones incrementales. */
function diagnosticarIdentidadEjecucion() {
  return {
    ok: true,
    effectiveUser: String(Session.getEffectiveUser().getEmail() || ''),
    activeUser: String(Session.getActiveUser().getEmail() || ''),
    timezone: Session.getScriptTimeZone()
  };
}
