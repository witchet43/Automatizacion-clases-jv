# Contrato operativo — STATIC_WEB_APP_SERVICE

**Operación:** ChatGPT → Portal Académico privado → WebApp canónica de Apps Script → Classroom, Forms y Drive. Las solicitudes van firmadas por el Portal; Gamma y Notion se usan mediante sus conectores LIVE.

**Prohibido para trabajos ordinarios:** ejecutar tareas académicas desde GitHub Actions o Cloud Run, archivos `.academic-requests`, Execution API, rutas alternativas, Work Mode, Codex y publicación automática.

**Permitido para mantenimiento autorizado:** versionar, validar y desplegar código mediante `.platform-changes/*.json`, `deploy-apps-script.yml` y `validate-minimal-academic-operations.yml`. La WebApp mantiene su deployment y URL originales.

Garantías: Classroom DRAFT; Forms no publicados; Google Docs en STUDENT_COPY; idempotencia contra DRAFT/PUBLISHED, sin duplicados ni reintentos ciegos; Gamma LIVE y notas docentes detalladas en Notion.

El manifest aún conserva campos históricos de nombre de workflow y directorio de solicitudes **por compatibilidad con el SHA fijado del Site**. No existe workflow que procese esos campos; se retirarán sincronizando la publicación del Site para no romper el gateway. Consulte `docs/cleanup-register-20261020.md` para pendientes manuales.
