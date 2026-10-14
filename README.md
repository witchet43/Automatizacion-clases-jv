# Automatización académica JV

Repositorio fuente del sistema académico Google Apps Script para Classroom, Forms y Drive. **GitHub es la fuente técnica de verdad; el manifiesto `config/academic-context.json` define la ruta operativa.**

## Arquitectura canónica

Para toda operación académica registrada:

`.academic-requests/` → **Academic Web App** → Web App canónico → entrypoint declarado → postflight real.

La única excepción de arranque es `quizAsistencia`, que conserva su FAST_PATH pero sigue ejecutándose por el mismo Web App.

No existen transportes alternativos de producción. Están prohibidos como mecanismos de recuperación o atajo:

- Apps Script Execution API;
- `clasp run`;
- llamadas REST directas a Classroom o Forms desde GitHub Actions;
- deployments Web App de reemplazo;
- workflows específicos por materia, examen o incidente;
- funciones generadoras one-off como `crearExamenUnidad2...`.

Si el Web App falla, se recupera el estado real, se corrige la ruta canónica y se reintenta idempotentemente. No se reconstruye el algoritmo.

## Proyecto Apps Script

- Script ID: `1jR91MDwOUlEdWaLQkuKLca5x1Qz1tqPncgc-PApPB-dFDLYAdD2y_4FE`
- Configuración local: `.clasp.json`
- Código Apps Script: `src/`
- Proyecto Google Cloud: `473915513985`

`clasp` se usa únicamente para administración del código/despliegue canónico: `push`, habilitación de servicios requeridos y actualización del deployment existente. No se usa como transporte de operaciones académicas.

## Desarrollo y despliegue

```bash
npm install
node scripts/academic-context.mjs check
node scripts/test-architecture-boundaries.mjs
node scripts/test-operation-contracts.mjs
```

El workflow **Validate Minimal Academic Operations** ejecuta sintaxis y regresiones. **Deploy Apps Script** vuelve a ejecutar controles, hace `clasp push --force`, actualiza el deployment Web App canónico y verifica el endpoint sin crear recursos.

## Exámenes

El flujo separa diseño y materialización:

1. Identificar cobertura real y diseñar el instrumento.
2. Revisar/aprobar y congelar reactivos, opciones, claves y puntajes.
3. Enviar el contenido aprobado como parámetros de `action=examen`.
4. El Web App delega exclusivamente a `crearExamen(params)`.
5. Verificar `quizId`, `formId`, `workId`, Form no publicado y CourseWork DRAFT.

Una falla técnica en los pasos 3–5 no autoriza generar otro examen ni implementar otro creador.

## Invariantes principales

- CourseWork ordinario automático: **DRAFT**.
- Forms académicos: **no publicados**.
- Calificación automática: solo `draftGrade`; no devolución/publicación automática.
- Importación Forms → Classroom no requiere `TURNED_IN` cuando existe identidad exacta y puntaje completo.
- Google Docs académicos que corresponda entregar: copia editable por alumno.
- La secuencia de clase proviene de planeación + Classroom real + Gamma verificada, nunca de la fecha actual.

## Estructura relevante

- `config/academic-context.json`: manifiesto y operaciones.
- `src/00_ContratoArquitectura.gs`: contrato ejecutable.
- `src/00_PoliticasCanonicas.gs`: políticas deterministas.
- `src/22_EntrypointsRecursosSeguros.gs`: entrypoints de recursos.
- `src/65_QuizAsistenciaWebApp.gs`: dispatcher HTTP canónico.
- `scripts/test-architecture-boundaries.mjs`: bloqueo de rutas paralelas.
- `.github/workflows/academic-webapp.yml`: ejecución de solicitudes.
- `.github/workflows/deploy-apps-script.yml`: despliegue.
- `.github/workflows/validate-minimal-academic-operations.yml`: validación.
- `docs/academic-webapp-architecture.md`: arquitectura operativa.

## Seguridad

No subir secretos, tokens ni `.clasprc.json`. Las credenciales de despliegue permanecen en GitHub Secrets y las claves de servicios usadas por Apps Script en mecanismos privados apropiados.
