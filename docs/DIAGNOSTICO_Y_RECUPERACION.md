# Diagnóstico, verificación y recuperación — Classroom Academic Gateway

**Uso:** seguir esta secuencia después de conectar el plugin, después de cualquier deploy y ante errores. Nunca probar creando o publicando notas de alumnos.

## 0. Contrato obligatorio de errores por eslabón (noviembre 2026)

**Objetivo:** el operador no debe recibir únicamente `UPSTREAM_HTTP_403` o
`CANONICAL_UPSTREAM_FAILURE`. Las herramientas del MCP devuelven un objeto
de diagnóstico seguro con estas claves:

| Campo | Qué permite determinar |
|---|---|
| `errorCode` | Tipo de fallo, sin detalles privados |
| `failedAt` | Último eslabón observable: OAuth, MCP, Google WebApp (entrada o redirección), Apps Script, Classroom/Drive/Docs/Sheets/Forms/Calendar, Cloud Run Admin, Secret Manager o GitHub |
| `phase` | Token, HTTP, transporte, lectura, decodificación, autorización/contexto, política o ejecución |
| `httpStatus` | Código HTTP cuando una respuesta realmente se recibió |
| `wasRedirected` | Si la respuesta final siguió una redirección |
| `diagnosticId` | Identificador aleatorio para buscar **MCP_CHAIN_DIAGNOSTIC** en Cloud Logging |
| `requestIdHint` | Últimos 12 caracteres del ID de solicitud, nunca credenciales |
| `sourceLocation` | Hasta tres funciones identificadas por Apps Script |
| `nextCheck` | Siguiente punto de inspección indicado por el error, no autorización de cambios |

Ejemplo de formato (valores ilustrativos, **no** resultado de producción):

```json
{"ok":false,"errorCode":"UPSTREAM_HTTP_403",
 "failedAt":"APPS_SCRIPT_WEBAPP_ENTRY","phase":"GOOGLE_HTTP_RESPONSE",
 "httpStatus":403,"diagnosticId":"0011223344556677",
 "nextCheck":"CHECK_WEBAPP_HTTP_ACCESS_AND_REDIRECT"}
```

**Límites de inferencia:** `APPS_SCRIPT_WEBAPP_ENTRY` indica el *host HTTP
final observado*, **no demuestra** que se ejecutó `doPost`. Si el host final
es `script.googleusercontent.com`, se devuelve
`APPS_SCRIPT_RESPONSE_REDIRECT`; si no está disponible la URL final se devuelve
`WEBAPP_HTTP_GATE_UNKNOWN` o `WEBAPP_REDIRECT_UNKNOWN`. En ningún caso se
imprime la URL completa: las redirecciones pueden incluir tokens.

**Política de seguridad y alcance:** ningún diagnóstico devuelve contraseñas,
llaves HMAC, cabeceras Authorization, tokens, cuerpo de solicitudes/respuestas,
identidad o calificaciones de estudiantes. Los errores no disparan nuevos
intentos de escritura. Las respuestas de Apps Script deben exponer
`errorDetails.failedAt`, `stage`, `provider`, `sourceLocation` y
`requestIdHint`, con `error` reducido a su código seguro. El Gateway conserva
esas señales y emite un ID para correlación en logs. No se requiere nuevo
servicio, almacenamiento, plugin ni credencial para la observabilidad.

**Casos canónicos:**

- `MCP_OAUTH_BOUNDARY / BEARER_VALIDATION`: token o scope rechazado antes de ejecutar la herramienta.
- `APPS_SCRIPT_WEBAPP_ENTRY / GOOGLE_HTTP_RESPONSE / 403`: respuesta HTTP de la entrada Google; no asumir firma HMAC equivocada.
- `APPS_SCRIPT_RESPONSE_REDIRECT`: respuesta HTTP rechazada tras la redirección a Google Content.
- `MCP_TO_APPS_SCRIPT_WEBAPP / NETWORK_TRANSPORT`: no se recibió una respuesta HTTP.
- `APPS_SCRIPT_AUTH_CONTEXT`: el código Apps Script devolvió un fallo de firma o contexto.
- `GOOGLE_CLASSROOM_API`, `GOOGLE_DRIVE_API`, `GOOGLE_DOCS_API`, `GOOGLE_SHEETS_API`, `GOOGLE_FORMS_API`, `GOOGLE_CALENDAR_API`: la excepción de Apps Script contiene evidencia del proveedor; sin evidencia se conserva `APPS_SCRIPT_EXECUTION`.
- `CLOUD_RUN_ADMIN_API`, `CLOUD_RUN_METADATA_SERVER`, `GOOGLE_SECRET_MANAGER`: introspección GCP fallida; no equivale a una falla de Classroom.
- `GITHUB_APP_CONFIG` o `GITHUB_APP_TOKEN_EXCHANGE`: herramienta auxiliar de GitHub; no implica que el MCP académico deje de funcionar.

