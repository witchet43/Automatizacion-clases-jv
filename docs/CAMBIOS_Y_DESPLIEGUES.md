# Cómo modificar y desplegar cada componente de Classroom Academic Gateway

**Procedimiento de ingeniería · Versión 2026-10-27.** La ruta de producción es exclusivamente **ChatGPT → MCP OAuth/Cloud Run → Apps Script WebApp/HMAC → Classroom**. Consultar [AGENTS.md](../AGENTS.md).

## 1. Responsabilidades y fuente de verdad

| Componente | Fuente editable | Entrega a producción | Qué NO debe hacer |
|---|---|---|---|
| Habilidades/UI/nombre del plugin | Paquete privado actual en ChatGPT/Plugin Creator (`plugin.json`, `.codex-plugin/plugin.json`, `skills/**`, y `.mcp.json` o `.app.json`) | Nueva **release** del mismo plugin, con `expected_release_id` | Crear otro plugin, cambiar bindings o guardar HMAC |
| Servidor MCP | `mcp-cloud-run/server.mjs`, tests, Dockerfile y `mcp-cloud-run/**` | Workflow `deploy-cloud-run-mcp.yml` → revisión de Cloud Run **existente** | Calcular notas, crear recursos Google directamente o relajar OAuth |
| Reglas académicas Apps Script | `src/*.gs`, `src/appsscript.json` y `config/academic-context.json` | Workflow `deploy-apps-script.yml` → **mismo Script ID y WebApp deployment** | Crear otro deployment por defecto o llamar Apps Script vía Execution API para operaciones ordinarias |
| WebApp (interfaz/seguridad) | `src/65_QuizAsistenciaWebApp.gs`, `src/00_AcademicWriteAuthorization.gs`, otras funciones `src/**` | **Mismo** despliegue Apps Script canónico | Tratar `ANYONE_ANONYMOUS` como autorización; omitir validación HMAC |
| Contexto y cursos | `config/academic-context.json` + derivado `src/00_AcademicContextConfig.gs` y `mcp-cloud-run/context.json` | **Cambio coordinado y atómico** Apps Script + MCP y cualquier cliente que fije el SHA | Editar solo uno de los tres o inventar `courseId` |
| GitHub Actions | `.github/workflows/*.yml` | Merge revisado a `main` con autorización exacta | Crear tareas, calificar alumnos o enviar solicitudes académicas desde CI |

**Plugin ≠ MCP ≠ Apps Script ≠ WebApp ≠ Workflow.** Cada capa tiene un artefacto de publicación distinto; modificar una **no** actualiza automáticamente las otras.

## 2. Ciclo obligatorio de un cambio

1. **Clasificar**: `PLUGIN_ONLY`, `MCP_ONLY`, `APPS_SCRIPT/WEBAPP`, `CONTRACT_COORDINATED`, `INFRA/OAUTH` o `DOCS_ONLY`. Registrar motivo y impacto en autenticación, cursos, calificaciones e idempotencia.
2. **Leer estado real**: SHA de `main`; versión del plugin + `current_release_id`; revisión Cloud Run y tráfico; URL y versión actual del deployment WebApp; `manifestSha256`; pruebas previas.
3. **Branch desde `main`**, cambios mínimos en los archivos correspondientes, tests unitarios de cada caso, sin alterar datos de alumnos. No reintroducir implementaciones de Portal/Site ni `.academic-requests`.
4. **Evidencia de autorización**: agregar **exactamente un JSON nuevo** en `.platform-changes/<identificador>.json` cuando el merge active un cambio de plataforma en `main`. Debe incluir `mode: "PLATFORM_CHANGE"`, `authorized: true`, `requestedByUser: true`, `authorizationText` textual real, `reason` y `allowedChangedPaths` con la **lista exacta** de todos los archivos agregados/modificados/eliminados excepto el propio JSON. No inventar consentimiento.
5. **PR**, ejecutar `Validate Minimal Academic Operations`; revisar las diferencias, la seguridad del endpoint y pruebas de regresión. Si falla, corregir antes de merge.
6. **Fusionar con squash** para que `scripts/assert-platform-change-authorized.mjs` audite un único commit que contenga la evidencia y todos los archivos autorizados. El guard compara `HEAD^ HEAD`. Evitar merges que dividan archivos y evidencia en commits separados.
7. **Observar Actions y postflight**, sin declarar éxito por el merge: verificar `success` y estado real del destino. Si falla o queda ambiguo, detener escrituras, diagnosticar y revertir solo de forma coordinada.
8. **Actualizar este runbook** cuando cambie de verdad el proceso; un documento obsoleto no debe coexistir como guía activa.

