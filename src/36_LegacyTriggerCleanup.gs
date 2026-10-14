/**
 * Limpieza transitoria de triggers de experimentos retirados.
 * No contiene lógica académica ni crea recursos.
 */
function monitorearQuizAbiertoOpenAI() {
  let removed=0;
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'monitorearQuizAbiertoOpenAI'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); removed++; });
  return {ok:true,descomisionado:true,triggersEliminados:removed};
}
