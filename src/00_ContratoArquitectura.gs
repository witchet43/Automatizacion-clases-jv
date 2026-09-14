/**
 * CONTRATO ARQUITECTÓNICO FUNDAMENTAL
 *
 * Este proyecto no delega reglas de comportamiento a prompts, chats o memoria.
 * La IA expresa intención y parámetros mínimos; el código ejecutable contiene
 * el algoritmo, las reglas, validaciones, estados e invariantes.
 *
 * Un cambio de comportamiento NO se considera terminado hasta que:
 * 1) quede implementado en código canónico;
 * 2) exista una verificación determinista o regresión que proteja el cambio;
 * 3) el despliegue haya sido validado.
 *
 * Ningún error de una operación canónica puede quedar silencioso: debe quedar
 * registrado, notificarse al docente y conservar su excepción técnica.
 *
 * La documentación explica el contrato; nunca sustituye su implementación.
 */
const ARCHITECTURE_CONTRACT = Object.freeze({
  BEHAVIOR_SOURCE: 'CODE',
  AI_ROLE: 'INTENT_AND_MINIMAL_PARAMETERS',
  PROMPT_ALGORITHM_RECONSTRUCTION_ALLOWED: false,
  BEHAVIOR_CHANGE_REQUIRES_CODE: true,
  BEHAVIOR_CHANGE_REQUIRES_REGRESSION: true,
  DOCUMENTATION_IS_EXECUTION_SOURCE: false,
  DEPLOYMENT_VERIFICATION_REQUIRED: true,
  SILENT_SCRIPT_FAILURE_ALLOWED: false
});

function validarContratoArquitectura_() {
  const c = ARCHITECTURE_CONTRACT;
  if (c.BEHAVIOR_SOURCE !== 'CODE') throw new Error('El comportamiento debe vivir en código.');
  if (c.AI_ROLE !== 'INTENT_AND_MINIMAL_PARAMETERS') throw new Error('La IA no debe reconstruir algoritmos.');
  if (c.PROMPT_ALGORITHM_RECONSTRUCTION_ALLOWED !== false) throw new Error('No se permite reconstruir algoritmos desde prompts.');
  if (c.BEHAVIOR_CHANGE_REQUIRES_CODE !== true) throw new Error('Todo cambio de comportamiento debe quedar implementado en código.');
  if (c.BEHAVIOR_CHANGE_REQUIRES_REGRESSION !== true) throw new Error('Todo cambio de comportamiento debe quedar protegido por regresión o validación determinista.');
  if (c.DOCUMENTATION_IS_EXECUTION_SOURCE !== false) throw new Error('La documentación no puede sustituir al código ejecutable.');
  if (c.DEPLOYMENT_VERIFICATION_REQUIRED !== true) throw new Error('Todo cambio debe verificarse después del despliegue.');
  if (c.SILENT_SCRIPT_FAILURE_ALLOWED !== false) throw new Error('Un error de script nunca puede quedar silencioso.');
  return Object.assign({}, c);
}
