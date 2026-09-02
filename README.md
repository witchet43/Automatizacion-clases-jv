# Automatización de clases JV

Repositorio fuente del proyecto Google Apps Script **Pipeline Quizzes - Forms - Classroom**.

## Proyecto Apps Script vinculado

- Script ID: `1jR91MDwOUlEdWaLQkuKLca5x1Qz1tqPncgc-PApPB-dFDLYAdD2y_4FE`
- El vínculo está definido en `.clasp.json`.
- El código sincronizado vive en `src/`.
- GitHub es la fuente de verdad; Apps Script es el entorno de ejecución.

## Primera configuración en una computadora

Requisitos: Node.js 22+ y acceso de Google a la cuenta propietaria/editora del Apps Script.

```bash
npm install
npm run clasp:login
npm run clasp:status
npm run clasp:open
```

`clasp:open` debe abrir **Pipeline Quizzes - Forms - Classroom**. Antes del primer despliegue no ejecutes `clasp pull`, porque reemplazaría el contenido local por el proyecto remoto actual.

## Desplegar GitHub/local hacia Apps Script

```bash
git pull
npm install
npm run clasp:status
npm run clasp:push
```

Después del `push`, abre Apps Script y ejecuta primero:

```javascript
validarSoporteTiposQuiz()
```

El monitor ya instalado seguirá invocando `procesarQuizzesAprobados()`; no es necesario reinstalarlo solo por actualizar código.

## Flujo canónico de exámenes

1. Registrar el examen y sus preguntas en las hojas `Quizzes` y `Preguntas Quiz`.
2. Marcarlo como `APROBADA`. El pipeline crea el Google Form y la actividad de
   Classroom enlazada y administrable por este proyecto.
3. Publicar la actividad cuando corresponda y esperar las entregas.
4. Cuando el docente solicite importar notas, ejecutar en Apps Script:

```javascript
importarCalificacionesAhora()
```

La función procesa los quizzes en estado `CREADA`, empata exclusivamente por
correo exacto, conserva cualquier calificación existente, exige entregas
`TURNED_IN` y escribe solo `draftGrade`. No devuelve trabajos ni publica notas.

## Recuperar un cambio manual hecho en Apps Script

Solo cuando conscientemente quieras traer cambios remotos al repositorio:

```bash
npm run clasp:pull
```

Después revisa el diff antes de hacer commit.

## Estructura

- `src/01_PipelineQuizzes.gs`: creación Sheets → Forms → Classroom y soporte de tipos de pregunta.
- `src/02_ValidacionYUtilidades.gs`: validaciones, correo verificado y utilidades comunes.
- `src/03_Actividad13YApi.gs`: herramientas heredadas de Actividad 13/13.1.
- `src/04_MonitorCalificaciones.gs`: monitor de calificaciones de quizzes.
- `src/GitHubCalificaciones.gs`: integración GitHub Actions → Classroom.
- `src/EvaluacionIA.gs`: evaluación de respuestas abiertas con IA.
- `src/appsscript.json`: manifiesto y scopes.

## Tipos de pregunta del pipeline

El generador soporta:

- opción múltiple;
- lista;
- casillas con varias respuestas correctas (`A,B`, `A,C,D`, etc.);
- respuesta corta con respuesta principal y variantes aceptadas.

La función `validarSoporteTiposQuiz()` revisa los registros antes de crear Forms.

## Seguridad

No subir tokens, claves API ni `.clasprc.json`. `GITHUB_TOKEN`, `OPENAI_API_KEY` y `GEMINI_API_KEY` deben permanecer en **Script Properties** de Apps Script.
