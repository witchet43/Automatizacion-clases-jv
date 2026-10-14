# UAQ — contrato de arranque obligatorio

## REGLA DE MÁXIMA PRIORIDAD

Este proyecto opera bajo **STATIC_WEB_APP_SERVICE**.

Para una operación académica ya soportada, el asistente es **cliente/orquestador de una Web App ya desplegada**, no desarrollador del motor.

Una solicitud de clase, tarea, actividad, práctica, quiz, examen, material, Quiz de Asistencia, auditoría o reconciliación es **data-only**. Puede crear exactamente un archivo `.academic-requests/*.json` y ejecutar la ruta canónica. No autoriza tocar código.

Durante una operación académica está prohibido modificar `src/**`, `config/**`, workflows, manifest, algoritmos, Apps Script, deployments o rutas de transporte. Está prohibido crear funciones one-off por materia/unidad. Está prohibido usar Work mode para este proyecto.

**Un fallo operacional NO concede autorización de desarrollo.** Ante timeout, error HTTP o respuesta incierta: recuperar estado real, aplicar idempotencia y reintentar únicamente por la misma Web App. Si el defecto exige cambiar el motor, detenerse e informar al docente. No cambiar plataforma hasta recibir autorización explícita del usuario en la conversación actual.

## Dos carriles mutuamente excluyentes

### ACADEMIC_OPERATION
Ruta única:

`.academic-requests/<requestId>.json → Academic Web App → Web App canónico → entrypoint genérico → postflight`

El commit debe contener **solo** ese JSON. `scripts/assert-academic-request-data-only.mjs` bloquea cualquier mezcla con código/documentación/configuración.

Contenido nuevo es dato, no código. Un examen nuevo usa `crearExamen(params)`; una práctica nueva usa `crearPractica(params)`; una tarea nueva usa `crearTarea(params)`.

### PLATFORM_CHANGE
Solo existe cuando el usuario autoriza explícitamente cambiar la plataforma/funcionalidad. El mismo commit debe incluir exactamente una evidencia `.platform-changes/*.json` que cite la autorización y enumere exactamente los archivos modificados.

`scripts/assert-platform-change-authorized.mjs` valida la evidencia. Solo entonces GitHub Actions puede ejecutar **Deploy Apps Script**, actualizar el deployment canónico existente y realizar postflight. Nunca crear un deployment alternativo.

No mezclar `.academic-requests/**` y `.platform-changes/**` en el mismo commit.

## Arranque en cualquier chat nuevo

1. Leer `config/academic-context.json`.
2. Resolver `operationKey`.
3. Si la operación existe, tratarla como ACADEMIC_OPERATION data-only.
4. Leer únicamente la guía/documentación necesaria para construir parámetros.
5. Crear la solicitud declarativa y usar la Web App existente.
6. Cerrar solo con IDs/URLs/estados/postflight reales.
7. Si el motor requiere código nuevo, STOP y pedir autorización explícita de PLATFORM_CHANGE.

No usar memoria para reconstruir IDs, endpoints, algoritmos o avance. Calendar y la fecha actual no seleccionan clase. CourseWork ordinario permanece DRAFT y Forms sin publicar.


## Gamma LIVE — regla obligatoria sin excepción

La planeación es referencia histórica; **nunca certifica el estado actual de Gamma**. Un texto como `GENERADA Y VERIFICADA` o una URL guardada no permite declarar una Gamma reutilizable.

Para una clase o Gamma:
1. Resolver la sesión por Web App.
2. Si Gamma aplica, verificar el servicio Gamma real mediante el conector: consultar la URL/ID registrada y buscar también por título/tema con archivadas incluidas.
3. Leer la Gamma candidata antes de reutilizarla y comprobar que está activa, no archivada y corresponde al tema canónico.
4. Pasar esa evidencia a `resolverClase` en `options.gammaLiveEvidence[sesion]` con `source: "GAMMA_LIVE_CONNECTOR"`.
5. Obedecer `gammaDecision`:
   - `REUSE`: reutilizar.
   - `CREATE`: generar una nueva Gamma.
   - `REUSE_ACTIVE_EQUIVALENT`: no generar; usar el equivalente activo encontrado.
   - `REPAIR_OR_REVIEW`: corregir/revisar el existente; no duplicar.
   - `BLOCK`: detenerse.
   - `VERIFY_LIVE`: todavía falta consultar Gamma real.
6. `CREATE` solo es válido si se ejecutó búsqueda LIVE y no existe equivalente activo.
7. Después de generar, esperar `completed`, leer la nueva Gamma, comprobar título/contenido/estado activo y volver a aportar evidencia `LIVE_ACTIVE_CANONICAL` antes de declarar el paquete preparado.

Una Gamma archivada, eliminada, inaccesible o solo “verificada” en Sheets **nunca** acredita una clase preparada.


## Notas docentes de clase en Notion — componente obligatorio

Toda **CREACIÓN DE CLASE COMPLETA** termina en este orden: recursos Google → Gamma canónica verificada → **notas docentes Notion** → postflight final.

La raíz y la página padre por materia viven en `config/academic-context.json`. El título de la nota debe ser exactamente el tema/subtema canónico. Buscar antes de crear; si existe exactamente una nota canónica, reutilizar o actualizar. Nunca crear una segunda nota para la misma materia/tema. Múltiples candidatas bloquean la operación.

La nota debe ser un guion útil para impartir la clase, no una copia de Gamma. Debe incluir como mínimo: Objetivo de la clase, Guion para exponer, Preguntas útiles, Errores conceptuales a corregir, Transición a la actividad, Cierre, Preparación siguiente y Conceptos clave. Cuando Gamma aplica, incluir la Gamma canónica de referencia.

Después de crear/actualizar, hacer fetch real de Notion y pasar a `resolverClase` `options.notionLiveEvidence[sesion]` con `source: "NOTION_LIVE_CONNECTOR"`. Solo `LIVE_CANONICAL` permite declarar `paquetePreparado=true`. Una clase sin notas Notion verificadas está incompleta.


## Introducción a TI — ITI_WINDOWS_BASELINE_V1

Para **Introducción a las Tecnologías de Información**, antes de diseñar cualquier material futuro se debe leer `courses.introduccion-tecnologias-informacion.studentEnvironmentProfile`.

Regla inequívoca: **todo trabajo práctico nuevo debe poder resolverse de principio a fin en una sola computadora con Windows**. No asumir laboratorio especializado ni segundo sistema operativo. No exigir WSL, Linux/Ubuntu, máquinas virtuales, dual boot ni evidencia obtenida fuera de Windows. Otros sistemas operativos pueden aparecer únicamente como ejemplos conceptuales; nunca como entorno de ejecución requerido.

Las herramientas obligatorias deben funcionar en Windows. Cuando una herramienta externa sea opcional, debe existir alternativa compatible con Windows; preferir herramientas nativas cuando sean suficientes.

Los recursos históricos ya publicados se conservan sin retrocorrección: `historicalPublishedResourcesPolicy = LEAVE_AS_IS`. Esta excepción histórica **no** autoriza repetir ese diseño en materiales nuevos.

Checklist obligatorio antes de crear:
1. ¿Todo puede resolverse en Windows?
2. ¿Toda evidencia sale de Windows?
3. ¿No requiere segundo SO, WSL, VM ni dual boot?
4. Si aparecen otros SO, ¿son solo ejemplos conceptuales?
5. Si hay herramienta externa, ¿funciona en Windows y tiene alternativa compatible cuando es opcional?

Si cualquiera es NO, rediseñar antes de crear el recurso.
