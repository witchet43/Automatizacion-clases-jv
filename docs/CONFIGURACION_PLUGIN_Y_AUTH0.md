# Instalación y configuración del Classroom Academic Gateway

**Estado comprobado: 27-10-2026 · Procedimiento vigente · No ejecutar pasos de provisionamiento en una instalación ya funcional.**

Este documento es la referencia para **instalar o reconectar** el plugin desde un entorno nuevo. Para cambiar software ya instalado, seguir [CAMBIOS_Y_DESPLIEGUES.md](CAMBIOS_Y_DESPLIEGUES.md). Para solucionar errores, seguir [DIAGNOSTICO_Y_RECUPERACION.md](DIAGNOSTICO_Y_RECUPERACION.md). El contrato normativo está en [AGENTS.md](../AGENTS.md).

## 1. Arquitectura que realmente funciona

```text
ChatGPT (plugin conectado y usuario autorizado)
  └─ MCP Streamable HTTP + OAuth (Auth0, PKCE S256, DCR)
     └─ Cloud Run: academic-classroom-mcp-oauth
        └─ HTTPS POST con firma HMAC-SHA256 y anti-replay
           └─ WebApp canónica de Google Apps Script
              └─ Classroom / Forms / Drive
```

- **Apps Script** es el único ejecutor de reglas didácticas y calificaciones.
- **MCP** verifica identidad/alcance/curso, firma y transporta; no debe contener otra lógica académica.
- **Plugin** declara cómo ChatGPT descubre el MCP y enseña las habilidades; no almacena claves HMAC.
- **GitHub** aloja código y contratos. **GitHub Actions** ejecuta pruebas y despliegues autorizados, **nunca** una solicitud docente ordinaria de crear un trabajo o cerrar una unidad.
- Gamma y Notion participan por sus conectores propios al preparar clases y no sustituyen la WebApp.

### Valores de referencia (no son secretos)

| Elemento | Valor canónico |
|---|---|
| Repositorio | `witchet43/Automatizacion-clases-jv` |
| Rama de producción | `main` |
| Contrato | `1.1.0` |
| Proyecto Google Cloud | `classroom-mcp-512122` |
| Región | `us-central1` |
| Proyecto numérico | `148028894895` |
| Cloud Run servicio | `academic-classroom-mcp-oauth` |
| URL de la API / audience OAuth | `https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app` |
| URL de transporte MCP | `https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app/mcp` |
| Auth0 issuer | `https://dev-67cfevmusm7px130.us.auth0.com/` |
| Apps Script ID | `1jR91MDwOUlEdWaLQkuKLca5x1Qz1tqPncgc-PApPB-dFDLYAdD2y_4FE` |
| WebApp | **Tomar de `config/academic-context.json → webApp.url`** (no pegar una URL distinta) |
| Script Property de firma | `ACADEMIC_WRITE_HMAC_KEY` (nombre, nunca valor) |
| Secret Manager | `academic-write-hmac`, `academic-mcp-allowed-subjects` |
| GitHub Secret para clasp | `CLASPRC_JSON` (nombre, nunca valor) |
| Identidad GitHub WIF | `projects/148028894895/locations/global/workloadIdentityPools/github-classroom-pool/providers/github` |
| Cuenta de despliegue | `classroom-mcp-deployer@classroom-mcp-512122.iam.gserviceaccount.com` |
| Cuenta de ejecución | `classroom-mcp-sa@classroom-mcp-512122.iam.gserviceaccount.com` |

**No confundir:** URL de API/audience **sin `/mcp`**, URL del plugin **con `/mcp`**. El host `.a.run.app` puede aparecer como alias en el estado de Google; la URL canónica probada para el cliente es la indicada arriba. No cambiar estos valores durante una reconexión.

## 2. Precondiciones / inventario antes de configurar

