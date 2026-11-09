# Reconciliación Classroom ↔ planeación ↔ Google Docs

## Alcance
El libro canónico de planeación contiene la pestaña **Planeación maestra** (sesiones,
subtemas, fechas y vínculos a documentos) y la pestaña
**Inventario de actividades** (registro longitudinal por ID).
No se insertan sesiones ficticias: una actividad manual puede pertenecer a una
sesión existente; si la relación es ambigua queda `SESION_POR_ASIGNAR`.
La numeración curricular de Gamma (p. ej. `2.12`) es distinta del consecutivo
global de materiales `Actividad NN`.

## Autoridades y garantías
- Classroom es autoridad para CourseWork ID, estado, entrega, calificaciones y
  números de **actividades ya existentes**; nunca se reemplazan o eliminan.
- Drive es autoridad para documento Google original y su ID. Reutilizar el
  documento adjunto al trabajo, después un documento de nombre exacto inequívoco.
  Nunca escoger entre dos documentos de igual nombre sin verificar su ID.
- La planeación es autoridad para sesiones, fechas, unidad, subtema y actividad
  prevista. Registrar nuevas actividades en **Inventario de actividades**, con
  clave estable `CW:<courseWorkId>` o `DOC:<documentId>`.
- Los documentos planeados todavía no publicados se renombran cuando su
  número colisiona con una actividad Classroom, conservando ID y URL. El título
  del archivo y encabezado interno deben coincidir con el número asignado.
- No modificar un trabajo PUBLISHED ni las copias individuales de estudiantes.
  Las tareas y documentos nuevos deben cumplir DRAFT/STUDENT_COPY cuando se
  incorporen a Classroom mediante los entrypoints canónicos.
- Nunca usar la fecha actual o un contador en PropertiesService para secuenciar
  una sesión. No borrar recibos HMAC/IDEMPOTENCY ni cambiar requestId después
  de un resultado incierto.

## Operación rutinaria desde el Gateway
1. Ejecutar `crear_recurso(operation="clase",params:{mode:"RECONCILE_PLAN"})`
   antes de `PLAN`/Gamma. Solo consulta inventario y Classroom;
   responde `missingClassroomActivities`, `numberingChanges`,
   `duplicateNumbers`, `catalogExists` y `nextPhase`.
2. Para actividades faltantes, verificar documento adjunto o Google Doc
   existente. En caso de varios archivos con título idéntico, verificar cuál es
   el original. Aportar opcionalmente `documentMap` con ID exacto; si hay
   sesión curricular inequívoca, aportarla en `sessionMap`.
3. Ejecutar `mode:"RECONCILE_APPLY"`, `maxMutations` entre 1 y 8 (4 por
   defecto). Solo registra actividades ausentes y renumera documentos
   planeados en lotes. No crea otra actividad Classroom.
   Si el curso carece de inventario, inicia la pestaña desde los documentos
   que ya están en la planeación.
4. Revisar el resultado; repetir lotes únicamente tras confirmación inequívoca
   de éxito y con requestId distinto por lote nuevo. Si falla una escritura
   de resultado incierto, consultar Workspace y recibos antes de intentar
   recuperar. No usar un requestId nuevo para repetir ciegamente el mismo lote.
5. Volver a `RECONCILE_PLAN` hasta obtener `complete:true`,
   `numberingChanges:[]` y `missingClassroomActivities:[]`.
   No detener Gamma/Notion por una actividad ambigua: informar su referencia
   y la acción aislada pendiente.

## Ejemplo real: Sistemas Operativos
Se conservaron las actividades manuales PUBLISHED 10–13 con sus IDs Classroom
y sus Google Docs originales; se registraron en el mismo libro de planeación,
asociando FCFS/SJF a la clase 15 y Round Robin/prioridades a la 16.
Los documentos planeados originalmente 10–29 pasaron a 14–33 por cambio
de título y encabezado, **sin cambiar sus IDs**.
La actividad sobre grafos de deadlock en la clase 20 pasó a
`Actividad 14 - Grafo de asignación de recursos y deadlock`.
El título Gamma de esa sesión sigue siendo
`2.12 - Interbloqueos: condiciones necesarias`.

## Seguridad y verificación
Revisar los dos libros reales de estado: `diagnosticar_clase` en el curso,
y las pestañas de la hoja canónica. Los IDs de CourseWork y Drive deben
permanecer idénticos. No cambiar notas, estados o entregas. Un cambio de
esquema o ruta del Gateway requiere `PLATFORM_CHANGE`, CI y despliegue sobre
la WebApp existente, con HMAC firmado verificado al final.