### Ejemplo de evidencia (texto ilustrativo, no autorización reusable)

```json
{
  "mode": "PLATFORM_CHANGE",
  "authorized": true,
  "requestedByUser": true,
  "authorizationText": "<cita exacta del consentimiento de esta intervención>",
  "reason": "<qué cambia y por qué>",
  "allowedChangedPaths": [
    "mcp-cloud-run/server.mjs",
    "mcp-cloud-run/tests/adapter.test.mjs"
  ]
}
```

La evidencia real debe contener únicamente rutas efectivamente modificadas y su autorización correspondiente. **No** acumular 95 evidencias anteriores como instrucciones: la recuperación del registro histórico está en commits Git.

## 3. Modificar el plugin sin perder la conexión

**Primero decidir por ID, no solo por nombre.** Existen dos versiones privadas registradas; leer [CONFIGURACION_PLUGIN_Y_AUTH0.md](CONFIGURACION_PLUGIN_Y_AUTH0.md). No adivinar qué paquete usa una conversación.

### Cambios posibles

- **Solo textos/habilidades (skills, prompts, descripción):** actualizar **la release del mismo plugin**, sin tocar el servidor MCP, API Auth0, secrets ni WebApp.
- **URL MCP/auth del plugin:** cambio de integración de alto riesgo. Mantener URL y modo `mixed` + DCR actuales a menos que exista un cambio planeado y comprobado en el servidor y Auth0. Requiere reconexión y pruebas de permiso.
- **Herramienta nueva/cambio de entrada**: primero implementar nueva herramienta y tests en MCP; desplegar servidor; **después** actualizar skills del plugin y lanzar release del mismo ID. El plugin no añade una herramienta por escribir su nombre en la skill.

### Procedimiento de actualización del plugin (Plugin Creator)

1. Consultar `list_owned_personal_plugins` y `get_plugin_files(plugin_id)`; registrar `version`, `current_release_id`, archivos y manifest **actuales**. Obtener los archivos de la release que se va a modificar.
2. Preparar un ZIP o `tar.gz` de **esa misma identidad**, con `plugin.json` / `.codex-plugin/plugin.json` y solo archivos cambiados. Los omitidos se conservan; para quitar archivos utilizar `delete_paths` exactos y retirar antes cualquier referencia.
3. Para el plugin con `.mcp.json` conservar `mcpServers.classroom-academic-gateway.url`, `auth.type=mixed`, `client.mode=dcr`, `defaultScopes=[]`; mantener coherentes `mcp.json` y `.mcp.json` si ambos están en el paquete.
4. Para el plugin app-vinculado conservar `.app.json` y la referencia `apps` de su manifest; **no** intentar convertirlo a un plugin declarativo durante una actualización de skills.
5. Validar todos los Markdown, frontmatter `SKILL.md`, referencias y versión. Emitir nueva versión semántica: `update_plugin(plugin_id, archive, expected_release_id)`. El servicio incrementa automáticamente la versión de parche si no se cambia la versión efectiva; no reducir versión.
6. Confirmar nueva `release_id` / versión y estado del plugin; reconectar/reabrir una conversación con el paquete real, comprobar herramientas actuales y ejecutar `gateway_status` con y sin verificación HMAC.
7. Si una release no expone herramientas, diagnosticar la conexión/descubrimiento de esa release. **No** reconfigurar Auth0 ni crear un servidor nuevo como solución inicial.

