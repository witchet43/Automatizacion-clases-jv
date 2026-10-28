# Diagnóstico, verificación y recuperación — Classroom Academic Gateway

**Uso:** seguir esta secuencia después de conectar el plugin, después de cualquier deploy y ante errores. Nunca probar creando o publicando notas de alumnos.

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
