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
  REMOTE_TRANSPORT: 'WEB_APP',
  PUBLIC_WEBAPP_SCOPE: 'DIDACTIC_MATERIALIZATION',
  PROMPT_ALGORITHM_RECONSTRUCTION_ALLOWED: false,
  BEHAVIOR_CHANGE_REQUIRES_CODE: true,
  BEHAVIOR_CHANGE_REQUIRES_REGRESSION: true,
  DOCUMENTATION_IS_EXECUTION_SOURCE: false,
  DEPLOYMENT_VERIFICATION_REQUIRED: true,
  SILENT_SCRIPT_FAILURE_ALLOWED: false,
  ROUTE_SOURCE: 'MANIFEST_OPERATION',
  ALTERNATIVE_REMOTE_TRANSPORT_ALLOWED: false,
  DIRECT_GOOGLE_API_WORKFLOWS_ALLOWED: false,
  ONE_OFF_ACADEMIC_GENERATORS_ALLOWED: false,
  RECOVERY_POLICY: 'CANONICAL_ROUTE_ONLY',
  INCIDENT_REGRESSION_REQUIRED: true,
  PERIODIC_ACADEMIC_POLLING_ALLOWED: false,
  GENERATED_MANIFEST_REGISTRY_REQUIRED: true,
  OPERATING_MODEL: 'STATIC_WEB_APP_SERVICE',
  ACADEMIC_OPERATIONS_ARE_DATA_ONLY: true,
  ACADEMIC_OPERATION_SOURCE_MUTATION_ALLOWED: false,
  ACADEMIC_OPERATION_WORKFLOW_MUTATION_ALLOWED: false,
  ACADEMIC_OPERATION_MANIFEST_MUTATION_ALLOWED: false,
  ACADEMIC_OPERATION_DEPLOYMENT_ALLOWED: false,
  ACADEMIC_FAILURE_GRANTS_DEVELOPMENT_AUTHORIZATION: false,
  SAME_WEBAPP_RECOVERY_REQUIRED: true,
  PLATFORM_CHANGE_REQUIRES_EXPLICIT_USER_AUTHORIZATION: true,
  PLATFORM_CHANGE_EVIDENCE_REQUIRED: true,
  PLATFORM_CHANGE_MAY_SHARE_COMMIT_WITH_ACADEMIC_REQUEST: false,
  DEPLOY_TRIGGER: 'PLATFORM_CHANGE_EVIDENCE_ONLY',
  NEW_DEPLOYMENT_ALLOWED: false,
  WORK_MODE_ALLOWED: false,
  PLANNING_GAMMA_STATE_IS_AUTHORITY: false,
  GAMMA_LIVE_VERIFICATION_REQUIRED_BEFORE_REUSE: true,
  GAMMA_LIVE_SEARCH_REQUIRED_BEFORE_CREATE: true,
  GAMMA_ARCHIVED_COUNTS_AS_PREPARED: false,
  GAMMA_ACTIVE_CANONICAL_ONLY_COUNTS_AS_VERIFIED: true,
  GAMMA_POST_GENERATION_READ_REQUIRED: true,
  NOTION_CLASS_NOTES_REQUIRED: true,
  NOTION_CLASS_NOTES_ROUTE: 'NOTION_CONNECTOR',
  NOTION_LIVE_VERIFICATION_REQUIRED: true,
  NOTION_SEARCH_BEFORE_CREATE_REQUIRED: true,
  NOTION_POST_CREATE_FETCH_REQUIRED: true,
  NOTION_EXACT_CANONICAL_TITLE_REQUIRED: true,
  NOTION_DUPLICATES_ALLOWED: false,
  NOTION_PLANNING_STATE_IS_AUTHORITY: false,
  CLASS_PACKAGE_COMPLETE_REQUIRES_NOTION_NOTES: true,
  CLASS_GENERATION_ORDER: 'GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT'
});

