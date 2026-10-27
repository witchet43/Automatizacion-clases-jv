# Arquitectura académica canónica (operación y mantenimiento separados)

> **ACTUALIZACIÓN 27/10/2026:** este documento refleja la arquitectura de Portal/Site anterior y contiene referencias obsoletas a la ausencia de Cloud Run. La ruta actualmente verificada es **ChatGPT → MCP OAuth Cloud Run → WebApp Apps Script firmada con HMAC → Classroom**. Conservar los principios pedagógicos y de protección; consultar [inventario vigente de limpieza](cleanup-classroom-20261027.md) antes de modificar infraestructura.


Contrato **STATIC_WEB_APP_SERVICE**: operaciones **data-only**. Ante fallo, bloquear y reconciliar sin ruta alternativa; **Work mode** no se utiliza.


## Flujo único

`ChatGPT → Portal Académico privado → POST autorizado y firmado → Google Apps Script WebApp canónica → Classroom / Forms / Drive`

El Site verifica curso, operación, título, estado DRAFT, requestId y autorización HMAC. Apps Script es la única autoridad de comportamiento e idempotencia. No hay workflow GitHub intermediario, ni adaptador Cloud Run, ni Execution API. Cualquier resultado incierto requiere diagnóstico real, nunca nueva petición con ID improvisado.

Las operaciones crean datos y **no modifican el código**. Tras la ejecución, verificar ID, curso, título, DRAFT, documento canónico, STUDENT_COPY y ausencia de duplicados. Los exámenes se construyen con 25 reactivos / 100 puntos conforme a política; el Quiz de asistencia es una tarea vacía con nombre automático Quiz N.

## Clase completa

La siguiente sesión se resuelve por planeación canónica y recursos realmente existentes; fecha/Calendar no deciden. Orden: recursos Google → Gamma LIVE (búsqueda, lectura, no duplicar) → Notion LIVE (notas docentes claras y completas) → reconciliación. La página de Notion debe coincidir con materia y tema canónico. Una clase incompleta no puede marcarse terminada.

## Mantenimiento

Las únicas automatizaciones GitHub permitidas son validación de regresiones y actualización del **deployment existente** bajo una evidencia `.platform-changes/*.json` con autorización explícita. GitHub no debe ejecutar creación de Classroom. `academic-webapp.yml`, las solicitudes `.academic-requests` y Cloud Run MCP están descomisionados del árbol activo, conservados en historial de Git.

### Metadatos heredados fijados por SHA

Para mantener el Site funcionando entre chats, `config/academic-context.json` conserva provisionalmente nombres/campos del viejo workflow de solicitud. Son metadatos de compatibilidad; **no existe workflow ejecutable**. No cambiar el manifest ni su paquete generado sin sincronizar SHA, configuración y publicación del Site. El cierre manual se explica en `docs/cleanup-register-20261020.md`.

## Protección

- No publicación automática; no ejecución de rutinas académicas en CI.
- Forms no publicados; Docs STUDENT_COPY; notas y calificaciones privadas.
- No eliminar HMAC, recibos PENDING, identificadores canónicos o contenidos académicos.
- Evitar trigger legado concurrente: revisar estado real y retirar solo tras comprobar uso.
- Operaciones de eliminación requieren herramienta explícita y postflight; de otro modo intervención manual.
