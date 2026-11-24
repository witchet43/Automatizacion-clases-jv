# Orquestación persistente de liberaciones

El coordinador de liberaciones de plataforma vive en GitHub Actions, no en una sesión de ChatGPT. Un squash merge autorizado en main, con su archivo de evidencia en .platform-changes/, activa automáticamente los cuatro workflows de CI, Apps Script, Cloud Run y certificación. Cada ejecución se asocia al SHA exacto; los despliegues esperan los resultados de sus dependencias. No se modifica la ruta canónica de operaciones académicas.

## Secuencia y criterios

1. CI completo y autorización de plataforma de alcance exacto.
2. Apps Script: comparación de los archivos de la versión desplegada con el código versionado (incluido el contexto generado). Solo se actualiza el deployment canónico si no coincide; el postflight consulta la versión y vuelve a verificar los archivos.
3. Cloud Run: comparación del commit activo con el runtime objetivo; solo se reconstruye si hay diferencia de código o configuración de despliegue. El deploy manual explícito conserva su ruta de recuperación. Los dos despliegues verifican que la revisión sigue siendo main antes de mutar.
4. Certificación: 100 % del tráfico a la revisión lista, equivalencia de código Cloud Run, metadata OAuth, descubrimiento MCP, rechazo de una operación anónima con identificadores inexistentes, y prueba HMAC positiva contra Apps Script. La prueba positiva usa un ID token Google de vida corta emitido a la cuenta de despliegue existente mediante WIF; el endpoint separado /release/probe solo ejecuta diagnosticarFirma y no confiere permisos MCP ni permite acceder a estudiantes.

El estado release/orchestrator del commit es pending, success o failure. Los archivos release-evidence.json y release-live-evidence.json se publican como artefactos durante 90 días; el estado del commit y los registros de las ejecuciones permanecen como referencias. El coordinador emite COMPLETED únicamente después de verificar todas las etapas. BLOCKED identifica fallo, deadline, evidencia faltante o sustitución del commit. Un release más reciente reconcilia el estado real de ambos componentes, de modo que no se pierda una modificación autorizada de un release intermedio.

## Reintentos

Máximo dos intentos por workflow (el original y un reintento de jobs fallidos). CI es seguro de reintentar; los deploys se reintentan solo si ningún paso mutante comenzó. No se repite un deploy que pudo haber modificado producción ni se redepliega una versión obsoleta. Las consultas HTTP transitorias y las pruebas de lectura pueden reintentarse hasta tres veces. La coordinación tiene deadline de 30 minutos y un timeout del job de 45 minutos. Un error determinista requiere una corrección de código aprobada y un nuevo commit; el coordinador no inventa ni integra cambios autónomos de código. Si una ejecución se interrumpe, puede reejecutarse el coordinador sobre el SHA vigente; consulta las ejecuciones e intentos persistidos en GitHub, no depende de memoria de chat.

## Límites y seguridad

- El coordinador certifica un E2E de plataforma, no una operación académica real. No crea Forms, Classroom ni calificaciones y no usa los pipelines como ejecutor académico. La aceptación funcional de cada operación mutante debe invocarse separadamente por MCP con OAuth y consentimiento del usuario, y verificarse mediante su lectura posterior.
- El catálogo MCP del servidor se valida; el caché de herramientas de una sesión o del complemento de ChatGPT es externo al repositorio y no se declara actualizado sin evidencia.
- La cuenta de despliegue y las credenciales clasp existentes se reutilizan. No se agrega almacenamiento, nuevo servidor, clave estática ni un permiso de calificación a la identidad de release. La verificación de fuente Apps Script usa su API de administración de deployments y contenido versionado, no la API de ejecución de Apps Script ni APIs académicas directas.
- Las credenciales y las respuestas de estudiantes jamás se almacenan en artefactos. Ante fuente no verificable, identidad no autorizada, pipeline ausente o evidencia incompleta, el estado es BLOCKED.

## Operación

Consultar Actions → Persistent Academic Release Orchestrator o el estado release/orchestrator del commit aprobado. Para recuperación sin crear un cambio artificial, usar Run workflow sobre main únicamente si el commit vigente tiene evidencia de plataforma y sus pipelines originales existen. No deshabilitar las protecciones ni forzar ejecuciones sobre un SHA sustituido.

Este workflow es un coordinador de releases de plataforma; no un sistema de generación autónoma de código ni un sustituto de las pruebas de aceptación específicas del usuario.