**Política de cambios:** nunca modificar ambos plugins indiscriminadamente; decidir cuál se usará como oficial y documentar su ID exacto. Al actualizar scripts/skills, mantener el mismo identificador que ya tiene autorización del usuario. El código del plugin vive actualmente en las releases de Plugin Creator; si se decide versionarlo en GitHub, introducir fuente reproducible y publicación validada como cambio separado, no copiar un paquete antiguo como fuente de verdad.

## 4. Modificar el servidor MCP (Cloud Run)

Código: `mcp-cloud-run/server.mjs`, `mcp-cloud-run/tests/*.test.mjs`, `mcp-cloud-run/sync-context.mjs`, `mcp-cloud-run/package.json`, `mcp-cloud-run/Dockerfile`.

**Contrato obligatorio:** `verifyBearer` comprueba issuer, audience `MCP_PUBLIC_URL`, firma RSA y `MCP_ALLOWED_SUBJECTS`. `academic.read` controla datos de entregas; `academic.close_unit` controla escrituras; las herramientas públicas deben respetar su política explícita. Las solicitudes a la WebApp son HTTPS POST firmadas por HMAC. No se devuelve información privada al diagnosticar el transporte.

Procedimiento:
1. Agregar tests de éxito y rechazo: sin token, token de scope incorrecto, curso no registrado, requestId inválido, doble petición, respuesta negativa de WebApp y conducta sin creación.
2. Ejecutar `node mcp-cloud-run/sync-context.mjs` (genera contexto desde manifest) y `cd mcp-cloud-run && npm install --no-audit --no-fund && npm run check`. El artefacto generado no debe editarse manualmente.
3. Crear PR + evidencia `PLATFORM_CHANGE` exacta. El workflow `Deploy Independent Academic MCP to Cloud Run` se dispara por **cambios de código bajo `mcp-cloud-run/**`** (se excluye Markdown) o por cambios del propio workflow. No cambiar `main` directamente.
4. El workflow comprueba tests, WIF, secretos habilitados, Auth0 metadata/JWKS/PKCE, despliega a `academic-classroom-mcp-oauth` **sin tocar otros servicios**, valida `/health`, metadatos OAuth y rechazo de escrituras anónimas.
5. Verificar `tools/list` y desde ChatGPT `gateway_status(verificarFirma=true)` y `diagnosticar_clase` en solo lectura. Si cambia el contrato de skills, actualizar la **release del plugin** después de esta prueba.

**Workflow manual**: solo lanzar `workflow_dispatch` con `confirm_deploy=true` tras solicitud expresa y cuando se quiera redeplegar el commit aprobado de `main`. No utilizarlo para ejecutar una tarea académica.

## 5. Modificar Apps Script y la WebApp sin cambiar su identidad

El código real está en `src/*.gs`; `.clasp.json` fija Script ID y `rootDir=src`. El deployment WebApp canónico se define en `config/academic-context.json → webApp.url` y se **actualiza**, no se reemplaza.

**Caso A: cambiar algoritmo académico (p. ej., cálculo de unidad, práctica, examen, Classroom):**
1. Revisar reglas en `src/00_PoliticasCanonicas.gs`, `src/15_OperacionesAcademicas.gs`, funciones relevantes y `config/master-rules.json`. Cambiar las funciones `src/**` apropiadas; nunca duplicar reglas en MCP.
2. Crear regresiones para ponderación, formato, DRAFT/PUBLISHED, STUDENT_COPY, importación Forms aun sin TURNED_IN, errores, reintentos e idempotencia. **Nunca** generar CourseWork de prueba en CI.
3. PR + evidencia `.platform-changes/*.json` con todas las rutas exactas. Fusionar con squash tras tests.
4. El workflow `Deploy Apps Script` se activa por evidencia `.platform-changes/**`. Comprueba sintaxis, normas y regresiones.
5. Su **source gate** detecta diferencias `src/**` o `config/academic-context.json`; solo si cambió alguna, restaura el secreto `CLASPRC_JSON`, ejecuta `npx clasp push --force` y `npm run apps-script:deploy` → `clasp update-deployment <ID canónico>`.
6. Ejecuta `scripts/verify-academic-webapp.mjs`, con pruebas **negativas** de WebApp que deben ser rechazadas antes de crear recursos. No sustituye `gateway_status(true)` ni diagnóstico real desde ChatGPT.
7. Verificar endpoint y ejecución real de solo lectura. Una modificación de negocio que afecte alumnos requiere una verificación explícita de su comportamiento, no una tarea artificial creada en producción.