1. Revisar que `gateway_status(verificarFirma=true)` no funcione ya. Si funciona, **no recrear** OAuth, WebApp, Secrets ni Cloud Run.
2. Confirmar en Google Cloud que el proyecto, servicio, cuentas, APIs y secretos **ya existen**. No crear duplicados; nunca imprimir el contenido de secretos.
3. Confirmar que `.clasp.json` enlaza al **script existente** y que `config/academic-context.json` contiene el deployment de producción.
4. Confirmar el manifest App Script `src/appsscript.json`: `executeAs=USER_DEPLOYING`, `access=ANYONE_ANONYMOUS`. **Esto no es protección de acceso:** la WebApp es públicamente direccionable y la escritura debe validarse **en el body HMAC**, con marca temporal, nonce y recibos idempotentes.
5. En una recuperación, utilizar primero el commit/despliegue anterior verificado; evitar nuevos IDs de Apps Script o proyectos paralelos.

## 3. Configurar Auth0 (únicamente si el tenant no está listo)

Tenant: `dev-67cfevmusm7px130`. Las opciones de la interfaz pueden cambiar; confirmar **nombres y valores reales**, no crear aplicaciones por tanteo.

1. Revisar que Auth0 publique descubrimiento OAuth/OIDC, JWKS RSA, PKCE `S256` y Dynamic Client Registration (DCR) para el flujo de ChatGPT. El script `scripts/verify-auth0-mcp.mjs` verifica metadatos, **no autentica a un usuario**.
2. En **Applications → APIs**, localizar la API cuyo **Identifier** coincide exactamente con la **audience** del cuadro anterior. Conservar `Per-app authorization` para evitar acceso global indiscriminado.
3. Mantener definidos los scopes de API `academic.read` y `academic.close_unit`. Son diferentes: el primero protege lectura de entregas individuales; el segundo operaciones de creación y calificación en borrador.
4. ChatGPT crea un cliente externo (normalmente con ID `tpc_...`) mediante DCR. En **API → Application Access** localizar el **client ID generado en el intento actual** y habilitar **User-delegated Access** con los permisos necesarios. Mantener **Client Access** y **Anonymous Access** sin conceder, salvo requerimiento nuevo auditado. No pegar un `tpc_` histórico en un cliente nuevo.
5. En **Authentication → Database / Social / Enterprise**, abrir la conexión de identidad que realmente utiliza el docente. Debe estar habilitada para aplicaciones de terceros; en el tenant actual se corrigió activando **Promote Connection to Domain Level** en la conexión de base de datos. **Advertencia:** amplía las aplicaciones de terceros que pueden usar *esa conexión de identidad*; **no** debe interpretarse como autorización general a la API, que permanece controlada por grants. Revisar riesgo antes de habilitarlo en otros tenants.
6. Verificar que el login presenta pantalla y consentimiento y que regresa a ChatGPT. No guardar `client_secret` en plugin; ChatGPT utiliza cliente público + PKCE.
7. Revisar en Auth0 los logs del intento actual antes de cualquier cambio. Registrar `error code`, client ID y tracking ID, sin capturar tokens o contraseñas.

**Errores conocidos y remedios comprobados:**
- `Client ... is not authorized to access resource server` → falta acceso de la aplicación `tpc_` a la API específica; revisar User-delegated Access.
- `no connections enabled for the client` → falta una conexión de identidad accesible para el cliente tercero; revisar conexión y `Promote Connection to Domain Level`.
- `invalid_audience`, `invalid_issuer`, JWT rechazado → cotejar `MCP_PUBLIC_URL`, el Identifier de Auth0, issuer y JWKS; **no** quitar validación de audiencia.
- `INSUFFICIENT_SCOPE` en operaciones privadas → comprobar scopes otorgados y los solicitados por la herramienta. El MCP exige `academic.read` para `listar_entregas` y `academic.close_unit` para escribir.

## 4. Cloud Run / Secret Manager: validar, no reprovisionar

Variables del servicio canónico (configuración definida en `.github/workflows/deploy-cloud-run-mcp.yml`):

```text
MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app
MCP_OAUTH_ISSUER=https://dev-67cfevmusm7px130.us.auth0.com/
MCP_OAUTH_JWKS_URL=https://dev-67cfevmusm7px130.us.auth0.com/.well-known/jwks.json
MCP_DEPLOY_COMMIT=<SHA de commit desplegado>
ACADEMIC_WRITE_HMAC_KEY <- academic-write-hmac:latest
MCP_ALLOWED_SUBJECTS <- academic-mcp-allowed-subjects:latest
```

