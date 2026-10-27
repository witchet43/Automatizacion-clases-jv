# Automatización académica JV — arquitectura vigente

Contrato **STATIC_WEB_APP_SERVICE**: operaciones **data-only**. Ante fallo, bloquear y reconciliar sin ruta alternativa; **Work mode** no se utiliza.


## Operación académica (sin GitHub Actions)

**Ruta principal verificada: ChatGPT → Classroom Academic Gateway (OAuth/Auth0) → Cloud Run `academic-classroom-mcp-oauth` → WebApp canónica Google Apps Script (HMAC) → Classroom / Drive / Forms.** El Portal Académico/Site queda como integración heredada pendiente de evaluación; no debe sustituir automáticamente la conexión funcional.
Gamma y Notion se acceden mediante sus conectores para presentaciones y notas docentes.

Las operaciones de lectura usan preferentemente las herramientas MCP (`gateway_status`, `diagnosticar_clase`, `auditar_recursos`). Las escrituras pasan por una solicitud autorizada y firmada (HMAC), el entrypoint genérico `uaqExecutor`, la lógica canónica de Apps Script y postflight. Los recursos didácticos ordinarios quedan **DRAFT** y Forms sin publicar. **Excepción administrativa explícita:** `Calificación Unidad N` tiene CourseWork `PUBLISHED`, pero cada nota individual queda en `draftGrade`, nunca `assignedGrade`. Google Docs de actividades, tareas y prácticas se adjuntan como **STUDENT_COPY**.

No usar Codex, Work Mode, GitHub Actions, Execution API, `clasp run`, workflows por archivo o scripts ad hoc para ejecutar operaciones académicas. Cloud Run está autorizado exclusivamente como adaptador MCP OAuth que firma y transporta solicitudes a la misma WebApp canónica; no contiene algoritmos académicos. Un fallo no autoriza reintentar con otro requestId: se consulta Classroom primero y se exige idempotencia.

El servicio canónico es el mismo endpoint registrado en `config/academic-context.json`. **No cambiar su URL, deployment, firma ni identificadores de curso durante una limpieza**.

### Generación de clase completa

1. Resolver la próxima sesión desde planeación y estado real de Classroom, no desde el día actual ni Calendar.
2. Reutilizar documentos canónicos; crear recursos Google en DRAFT y verificar IDs, adjuntos, STUDENT_COPY y duplicados.
3. Buscar la Gamma LIVE, verificar y reutilizar antes de generar otra.
4. Buscar la nota de Notion bajo la materia; actualizar sin duplicar; notas explicativas completas para impartir la clase.
5. Reconciliar el paquete. Nunca declarar completada una clase con algún componente pendiente.

## Mantenimiento de plataforma

GitHub se utiliza exclusivamente para versionar, validar y desplegar **cambios de código aprobados por el usuario**. Apps Script se despliega exclusivamente por `deploy-apps-script.yml` y evidencia `.platform-changes/*.json`. El adaptador MCP independiente tiene `deploy-cloud-run-mcp.yml`, manual y protegido por WIF + OAuth + Secret Manager; ninguno de los dos workflows ejecuta operaciones de alumnos. `validate-minimal-academic-operations.yml` ejecuta regresiones. No crea recursos de alumnos.

Las antiguas solicitudes `.academic-requests/` y el workflow `academic-webapp.yml` quedaron retirados del árbol activo; su historial permanece en Git y en la rama de archivo `archive/academic-requests-before-direct-webapp-20261020`. El adaptador MCP original de token fijo fue retirado. Existe un **nuevo** `mcp-cloud-run/` con OAuth (no hereda la antigua credencial ni ejecuta lógica de Classroom): ver `mcp-cloud-run/README.md`. Su despliegue queda separado del de Apps Script y requiere infraestructura y OAuth configurados.

**Compatibilidad temporal que no debe tocarse sin actualizar el Site:** el manifest aún expone metadatos históricos `workflow.name/path`, `operations.*.requestDirectory` y otros campos de envoltura. El Site desplegado usa el SHA-256 de ese manifest para validar las solicitudes: modificarlo ahora sin republicar el Site cortaría el acceso académico. Son **metadatos inertes**, no una ruta ejecutable. Ver `docs/cleanup-register-20261020.md` para cerrar esa dependencia.

## Reglas protegidas

- Política DRAFT; Forms no publicados; copia individual editable.
- Consecutivo de Quiz de asistencia considerando DRAFT y PUBLISHED.
- Una única fuente de comportamiento: Apps Script canónico.
- Calificaciones existentes, registros académicos, trazabilidad e idempotencia se conservan.
- Integración de calificaciones GitHub es una función distinta de la creación de clases; auditar uso antes de desinstalar sus triggers.
- Sin eliminaciones en Classroom mediante vías alternativas.

**Mantenimiento vigente:** [Inventario de limpieza de Classroom — 27/10/2026](docs/cleanup-classroom-20261027.md). Los registros del 20/10 son históricos y no deben utilizarse como instrucción actual de desinstalación. Consulta también `AGENTS.md`.
