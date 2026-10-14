# Automatización académica JV

## Modelo operativo definitivo: STATIC_WEB_APP_SERVICE

La Web App académica es un **servicio estable ya desplegado**. Crear contenido académico nuevo no es desarrollo de software.

### Operación académica

`.academic-requests/*.json → Academic Web App → Web App canónico → entrypoint genérico → postflight`

Clases, tareas, actividades, prácticas, quizzes, exámenes, materiales y Quiz de Asistencia son **datos de entrada**. Una operación académica:

- no modifica `src/**`;
- no modifica `config/**`;
- no modifica workflows;
- no modifica el manifest;
- no ejecuta `clasp push`;
- no actualiza ni crea deployments;
- no crea funciones específicas por materia/unidad;
- no usa Execution API, APIs directas ni rutas alternativas;
- no usa Work mode.

Un fallo operacional no autoriza cambiar código. La recuperación usa la misma Web App e idempotencia. Si el motor realmente necesita una modificación, la operación se detiene y se requiere autorización explícita del usuario para un cambio de plataforma.

### Cambio de plataforma

Un cambio de comportamiento/funcionalidad usa un carril separado. Requiere:

1. autorización explícita del usuario en la conversación actual;
2. exactamente una evidencia `.platform-changes/*.json` con el texto de autorización y el alcance exacto;
3. CI/regresiones verdes;
4. actualización automática del **mismo deployment canónico**;
5. postflight read-only.

**Deploy Apps Script solo se dispara por `.platform-changes/**`.** Un cambio en `src/**` sin evidencia puede fallar validación, pero no puede desplegarse por sí mismo.

No se permite mezclar una solicitud académica con un cambio de plataforma en el mismo commit.

## Endpoint canónico

`https://script.google.com/macros/s/AKfycbz2rCuB9jUsbnt0tj0RgHmr3lguOZjVL34a_2F_yhggiwLNTOEn8QdsdbFv4SK6aGxr/exec`

## Componentes

- `config/academic-context.json`: manifiesto ejecutable y contrato data-only.
- `.academic-requests/`: mensajes de operación académica.
- `.platform-changes/`: evidencia de autorización para cambios de plataforma.
- `scripts/assert-academic-request-data-only.mjs`: impide mezclar contenido y código.
- `scripts/assert-platform-change-authorized.mjs`: impide deployment sin autorización explícita.
- `scripts/test-static-webapp-contract.mjs`: protege el modelo estático.
- `src/00_ContratoArquitectura.gs`: contrato ejecutable.
- `.github/workflows/academic-webapp.yml`: ejecución académica.
- `.github/workflows/deploy-apps-script.yml`: deployment exclusivamente de cambios de plataforma autorizados.
- `.github/workflows/validate-minimal-academic-operations.yml`: regresiones.

## Invariantes académicos

CourseWork ordinario: DRAFT. Forms: no publicados. Google Docs entregables: STUDENT_COPY. La secuencia de clase proviene de planeación + Classroom real + Gamma verificada, nunca de la fecha actual o Calendar.

**La señal de salud esperada es poder crear decenas de recursos académicos con cero modificaciones de código y cero deployments.**
