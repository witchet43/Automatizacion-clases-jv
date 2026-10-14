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
