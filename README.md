**Protección de acceso a la Web App:** el despliegue ejecuta como propietario; las operaciones de escritura directa requieren una credencial en `credential` que coincida con la propiedad privada de Apps Script `ACADEMIC_DIRECT_WEBAPP_SECRET`. La credencial no se almacena en GitHub, documentos ni conversación. Falta configurar esta propiedad y conectar el cliente ChatGPT antes de desplegar. Esto no añade comprobaciones académicas por pregunta.

## RUTA DIRECTA PROPUESTA (2026-10-19)

`ChatGPT con POST conectado → Web App doPost → action + courseId + params → generador canónico → Forms y Classroom DRAFT`. GitHub se usa solamente para modificar y desplegar código. Las referencias inferiores a `.academic-requests` son legado; no sustituir la falta de conexión POST por GitHub. Este cambio no instala automáticamente el conector ni demuestra ejecución real.

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


## Verificación LIVE de Gamma

La planeación ya no es autoridad sobre la existencia o vigencia de una Gamma. `GENERADA Y VERIFICADA` se trata como referencia histórica.

`resolverClase` acepta `options.gammaLiveEvidence` por sesión. Solo `LIVE_ACTIVE_CANONICAL`, obtenido del conector Gamma tras búsqueda real y lectura de contenido, puede establecer `gammaVerificada=true`. Una Gamma archivada o no encontrada devuelve decisión `CREATE` únicamente cuando la búsqueda LIVE confirmó que no existe un equivalente activo. Esto evita tanto falsos “completado” como regeneraciones que consumen créditos.


## Notas de clase en Notion

Las notas docentes son componente obligatorio del paquete de clase. El orden canónico es:

`Google resources → Gamma LIVE canónica → Notion notes LIVE → resolverClase postflight`

La raíz Notion y cada página padre por materia están registradas en el manifest. Cada nota usa como título exacto el tema/subtema canónico. Se busca antes de crear, se bloquean duplicados y se hace fetch posterior para validar contenido, parent, título y referencia a Gamma cuando aplica.

`resolverClase` acepta `options.notionLiveEvidence[sesion]`. Sin evidencia `LIVE_CANONICAL`, la clase no puede marcarse preparada.


## Baseline de entorno — Introducción a TI

El curso **Introducción a las Tecnologías de Información** usa el perfil `ITI_WINDOWS_BASELINE_V1`.

Para materiales futuros, el único entorno práctico asumido es **una computadora con Windows**. No se diseña trabajo que requiera Linux/Ubuntu, WSL, máquinas virtuales, dual boot, un segundo sistema operativo o un laboratorio multi-OS. Otros sistemas operativos pueden utilizarse únicamente como ejemplos conceptuales.

Toda evidencia exigida al alumno debe poder generarse en Windows y toda herramienta obligatoria debe funcionar en Windows. Los recursos históricos ya publicados permanecen sin cambios (`LEAVE_AS_IS`); esa excepción no se hereda a contenido nuevo.

La definición ejecutable está en `config/academic-context.json → courses.introduccion-tecnologias-informacion.studentEnvironmentProfile`.


La política de entorno de Introducción a TI se valida en CI como parte del contrato estático antes de cualquier deployment autorizado.
