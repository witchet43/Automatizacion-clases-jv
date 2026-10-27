# Inventario de limpieza controlada — Classroom Academic Gateway
Fecha de auditoría: 2026-10-27. Alcance: **únicamente automatización académica**. Este documento no es una instrucción para borrar recursos automáticamente.

## Arquitectura que se debe conservar
ChatGPT con OAuth de Auth0 → MCP Streamable HTTP `academic-classroom-mcp-oauth` en Cloud Run (`classroom-mcp-512122`, `us-central1`) → WebApp canónica Apps Script firmada con HMAC → Classroom / Forms / Drive. Apps Script contiene las reglas académicas; el MCP autoriza, valida y firma, no calcula calificaciones. Gamma/Notion se integran por flujos propios.

Evidencia operativa directa:
- `gateway_status(verificarFirma=true)`: `upstreamHmacAccepted=true`, contrato `1.1.0`.
- `diagnosticar_clase` de Sistemas Operativos respondió `ok=true`.
- `cerrar_unidad` de Ética y Legislación Informática, unidad 2: CourseWork `896227204779` en PUBLISHED, 21 estudiantes con `draftGrade`; no se asignó `assignedGrade`.
- Despliegue de MCP por commit `ef9384282908f182dcab94f58304f29ed83f8c87`, GitHub Actions run `40600712435`, aprobado.

## Inventario y criterio de limpieza
| Área | Evidencia | Categoría | Acción siguiente |
|---|---|---|---|
| Cloud Run `academic-classroom-mcp-oauth` | Servicio existente y activo; usado por el MCP | CRÍTICO | Conservar y no cambiar URL, IAM, versiones, tráfico o autenticación |
| Cloud Run `academic-classroom-mcp` | Existía el 27/10 en auditoría GCP | REVISAR | Comprobar tráfico y dependencias; no borrar por el nombre |
| Cloud Run `academic-classroom-chatgpt-gateway` | Existía el 27/10 en auditoría GCP | REVISAR | Comprobar invocaciones y consumidores antes de considerar eliminación |
| Secret Manager `academic-write-hmac` | Versión latest ENABLED; HMAC validado extremo a extremo | CRÍTICO | Conservar |
| Secret Manager `academic-mcp-allowed-subjects` | Versión latest ENABLED; clave de autorización OAuth | CRÍTICO | Conservar |
| Secret antiguo `classroom-mcp-token` | Referido como legado en documentación | NO VERIFICADO | Buscar consumidores y versiones sin leer valores; no borrar aún |
| Auth0 tenant `dev-67cfevmusm7px130` | Login OAuth funcional, DCR y permisos API | CRÍTICO | Conservar tenant, API y cliente ChatGPT que funciona |
| Plugins USER | 2: `plugin_asdk_app_6ae122d7590c819189986ae8d91db706` (v1.0.1) y `plugins_6ad6d4abed4c819197eab7830fe773af` (v0.3.13) | REVISAR | Comparar en ChatGPT cuál es usado; el antiguo también apunta al MCP activo; desconectar solo con verificación |
| GitHub | 112 ramas históricas al inicio (113 con rama de esta auditoría); los PR #2 y #4 cerrados sin fusión por obsolescencia, sus ramas preservadas | EN PROCESO | Conservar `main`, ramas de archivo y evidencias; identificar ramas fusionadas antes de eliminarlas |
| `.platform-changes/` | Evidencias de cambios y autorizaciones previas | AUDITORÍA | Conservar por trazabilidad y pruebas |
| `config/academic-context.json` | SHA fijado y campos de compatibilidad de workflow anterior | CRÍTICO | No tocar hasta migración coordinada con Apps Script y MCP |
| Deployments Apps Script | Endpoint canónico firmado y funcional | CRÍTICO | No reemplazar; identificar versiones anteriores con inventario de consumidores |
| Triggers y Script Properties Apps Script | Sin inventario actual de instancias instaladas | NO VERIFICADO | Diagnosticar antes de retirar; jamás borrar recibos HMAC, PENDING o claves de idempotencia por antigüedad |
| Historial de documentos y Classroom | Documentación histórica identifica algunos duplicados de pruebas | REVISAR | Confirmar IDs reales y vínculos antes de cualquier eliminación |

