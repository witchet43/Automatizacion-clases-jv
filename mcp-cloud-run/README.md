# Classroom Academic Gateway — MCP OAuth operativo

Este directorio contiene **únicamente el adaptador de transporte**; la WebApp Google Apps Script canónica es el único motor académico.

## Despliegue único
- Cloud Run: `academic-classroom-mcp-oauth`.
- Proyecto: `classroom-mcp-512122` / `us-central1`.
- Endpoint: `https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app/mcp`.
- Auth0 issuer: `https://dev-67cfevmusm7px130.us.auth0.com/`.
- Modo de despliegue: `MCP_AUTH_MODE=oauth`; no habilitar acceso anónimo para operaciones de escritura.
- API OAuth: audiencia del servicio Cloud Run (sin el sufijo `/mcp`).
- Scopes: `academic.read` y `academic.close_unit` (según operación). Aplicar menor privilegio y sujeto autorizado.
- Secret Manager: `academic-write-hmac` y `academic-mcp-allowed-subjects`, no publicar valores.
- Transporte académico: `SIGNED_WEBAPP_ONLY`; el MCP firma y delega a Apps Script, no llama a Classroom directamente.

## Herramientas
`gateway_status`, `diagnosticar_clase`, `auditar_recursos`, `crear_recurso`, `listar_entregas`, `calificar_entrega_draft`, `cerrar_unidad`, `cerrar_materia`, `consultar_despliegues_mcp`, `consultar_ejecucion_mcp`, `iniciar_despliegue_mcp`, `verificar_despliegue`.

Las últimas herramientas administrativas pueden necesitar credenciales adicionales; que una operación administrativa falle no autoriza modificar OAuth, HMAC o recurrir a ejecutores alternativos.

## Despliegue y comprobaciones
1. Cambios autorizados mediante `.platform-changes/*.json`.
2. Ejecutar regresiones `npm run check` en este directorio y la validación principal.
3. Workflow único de Cloud Run: `.github/workflows/deploy-cloud-run-mcp.yml`.
4. Confirmar la revisión con pruebas OAuth, rechazo de escritura anónima, listado MCP y `gateway_status(verificarFirma=true)`.
5. Consultar Classroom en solo lectura antes de permitir nuevas escrituras.

**Prohibido** restablecer flujos anónimos, deshabilitar OAuth/HMAC, crear otro MCP académico o usar GitHub Actions como ejecución ordinaria.
