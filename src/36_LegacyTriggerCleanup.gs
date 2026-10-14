/**
 * Limpieza transitoria de triggers de mecanismos retirados.
 * Los handlers existen únicamente para permitir que un trigger legado se
 * ejecute una última vez, se elimine y deje de generar correos de error.
 */
function eliminarTriggersLegacyPorHandler_(handler) {
  let removed=0;
  ScriptApp.getProjectTriggers()
    .filter(function(t){return t.getHandlerFunction()===handler;})
    .forEach(function(t){ScriptApp.deleteTrigger(t);removed++;});
  return removed;
}
function monitorearQuizAbiertoOpenAI() {
  return {ok:true,descomisionado:true,triggersEliminados:eliminarTriggersLegacyPorHandler_('monitorearQuizAbiertoOpenAI')};
}
function evaluarEntregas() {
  return {ok:true,descomisionado:true,triggersEliminados:eliminarTriggersLegacyPorHandler_('evaluarEntregas')};
}
