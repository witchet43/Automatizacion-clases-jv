# Arquitectura canónica del Academic Web App

## Regla central

`config/academic-context.json` es el manifiesto ejecutable. Cada operación resuelve primero `operationKey` y usa exclusivamente `manifest.operations[operationKey].executionRoute`.

La ruta vigente es:

`.academic-requests/` → workflow **Academic Web App** → Web App canónico → dispatcher → entrypoint declarado → postflight.

`quizAsistencia` usa `FAST_PATH_WEB_APP`; todas las demás operaciones registradas usan `ACADEMIC_WEB_APP`.

## Responsabilidades

- **IA/cliente:** intención y parámetros mínimos.
- **Manifiesto:** curso, operación, ruta, documentos y configuración estable.
- **Web App:** validación de contexto y despacho.
- **Entrypoints:** algoritmos de creación/reconciliación.
- **Postflight:** comprobación de IDs, enlaces, estados e invariantes en los sistemas reales.
- **Deploy Apps Script:** despliegue del mismo Web App; no ejecuta operaciones académicas.

## Recuperación

Un timeout, error HTTP o pérdida de respuesta después de enviar una mutación produce un **resultado incierto**. Antes de reintentar:

1. consultar el sistema destino real;
2. incluir DRAFT y PUBLISHED cuando corresponda;
3. localizar por evidencia fuerte (courseId, título, topicId y documentId/formId);
4. reutilizar una coincidencia canónica;
5. bloquear ante conflicto o múltiples coincidencias;
6. reintentar únicamente la misma operación por el Web App.

Nunca se crea un segundo transporte para recuperar una operación.

## Rutas explícitamente prohibidas

No son mecanismos operativos ni de contingencia:

- Apps Script Execution API;
- `clasp run`;
- REST directo a Classroom/Forms desde workflows;
- canje OAuth manual en workflows académicos;
- deployment Web App alternativo/replacement;
- workflow específico por curso, examen o incidente;
- generador Apps Script específico por materia/unidad.

La regresión `scripts/test-architecture-boundaries.mjs` bloquea estas desviaciones.

## Cambios de arquitectura

Una ruta nueva solo puede existir mediante un cambio intencional que:

1. modifique el manifiesto;
2. modifique el contrato/política ejecutable;
3. añada o ajuste regresiones;
4. pase validación de sintaxis y pruebas;
5. despliegue el Web App;
6. verifique el deployment.

La documentación por sí sola no cambia el comportamiento.