**Caso B: modificar el contrato de WebApp (`doPost`, acción, firma, JSON):**
1. Definir el esquema de request/response y seguridad. Editar primero Apps Script (`src/65_QuizAsistenciaWebApp.gs`, autorización) y **tests**.
2. Conservar recepción HMAC en el JSON (Apps Script WebApp no permite usar cabeceras arbitrarias de forma equivalente). `ACADEMIC_WRITE_HMAC_KEY` es Script Property; HMAC requiere timestamp/nonce y recibos `ACADEMIC_WRITE_RECEIPT_`.
3. Si la nueva acción exige apoyo MCP, desplegar cambio **compatible hacia atrás** de WebApp, verificarlo, luego MCP, por último skill/release del plugin. No introducir un contrato incompatible hasta que todas las capas usen la misma versión.
4. No cambiar `executeAs=USER_DEPLOYING` ni `access=ANYONE_ANONYMOUS` sin rediseño integral de autenticación. Aunque el endpoint acepte peticiones HTTP públicas, las escrituras válidas se rechazan sin HMAC.

**Caso C: cambiar IDs de curso, endpoint, manifest o SHA:**
Es operación **`CONTRACT_COORDINATED` de alto riesgo**. El `manifestSha256` se calcula sobre los bytes exactos de `config/academic-context.json`, y se reproduce en Apps Script generado y `mcp-cloud-run/context.json`. Cambiarlo en una sola capa provoca `ACADEMIC_CONTEXT_MISMATCH` o bloqueo de escritura. Preparar una secuencia compatible, comprobar consumidores externos (incluido Site antiguo si existe), desplegar WebApp y MCP coordinadamente y confirmar firma/contrato real antes de permitir escrituras. No ejecutar esta operación como limpieza documental.

## 6. GitHub Actions: mapa vigente de workflows

| Workflow | Trigger | Efectos |
|---|---|---|
| `validate-minimal-academic-operations.yml` | PR en código y `push` en paths definidos; manual | Tests, checks, *sin escribir Classroom* |
| `deploy-apps-script.yml` | `push main` al agregar evidencia `.platform-changes/**` | Regresiones; **solo** actualiza WebApp existente si cambia `src/**` o manifest |
| `deploy-cloud-run-mcp.yml` | `push main` al cambiar MCP (no Markdown) o workflow; manual `confirm_deploy=true` | Despliega servicio OAuth canónico, valida salud y seguridad |
| `audit-cloud-run-mcp.yml` | Manual o cambio del propio workflow | Consulta Cloud Run, endpoints y Auth0 sin crear clientes ni materiales |
| `audit-classroom-mcp-wif.yml` | Según YAML, auditoría independiente | Identidad WIF, servicios y metadatos sin mostrar valores |

**Control:** workflows de despliegue de código deben usar la misma rama aprobada `main` y pruebas verdes. En GitHub Actions revisar cada job y su conclusión, no únicamente el círculo general del PR.

**Matiz del source gate:** editar solo documentación + evidencia puede ejecutar `Deploy Apps Script` para validar, pero los pasos de `clasp` quedan `skipped`. Editar el propio workflow de despliegue MCP sí dispara el workflow (una vez), mientras que editar solo `mcp-cloud-run/README.md` no.

## 7. Matriz de impacto para cambios futuros

