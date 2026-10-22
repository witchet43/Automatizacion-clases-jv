# Classroom JV — MCP independiente en Cloud Run

Servicio **MCP Streamable HTTP**, conectado exclusivamente a la WebApp canónica de Google Apps Script. No requiere modificar ChatGPT Sites, no ejecuta Apps Script mediante GitHub Actions y no llama directamente a las APIs de Classroom, Drive ni Forms.

## Herramientas

- `gateway_status`: confirma estado local y autorización OAuth.
- `diagnosticar_clase`: consulta el curso desde Apps Script sin modificaciones.
- `cerrar_unidad`: exige `courseId`, unidad numérica y `confirmar: true`. Apps Script calcula 70% examen y 30% trabajos publicados; crea/reutiliza `Calificación Unidad N` con **CourseWork PUBLISHED** y **calificaciones individuales draftGrade**. Prohibido escribir `assignedGrade` o devolver entregas.

Este adaptador nunca calcula calificaciones ni reescribe la lógica académica: sólo valida identidad, autoriza y firma la petición con el mismo HMAC canónico. Cualquier fallo ambiguo requiere reconciliar la actividad real antes de repetir.

## Seguridad y configuración previa indispensable

ChatGPT **no puede entregar un token API fijo** en una conexión MCP; requiere OAuth 2.1 (PKCE S256) para acceso privado. Utilizar un proveedor OAuth gestionado compatible con MCP, por ejemplo Auth0, que emita JWT RS256 con el parámetro `resource` y `aud` correspondiente a la URL del servidor. Habilitar descubrimiento OAuth, CIMD o DCR, permitir el redirect URI que ChatGPT muestre y el scope `academic.read` / `academic.close_unit`. No intentar montar un servidor OAuth propio ad hoc.

El adaptador devuelve el recurso protegido en `/.well-known/oauth-protected-resource`, comprueba `iss`, `aud`, firma JWKS, `exp`, `sub` permitido y permisos por operación. Sin OAuth válido, devuelve 401. No hay endpoint académico anónimo.

**GitHub Actions Variables (Settings → Secrets and variables → Actions → Variables):**

| Variable | Valor necesario |
|---|---|
| `GCP_PROJECT_ID` | proyecto Cloud con Cloud Run, Cloud Build, Artifact Registry, Secret Manager habilitados |
| `GCP_REGION` | región habilitada, p. ej. `us-central1` |
| `GCP_WIF_PROVIDER` | nombre completo del proveedor Workload Identity Federation de GitHub |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | cuenta de servicio deployer con permisos mínimos |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | cuenta ejecutora Cloud Run con acceso sólo a los dos secretos |
| `MCP_OAUTH_ISSUER` | issuer exacto del OAuth gestionado |
| `MCP_OAUTH_JWKS_URL` | URL JWKS HTTPS del mismo origen del issuer |
| `GCP_MCP_HMAC_SECRET_NAME` | nombre en Secret Manager del **mismo** `ACADEMIC_WRITE_HMAC_KEY` de Apps Script |
| `GCP_MCP_SUBJECT_ALLOWLIST_SECRET_NAME` | nombre del secreto que contiene los `sub` OAuth autorizados, separados por coma |
| `MCP_PUBLIC_URL` | opcional, URL HTTPS de dominio propio; sin ella usa la URL de Cloud Run |

La clave HMAC debe provisionarse en Secret Manager por una persona autorizada, **sin copiarse al repositorio ni al chat**. No modificar/eliminar la propiedad Apps Script original. El valor de `MCP_ALLOWED_SUBJECTS` procede de Secret Manager y limita los usuarios incluso si el proveedor OAuth emite tokens válidos para otras cuentas.

**GitHub Actions Secrets** no se necesitan para contraseñas: el despliegue usa OIDC y Workload Identity Federation. El servicio Cloud Run permite acceso HTTPS a su endpoint para que ChatGPT lo alcance, pero todas las rutas académicas bajo `/mcp` exigen validación OAuth del JWT; no confundir con acceso anónimo a datos.

## Instalación y pruebas

1. Configurar Google Cloud, el proveedor OAuth, el allowlist del único usuario y los secretos (no se pueden provisionar desde este chat sin permisos de cuenta).
2. Ejecutar workflow `Deploy Independent Academic MCP to Cloud Run` manualmente con `confirm_deploy=true`. Comprueba configuración y pruebas antes de desplegar. La primera ejecución obtiene la URL real tras el bootstrap y la fija como audiencia OAuth. No crea CourseWork.
3. Configurar el recurso/API en el proveedor OAuth con **exactamente esa URL** como audience, `academic.read` y `academic.close_unit`, redirect autorizado y PKCE S256. Repetir configuración de cliente si el IdP lo requiere.
4. En ChatGPT → Plugins → Add custom MCP server, introducir el URL HTTPS del resultado de Actions + `/mcp`, conectar OAuth e instalar el plugin. Es una vinculación **de una sola vez** sin modificar el código del Site anterior.
5. Probar `gateway_status` y `diagnosticar_clase` primero; para `cerrar_unidad` solicitar autorización explícita y comprobar postflight `courseWorkState:PUBLISHED`, `studentGradeState:DRAFT_ONLY`, `courseWorkId` y cantidad de alumnos.

Pruebas unitarias antes del deploy:

```sh
node mcp-cloud-run/sync-context.mjs
cd mcp-cloud-run
npm install
npm run check
```

El archivo `context.json` se genera a partir del **contexto de Apps Script desplegado** y no se mantiene a mano; ninguna migración modifica el manifest del Site. Un cambio del manifest requiere una migración sincronizada con Apps Script y el Site.

### Límites actuales

El repositorio implementa y prueba el adaptador, pero **no puede autorizar Google Cloud ni registrar OAuth en nombre del propietario sin esas conexiones**. Sin variables, WIF y secretos el workflow se detiene antes del deploy; sin conexión OAuth en ChatGPT la operación no aparece en el chat. No afirmar una creación en Classroom hasta recibir el `courseWorkId` real.
