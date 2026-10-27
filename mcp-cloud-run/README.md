# Estado operativo verificado — 27 de octubre de 2026

**La configuración vigente utiliza OAuth de Auth0, no acceso anónimo.**
El complemento Classroom Academic Gateway invoca por HTTPS el MCP `academic-classroom-mcp-oauth` (Streamable HTTP, OAuth); Cloud Run firma llamadas a la WebApp canónica de Apps Script mediante HMAC. `gateway_status(verificarFirma=true)` confirmó `upstreamHmacAccepted=true`; `diagnosticar_clase` y `cerrar_unidad` se ejecutaron correctamente.

- URL MCP: `https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app/mcp`.
- Contrato académico: `1.1.0`.
- Escritura: `SIGNED_WEBAPP_ONLY`; calificaciones individuales en `draftGrade`, no `assignedGrade`.
- El nombre `oauth` del servicio **sí corresponde al modo de autenticación vigente**.
- Auditoría y candidatos de limpieza: [cleanup-classroom-20261027.md](../docs/cleanup-classroom-20261027.md).

> **Nota histórica:** la configuración anónima del 26 de octubre fue temporal y ya no debe presentarse como vigente. No se debe reactivar para solucionar errores de acceso.

---

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

## Preparación de IAM y fichas de secretos (única ejecución, idempotente)