| Si cambias... | Plugin release | Deploy MCP | Deploy Apps Script/WebApp | Auth0 / Secret Manager |
|---|---|---|---|---|
| Texto de una skill | **Sí** | No | No | No |
| Nombre/descripción del plugin | **Sí** | No | No | No |
| Nueva herramienta MCP o schema | Si cambia skills: **sí, después** | **Sí** | Solo si cambia acción de WebApp | Solo si cambia scope/audience |
| Lógica académica de calificaciones | No | Solo si cambia contrato | **Sí** | No |
| Algoritmo de HMAC, request/response | Posible | **Sí** | **Sí**, coordinado | Solo por cambio de credencial |
| Lista canónica de cursos / manifest | Revisar | **Sí**, sincronizar | **Sí**, sincronizar | No por defecto |
| Permisos de un usuario OAuth | No | No | No | **Auth0** (grants/conexión) |
| Corrección de documentación | No | No | No; solo CI de validación | No |

## 8. Reversión / recuperación

- **Plugin:** localizar release anterior y paquete original por ID. No reinstalar plugin con otro nombre/identidad por defecto. Actualizar/republicar conservando bindings y revisar consentimiento.
- **MCP:** recuperar versión aprobada del código mediante `git revert` (PR nuevo + evidencia) y redeplegar; o rollback de revisión Cloud Run existente desde consola tras comprobar compatibilidad de contexto y HMAC. No desplegar una revisión anónima antigua.
- **Apps Script:** revisar la versión de deployment existente; actualizar el **mismo deployment** a una versión previa compatible y alinear MCP/manifest. El rollback solo es válido si no rompe recibos o datos ya escritos.
- **Manifest/contexto:** revertir ambas capas de forma sincronizada; comparar SHA antes de reabrir escrituras.
- **Si hay PENDING o timeouts:** no repetir solicitud ni borrar recibos; reconciliar con Classroom y registros de Apps Script.

Consultar [DIAGNOSTICO_Y_RECUPERACION.md](DIAGNOSTICO_Y_RECUPERACION.md). Una aprobación de CI no acredita por sí sola que una calificación se haya escrito; exigir ID y estado desde Classroom.

## Reconciliación progresiva de clases (29-oct-2026)

- **Progreso curricular:** la sesión siguiente se identifica por la planeación canónica y los recursos `PUBLISHED` que realmente existen en Classroom. Si ese avance supera la frontera con evidencia histórica de Gamma/Notion, la presentación o nota antigua pendiente se registra en `historicalBacklog` y **no retrocede la selección**. La deuda histórica se atiende en una reconciliación independiente.
- **Componentes reutilizables:** cada recurso se identifica por título, tema y estado `DRAFT/PUBLISHED`. Un recurso completo se reutiliza; un borrador incompleto se repara mediante su entrada canónica; un publicado nunca se sustituye, borra ni publica nuevamente.
- **Ejecución parcial:** ausencia de contenido, error de formato o fallo de creación se registra por recurso y no cancela los componentes restantes. Los fallos de escritura incierta se etiquetan `RECONCILE_BEFORE_RETRY`; **no** se reintentan con otro identificador sin verificar antes Classroom y recibos. Solo el lock de idempotencia admite reintento acotado.
- **Sesión automática:** la operación `clase EXECUTE` usa `requestedSession` o infiere la sesión canónica por estado real. Cada recurso recibe `sesionCanonica` y `explicitSequenceOverride`, siempre sometidos a validación estricta de coincidencia curricular en Apps Script. La ejecución no calcula progreso por fecha ni modifica la planeación.
- **Gamma/Notion:** son componentes independientes y sus verificaciones LIVE siguen siendo obligatorias para declarar `COMPLETE`. Un paquete parcialmente creado informa `resourceRepairPending` y conserva `nextPhase=GENERATE_OR_REUSE_GAMMA_AND_NOTION` para no bloquear el trabajo independiente.
- **Despliegue:** cambios exclusivos de `src/*.gs` requieren PR, tests en CI, merge revisado y despliegue en el Script ID y WebApp canónicos. Hasta esa validación el código de producción conserva su comportamiento anterior.
