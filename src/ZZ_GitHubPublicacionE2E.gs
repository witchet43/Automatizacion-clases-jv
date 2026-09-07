/**
 * Extensiones E2E del flujo GitHub -> Classroom.
 *
 * Política vigente de seguridad Classroom:
 * - Toda creación automática permanece en DRAFT.
 * - Ninguna autorización conversacional ni estado de Sheets puede provocar PUBLISHED.
 * - La publicación visible la realiza exclusivamente el docente de forma manual.
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
    if (estado !== 'PUBLICADA') return;

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

/**
 * Compatibilidad con el monitor existente.
 * Esta función queda deliberadamente como NO-OP para impedir cualquier publicación
 * automática en Classroom. Nunca llama CourseWork.patch(...PUBLISHED...) ni create
 * con state=PUBLISHED.
 */
function ghPublicarActividadesAutorizadas_(activitySheet, activityData, report) {
  if (!activityData || !activityData.records) return 0;

  activityData.records.forEach(function(activity) {
    var estado = ghClean_(activity['Estado Classroom']).toUpperCase();
    if (estado !== 'PUBLICAR') return;

    var headers = activityData.headers || [];
    var stateIndex = headers.indexOf('Estado Classroom');
    var syncIndex = headers.indexOf('Última sincronización');
    var obsIndex = headers.indexOf('Observaciones');

    // Corrige comandos heredados para que no puedan actuar como disparador de publicación.
    if (stateIndex >= 0) activitySheet.getRange(activity.__row, stateIndex + 1).setValue('BORRADOR');
    if (syncIndex >= 0) activitySheet.getRange(activity.__row, syncIndex + 1).setValue(new Date());
    if (obsIndex >= 0) activitySheet.getRange(activity.__row, obsIndex + 1).setValue(
      'Publicación automática deshabilitada por política vigente. El recurso permanece en DRAFT y debe publicarse manualmente por el docente.'
    );
  });

  return 0;
}

// Conservada solo por compatibilidad histórica. Ya no se usa para publicación.
function ghReemplazarIdClassroomEnTareas_(courseId, oldWorkId, newWorkId) {
  return false;
}