function validarContratoArquitectura_() {
  const c = ARCHITECTURE_CONTRACT;
  if (c.BEHAVIOR_SOURCE !== 'CODE') throw new Error('El comportamiento debe vivir en código.');
  if (c.AI_ROLE !== 'INTENT_AND_MINIMAL_PARAMETERS') throw new Error('La IA no debe reconstruir algoritmos.');
  if (c.REMOTE_TRANSPORT !== 'WEB_APP') throw new Error('El transporte remoto canónico debe ser WEB_APP.');
  if (c.PUBLIC_WEBAPP_SCOPE !== 'DIDACTIC_MATERIALIZATION') throw new Error('El Web App público debe limitarse a materialización didáctica.');
  if (c.PROMPT_ALGORITHM_RECONSTRUCTION_ALLOWED !== false) throw new Error('No se permite reconstruir algoritmos desde prompts.');
  if (c.BEHAVIOR_CHANGE_REQUIRES_CODE !== true) throw new Error('Todo cambio de comportamiento debe quedar implementado en código.');
  if (c.BEHAVIOR_CHANGE_REQUIRES_REGRESSION !== true) throw new Error('Todo cambio de comportamiento debe quedar protegido por regresión o validación determinista.');
  if (c.DOCUMENTATION_IS_EXECUTION_SOURCE !== false) throw new Error('La documentación no puede sustituir al código ejecutable.');
  if (c.DEPLOYMENT_VERIFICATION_REQUIRED !== true) throw new Error('Todo cambio debe verificarse después del despliegue.');
  if (c.SILENT_SCRIPT_FAILURE_ALLOWED !== false) throw new Error('Un error de script nunca puede quedar silencioso.');
  if (c.ROUTE_SOURCE !== 'MANIFEST_OPERATION') throw new Error('La ruta debe resolverse exclusivamente desde el manifiesto.');
  if (c.ALTERNATIVE_REMOTE_TRANSPORT_ALLOWED !== false) throw new Error('No se permiten transportes remotos alternativos.');
  if (c.DIRECT_GOOGLE_API_WORKFLOWS_ALLOWED !== false) throw new Error('Los workflows no pueden materializar recursos con APIs de Google directas.');
  if (c.ONE_OFF_ACADEMIC_GENERATORS_ALLOWED !== false) throw new Error('No se permiten generadores académicos específicos por materia/unidad.');
  if (c.RECOVERY_POLICY !== 'CANONICAL_ROUTE_ONLY') throw new Error('La recuperación debe permanecer en la ruta canónica.');
  if (c.INCIDENT_REGRESSION_REQUIRED !== true) throw new Error('Toda causa raíz corregida debe quedar protegida por regresión.');
  if (c.PERIODIC_ACADEMIC_POLLING_ALLOWED !== false) throw new Error('No se permite polling académico periódico como sustituto de operaciones bajo demanda.');
  if (c.GENERATED_MANIFEST_REGISTRY_REQUIRED !== true) throw new Error('Cursos y planeaciones deben provenir del manifiesto generado.');
  if (c.OPERATING_MODEL !== 'STATIC_WEB_APP_SERVICE') throw new Error('La Web App debe operar como servicio estático durante operaciones académicas.');
  if (c.ACADEMIC_OPERATIONS_ARE_DATA_ONLY !== true) throw new Error('Las operaciones académicas deben ser data-only.');
  if (c.ACADEMIC_OPERATION_SOURCE_MUTATION_ALLOWED !== false ||
      c.ACADEMIC_OPERATION_WORKFLOW_MUTATION_ALLOWED !== false ||
      c.ACADEMIC_OPERATION_MANIFEST_MUTATION_ALLOWED !== false ||
      c.ACADEMIC_OPERATION_DEPLOYMENT_ALLOWED !== false)
    throw new Error('Una operación académica no puede modificar ni desplegar plataforma.');
  if (c.ACADEMIC_FAILURE_GRANTS_DEVELOPMENT_AUTHORIZATION !== false) throw new Error('Un fallo operacional nunca autoriza desarrollo.');
  if (c.SAME_WEBAPP_RECOVERY_REQUIRED !== true) throw new Error('La recuperación debe usar la misma Web App.');
  if (c.PLATFORM_CHANGE_REQUIRES_EXPLICIT_USER_AUTHORIZATION !== true ||
      c.PLATFORM_CHANGE_EVIDENCE_REQUIRED !== true)
    throw new Error('Todo cambio de plataforma requiere autorización explícita y evidencia.');
  if (c.PLATFORM_CHANGE_MAY_SHARE_COMMIT_WITH_ACADEMIC_REQUEST !== false)
    throw new Error('Operación académica y cambio de plataforma no pueden compartir commit.');
  if (c.DEPLOY_TRIGGER !== 'PLATFORM_CHANGE_EVIDENCE_ONLY') throw new Error('Deploy solo puede dispararse por evidencia de cambio de plataforma.');
  if (c.NEW_DEPLOYMENT_ALLOWED !== false) throw new Error('Solo se actualiza el deployment canónico existente.');
  if (c.WORK_MODE_ALLOWED !== false) throw new Error('Work mode no forma parte de esta arquitectura.');
  if (c.PLANNING_GAMMA_STATE_IS_AUTHORITY !== false) throw new Error('La planeación no puede certificar el estado vivo de Gamma.');
  if (c.GAMMA_LIVE_VERIFICATION_REQUIRED_BEFORE_REUSE !== true) throw new Error('Toda reutilización de Gamma exige verificación LIVE.');
  if (c.GAMMA_LIVE_SEARCH_REQUIRED_BEFORE_CREATE !== true) throw new Error('Toda creación de Gamma exige búsqueda LIVE previa.');
  if (c.GAMMA_ARCHIVED_COUNTS_AS_PREPARED !== false) throw new Error('Una Gamma archivada nunca acredita paquete preparado.');
  if (c.GAMMA_ACTIVE_CANONICAL_ONLY_COUNTS_AS_VERIFIED !== true) throw new Error('Solo Gamma activa y canónica puede contarse como verificada.');
  if (c.GAMMA_POST_GENERATION_READ_REQUIRED !== true) throw new Error('Toda Gamma generada debe leerse y verificarse antes de registrarla.');
  if (c.NOTION_CLASS_NOTES_REQUIRED !== true || c.NOTION_CLASS_NOTES_ROUTE !== 'NOTION_CONNECTOR')
    throw new Error('Toda clase requiere notas canónicas en Notion por su conector.');
  if (c.NOTION_LIVE_VERIFICATION_REQUIRED !== true || c.NOTION_SEARCH_BEFORE_CREATE_REQUIRED !== true ||
      c.NOTION_POST_CREATE_FETCH_REQUIRED !== true)
    throw new Error('Notion exige búsqueda y verificación LIVE antes/después de crear.');
  if (c.NOTION_EXACT_CANONICAL_TITLE_REQUIRED !== true || c.NOTION_DUPLICATES_ALLOWED !== false)
    throw new Error('Las notas Notion deben usar título canónico exacto y no admitir duplicados.');
  if (c.NOTION_PLANNING_STATE_IS_AUTHORITY !== false)
    throw new Error('La planeación no puede certificar notas Notion.');
  if (c.CLASS_PACKAGE_COMPLETE_REQUIRES_NOTION_NOTES !== true)
    throw new Error('Una clase sin notas Notion no puede declararse paquete completo.');
  if (c.CLASS_GENERATION_ORDER !== 'GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT')
    throw new Error('El orden de generación debe terminar en Notion y postflight.');
  return Object.assign({}, c);
}
