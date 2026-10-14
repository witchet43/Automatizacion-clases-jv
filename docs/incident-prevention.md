# Controles derivados de incidentes — auditoría de 10 días

Los incidentes se gestionan por causa raíz y quedan protegidos por regresiones.

## Controles permanentes

- Rutas paralelas, Execution API, replacement deployments y APIs académicas directas: eliminadas y bloqueadas.
- Bundle/contexto y registros: el manifiesto es la única fuente de cursos y planeaciones.
- Scope de Google Docs, IDs obsoletos, renderizado documental, tablas y comandos didácticos: protegidos por regresiones.
- Polling administrativo y triggers legados: descomisionados.
- Lecturas transitorias Classroom: retry acotado únicamente en lecturas.
- Errores HTTP/autorización: diagnóstico explícito sin cambiar de transporte.
- Límite de versiones Apps Script: verificado antes de mutar.
- **STATIC_WEB_APP_SERVICE:** una operación académica es data-only y no puede disparar deployment.
- **Academic Web App:** rechaza commits mixtos mediante `assert-academic-request-data-only.mjs`.
- **Deploy Apps Script:** solo puede arrancar por evidencia `.platform-changes/**` y valida autorización/alcance con `assert-platform-change-authorized.mjs`.
- Un fallo operacional nunca autoriza modificar el motor.

## Límite de plataforma

Un trigger instalado en otro proyecto de Apps Script no puede eliminarse desde este repositorio. Ese caso es mantenimiento externo, no motivo para crear otra ruta académica.