## Limpieza de organización ejecutada
- Cerrado PR #4 (transporte directo experimental ChatGPT → Apps Script), no fusionado. Comentario explicativo y rama conservada.
- Cerrado PR #2 (ejecución de próxima clase mediante GitHub Actions/Execution API), no fusionado; `resolverSiguienteClase` existe en la fuente canónica actual. Rama conservada.
- Actualizados README, AGENTS y documentación histórica para fijar que el MCP OAuth es la ruta verificada.
- El workflow `audit-cloud-run-mcp.yml` fue ampliado para mostrar metadata y contar solo timestamps de logs de solicitud en 7/30 días para tres servicios (si IAM lo permite). No borra recursos ni lee cuerpos, credenciales ni datos personales.
- Retirado del workflow de auditoría el intento de POST inválido a registro DCR de Auth0; el descubrimiento OAuth ahora usa GET exclusivamente.

## Inconsistencias observadas
- `mcp-cloud-run/README.md` afirma anónimo sin OAuth, pero el despliegue actual es `STREAMABLE_HTTP_OAUTH`.
- `docs/academic-webapp-architecture.md` dice que no hay adaptador Cloud Run; ese apartado es anterior al retorno exitoso de MCP en octubre.
- `docs/cleanup-register-20261020.md` es una fotografía histórica: **no** describe la arquitectura vigente.
- `consultar_despliegues_mcp` falla con `GITHUB_APP_CREDENTIALS_NOT_CONFIGURED` (integración GitHub App opcional sin configurar). Las operaciones académicas no dependen de ella.
- `verificar_despliegue` falla con `CANONICAL_UPSTREAM_FAILURE`; hay que diagnosticar acceso a Cloud Run Admin API/revisiones antes de modificar IAM.
- GitHub mantiene pruebas y herramientas para rutas de plataforma anteriores, aunque las operaciones canónicas ya funcionan. No retirar sin trazabilidad.

## Secuencia de limpieza segura
1. **Congelar servicio operativo**: no cambiar Auth0, secretos, URLs, permisos de escritura o Cloud Run OAuth durante la auditoría.
2. Auditar tráfico y consumidores de los otros dos servicios Cloud Run y del secreto heredado. Sin evidencia de ausencia de uso, no eliminarlos.
3. Identificar en ChatGPT el plugin activo por ID y conexión. Mantener el que invoca las 12 operaciones; revisar el otro antes de desinstalar.
4. Clasificar ramas GitHub mediante PR y comparación con main; eliminar solo ramas ya fusionadas y sin función de archivo. No eliminar evidencia de plataforma.
5. Diagnosticar instalaciones de triggers y propiedades de Apps Script sin revelar claves; retirar solo funciones/despliegues sin consumidores.
6. Atender por separado las dos herramientas opcionales de observabilidad: repararlas sin ampliar IAM innecesariamente o retirarlas del contrato mediante cambio probado.
7. Verificar nuevamente `gateway_status(verificarFirma=true)`, `diagnosticar_clase` y pruebas regresivas; evitar escrituras de prueba.

