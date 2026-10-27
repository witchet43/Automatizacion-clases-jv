# Registro de limpieza profunda — 20 de octubre de 2026

> **REGISTRO HISTÓRICO, NO PLAN OPERATIVO VIGENTE.** Este documento captura el estado del **20/10/2026**, cuando se intentó retirar el adaptador Cloud Run y usar Portal/Site. El **27/10/2026** se recuperó y verificó el Gateway MCP OAuth. Para cualquier limpieza actual usar [el inventario confirmado del 27/10](cleanup-classroom-20261027.md). No eliminar `academic-classroom-mcp-oauth` ni sus secretos basándose en instrucciones anteriores.


## Arquitectura vigente

ChatGPT → Portal académico privado → WebApp canónica Apps Script (`uaqExecutor`) → Google Classroom, Forms y Drive. Gamma y Notion usan conectores propios. GitHub solo valida y despliega cambios de código explícitamente autorizados.

### Cambios realizados en el repositorio

- Las solicitudes históricas `.academic-requests/` se archivaron sin perder trazabilidad en la rama `archive/academic-requests-before-direct-webapp-20261020`. El árbol activo deja de contenerlas. Los commits antiguos permanecen en Git.
- Se elimina el workflow de ejecución académica `.github/workflows/academic-webapp.yml`, así como `scripts/execute-academic-request.mjs` y su guard de solicitudes por commit.
- Se elimina el código antiguo `mcp-cloud-run/` (adaptador alternativo que no debe operar solicitudes académicas).
- `README.md`, `AGENTS.md`, documentación canónica y pruebas pasan a exigir llamada directa Site/WebApp.
- Solo subsisten `validate-minimal-academic-operations.yml` y `deploy-apps-script.yml` en GitHub Actions. Se conserva `.platform-changes/` como auditoría de autorizaciones y el motor Apps Script/Gradebook válido.
- Una regresión específica impide reintroducir rutas alternativas.

## Pendientes MANUALES (no detienen la limpieza de código)

**1. Classroom — eliminar solo duplicado Práctica 16 (UAQ Sistemas Distribuidos):** curso `871158466533`; conservar el primer DRAFT `893237625248`, eliminar el segundo DRAFT `883005863308`. Classroom → Sistemas Distribuidos → Trabajo en clase → Práctica 16 más reciente → menú ⋮ → Eliminar. Verificar después que hay una sola. El plugin instalado no expone borrado autorizado de CourseWork; no convertir una función de creación en un borrador de eliminación.

**2. Recursos de prueba de Sistemas Operativos:** revisar y eliminar manualmente, *solo si aún existen*, los borradores de prueba creados en la validación: actividad `893232046159`, tarea `893232707530`, práctica `874130972863`, quiz `874131420573` y examen `893236212306`. Los Google Docs/Forms vinculados deben revisarse antes de moverlos a papelera. **No eliminar Quiz 15 `893236157701`**: fue solicitado expresamente con consecutivo oficial y sin prefijo de prueba.

**3. Apps Script — disparadores instalados:** abrir el proyecto canónico → Desencadenadores/Triggers y listar los existentes. Si están instalados, retirar los de mecanismos ya descomisionados `monitorearQuizAbiertoOpenAI`, `evaluarEntregas` y cualquier workflow de solicitud por hojas que ya no ejecute trabajo real. No retirar triggers de calificaciones/imputación hasta confirmar con docente su uso actual; `monitorearCalificacionesGitHubCadaMinuto` y cierres de unidad requieren auditoría específica. Código obsoleto no prueba por sí solo que exista un trigger activo.

**4. Apps Script — Script Properties:** no eliminar HMAC, `ACADEMIC_WRITE_RECEIPT_*` PENDING o COMPLETED ni claves de idempotencia válidas a ciegas. Ejecutar `diagnosticarPropiedadesAcademicas` en Apps Script para obtener recuentos sin exponer claves; usar `depurarSolicitudesQuizSinReferencia` únicamente tras reconciliar recursos Classroom.

**5. Cloud Run:** el repositorio ya no contiene el adaptador, pero el conector disponible no permite confirmar/desplegar/destruir servicios Cloud Run reales. En Google Cloud Console → Cloud Run, buscar `academic-classroom-mcp` (nombre usado en documentación anterior) y otros adaptadores MCP académicos; si existe uno no usado, desactivarlo/eliminarlo después de confirmar cero tráfico útil y dependencias, sin afectar el proyecto de Apps Script.