La federación WIF GitHub → Google Cloud ya fue comprobada en [GitHub Actions](https://github.com/witchet43/Automatizacion-clases-jv/actions/workflows/audit-classroom-mcp-wif.yml). La cuenta de deployer puede autenticarse y leer servicios, pero no puede inspeccionar todas las políticas IAM; por eso preparamos este script de intervención mínima.

En **Cloud Shell** del proyecto `classroom-mcp-512122` ejecutar:

```bash
curl -fsSL https://raw.githubusercontent.com/witchet43/Automatizacion-clases-jv/main/scripts/preparar-mcp-iam-secrets.sh -o /tmp/preparar-mcp-iam-secrets.sh
bash /tmp/preparar-mcp-iam-secrets.sh --apply
```

Es una **mutación de configuración IAM y Secret Manager**, no una auditoría. Se limita a crear las fichas vacías `academic-write-hmac` y `academic-mcp-allowed-subjects` si faltan; otorgar `roles/secretmanager.secretAccessor` a la cuenta runtime en esos dos secretos; y `roles/iam.serviceAccountUser` a deployer sobre la cuenta runtime. También verifica **antes de modificar IAM** que exista la cuenta predeterminada de compilación `148028894895-compute@developer.gserviceaccount.com` (sin crear cuentas nuevas) y añade, solo si faltan, los permisos documentados del despliegue desde código fuente: `roles/run.sourceDeveloper` y `roles/serviceusage.serviceUsageConsumer` para deployer, y `roles/run.builder` para la cuenta de compilación. Si la cuenta de compilación predeterminada no existe, se detiene sin crear recursos, para identificar primero la identidad que realmente usa Cloud Build. Estos permisos de proyecto son necesarios para crear el tercer servicio; no autorizan modificar deliberadamente los servicios históricos. **No escribe valores secretos, ni lee el antiguo `classroom-mcp-token`, ni despliega servicios.** Segunda ejecución no añade recursos duplicados.

El valor de `academic-write-hmac` ha de coincidir con la propiedad `ACADEMIC_WRITE_HMAC_KEY` del Apps Script existente (no revelar en chat/terminal visible). La segunda ficha recibirá el `sub` validado del proveedor OAuth una vez configurado. Estos contenidos solo se cargan de forma interactiva desde Cloud Shell, nunca por GitHub ni el chat.

### Carga segura de versiones (solo cuando el valor original ya es conocido)

**HMAC:** En Apps Script → Configuración del proyecto → Propiedades del script, verificar que exista `ACADEMIC_WRITE_HMAC_KEY`; copiar su valor exacto, sin enviarlo al chat. Google Apps Script no expone esta propiedad mediante la API ordinaria de código del repositorio; este script **no puede comprobar si el valor copiado coincide con Apps Script**. Ejecutar desde Cloud Shell:

```bash
gcloud config set project classroom-mcp-512122 >/dev/null
curl -fsSL https://raw.githubusercontent.com/witchet43/Automatizacion-clases-jv/main/scripts/cargar-mcp-secreto.sh -o /tmp/cargar-mcp-secreto.sh
bash /tmp/cargar-mcp-secreto.sh --hmac
```

En la solicitud de entrada oculta, pegar el valor original y presionar Enter. La orden no lo escribe en historial, repositorio, archivo temporal ni logs; se transfiere por stdin directamente a Secret Manager. Si ya existe cualquier versión, el script NO agrega otra automáticamente: si `latest` está en estado `ENABLED`, devuelve `YA_EXISTE_VERSION_HABILITADA`; de lo contrario, detiene la operación para revisión. El estado se verifica mediante `gcloud secrets versions describe latest` (únicamente metadatos), sin depender del filtro `state=ENABLED` que produjo la advertencia de Cloud Shell.

**OAuth:** Solo después de identificar al usuario en un IdP real y su `sub`, ejecutar el mismo script con `--subject`; pegar el identificador en el prompt oculto. Jamás inventar el `sub` ni utilizar el correo como sustituto sin corroboración.

Al iniciar, el script concede al **deployer** `roles/secretmanager.viewer` solo sobre estos dos secretos, si todavía no lo tiene: permite ver si existen y comprobar sus políticas/metadata desde el auditor de GitHub, pero **NO** permite leer los valores. La cuenta runtime conserva su acceso a los valores. La auditoría separa "no verificable" de ausencia real; falta de permisos no equivale a secreto inexistente.

El script no habilita OAuth ni publica la actividad de Classroom. No ejecutar el workflow de despliegue hasta que ambos secretos contengan una versión habilitada y el issuer/JWKS del IdP sean comprobados.

## Proveedor nuevo elegido: Auth0 Free (no creado todavía)

Proveedor de autorización **gestionado**, tenant nuevo dedicado a Classroom JV; el plan Free de Auth0 es suficiente para iniciar este único usuario. El registro inicial requiere confirmar la identidad del propietario en [Auth0](https://auth0.com/signup); GitHub Actions y Cloud Shell **no crean una cuenta externa automáticamente**.

### Datos fijos que no se vuelven a solicitar

- Proyecto de Cloud Run: `classroom-mcp-512122`, región `us-central1`
- Recurso nuevo: `academic-classroom-mcp-oauth`; ninguno de los dos servicios existentes se modifica
- API de Auth0: **Classroom Academic Gateway MCP**
- Tipo: OAuth Authorization Code + PKCE **S256**
- API scopes: `academic.read`, `academic.close_unit`
- Firma de API: **RS256**
- Cliente ChatGPT: **DCR** (Dynamic Client Registration), no CIMD hasta probar su compatibilidad
- Configuración de tenant Auth0 → Settings → Advanced: activar **Dynamic Client Registration** y **Resource Parameter Compatibility Profile**; tener presente que DCR público permite registrar aplicaciones, por lo que se usa un tenant nuevo dedicado, protección Auth0 y la allowlist `sub` en el MCP

### Secuencia para no duplicar infraestructura ni exponer secretos

1. El propietario registra un tenant **Free** en Auth0 y comparte únicamente el **dominio del tenant** (p. ej. `tenant.us.auth0.com`). No compartir contraseña, tokens ni client secrets. Verificar en `https://DOMINIO/.well-known/openid-configuration` el issuer exacto y el JWKS.
2. Se configura el tenant gestionado y su DCR/Resource Compatibility, habilitando solo el usuario autorizado. Su `user_id` real (claim JWT `sub`, no un email supuesto) se añade **con entrada oculta** al secreto `academic-mcp-allowed-subjects` usando `scripts/cargar-mcp-secreto.sh --subject`. El HMAC ya está provisionado: no volver a cargarlo.
3. El API Identifier de Auth0 tiene que igualar **exactamente** la URL HTTPS real del Cloud Run. Como aún no existe `academic-classroom-mcp-oauth`, no se debe inventar su URL. La primera implementación, si es autorizada con ambos secretos e issuer/JWKS verificados, usa exclusivamente el servicio NUEVO como bootstrap privado lógicamente **deny-by-default**, obtiene la URL real y corrige `MCP_PUBLIC_URL` en el mismo workflow. La API de Auth0 **todavía no puede emitir tokens válidos para ese público** hasta registrar exactamente esa URL como Audience en Auth0. Nunca se debe declarar OAuth operativo durante esta etapa.
4. Registrar la **API de Auth0** con identifier/audience igual a la URL real resultante; agregar scopes `academic.read` y `academic.close_unit`, firma RS256, y verificar que el token tenga `iss`, `aud`, `sub` y `scope` correctos.
5. Conectar ChatGPT usando DCR y OAuth: exactamente el endpoint `<URL_REAL>/mcp`. Permitir el redirect URI que indique la interfaz de Plugins si el proveedor lo exige. Probar primero `gateway_status` y `diagnosticar_clase`, luego el cierre de la Unidad 2 del curso `871149624583`, conservando `PUBLISHED` y `draftGrade`.

### Preflight del proveedor (no escribe ni consulta secretos)

Con `MCP_OAUTH_ISSUER` y `MCP_OAUTH_JWKS_URL` definidos en las variables de GitHub, el workflow `deploy-cloud-run-mcp.yml` ejecuta `node scripts/verify-auth0-mcp.mjs` antes de cualquier intento de desplegar. Comprueba con HTTPS descubrimiento, `issuer`, PKCE S256, endpoint DCR, JWKS RSA y coincidencia exacta con la URL JWKS configurada. **No es posible verificar externamente** desde ese script que la opción Resource Parameter Compatibility Profile esté habilitada o que la API Audience y el `sub` coincidan; estos controles se verifican en la integración real.

**No usar WIF de GitHub como si fuese el OAuth de ChatGPT.** Los dos usan identidad, pero tienen funciones y límites distintos.

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
