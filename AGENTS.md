# Arranque académico independiente del chat

Para solicitudes académicas no FAST_PATH, empezar por `config/academic-context.json` y el Bootstrap Académico enlazado en `documents.bootstrap.url`. Leer la guía de la operación y la planeación objetivo cuando su contrato lo requiera. No usar memoria conversacional para reconstruir IDs, endpoint, workflow, algoritmos o avance.

El único transporte remoto es el Web App vigente mediante `.academic-requests/` → workflow **Academic Web App** → Web App canónico → entrypoint declarado → postflight. El workflow carga el manifiesto y adjunta `operationalContext`. No crear rutas alternativas.

## Contención obligatoria ante fallos

Si una operación canónica falla, diagnosticar y reparar **la misma ruta canónica**. No crear workflows específicos por materia/unidad, generadores one-off, deployments de reemplazo, Execution API, `clasp run`, OAuth manual ni llamadas REST directas a Classroom/Forms para “salir del paso”. Un timeout o respuesta incierta exige recuperación idempotente contra el estado real antes de reintentar.

El contenido académico aprobado se trata como datos de entrada al entrypoint existente. Una reparación técnica nunca autoriza reescribir el algoritmo ni crear funciones como `crearExamenUnidadX...`.

`quizAsistencia` conserva FAST_PATH: únicamente `action` y `materia`, sin lecturas previas de documentos/planeación ni `operationalContext` externo.

La siguiente clase se elige con planeación, Gamma verificada y Classroom real. Calendar y fecha actual no seleccionan clase; DRAFT solo acredita preparación. No publicar CourseWork. Verificar IDs y postflight antes de dar por completada una operación.

Cambios de arquitectura: editar el manifiesto y el código canónico; ejecutar `node scripts/academic-context.mjs build`, `check` y `node scripts/test-architecture-boundaries.mjs`; correr regresiones; desplegar por **Deploy Apps Script**, que actualiza el mismo deployment y realiza un postflight sin crear recursos. Toda ruta nueva debe ser deliberada, quedar en el manifiesto y requerir actualización explícita de la regresión de fronteras.
