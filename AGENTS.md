# Contrato canónico para cualquier chat nuevo — plataforma académica JV

Contrato **STATIC_WEB_APP_SERVICE**: operaciones **data-only**. Ante fallo, bloquear y reconciliar sin ruta alternativa; **Work mode** no se utiliza.


**La única fuente de lógica y escritura académica es la WebApp canónica de Apps Script.** Se permiten dos transportes al MISMO ejecutor: el Portal académico legado y el nuevo MCP OAuth independiente de Cloud Run. Ninguno puede llamar APIs académicas de Google directamente ni contener lógica duplicada. Gamma y Notion se usan solo a través de sus conectores; no son canales alternativos para crear CourseWork.

## Operaciones rutinarias: DATA_ONLY

Leer `config/academic-context.json` para obtener cursos, operación y contrato. Invocar las herramientas instaladas del Portal académico; no crear archivos de solicitud GitHub. Las operaciones soportadas pasan por el gateway firmado `uaqExecutor`; los diagnósticos autorizados son de solo lectura. Nunca utilizar GitHub Actions, `.academic-requests`, Execution API, `clasp run`, Work Mode ni Codex para crear contenido. Cloud Run sólo puede actuar como transporte OAuth + firma HMAC a la misma WebApp, sin ejecutar directamente Classroom.

Proteger DRAFT (sin publicación), Forms sin publicar y Google Docs con `STUDENT_COPY`. Los recursos existentes se reutilizan por curso+título+tema+documentId y se deben consultar con estados `DRAFT` y `PUBLISHED`. Cuando una operación devuelve timeout o fallo incierto, **consultar estado real primero**; no reintentar con otro ID ni crear duplicados. Si hay dos coincidentes, bloquear e informar.

Para clases, la planeación junto con Classroom real decide la siguiente sesión; no Calendar, memoria ni fecha actual. Gamma: búsqueda y lectura LIVE antes de reutilizar/crear. Notion: buscar y reutilizar la nota canónica del tema, redactar **explicaciones detalladas para estudiar e impartir**; nunca notas escuetas. Secuencia: recursos Google → Gamma LIVE → Notion LIVE → postflight. Los recursos didácticos ordinarios permanecen DRAFT. Única excepción de publicación automatizada: `Calificación Unidad N` como CourseWork PUBLISHED, pero sólo `draftGrade` por alumno, sin `assignedGrade` ni devolución. Actividades nunca llevan «tiempo estimado». Se preservan reglas académicas particulares del manifest, incluida la baseline Windows de Introducción a TI.

## Cambios de código o arquitectura: PLATFORM_CHANGE

Exigen autorización explícita del propietario (una autorización global específica de limpieza también es válida para esta intervención). Proteger un único deployment y URL. Solo `.platform-changes/*.json` autoriza el workflow `deploy-apps-script.yml`. Ejecución y validación no deben crear CourseWork. Prohibidas rutas one-off y cualquier backend académico alternativo. Apps Script conserva su deployment original. El adaptador MCP independiente puede desplegarse en Cloud Run tras la autorización explícita y la preparación de WIF, OAuth y Secret Manager. Regresiones deben quedar verdes y verificarse el estado real tras desplegar.

**La integración Site incluye un hash fijado del manifest**. No modificar el contenido de `config/academic-context.json` ni su `src/00_AcademicContextConfig.gs` generado durante la desinstalación de rutas antiguas hasta asegurar la republicación sincronizada del Site; consulta el registro de pendientes. Los campos históricos de workflow del manifest son compatibilidad temporal, NO una vía ejecutable.

## Pendientes de mantenimiento

Ver `docs/cleanup-register-20261020.md`: posibles triggers heredados, despliegues externos, plugins privados antiguos, duplicado de Práctica 16 y migración de metadatos Site. No borrar Google Docs canónicos, calificaciones, Script Properties HMAC ni recibos académicos. Eliminar siempre de forma específica y verificar después.

## MCP independiente sin Sites ni Codex

Nuevo adaptador OAuth en `mcp-cloud-run/` con herramientas `gateway_status`, `diagnosticar_clase`, `cerrar_unidad`. Sólo firma y envía solicitudes a la WebApp; requiere scopes, audiencia, allowlist `sub` y autenticación PKCE mediante un proveedor OAuth gestionado. El workflow de Cloud Run no crea materiales. Configuración externa inicial y enlace de plugin son obligatorios antes de usarlo desde este chat. No declarar un cierre académico ejecutado sin un `courseWorkId` real. Véase `mcp-cloud-run/README.md`.