**Regresión:** `mcp-cloud-run/tests/chain-diagnostics.test.mjs`,
`mcp-cloud-run/tests/adapter.test.mjs`,
`scripts/test-webapp-error-diagnostics.mjs` y
`scripts/verify-academic-webapp.mjs`. Se ejercitan errores simulados de HTTP,
redirección, red, firma y ejecución, sin datos reales de Classroom. El
workflow de Cloud Run comprueba además una firma HMAC LIVE contra Apps Script
tras desplegar; si falla, el resultado de la verificación no acredita operación
académica aunque la revisión esté creada.

## Acceso autenticado obligatorio — 3 de noviembre de 2026

El flujo académico ya no permite ejecutar herramientas MCP de forma anónima.

- **ChatGPT → MCP:** `tools/call` exige JWT OAuth de Auth0 autorizado. `academic.read` habilita lecturas generales; `academic.close_unit` habilita escrituras. Las lecturas privadas de estudiantes requieren `academic.read` explícito. `initialize`, `tools/list` y el documento OAuth discovery pueden seguir públicos porque solo describen el protocolo y no exponen datos académicos.
- **Cloud Run:** la entrada HTTPS sigue invocable para permitir el flujo de OAuth **gestionado por la aplicación**; Google Cloud IAM no acepta directamente tokens Auth0 como si fueran ID tokens de servicio Google. No confundir transporte HTTP público con permiso para ejecutar herramientas.
- **Cloud Run → Apps Script:** el servidor obtiene un token Google OAuth temporal de la **cuenta de servicio ya configurada**, mediante el metadata server, y lo envía únicamente a `script.google.com` usando el encabezado `Authorization: Bearer`. No se crea ni almacena una clave estática; el entorno de producción declara `GOOGLE_WEBAPP_AUTH_MODE=google_oauth`.
- **Apps Script:** `webapp.access=ANYONE` significa **solo usuarios Google autenticados**; `ANYONE_ANONYMOUS` queda prohibido. `executeAs=USER_DEPLOYING` se conserva. Todas las operaciones académicas son POST con firma HMAC; GET no ejecuta diagnósticos ni expone datos.
- **Validación:** la CI de Apps Script verifica el rechazo anónimo. El flujo completo solo se considera operativo después de que un cliente OAuth autorizado llame a `gateway_status(true)` y obtenga `upstreamHmacAccepted=true`.

**Restricción técnica:** los tokens Google de una cuenta de servicio NO equivalen a una sesión Google personal. Google puede seguir respondiendo 401/403 pese a que el token se envíe correctamente; la transición no se declarará operativa hasta que el servidor acepte una llamada real. La API `scripts.run` no es un sustituto automático porque Google no admite service accounts para ese método. No reducir permisos ni abrir de nuevo el acceso anónimo como “solución” sin autorización explícita.

## Ruta vigente — solo WebApp + HMAC (decisión del usuario, 4-nov-2026)

**Único transporte académico permitido:**
`ChatGPT → Auth0 MCP → Cloud Run → POST WebApp canónica → Apps Script → Classroom`.

- WebApp: `webapp.access=ANYONE_ANONYMOUS`,
  `executeAs=USER_DEPLOYING`. Esto permite llegar al manejador HTTP
  **sin requerir OAuth de Google**; no concede autorización académica.
- Cloud Run: `ACADEMIC_UPSTREAM_TRANSPORT=webapp` y
  `GOOGLE_WEBAPP_AUTH_MODE=legacy`. No solicita tokens de Google ni usa
  `scripts.run`.
- MCP: mantiene autenticación Auth0 en `tools/call` y permisos por herramienta.
- Apps Script: todas las operaciones académicas requieren la firma HMAC
  `ACADEMIC_WRITE_HMAC_KEY` de la infraestructura ya existente.
  Solicitudes sin firma o con firmas inválidas son rechazadas.