**6. Plugins privados anteriores:** se detectaron plugins privados históricos `classroom-academic-gateway` (versión 0.2.0, describe ejecución con GitHub Actions) y `dev-062ca842a5f081919c2ac3e0cd654cca` (Site diagnóstico solo lectura). Revisar cuáles están conectados y conservar exclusivamente el **Portal Académico operativo**; eliminar o desconectar desde Settings → Plugins el legado si no es la integración vigente. No eliminar por nombre sin contrastar los IDs del Site activo.

**7. Ramas GitHub históricas:** hay varias ramas `auto-simple-quiz-*`, `feature/cloud-run-mcp-classroom`, `platform/direct-webapp-*`, `fix/*-20260914` y otras ya fusionadas. GitHub aquí no tiene `delete_ref` para borrarlas; revisar protección, PR abiertos y compararlas con `main` antes de borrar solo las fusionadas. Mantener `main` y `archive/academic-requests-before-direct-webapp-20261020`. Borrarlas no es requisito para la WebApp.

**8. Metadatos de configuración Site / manifest:** `config/academic-context.json` conserva temporalmente `workflow.path`, `workflow.requestsDirectory`, `operations.*.requestDirectory` y el nombre `Academic Web App`. Son campos LEGACY COMPATIBILITY, ya no una ruta de ejecución. **No cambiarlos todavía:** su SHA-256 está fijado en el Site y en `src/00_AcademicContextConfig.gs`. Para retirar estos metadatos hay que actualizar y republicar el Site, desplegar en una sola ventana la configuración nueva con hash concordante y verificar lectura + escritura HMAC antes de desactivar la configuración anterior. No sacrificar la capacidad de crear clases desde cualquier chat nuevo por limpiar nombres heredados.

**9. Despliegues/versiones antiguas de Apps Script:** no confundir un deployment antiguo con el deployment canónico en producción. Abrir Manage deployments, conservar el endpoint registrado en el manifest y retirar manualmente solo deployments no usados después de verificar accesos. La política de versiones del repositorio no usa DELETE automático.

**10. Hojas y documentos históricos:** registros de publicación, planeaciones, instrumentos y calificaciones sirven como auditoría y fuente de clases. No borrar masivamente. Las notas Notion y Gamma se revisan por LIVE, no se infiere obsolescencia por fecha.

## Confirmación de integridad

Tras desplegar limpieza: verificar `gateway_status` (writesEnabled, ownerIdentityVerified, transport=direct-canonical-webapp), diagnóstico de Classroom y ausencia de workflow académico de GitHub. No crear actividades para comprobar limpieza. Para cualquier fallo, detenerse antes de cambiar endpoint o credenciales.

## Incidente pendiente: Portal Académico y sesión 13 ADSC (20/10/2026)
Autorización docente: «Completala, autorizo todo lo necesario».
El curso UAQ tiene courseId 871158479566 y temaSubtema canónico «Selección y adaptación de un enfoque metodológico» (sin prefijo 3.3). La nota docente está en https://app.notion.com/p/3ffcd69130bc81ee84a0c96143801f62. Gamma existente: https://gamma.app/docs/2pjc99vj7owgou9, pendiente del theme UAQ exacto bfm8ztqy1whsib8. No regenerar Gamma a ciegas.

Los intentos de crear el borrador desde el Site Classroom Portal académico terminaron en WEBAPP_WRITE_REJECTED_OR_UNKNOWN_RECONCILE. Un diagnóstico seguro temporal ya desplegado permitió leer el código real ACCION_NO_PERMITIDA, lo que significa que el Site publicado envía un valor de action que el WebApp rechaza antes de ingresar al creador de recursos. WebApp solo admite uaqExecutor para escrituras; el helper correcto site-bridge/direct-write-client.mjs ya construye action:'uaqExecutor'. Corregir el SITE publicado (https://classroom-academico-jv.witchet43.chatgpt.site) para usar uaqExecutor con operation, courseId, requestId, params, operationalContext y HMAC firmados. No habilitar acciones directas alternativas, no deshabilitar HMAC, no usar GitHub Actions como transporte de alumnos.

Classroom fue reconciliado con 24 CourseWork y ningún borrador nuevo de práctica 3.3; búsqueda Drive por título no identificó el documento nuevo. No reintentar requests usados (pueden tener recibos PENDING). Tras la corrección del Site, diagnosticar recibos, obtener nueva autorización e identidad idempotente y crear una sola práctica DRAFT sin vencimiento, Google Doc STUDENT_COPY. Paquete de la sesión 13 sigue PARCIAL hasta ese postflight y el tema Gamma canónico. La instrumentación temporal de código se retira con este registro.