## Resultado de verificación posterior al PR #111
- PR #111 integrado como commit `a15754f5253a54baefae55214e237d8acdfc98e0`.
- Pruebas principales y auditorías GitHub Actions aprobaron: workflows `40604410166`, `40604410156`, `40604410260`, `40604410285`.
- El README de `mcp-cloud-run/` activó inesperadamente el deploy por la regla amplia `mcp-cloud-run/**`; la actualización de Cloud Run terminó satisfactoriamente (`40604410097`), OAuth y HMAC continuaron funcionando.
- Para evitar despliegues por documentación se agrega un filtro negativo `!mcp-cloud-run/**/*.md` al workflow de despliegue, sin modificar código del adaptador.
- Cloud Logging devolvió resultado **INCONCLUSIVE** para los tres servicios y periodos 7/30 días debido a autorización o disponibilidad; **no se obtuvo evidencia de ausencia de uso** de los dos servicios legados. No eliminarlos.
- `gateway_status(verificarFirma=true)`: firma HMAC aceptada; `diagnosticar_clase` de Sistemas Operativos: `ok=true`, 53 trabajos; sin cambios en Classroom.
- Continúan fuera del alcance automático la revisión de triggers Apps Script y el consumo real de los dos plugins de ChatGPT. Mantenerlos mientras no se pueda demostrar que no se usan.

## Reconciliación adicional de recursos reales (solo lectura)
Comprobación posterior por `diagnosticar_clase`, sin eliminar ni crear recursos:
- **UAQ Sistemas Distribuidos** (`871158466533`): Práctica 16 canónica `893237625248` **existe** y está `PUBLISHED`. Duplicado anteriormente reportado `883005863308` **no aparece** entre 43 trabajos actuales. No hay eliminación manual pendiente de ese duplicado.
- **ITQ Sistemas Operativos** (`875776451793`): los cinco borradores de prueba del registro del 20/10 (`893232046159`, `893232707530`, `874130972863`, `874131420573`, `893236212306`) **ya no aparecen** entre 53 trabajos actuales. No eliminarlos otra vez.
- **Quiz 15** `893236157701` **sí existe** como `DRAFT`: fue solicitado como recurso oficial y debe conservarse.

## Verificación periódica pendiente
- El tenant Auth0 mostró **17 días restantes de prueba** el 27/10. Según Auth0, al vencer se activa el plan Free automáticamente, pero las funciones exclusivas del trial pueden dejar de estar disponibles. Revisar **Settings → Subscription** y la continuidad de DCR, conexión delegada, permisos de la API y login después del cambio de plan. No contratar un plan ni introducir datos de facturación sin consentimiento.
- Las invocaciones efectivas a los **dos Cloud Run legados** siguen sin verificarse: el workflow auditor encontró metadatos pero **Cloud Logging fue inconcluso** por acceso/retención. Se requiere consultar tráfico en Cloud Console con una identidad autorizada antes de eliminar servicios.
- Triggers y deployments de Apps Script y uso del complemento heredado no están inventariados desde sus interfaces administrativas; **no desinstalar a ciegas**.

## Criterios para próximas acciones
- Si Cloud Logging devuelve **INCONCLUSIVE** por permisos/retención, no interpretarlo como 0 solicitudes; no eliminar servicios.
- Si una rama fue fusionada pero es referencia de archivo/rollback, conservarla; el conteo no es objetivo de seguridad.
- Los dos complementos personales exponen 9 habilidades semejantes; uno referencia explícita al MCP con OAuth y el otro usa la app registrada. No desconectar ningún complemento hasta constatar por su ID cuál está instalado/operando en los chats que se utilizan.
- `academic-write-hmac`, `academic-mcp-allowed-subjects` y `config/academic-context.json` se consideran **inmutables** en la presente limpieza.
- No hay acceso de modificación a inventario real de triggers, implementaciones Apps Script o secretos GCP desde las herramientas de esta sesión; requerir evidencia de lectura antes de cada borrado.

## Guardrails
Prohibido publicar automáticamente notas individuales, escribir `assignedGrade`, reusar recibos inciertos, publicar nuevos trabajos para probar limpieza, leer secretos, eliminar un servicio por coincidencia de nombre o cambiar el manifest fijado por SHA sin despliegue coordinado.

**Estado de esta auditoría:** se cerraron 2 PR experimentales sin fusionarlos y se actualizaron documentos y un workflow de inspección solo lectura. No se eliminaron servicios, ramas, plugins, trabajos, secretos ni recursos de alumnos.
