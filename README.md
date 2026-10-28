# Automatización académica JV — arquitectura única vigente

**Estado operativo verificado: 27 de octubre de 2026.**

**ChatGPT → Classroom Academic Gateway MCP (Auth0 OAuth) → Cloud Run `academic-classroom-mcp-oauth` → WebApp canónica de Google Apps Script (HMAC) → Google Classroom, Forms y Drive.**

`AGENTS.md` es el contrato obligatorio para toda conversación y toda operación. `docs/academic-webapp-architecture.md` describe el flujo y sus límites. No interpretar la historia de commits, PR cerrados ni pruebas anteriores como instrucciones de producción.

## Reglas de operación
- Contrato `STATIC_WEB_APP_SERVICE`: solicitudes académicas **data-only**; cambios del motor van por otra vía.
- Apps Script es el único motor de negocio; Cloud Run es únicamente transporte OAuth + HMAC. GitHub Actions se utiliza solo para validar y desplegar código autorizado, nunca como ejecutor de trabajos académicos.
- El manifest canónico es `config/academic-context.json` (contrato 1.1.0). **No modificar** su SHA, URLs, curso o deployment durante limpieza sin migración coordinada.
- Recursos ordinarios en `DRAFT`; Forms no publicados; Google Docs `STUDENT_COPY`; sin «tiempo estimado».
- Excepción deliberada: `Calificación Unidad N` puede estar en `PUBLISHED` con calificaciones individuales únicamente en `draftGrade`; nunca `assignedGrade` ni devolución automática.
- Antes de cualquier escritura: confirmar curso, identidad, idempotencia y existencia de recursos `DRAFT` y `PUBLISHED`. Tras fallo, diagnosticar el estado real: no repetir con `requestId` nuevo.
- Para clase completa: planeación y Classroom reales → recursos Google → Gamma LIVE → Notion LIVE → reconciliación. No inferir sesiones por fecha actual ni por Calendar.
- Si existe **fallo** de conexión o permisos: detener escritura, diagnosticar el MCP y el destino. Nunca cambiar de transporte, deshabilitar OAuth o HMAC, ni utilizar Work mode o Codex como alternativa.

## Manuales de configuración, cambios y recuperación

La configuración y mantenimiento se documentan en tres procedimientos **vigentes y obligatorios**; no utilizar commits o manuales anteriores como guía de instalación:

1. [Configurar / reconectar plugin, Auth0 y Cloud Run](docs/CONFIGURACION_PLUGIN_Y_AUTH0.md).
2. [Modificar plugin, MCP, Apps Script, WebApp y usar GitHub Actions](docs/CAMBIOS_Y_DESPLIEGUES.md).
3. [Diagnóstico, pruebas seguras y recuperación](docs/DIAGNOSTICO_Y_RECUPERACION.md).

Cada cambio debe seguir la matriz de impacto, PR, evidencia de autorización exacta y verificaciones post-deploy. El plugin y su release se administran **por separado** del servidor MCP y la WebApp.

## Infraestructura operativa
- Proyecto Google Cloud: `classroom-mcp-512122` (`us-central1`).
- MCP: `https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app/mcp`.
- Servicios y secretos esenciales: `academic-classroom-mcp-oauth`, `academic-write-hmac`, `academic-mcp-allowed-subjects`.
- WebApp: la URL de `config/academic-context.json → webApp.url` (no crear otra).
- Despliegues controlados: `.github/workflows/deploy-cloud-run-mcp.yml` y `.github/workflows/deploy-apps-script.yml`.
- Pruebas: `.github/workflows/validate-minimal-academic-operations.yml`.

## Seguridad y mantenimiento
Conservar el cliente OAuth conectado, los secretos HMAC, las cuentas de servicio, los recibos de escritura, los registros de idempotencia y el deployment Apps Script. No eliminar servicios Cloud Run o plugins externos sin evidencia de consumidores y tráfico.

La evidencia de autorización para cambios de plataforma utiliza `.platform-changes/*.json`. Las evidencias de cambios anteriores se consultan en **Git history**, no permanecen en el árbol activo. No se deben utilizar manuales de rutas anteriores como instrucciones operativas.

Consulta `AGENTS.md` para políticas de ejecución y `mcp-cloud-run/README.md` para operar el transporte.