- La ruta `EXECUTION_API`, cliente OAuth Google y sus tres secretos
  **NO forman parte del transporte activo**. No rotar ni activar esas
  credenciales como remedio ante fallos de WebApp.
- Se conserva el mismo `deploymentId` y URL canónicos:
  `AKfycbz2rCuB9jUsbnt0tj0RgHmr3lguOZjVL34a_2F_yhggiwLNTOEn8QdsdbFv4SK6aGxr`.
- Las escrituras mantienen DRAFT e idempotencia, sin publicar notas ni
  modificar `assignedGrade`.

**Pruebas obligatorias, en orden:**
1. CI efectúa POST sin firma al deployment existente y exige **JSON
   `ACADEMIC_HMAC_DIAGNOSTIC_INVALID`**. HTTP 401/403 antes de `doPost`
   demuestra fallo en el acceso de Google; no equivale a HMAC inválida.
2. `gateway_status(verificarFirma=true)` exige
   `upstreamHmacAccepted=true`, `keyEquivalent=true` y
   `signatureAccepted=true`.
3. `diagnosticar_clase` sobre curso registrado, únicamente lectura.
4. Si los anteriores pasan, hacer una operación escolar real a petición
   explícita del usuario, con las políticas existentes de DRAFT.

**Riesgo externo:** los reportes de Google de octubre-noviembre 2026 sobre
WebApps que rechazan solicitudes antes de `doPost` no demuestran la causa
de este caso. Si reaparece HTTP 403/400, detener cambios y registrar estado
HTTP, destino de redirección y existencia de ejecución de Apps Script. No
introducir rutas alternativas, despliegues paralelos ni Google OAuth
sin nueva autorización explícita.

## 1. Health check seguro en orden

| Prueba | Acción | Criterio mínimo |
|---|---|---|
| A. Plugin disponible | Seleccionar el plugin y verificar operaciones expuestas | Lista de 12 herramientas, no solo skills |
| B. Servidor MCP local | `gateway_status(verificarFirma=false)` | `configured=true`, `STREAMABLE_HTTP_OAUTH`, contrato `1.1.0` |
| C. HMAC hasta Apps Script | `gateway_status(verificarFirma=true)` | `upstreamHmacAccepted=true` |
| D. Classroom real solo lectura | `diagnosticar_clase(courseId="875776451793",soloClassroom=true)` | `ok=true`, curso Sistemas Operativos, listado real DRAFT/PUBLISHED |
| E. Protección OAuth | Workflow MCP realiza prueba de rechazo anónimo | Intento de `cerrar_unidad` anónimo devuelve HTTP `401` |
| F. WebApp | `scripts/verify-academic-webapp.mjs` desde CI | Rechaza requests inválidas; ninguna mutación real |
| G. Evidencia de deploy | GitHub Actions run y revisión Cloud Run / Apps Script | `success`, commit conocido, mismo servicio, ningún endpoint alterno |

**Importante:** el hash del manifest que devuelve `gateway_status` debe corresponder a la versión de `config/academic-context.json` y Apps Script. Un `/health` exitoso no acredita HMAC ni acceso a alumnos. `success` en Actions no demuestra que ChatGPT haya obtenido un token con el scope necesario.

### Lista de herramientas MCP anunciadas

`gateway_status`, `consultar_despliegues_mcp`, `consultar_ejecucion_mcp`, `iniciar_despliegue_mcp`, `verificar_despliegue`, `diagnosticar_clase`, `auditar_recursos`, `crear_recurso`, `listar_entregas`, `calificar_entrega_draft`, `cerrar_materia`, `cerrar_unidad`.

Las operaciones `consultar_despliegues_mcp` y `verificar_despliegue` son auxiliares de observabilidad; pueden requerir permisos que no usan las operaciones de Classroom. No deducir una falla general de HMAC de un error en esas herramientas.

## 2. Tabla de incidentes

