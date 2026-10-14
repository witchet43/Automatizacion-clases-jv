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


## Autoridad LIVE de Gamma

La planeación no certifica Gamma. Sus campos URL/ID/estado son referencias para localizar candidatos.

Para decidir reutilización o creación, el orquestador debe consultar Gamma real. La evidencia se entrega a `resolverClase` en `options.gammaLiveEvidence[sesion]` y debe declarar `source: GAMMA_LIVE_CONNECTOR`.

Estados permitidos: `LIVE_ACTIVE_CANONICAL`, `LIVE_ACTIVE_NON_CANONICAL`, `LIVE_ARCHIVED`, `LIVE_NOT_FOUND`, `LIVE_INACCESSIBLE`.

Solo `LIVE_ACTIVE_CANONICAL` con búsqueda realizada, contenido leído/verificado y tema canónico confirmado acredita Gamma preparada. `LIVE_ARCHIVED` y `LIVE_NOT_FOUND` permiten `CREATE` únicamente si la búsqueda LIVE no encontró un equivalente activo. La respuesta `REUSE_ACTIVE_EQUIVALENT` prohíbe regenerar.

Después de cualquier generación Gamma, el estado `completed` de la herramienta no basta: debe ejecutarse lectura/verificación real antes de registrar o declarar preparado el paquete.


## Componente Notion del paquete de clase

Notion no sustituye la Web App para materialización Google. Es el repositorio canónico de notas docentes y se usa mediante el conector Notion declarado en el manifest.

Una creación de clase completa sigue:
1. Web App materializa/verifica recursos Google.
2. Gamma se busca, genera/reutiliza y verifica LIVE.
3. El orquestador usa el conector Notion para buscar/reutilizar/crear la nota bajo la página de la materia.
4. Se hace fetch de la nota.
5. La evidencia `NOTION_LIVE_CONNECTOR` se entrega a `resolverClase`.
6. Solo Gamma LIVE + Notion LIVE + recurso Classroom real permiten `paquetePreparado=true`.

Las notas son idempotentes por `materia + tema/subtema canónico + parentPageId`. Un duplicado bloquea el cierre del paquete.