El contenido de `MCP_ALLOWED_SUBJECTS` es una lista de los `sub` autorizados (valor **secreto**). **No** compartirla por chat, README o logs. La clave HMAC de Secret Manager debe equivaler a la Script Property del Apps Script actual; si difiere, diagnosticar antes de rotar.

El servidor público HTTP permite llegar a la capa OAuth del adaptador; **no** equivale a autorización de herramientas. El MCP rechaza escrituras anónimas y restringe identidad, scopes y cursos. No cambiar `--allow-unauthenticated` de Cloud Run aislado del diseño OAuth de la aplicación.

## 5. Configurar el plugin en ChatGPT

Dos paquetes privados de la cuenta fueron identificados durante la auditoría. **No crear un tercero por rutina ni eliminar uno sin verificar consumidores.**

| Paquete | Identidad/versión observada | Particularidad |
|---|---|---|
| `classroom-academic-gateway` | `plugins_6ad6d4abed4c819197eab7830fe773af` · `0.3.13` | Plugin de skills con `.mcp.json`, `mcp.json`, `plugin.json` |
| `Classroom Academic Gateway MCP` | `plugin_asdk_app_6ae122d7590c819189986ae8d91db706` · `1.0.1` | Plugin vinculado a app: `.app.json` + `.codex-plugin/plugin.json`; conservar su binding |

### Variante declarativa (plugin con `.mcp.json`)

Verificar la definición equivalente a:

```json
{
  "mcpServers": {
    "classroom-academic-gateway": {
      "type": "streamable-http",
      "url": "https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app/mcp",
      "headers": {},
      "extensions": {
        "com.openai": {
          "auth": {
            "type": "mixed",
            "client": {"mode": "dcr"},
            "defaultScopes": []
          }
        }
      }
    }
  }
}
```

`mixed` significa que las herramientas anuncian individualmente su esquema: algunas usan `noauth` y otras `oauth2`. `defaultScopes: []` **no** significa omitir los permisos de cada herramienta. Se respetan los scopes reales emitidos por el MCP. El plugin no incluye URL de WebApp, valores de secretos, contraseñas ni `client_id` DCR estático.

### Variante app-vinculada

La fuente `.codex-plugin/plugin.json` referencia `apps: "./.app.json"`; `.app.json` contiene la identidad de la app. La configuración MCP/OAuth vive en la app conectada. **No reemplazar la app por una definición manual** ni modificar el ID para actualizar textos o skills. Obtener versión y `current_release_id` antes de modificarla.

### Conectar o reconectar

1. Abrir **ChatGPT → Settings/Configuración → Plugins**, localizar el paquete que se va a usar.
2. Revisar endpoint de la app/plugin; debe resolver al **MCP canónico**, no a los Cloud Run legados.
3. Seleccionar **Conectar/Reconectar**, autenticar mediante Auth0, consentir scopes de cada operación.
4. En una conversación con el complemento seleccionado ejecutar `gateway_status(verificarFirma=false)`, luego `gateway_status(verificarFirma=true)`. Debe devolver `upstreamHmacAccepted=true`.
5. Ejecutar `diagnosticar_clase(courseId="875776451793",soloClassroom=true)` como lectura real. No ejecutar un cierre de unidad para probar instalación.
6. Documentar versión del plugin, release ID, ID del paquete conectado, commit desplegado, resultado de las pruebas y fecha. **Nunca** registrar JWT, HMAC o valores de Secret Manager.

### Criterio de instalación exitosa

El plugin aparece conectado, expone las **12 herramientas** anunciadas por `tools/list`, OAuth protege las operaciones que modifican Classroom, la validación HMAC es aceptada y `diagnosticar_clase` devuelve recursos reales sin mutarlos. Que un `/health` o `gateway_status(false)` dé OK **no basta** para declarar la integración completa.

## 6. Recursos que NO deben duplicarse

No recrear el tenant Auth0, un proyecto Google Cloud, un servicio MCP, una WebApp, `CLASPRC_JSON`, nuevas cuentas de servicio, nuevas claves HMAC, nuevos plugins o nuevos cursos para resolver un error de permisos. Antes de cambiar cualquiera de ellos, revisar [DIAGNOSTICO_Y_RECUPERACION.md](DIAGNOSTICO_Y_RECUPERACION.md).
