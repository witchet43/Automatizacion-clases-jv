/**
 * Extensiones E2E del flujo GitHub -> Classroom.
 * Este archivo se mantiene al final del proyecto para aplicar las reglas operativas
 * vigentes sin intervención manual en el flujo normal.
 */

function ghAsegurarEvaluaciones_(evaluationSheet, evaluationData, activityData, repoData) {
  var existentes = {};
  evaluationData.records.forEach(function(ev) {
    existentes[ghClean_(ev['Actividad GitHub ID']) + '|' + ghClean_(ev['Registro repositorio ID'])] = true;
  });

  var headers = evaluationData.headers;
  var creadas = 0;
  activityData.records.forEach(function(activity) {
    var estado = ghClean_(activity['Estado Classroom']).toUpperCase();
    if (estado !== 'PUBLICAR' && estado !== 'PUBLICADA') return;

    var activityId = ghClean_(activity['Actividad GitHub ID']);
    var courseId = ghClean_(activity['ID curso']);
    if (!activityId || !courseId) return;

    repoData.records.forEach(function(repo) {
      if (ghClean_(repo['ID curso']) !== courseId) return;
      var repoId = ghClean_(repo['Registro ID']);
      if (!repoId) return;
      var key = activityId + '|' + repoId;
      if (existentes[key]) return;

      evaluationSheet.insertRowBefore(2);
      var values = {
        'Evaluación ID': 'EVAL-' + activityId + '-' + repoId,
        'Actividad GitHub ID': activityId,
        'Registro repositorio ID': repoId,
        'ID curso': courseId,
        'Correo Classroom': ghClean_(repo['Correo Classroom']),
        'Repositorio': ghClean_(repo['Repositorio']),
        'Estado entrega': 'SIN_ENTREGA',
        'Estado calificación': 'PROVISIONAL',
        'Fecha evaluación': new Date(),
        'Error': '',
        'Observaciones': 'Registro creado automáticamente por el monitor GitHub.'
      };
      headers.forEach(function(h, i) {
        if (Object.prototype.hasOwnProperty.call(values, h)) {
          evaluationSheet.getRange(2, i + 1).setValue(values[h]);
        }
      });
      existentes[key] = true;
      creadas++;
    });
  });
  return creadas;
}

function ghPublicarActividadesAutorizadas_(activitySheet, activityData, report) {
  var publicadas = 0;
  activityData.records.forEach(function(activity) {
    if (ghClean_(activity['Estado Classroom']).toUpperCase() !== 'PUBLICAR') return;

    var courseId = ghClean_(activity['ID curso']);
    var workId = ghClean_(activity['ID Classroom']);
    if (!courseId || !workId) return;

    var headers = activityData.headers;
    var stateIndex = headers.indexOf('Estado Classroom');
    var idIndex = headers.indexOf('ID Classroom');
    var syncIndex = headers.indexOf('Última sincronización');
    var obsIndex = headers.indexOf('Observaciones');

    try {
      var work = Classroom.Courses.CourseWork.get(courseId, workId);
      var finalWork = work;

      if (work.state !== 'PUBLISHED') {
        try {
          finalWork = Classroom.Courses.CourseWork.patch(
            {state: 'PUBLISHED'},
            courseId,
            workId,
            {updateMask: 'state'}
          );
        } catch (patchError) {
          // Si el borrador fue creado por otro proyecto desarrollador, Classroom no
          // permite administrarlo. Se crea un reemplazo canónico publicado desde este
          // mismo proyecto y se actualizan los IDs operativos.
          var body = {
            title: work.title,
            description: work.description || '',
            workType: work.workType || 'ASSIGNMENT',
            state: 'PUBLISHED',
            maxPoints: work.maxPoints || Number(activity['Puntos']) || 100
          };
          if (work.topicId) body.topicId = work.topicId;
          if (work.materials) body.materials = work.materials;
          if (work.dueDate) body.dueDate = work.dueDate;
          if (work.dueTime) body.dueTime = work.dueTime;

          finalWork = Classroom.Courses.CourseWork.create(body, courseId);
          ghReemplazarIdClassroomEnTareas_(courseId, workId, finalWork.id);
          try { Classroom.Courses.CourseWork.delete(courseId, workId); } catch (ignoreDelete) {}
        }
      }

      if (idIndex >= 0 && String(finalWork.id) !== workId) {
        activitySheet.getRange(activity.__row, idIndex + 1).setValue(String(finalWork.id));
      }
      if (stateIndex >= 0) activitySheet.getRange(activity.__row, stateIndex + 1).setValue('PUBLICADA');
      if (syncIndex >= 0) activitySheet.getRange(activity.__row, syncIndex + 1).setValue(new Date());
      if (obsIndex >= 0) activitySheet.getRange(activity.__row, obsIndex + 1).setValue(
        'Publicación visible autorizada por el docente y aplicada automáticamente. CourseWork ID: ' + finalWork.id
      );
      publicadas++;
    } catch (err) {
      var message = String(err && err.message ? err.message : err);
      if (obsIndex >= 0) activitySheet.getRange(activity.__row, obsIndex + 1).setValue('ERROR PUBLICACIÓN: ' + message);
      if (report && report.errores) report.errores.push({actividad: ghClean_(activity['Actividad GitHub ID']), error: message});
    }
  });
  return publicadas;
}

function ghReemplazarIdClassroomEnTareas_(courseId, oldWorkId, newWorkId) {
  var ss = SpreadsheetApp.openById(GH_GRADE_SYNC.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Tareas');
  if (!sheet) return;
  var data = ghLeerTabla_(sheet);
  var idCursoIndex = data.headers.indexOf('ID curso');
  var idClassroomIndex = data.headers.indexOf('ID Classroom');
  var resultadoIndex = data.headers.indexOf('Resultado');
  var fechaIndex = data.headers.indexOf('Fecha procesamiento');

  data.records.forEach(function(row) {
    if (ghClean_(row['ID curso']) !== String(courseId)) return;
    if (ghClean_(row['ID Classroom']) !== String(oldWorkId)) return;
    if (idClassroomIndex >= 0) sheet.getRange(row.__row, idClassroomIndex + 1).setValue(String(newWorkId));
    if (resultadoIndex >= 0) sheet.getRange(row.__row, resultadoIndex + 1).setValue('Actividad publicada automáticamente en Classroom.');
    if (fechaIndex >= 0) sheet.getRange(row.__row, fechaIndex + 1).setValue(new Date());
  });
}
