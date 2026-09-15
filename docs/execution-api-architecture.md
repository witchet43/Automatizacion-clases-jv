# Arquitectura de ejecución remota

## Alcance

Este repositorio sincroniza el script `1jR91MDwOUlEdWaLQkuKLca5x1Qz1tqPncgc-PApPB-dFDLYAdD2y_4FE` y lo ejecuta con el API oficial de Apps Script. El proyecto estándar de Google Cloud es `473915513985`.

`clasp` sólo se usa para dos tareas de administración: subir el código y crear/actualizar el deployment. Ningún workflow productivo usa `clasp run`.

## Flujo

1. `deploy-apps-script.yml` valida el código y las políticas, ejecuta `clasp push --force` y crea o actualiza el deployment API executable.
2. `execute-apps-script.yml` canjea el refresh token por un access token de corta duración, sin imprimir ninguno de los dos.
3. `scripts/run-apps-script.mjs` llama a `POST https://script.googleapis.com/v1/scripts/{deploymentId}:run`.
4. El proceso falla si el intercambio OAuth o el endpoint responde HTTP no exitoso, si Apps Script devuelve `error`, si no devuelve `done: true`, o si falta `response.result`.
5. Una segunda ejecución llama a `verificarEjecucionRemota`. Esta consulta Classroom, Forms, Drive y la hoja de auditoría correspondientes. Sólo entonces el job termina con éxito.

## Entrypoints autorizados

- `crearQuiz`
- `crearPractica`
- `crearTarea`
- `crearActividad`
- `crearQuizSencillo`
- `repararQuizPruebaCorreoVerificado`
- operaciones de calificación y configuración enumeradas expresamente en el selector del workflow

Los cinco creadores ordinarios verifican que cualquier `CourseWork` real quede en estado `DRAFT`. Quiz/examen también exige un Form real, correo `VERIFIED`, límite de una respuesta, enlace presente en Classroom y fila de auditoría en Sheets. Práctica exige Google Doc real y `STUDENT_COPY`.

## Identidad OAuth persistente

GitHub Actions usa tres secretos:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

El cliente OAuth debe crearse dentro del proyecto Cloud `473915513985`, el mismo proyecto estándar al que está vinculado Apps Script. El consentimiento inicial debe solicitar exactamente los scopes declarados en `src/appsscript.json`: Sheets, Forms, `drive.file`, Calendar de sólo lectura, los permisos Classroom usados por el código, y los servicios propios de Apps Script (`external_request`, `scriptapp`, `send_mail`).

El refresh token permite renovar access tokens sin consentimiento en cada job. No es irrevocable ni tiene duración garantizada: el usuario o Google pueden revocarlo, puede quedar inválido por políticas/cambios de seguridad y, si la pantalla OAuth permanece en modo Testing para usuarios externos, Google puede imponer caducidad corta. Un fallo `invalid_grant` requiere consentimiento de nuevo y reemplazar sólo `GOOGLE_OAUTH_REFRESH_TOKEN`.

Nunca se deben guardar tokens en commits, artifacts o logs. `.clasprc.json` se conserva únicamente como secreto heredado para `clasp push/deploy`; no se usa para la Execution API.

## APIs que deben estar habilitadas en 473915513985

- Apps Script API
- Google Drive API
- Google Forms API
- Google Classroom API
- Google Sheets API
- Google Calendar API

Los servicios avanzados Drive, Classroom y Calendar también están declarados en `src/appsscript.json`.

## Puesta en marcha y prueba controlada

1. Desplegar `main` y copiar el deployment ID confirmado por el job a `.apps-script-deployment.json`.
2. Crear el cliente OAuth dentro de `473915513985` y completar una vez el consentimiento humano.
3. Guardar los tres secretos OAuth en GitHub Actions.
4. Ejecutar primero `diagnosticarInfraestructuraEjecucion`. Es de sólo lectura y comprueba el script, Sheets, Forms, Drive, Classroom y Calendar.
5. Ejecutar `verificarQuizPruebaCorreoVerificado`. Debe confirmar `TEST-QUIZ-20260914-SO-3Q-001`, Form `1kTGYxRqC6kka6mpCtUvrVKeMiYkYFToWLTPMK18uU7o`, `emailCollectionType=VERIFIED`, cero preguntas manuales de correo y tres reactivos.
6. Sólo si la verificación falla por el estado del Form, ejecutar `repararQuizPruebaCorreoVerificado` y volver a verificar.

No se utiliza monitor como mecanismo de ejecución de estas operaciones.
