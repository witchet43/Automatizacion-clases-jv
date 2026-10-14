# Arquitectura canónica — STATIC_WEB_APP_SERVICE

## Contrato

La Web App desplegada es un servicio de producción estático para todas las operaciones declaradas en `config/academic-context.json`. El contenido académico es dato, no código.

## Carril A — ACADEMIC_OPERATION

Ruta única:

`.academic-requests/<requestId>.json → Academic Web App → Web App canónico → dispatcher → entrypoint genérico → postflight`

El commit de una operación académica debe contener exactamente un JSON bajo `.academic-requests/` y ningún otro archivo. El workflow ejecuta `scripts/assert-academic-request-data-only.mjs` antes de cualquier acción.

Una operación académica jamás puede modificar fuente, workflows, manifest o deployment. Un examen nuevo se expresa como parámetros de `crearExamen`; una práctica como parámetros de `crearPractica`; una clase como recursos declarativos de `clase`.

## Fallos operacionales

Un error, timeout, 404/429/5xx, bloqueo de guardrail o resultado incierto **no cambia de carril** y no concede autorización de desarrollo.

La única recuperación válida es:

1. leer estado real;
2. localizar evidencia fuerte;
3. reutilizar el recurso canónico si existe;
4. bloquear conflicto/ambigüedad;
5. reintentar la misma operación por la misma Web App.

Si la causa exige modificar el motor, STOP. Informar el defecto y esperar autorización explícita del usuario.

## Carril B — PLATFORM_CHANGE

Solo se abre por autorización explícita del usuario en la conversación actual. El commit debe incluir exactamente una evidencia `.platform-changes/*.json` con:

- `mode: PLATFORM_CHANGE`;
- `authorized: true`;
- `requestedByUser: true`;
- texto literal de la autorización;
- motivo;
- lista exacta de archivos permitidos.

`scripts/assert-platform-change-authorized.mjs` compara el commit real contra ese alcance. No puede coexistir con `.academic-requests/**`.

**Deploy Apps Script se dispara únicamente por `.platform-changes/**`**, vuelve a ejecutar regresiones, hace `clasp push`, actualiza el mismo deployment canónico y ejecuta postflight. Crear deployments alternativos está prohibido.

## Work mode

Work mode no forma parte de esta arquitectura. GitHub, GitHub Actions, Apps Script y la Web App canónica son el plano de control y ejecución. Si alguna intervención manual fuera imprescindible, debe ser mínima y explícita.

## Garantía buscada

Una operación académica rutinaria debe producir cero cambios de código y cero deployments. Muchos recursos académicos con cero deployments es el comportamiento correcto, no una omisión.
