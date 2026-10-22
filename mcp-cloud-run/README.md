# Classroom JV — MCP independiente en Cloud Run

Servicio **MCP Streamable HTTP**, conectado exclusivamente a la WebApp canónica de Google Apps Script. No requiere modificar ChatGPT Sites, no ejecuta Apps Script mediante GitHub Actions y no llama directamente a las APIs de Classroom, Drive ni Forms.

## Herramientas

- `gateway_status`: confirma estado local y autorización OAuth.
- `diagnosticar_clase`: consulta el curso desde Apps Script sin modificaciones.
- `cerrar_unidad`: exige `courseId`, unidad numérica y `confirmar: true`. Apps Script calcula 70% examen y 30% trabajos publicados; crea/reutiliza `Calificación Unidad N` con **CourseWork PUBLISHED** y **calificaciones individuales draftGrade**. Prohibido escribir `assignedGrade` o devolver entregas.

Este adaptador nunca calcula calificaciones ni reescribe la lógica académica: sólo valida identidad, autoriza y firma la petición con el mismo HMAC canónico. Cualquier fallo ambiguo requiere reconciliar la actividad real antes de repetir.

## Infraestructura reutilizada, verificada el 22 de octubre de 2026

El proyecto que ya cuenta con facturación y servicios Cloud Run es **`classroom-mcp-512122`** (región `us-central1`). En la consola se verificaron `academic-classroom-mcp` y `academic-classroom-chatgpt-gateway` como servicios existentes.

La auditoría real confirmó las siete APIs habilitadas, ambas cuentas de servicio, el proveedor de GitHub `projects/148028894895/locations/global/workloadIdentityPools/github-classroom-pool/providers/github` y el secreto histórico `classroom-mcp-token`. Este último pertenece a la integración previa: **NO es la clave HMAC ni un proveedor OAuth**, por lo que no se reutiliza para las calificaciones. Falta registrar en Secret Manager `academic-write-hmac` con el mismo valor del Apps Script y `academic-mcp-allowed-subjects` con el `sub` real del usuario de OAuth. Se han fijado en el workflow las identidades previas `classroom-mcp-deployer@classroom-mcp-512122.iam.gserviceaccount.com` y `classroom-mcp-sa@classroom-mcp-512122.iam.gserviceaccount.com`; su existencia/permisos deben auditarse antes de ejecutar el despliegue. **No** se sobrescribirá ninguno de esos dos servicios: el adaptador OAuth irá a `academic-classroom-mcp-oauth` dentro del mismo proyecto, sin afectar la WebApp de Apps Script.

Auditoría **solo lectura** sin exponer valores de Secret Manager:

```bash
curl -fsSL https://raw.githubusercontent.com/witchet43/Automatizacion-clases-jv/main/scripts/auditar-classroom-mcp-gcp.sh -o /tmp/auditar-classroom-mcp-gcp.sh
bash /tmp/auditar-classroom-mcp-gcp.sh
```

La auditoría comprueba APIs habilitadas, servicios existentes, cuentas de servicio, nombres WIF y nombres de secretos; jamás lee valores secretos ni modifica la infraestructura. Si no se tiene acceso autenticado a Cloud Shell, primero iniciarlo desde Google Cloud Console.

## Seguridad y configuración previa indispensable

ChatGPT **no puede entregar un token API fijo** en una conexión MCP; requiere OAuth 2.1 (PKCE S256) para acceso privado. Utilizar un proveedor OAuth gestionado compatible con MCP, por ejemplo Auth0, que emita JWT RS256 con el parámetro `resource` y `aud` correspondiente a la URL del servidor. Habilitar descubrimiento OAuth, CIMD o DCR, permitir el redirect URI que ChatGPT muestre y el scope `academic.read` / `academic.close_unit`. No intentar montar un servidor OAuth propio ad hoc.

El adaptador devuelve el recurso protegido en `/.well-known/oauth-protected-resource`, comprueba `iss`, `aud`, firma JWKS, `exp`, `sub` permitido y permisos por operación. Sin OAuth válido, devuelve 401. No hay endpoint académico anónimo.

**Únicas variables GitHub Actions que todavía necesita el nuevo adaptador (cuando exista proveedor OAuth):**

| Variable | Valor necesario |
|---|---|
| `MCP_OAUTH_ISSUER` | issuer exacto del OAuth gestionado |
| `MCP_OAUTH_JWKS_URL` | URL JWKS HTTPS del mismo origen del issuer |
| `MCP_PUBLIC_URL` | opcional, URL HTTPS de dominio propio; sin ella usa la URL de Cloud Run |

El proyecto `classroom-mcp-512122`, la región `us-central1`, el proveedor WIF verificado, las dos cuentas de servicio y los NOMBRES de ambos secretos nuevos están preconfigurados en el workflow; su contenido sigue faltando. No vuelvas a cargar el token antiguo como HMAC. **no** hay que dar de alta variables GitHub para ellos. Sigue siendo imprescindible que IAM y WIF permitan su uso. La clave HMAC debe provisionarse en Secret Manager por una persona autorizada, **sin copiarse al repositorio ni al chat**. No modificar/eliminar la propiedad Apps Script original. El valor de `MCP_ALLOWED_SUBJECTS` procede de Secret Manager y limita los usuarios incluso si el proveedor OAuth emite tokens válidos para otras cuentas.

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

El repositorio implementa y prueba el adaptador y reutiliza el proyecto Cloud Run existente, pero **no puede autorizar Google Cloud ni registrar OAuth en nombre del propietario sin esas conexiones**. Sin variables, WIF y secretos el workflow se detiene antes del deploy; sin conexión OAuth en ChatGPT la operación no aparece en el chat. No afirmar una creación en Classroom hasta recibir el `courseWorkId` real.