| Síntoma / error | Origen probable | Diagnóstico y corrección segura |
|---|---|---|
| ChatGPT no muestra herramientas, aunque el plugin aparece instalado | Catálogo/selección del plugin o conexión | Confirmar paquete/ID realmente invocado, reconectar misma app, comprobar `tools/list`. No recrear MCP |
| `invalid_request: Client tpc_... is not authorized to access resource server` | Auth0 API Application Access | Abrir API correcta y aprobar **User-delegated Access** para el `tpc_` del intento actual, scopes mínimos; no activar todos los clientes |
| `no connections enabled for the client` | Conexión de identidad no disponible para cliente tercero | Revisar Authentication → conexión utilizada; se resolvió con `Promote Connection to Domain Level`. Evaluar el alcance del ajuste |
| OAuth login funciona, pero `INSUFFICIENT_SCOPE` | Scope insuficiente o política MCP/ChatGPT inconsistente | Confirmar `academic.read` para lectura privada y `academic.close_unit` para escritura; comparar `securitySchemes`, `verifyBearer` y permisos actuales |
| `SUBJECT_NOT_ALLOWED` | JWT válido pero `sub` fuera de allowlist | Revisar identidad autenticada y `academic-mcp-allowed-subjects` con administrador; no abrir acceso a todos |
| `AUTH_REQUIRED` o `401` | No hay token OAuth requerido | Reconectar, solicitar consentimiento adecuado; para pruebas de rechazo anónimo **es correcto** |
| `MCP_CONFIG_REQUIRED` | Variable de entorno ausente | Comparar configuración real con workflow de Cloud Run; no copiar valores secretos al chat |
| `ACADEMIC_HMAC_KEYS_DIFFER`, `APPS_SCRIPT_HMAC_DIFFERS_FROM_SECRET_MANAGER`, `CLOUD_RUN_HMAC_DIFFERS_FROM_SECRET_MANAGER` | Secret Manager, revisión de Cloud Run o Script Property no sincronizados | Ejecutar `gateway_status(true)`; inspeccionar versiones/identidad de secreto sin imprimir valores; planificar rotación coordinada si es inevitable |
| `ACADEMIC_CONTEXT_MISMATCH` | Manifest, Apps Script y contexto MCP desalineados | Calcular SHA exacto, revisar `sync-context.mjs`, bundle generado y deployments; bloquear escritura hasta corregir ambas capas |
| `GITHUB_APP_CREDENTIALS_NOT_CONFIGURED` | Herramienta opcional para consultar Actions desde MCP sin GitHub App | Usar directamente **GitHub** o la página Actions para consultar runs. No poner un PAT en source y no usar esta falla como motivo para rehacer OAuth |
| `CANONICAL_UPSTREAM_FAILURE` en `verificar_despliegue` | API Cloud Run Admin o permisos de runtime; aún sin raíz demostrada | Leer logs sanitizados y auditar cuenta/roles; no ampliar IAM sin comprobación |
| `WEB_APP_AUTHORIZATION_REQUIRED` | WebApp devolvió HTML/403 | Revisar el deployment **existente** y acceso; no crear nueva URL |
| `ACADEMIC_WRITE_AUTH_REQUIRED`, `ACADEMIC_WRITE_AUTH_INVALID` | Escritura sin firma válida | Validar que el MCP firma el body exacto, reloj/nonce y clave compartida; nunca saltar HMAC |
| `ACADEMIC_WRITE_AUTH_EXPIRED` | Timestamp fuera de tolerancia | Revisar reloj y generar una solicitud nueva **solo si se demuestra que la operación anterior no reservó recibo ni escribió** |
| `ACADEMIC_WRITE_DUPLICATE_BLOCKED_RECONCILE_FIRST` / `PENDING` | Protección idempotente tras intento anterior | Consultar Classroom y recibo correspondiente con un procedimiento autorizado; no borrar recibos ni reintentar con otro ID |
| `APPS_SCRIPT_VERSION_LIMIT_MANUAL_BULK_DELETE_REQUIRED` | Apps Script acercándose al límite | Revisar `scripts/prune-apps-script-versions.mjs`: identifica versiones no referenciadas. El borrado, si se confirma, es manual; no borrar versiones referenciadas por deployments |
| GitHub workflow verde pero no hay notas | Se validó infraestructura, no una operación académica | Comprobar identificadores y estado real de CourseWork y StudentSubmissions; nunca declarar cierre por CI |

## 3. Punto de no retorno / acciones prohibidas

