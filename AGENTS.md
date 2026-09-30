# Arranque académico independiente del chat

Para solicitudes académicas no FAST_PATH, empezar por `config/academic-context.json` y el Bootstrap Académico enlazado en `documents.bootstrap.url`. Leer la guía de la operación y la planeación objetivo cuando su contrato lo requiera. No usar memoria conversacional para reconstruir IDs, endpoint, workflow, algoritmos o avance.

El único transporte remoto es el Web App vigente mediante `.academic-requests/` → workflow **Academic Web App**. Ese workflow carga el manifiesto y adjunta `operationalContext`; no inventar ni copiar un contexto de una conversación anterior. No crear rutas alternativas. Si falta contexto o hay desajuste, corregir la configuración canónica y volver a probar/desplegar.

`quizAsistencia` conserva FAST_PATH: únicamente `action` y `materia`, sin lecturas previas de documentos/planeación ni `operationalContext` externo.

La siguiente clase se elige con planeación, Gamma verificada y Classroom real. Calendar y fecha actual no seleccionan clase; DRAFT solo acredita preparación. No publicar CourseWork. Verificar IDs y postflight antes de dar por completada una clase.

Cambios: editar el manifiesto; ejecutar `node scripts/academic-context.mjs build` y `check`; correr `scripts/test-*.mjs`; desplegar por **Deploy Apps Script**, que actualiza el mismo deployment y realiza un postflight sin crear recursos. No mezclar cambios de despliegue y solicitudes académicas en un mismo commit.
