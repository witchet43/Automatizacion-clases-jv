# Arquitectura académica canónica

**ÚNICA RUTA EN SERVICIO:** ChatGPT → Auth0 (OAuth DCR, PKCE) → MCP `academic-classroom-mcp-oauth` (Cloud Run) → solicitud HMAC a WebApp de Apps Script (`uaqExecutor`) → Classroom / Forms / Drive.

La lógica de calificaciones, idempotencia y recursos vive en Apps Script. No hay ejecutor académico en GitHub. Los workflows de GitHub despliegan código y ejecutan regresiones, nunca recursos escolares.

## Contrato operativo
`STATIC_WEB_APP_SERVICE`: toda petición ordinaria es **data-only**, sin redeploy de infraestructura. Mantener seguridad OAuth y firma HMAC. Los recursos creados son DRAFT; Google Forms no publicados; documentos Google con STUDENT_COPY; no `assignedGrade`. Excepción: `Calificación Unidad N` aparece PUBLISHED con calificaciones individuales `draftGrade`.

## Flujo seguro
Resolver `courseId` por manifest → diagnóstico de Classroom DRAFT/PUBLISHED → solicitar operación MCP → WebApp valida HMAC y recibo idempotente → ejecutar Apps Script → verificar ID y estado reales. Si hay **fallo**, consultar registros/recibos; no reintentar con otra identidad. Nunca utilizar Work mode, Codex, GitHub Actions, Execution API o un Site como alternativa operativa.

La integración Gamma/Notion requiere evidencias LIVE e idempotencia por clase; la planeación y el estado de Classroom deciden la próxima sesión.

## Operación y mantenimiento
El MCP se despliega con `deploy-cloud-run-mcp.yml`; Apps Script con `deploy-apps-script.yml`, bajo autorización `.platform-changes/*.json`. El endpoint de Apps Script se obtiene de `config/academic-context.json`; no modificar sus metadatos ni SHA sin coordinación explícita. Las evidencias de cambios anteriores quedan disponibles únicamente en Git history.

## Verificación
Ejecutar `gateway_status(verificarFirma=true)`; requiere `upstreamHmacAccepted=true`. Después `diagnosticar_clase` en modo solo lectura. Para modificar infraestructura deben aprobarse las pruebas de `validate-minimal-academic-operations.yml`.
