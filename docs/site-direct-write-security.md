# Activar ESCRITURA segura — Site privado -> WebApp canónica (sin GitHub Actions)

Estado: implementación propuesta, **NO DESPLEGAR** hasta pasar todos los criterios. La lectura publicada sigue funcionando.

## Alcance
- Única ruta de operación: **ChatGPT -> plugin Site privado -> WebApp Apps Script canónica -> Classroom**.
- GitHub es control de versiones/pruebas de la plataforma, **nunca transporte operativo**.
- La WebApp es el único ejecutor de operaciones académicas. NO duplicar su lógica en Site.
- Inicialmente solo añadir la herramienta **`crear_borrador_academico`** (sin eliminar, publicar, devolver calificaciones o modificar recursos publicados), delegando en `uaqExecutor` y los contratos canónicos.
- Operaciones admisibles: `actividad`, `tarea`, `practica`, `quiz`, `examen`, `material`, `clase`, `quizAsistencia`. Rechazar otros valores.
- Mantener `gateway_status`, `listar_materias`, `diagnosticar_clase` y lectura actuales sin cambio.

## Riesgo de seguridad previo
La WebApp histórica está configurada para ejecutar como propietario y admitir llamadas anónimas. El manifiesto operativo verifica integridad y DRAFT, pero **NO AUTENTICA** solicitantes. No habilitar herramienta de escritura antes de desplegar la protección `src/00_AcademicWriteAuthorization.gs` y de provisionar la clave compartida. No creer que la privacidad del Site por sí sola protege el URL público de Apps Script.

## Autorización del propietario y credenciales
- Al publicar Site, exigir sesión autenticada del propietario, y autorización explícita por cada solicitud de escritura antes de invocación del MCP; mostrar materia, operación, título y estado `DRAFT`. Nunca inferir autorización de una consulta.
- Generar clave aleatoria de al menos 32 caracteres con fuente criptográfica de confianza, idealmente 32 bytes aleatorios en base64url/hex.
- Configurar manualmente la misma clave **solo como secreto del servidor Site** (`ACADEMIC_WRITE_HMAC_KEY`) y **Apps Script Script Properties** (`ACADEMIC_WRITE_HMAC_KEY`). No almacenarla en GitHub, prompts, archivos, logs, interfaz del cliente, ni parámetros URL.
- La WebApp `doPost` no recibe encabezados personalizados de forma utilizable. La autorización viaja en el **JSON body** firmado por HMAC; usar HTTPS obligatorio. No imprimir el body autenticado.

## Ejemplo de firmador en servidor de Site, Node.js
```js
import {createHmac, randomUUID, randomBytes} from 'node:crypto';

function signAcademicDraftRequest({operation,courseId,params,operationalContext}) {
  const key=process.env.ACADEMIC_WRITE_HMAC_KEY;
  if(!key || key.length<32) throw new Error('ACADEMIC_WRITE_KEY_NOT_CONFIGURED');
  if(!['actividad','tarea','practica','quiz','examen','material','clase','quizAsistencia'].includes(operation))
    throw new Error('OPERATION_NOT_ALLOWED');
  if(!/^\d+$/.test(courseId)) throw new Error('COURSE_ID_INVALID');
  // Resolve courseId against fixed verified manifest registry: never accept arbitrary URL/ID.
  const sanitizedParams={...params,state:'DRAFT',resourceState:'DRAFT',courseWorkState:'DRAFT'};
  const body={
    action:'uaqExecutor',
    operation,
    courseId,
    requestId: randomUUID(),
    params: sanitizedParams,
    operationalContext
  };
  const auth={
    timestamp: Date.now(),
    nonce:randomBytes(24).toString('base64url'),
    signature:createHmac('sha256',key).update(JSON.stringify(body),'utf8').digest('hex')
  };
  return {...body,auth};
}
// POST https://script.google.com/macros/s/<CANONICAL_DEPLOYMENT_ID>/exec
// Content-Type: text/plain;charset=UTF-8; body: JSON.stringify(signedBody).
```

**Important:** Keep `requestId` fixed for a single user-approved intent; a timeout or unknown result MUST NOT generate a new requestId or automatically retry. Reconcile state using the read-only diagnostic. One-time receipt keys intentionally block ambiguous replays. For an intentionally NEW creation after reconciliation, use a new authorization and fresh ID.

The example is a protocol contract, **not** an authorization to create course work; all user-supplied fields and limits must follow the existing canonical entrypoints. Preserve `operationalContext` EXACTLY as produced from the canonical manifest hash; no inferred values.

## WebApp server side
- `doGet`: read-only `diagnosticarClase` and `auditarIdentidadClassroom` only.
- `doPost`: `uaqExecutor` and `eliminarDrafts` are cryptographically gated; the Site MUST NOT expose `eliminarDrafts`.
- Verify signed JSON request body HMAC-SHA256, clock skew <=5 min, strong secret, unique request ID and `DRAFT` policy before any side effects.
- Apps Script `LockService` + Script Properties PENDING/COMPLETED receipt prevents duplicate execution. Unknown partial failures remain PENDING for manual reconciliation. Do not automatically reset or bypass.
- `auth` is not sent to `uaqExecutor` inner academic payload; only envelope crosses authorization boundary.
- No fallback to Cloud Run, GitHub Actions or other creation route on failure.

## Safe activation order
1. Run all GitHub regression tests on the feature PR, including `scripts/test-academic-write-auth.mjs`.
2. Verify Site server-side secret configurability and private write-tool schema, **without** publishing a write tool.
3. Provision the HMAC secret in the Apps Script Project Script Properties and Site server only.
4. Deploy the updated canonical Apps Script code through the **authorized platform-change** workflow only; do not create a new WebApp deployment or change canonical URL.
5. Validate that unsigned, expired, replayed and malformed write requests all fail **without** creating resources; keep the Site write tool disabled during these negative tests.
6. Verify Site signed-to-WebApp request with an **explicitly user-approved specific DRAFT artifact**, once; verify by read-only `diagnosticar_clase` that exactly one DRAFT exists and no published resource changed.
7. Only after that, enable `crear_borrador_academico` tool on the **existing Site** (no new Site/plugin) for owner only. Never activate deletion or publication through this rollout.

## Deployment guard
Current PR is a security proposal. Do not merge/deploy or claim write integration functional merely because code tests pass. Apps Script and the existing private Site must be updated together to avoid auth mismatch. The owner has authorized implementation of the write pathway, **not** unreviewed creation or publication of specific coursework.