No eliminar ni regenerar:
- `academic-write-hmac`, `academic-mcp-allowed-subjects` o la Script Property `ACADEMIC_WRITE_HMAC_KEY` sin plan de rotación.
- Recibos `ACADEMIC_WRITE_RECEIPT_` (incluidos `PENDING`) ni claves `SIMPLE_QUIZ_REQUEST_` válidas.
- URL/ID de WebApp canónica, proyecto `classroom-mcp-512122`, tenant Auth0 ni plugin conectado.
- Dos Cloud Run legados o un segundo plugin **sin pruebas de consumidores y tráfico**. La auditoría de 27/10 devolvió Cloud Logging **INCONCLUSIVE**, no prueba de cero uso.

Los cambios en repositorio **no** autorizan eliminar trabajos, notas publicadas, triggers ni Script Properties.

## Diagnóstico dirigido: Forms API sin escrituras (5-nov-2026)

Si el último error de un curso es `FORMS_BATCHUPDATE_*`, el comando
`diagnosticar_clase(courseId, soloClassroom=true)` incluye
`formsApiProbe` de **solo lectura**. Primero comprueba las autorizaciones
`forms.body` y `script.external_request`, después la disponibilidad
de un token OAuth (nunca su valor) y finalmente realiza un GET sobre un
identificador de formulario **deliberadamente inexistente**. HTTP 400 o
404 significa que UrlFetch completó transporte; un 401/403 demuestra que
se recibió un rechazo HTTP y hay que revisar `googleStatus`.
`AUTHORIZATION_REQUIRED` exige consentimiento del propietario de Apps Script.
`OAUTH_TOKEN_FAILED` o `URL_FETCH_FAILED` identifican el paso exacto.
No envía preguntas, no crea recursos, no elimina recibos ni relaja la
exigencia `emailCollectionType=VERIFIED`. Nunca registrar tokens, IDs
de formularios, URLs completas ni el cuerpo de error del proveedor.

## 4. Diagnóstico de Apps Script sin datos personales

En el editor del proyecto Apps Script existente, las funciones de mantenimiento definidas en `src/66_MantenimientoPropiedadesAcademicas.gs` son:
- `diagnosticarPropiedadesAcademicas`: **solo lectura**; reporta cantidades de propiedades, recibos PENDING y configuración HMAC como booleano, sin valores.
- `depurarSolicitudesQuizSinReferencia`: **destructiva sobre claves inválidas**; solo tras revisar diagnóstico y autorización específica; conserva recibos HMAC y solicitudes de quiz válidas.

Revisar `Executions` y deployment actual antes de una corrección. El último error WebApp puede existir en Script Properties como `ACADEMIC_LAST_WEBAPP_WRITE_FAILURE`; no imprimir payloads, alumnos, tokens ni HMAC.

## 5. Despliegue fallido / rollback

1. Congelar nuevas escrituras y registrar: PR/commit, workflow run, ID de revisión, versión/deployment Apps Script, `manifestSha256`, `client_id` (sin token) y error sanitizado.
2. Separar capa: plugin → OAuth/Auth0 → herramientas MCP → HMAC → WebApp → Classroom. No hacer cambios simultáneos para un error sin localizar.
3. Revertir por PR/commit aprobado y evidencia; para Apps Script actualizar **el mismo deployment** a una versión compatible, para Cloud Run recuperar revisión OAuth conocida, para plugin usar su release anterior y binding idéntico.
4. Revalidar A–G. Si una solicitud académica pudo haberse ejecutado, reconciliar primero los recursos reales y solo después tomar decisión sobre reintento.

## 6. Plantilla de reporte de intervención (sin datos confidenciales)

```text
Fecha:
Materia / courseId (si aplica):
Cambio: PLUGIN_ONLY | MCP_ONLY | APPS_SCRIPT/WEBAPP | CONTRACT_COORDINATED | INFRA/OAUTH | DOCS_ONLY
Commit GitHub / PR:
Versión y release ID del plugin:
Cloud Run servicio / revisión:
Apps Script Script ID / deployment ID:
Manifest SHA-256:
CI validate:
CI deploy MCP (si aplica):
CI deploy Apps Script (si aplica):
Auth0 discovery / cliente y permisos (sin tokens):
gateway_status(false):
gateway_status(true) / upstreamHmacAccepted:
diagnosticar_clase (solo lectura):
Classroom modificado: SÍ/NO; IDs exactos si SÍ:
Conclusión / regresiones / pendientes:
```

La operación se considera **completa** solo tras comprobar el destino realmente afectado. Mantener este formato en la descripción de PR y sus resultados, no en un registro narrativo de intentos fallidos en `main`.
