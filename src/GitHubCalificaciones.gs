/**
 * GitHub Actions -> Sheets -> Google Classroom.
 *
 * Seguridad:
 * - Solo escribe draftGrade.
 * - Nunca publica assignedGrade ni devuelve entregas.
 * - Solo procesa actividades con ID de Classroom explícito.
 * - Requiere que la actividad esté asociada con este proyecto desarrollador.
 * - El token de GitHub se lee exclusivamente de Script Properties: GITHUB_TOKEN.
 *
 * Automatización E2E:
 * - Crea idempotentemente registros en Evaluaciones GitHub para cada actividad/repositorio.
 * - Publica CourseWork solo cuando Estado Classroom = PUBLICAR, lo que representa autorización docente explícita.
 */
const GH_GRADE_SYNC = Object.freeze({
  SPREADSHEET_ID: '1YLSPcDSpqvaAk7lLeL6O3CTcgeqdrBtmxCgmdF6ISeA',
  REPOSITORIES_SHEET: 'Repositorios alumnos',
  ACTIVITIES_SHEET: 'Actividades GitHub',
  EVALUATIONS_SHEET: 'Evaluaciones GitHub',
  TOKEN_PROPERTY: 'GITHUB_TOKEN',
  API: 'https://api.github.com',
  USER_AGENT: 'Classroom-GitHub-Grader-UAQ',
  HANDLER: 'monitorearCalificacionesGitHubCadaMinuto'
});

function instalarMonitorCalificacionesGitHub() {
  validarConfiguracionGitHub_();
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === GH_GRADE_SYNC.HANDLER; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(GH_GRADE_SYNC.HANDLER).timeBased().everyMinutes(1).create();
  return auditarMonitorCalificacionesGitHub();
}

function desinstalarMonitorCalificacionesGitHub() {
  var eliminados = 0;
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === GH_GRADE_SYNC.HANDLER; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); eliminados++; });
  return {eliminados: eliminados};
}

function autorizarMonitorCalificacionesGitHub() {
  var ss = SpreadsheetApp.openById(GH_GRADE_SYNC.SPREADSHEET_ID);
  ss.getSheetByName(GH_GRADE_SYNC.EVALUATIONS_SHEET).getRange('A1').getDisplayValue();
  Classroom.Courses.list({pageSize: 1});
  validarConfiguracionGitHub_();
  return {autorizado: true, monitorInstalado: existeTriggerGitHub_()};
}

function auditarMonitorCalificacionesGitHub() {
  return ejecutarMonitorCalificacionesGitHub_(false);
}

function monitorearCalificacionesGitHubCadaMinuto() {
  return ejecutarMonitorCalificacionesGitHub_(true);
}

function ejecutarMonitorCalificacionesGitHub_(aplicar) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {omitido: true, motivo: 'Ya existe una ejecución en curso.'};

  try {
    validarConfiguracionGitHub_();

    var ss = SpreadsheetApp.openById(GH_GRADE_SYNC.SPREADSHEET_ID);
    var repoSheet = ghHoja_(ss, GH_GRADE_SYNC.REPOSITORIES_SHEET);
    var repoData = ghLeerTabla_(repoSheet);
    var activitySheet = ghHoja_(ss, GH_GRADE_SYNC.ACTIVITIES_SHEET);
    var activityData = ghLeerTabla_(activitySheet);
    var evaluationSheet = ghHoja_(ss, GH_GRADE_SYNC.EVALUATIONS_SHEET);
    var evaluationData = ghLeerTabla_(evaluationSheet);

    var report = {
      aplicar: aplicar,
      evaluacionesCreadas: 0,
      actividadesPublicadas: 0,
      evaluacionesRevisadas: 0,
      resultadosGitHubActualizados: 0,
      entregasDetectadas: 0,
      borradoresDeNotaEscritos: 0,
      yaCalificadas: 0,
      pendientes: 0,
      errores: []
    };

    if (aplicar) {
      report.evaluacionesCreadas = ghAsegurarEvaluaciones_(evaluationSheet, evaluationData, activityData, repoData);
      report.actividadesPublicadas = ghPublicarActividadesAutorizadas_(activitySheet, activityData, report);
      evaluationData = ghLeerTabla_(evaluationSheet);
      activityData = ghLeerTabla_(activitySheet);
    }

    var reposById = {};
    repoData.records.forEach(function(r) {
      reposById[ghClean_(r['Registro ID'])] = r;
    });

    var activitiesById = {};
    activityData.records.forEach(function(r) {
      activitiesById[ghClean_(r['Actividad GitHub ID'])] = r;
    });

    var submissionsCache = {};
    var studentsCache = {};

    evaluationData.records.forEach(function(ev) {
      report.evaluacionesRevisadas++;

      var activityId = ghClean_(ev['Actividad GitHub ID']);
      var repoId = ghClean_(ev['Registro repositorio ID']);
      var activity = activitiesById[activityId];
      var repo = reposById[repoId];

      if (!activity || !repo) {
        report.errores.push({evaluacion: ev['Evaluación ID'], error: 'No existe la actividad o el repositorio asociado.'});
        return;
      }

      var courseId = ghClean_(activity['ID curso']);
      var workId = ghClean_(activity['ID Classroom']);
      var organization = ghClean_(repo['Organización GitHub']);
      var repository = ghClean_(repo['Repositorio']);
      var branch = ghClean_(activity['Rama']) || 'main';
      var maxPoints = Number(activity['Puntos']) || 100;
      var expectedTests = Number(ev['Pruebas totales']) || 0;
      var evaluationRow = ev.__row;

      if (!courseId || !workId) {
        report.pendientes++;
        if (aplicar) ghActualizarEvaluacion_(evaluationSheet, evaluationData.headers, evaluationRow, {
          'Estado calificación': 'PENDIENTE_ID_CLASSROOM',
          'Error': '',
          'Observaciones': 'La actividad aún no tiene ID de Classroom. El monitor no escribirá calificaciones.'
        });
        return;
      }

      try {
        var result = ghObtenerResultado_(organization, repository, branch, expectedTests, maxPoints);
        if (!result) {
          report.pendientes++;
          if (aplicar) ghActualizarEvaluacion_(evaluationSheet, evaluationData.headers, evaluationRow, {
            'Estado calificación': 'PENDIENTE_GITHUB',
            'Error': '',
            'Observaciones': 'No existe una ejecución terminada de GitHub Actions para la rama configurada.'
          });
          return;
        }

        report.resultadosGitHubActualizados++;
        var resultValues = {
          'Commit SHA': result.sha,
          'Fecha commit': result.updatedAt,
          'URL ejecución': result.url,
          'Compilación': result.compilation,
          'Pruebas aprobadas': result.testsPassed,
          'Pruebas totales': result.testsTotal,
          'Puntaje provisional': result.score,
          'Fecha evaluación': new Date(),
          'Error': result.error || '',
          'Observaciones': result.observation
        };

        var cacheKey = courseId + '|' + workId;
        if (!submissionsCache[cacheKey]) {
          submissionsCache[cacheKey] = ghListarEntregas_(courseId, workId);
        }
        if (!studentsCache[courseId]) {
          studentsCache[courseId] = ghMapaAlumnos_(courseId);
        }

        var email = ghClean_(ev['Correo Classroom']).toLowerCase();
        var studentId = studentsCache[courseId][email];
        var submission = studentId ? submissionsCache[cacheKey][studentId] : null;

        if (!studentId) {
          resultValues['Estado calificación'] = 'SIN_ALUMNO_CLASSROOM';
          resultValues['Error'] = 'No se encontró el correo en la lista de alumnos del curso.';
          report.errores.push({evaluacion: ev['Evaluación ID'], error: resultValues['Error']});
        } else if (!submission || submission.state !== 'TURNED_IN') {
          resultValues['Estado entrega'] = submission ? submission.state : 'SIN_ENTREGA';
          resultValues['Estado calificación'] = 'PROVISIONAL';
          report.pendientes++;
        } else {
          report.entregasDetectadas++;
          resultValues['Estado entrega'] = 'TURNED_IN';

          if (submission.draftGrade !== undefined && submission.draftGrade !== null) {
            resultValues['Estado calificación'] = 'YA_CALIFICADA';
            report.yaCalificadas++;
          } else if (submission.associatedWithDeveloper === false) {
            resultValues['Estado calificación'] = 'NO_ADMINISTRABLE';
            resultValues['Error'] = 'La actividad no está asociada con el proyecto desarrollador que ejecuta el monitor.';
            report.errores.push({evaluacion: ev['Evaluación ID'], error: resultValues['Error']});
          } else if (!result.completed) {
            resultValues['Estado calificación'] = 'PENDIENTE_GITHUB';
            report.pendientes++;
          } else {
            resultValues['Estado calificación'] = aplicar ? 'DRAFT_GRADE_ESCRITA' : 'LISTA_PARA_CALIFICAR';
            if (aplicar) {
              Classroom.Courses.CourseWork.StudentSubmissions.patch(
                {draftGrade: result.score},
                courseId,
                workId,
                submission.id,
                {updateMask: 'draftGrade'}
              );
              report.borradoresDeNotaEscritos++;
            }
          }
        }

        if (aplicar) ghActualizarEvaluacion_(evaluationSheet, evaluationData.headers, evaluationRow, resultValues);
      } catch (err) {
        var message = String(err && err.message ? err.message : err);
        report.errores.push({evaluacion: ev['Evaluación ID'], error: message});
        if (aplicar) ghActualizarEvaluacion_(evaluationSheet, evaluationData.headers, evaluationRow, {
          'Estado calificación': 'ERROR',
          'Fecha evaluación': new Date(),
          'Error': message
        });
      }
    });

    return report;
  } finally {
    lock.releaseLock();
  }
}

function ghAsegurarEvaluaciones_(evaluationSheet, evaluationData, activityData, repoData) {
  var existentes = {};
  evaluationData.records.forEach(function(ev) {
    existentes[ghClean_(ev['Actividad GitHub ID']) + '|' + ghClean_(ev['Registro repositorio ID'])] = true;
  });

  var headers = evaluationData.headers;
  var creadas = 0;
  activityData.records.forEach(function(activity) {
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

    try {
      var work = Classroom.Courses.CourseWork.get(courseId, workId);
      if (work.state !== 'PUBLISHED') {
        Classroom.Courses.CourseWork.patch(
          {state: 'PUBLISHED'},
          courseId,
          workId,
          {updateMask: 'state'}
        );
      }
      var headers = activityData.headers;
      var stateIndex = headers.indexOf('Estado Classroom');
      var syncIndex = headers.indexOf('Última sincronización');
      var obsIndex = headers.indexOf('Observaciones');
      if (stateIndex >= 0) activitySheet.getRange(activity.__row, stateIndex + 1).setValue('PUBLICADA');
      if (syncIndex >= 0) activitySheet.getRange(activity.__row, syncIndex + 1).setValue(new Date());
      if (obsIndex >= 0) activitySheet.getRange(activity.__row, obsIndex + 1).setValue('Publicación visible autorizada por el docente y aplicada automáticamente por el monitor.');
      publicadas++;
    } catch (err) {
      var message = String(err && err.message ? err.message : err);
      if (report && report.errores) report.errores.push({actividad: ghClean_(activity['Actividad GitHub ID']), error: message});
    }
  });
  return publicadas;
}

function ghObtenerResultado_(organization, repository, branch, expectedTests, maxPoints) {
  if (!organization || !repository) throw new Error('Falta organización o repositorio GitHub.');
  var fullName = organization + '/' + repository;
  var runs = ghApi_('/repos/' + encodeURIComponent(organization) + '/' + encodeURIComponent(repository) +
    '/actions/runs?branch=' + encodeURIComponent(branch) + '&status=completed&per_page=20');
  var list = runs.workflow_runs || [];
  if (!list.length) return null;

  var run = list.filter(function(x) {
    return x.conclusion !== 'cancelled' && x.conclusion !== 'skipped';
  })[0];
  if (!run) return null;

  var jobsPayload = ghApi_('/repos/' + encodeURIComponent(organization) + '/' + encodeURIComponent(repository) +
    '/actions/runs/' + run.id + '/jobs?filter=latest&per_page=100');
  var jobs = jobsPayload.jobs || [];
  var steps = [];
  jobs.forEach(function(job) {
    (job.steps || []).forEach(function(step) {
      steps.push({jobId: job.id, name: String(step.name || ''), conclusion: step.conclusion || ''});
    });
  });

  var compileStep = ghFindStep_(steps, /cmake\s*--build|compil|build/i);
  var testStep = ghFindStep_(steps, /ctest|pruebas?|tests?/i);
  var compilationOk = compileStep ? compileStep.conclusion === 'success' : run.conclusion === 'success';
  var testsTotal = expectedTests;
  var testsPassed = 0;
  var parsed = null;

  if (testStep) {
    try {
      parsed = ghParseCTest_(ghDescargarLogJob_(organization, repository, testStep.jobId));
    } catch (ignore) {}
  }

  if (parsed) {
    testsTotal = parsed.total;
    testsPassed = parsed.passed;
  } else if (testStep && testStep.conclusion === 'success') {
    testsPassed = testsTotal;
  } else if (!testStep && run.conclusion === 'success') {
    testsPassed = testsTotal;
  }

  var compilePoints = compilationOk ? maxPoints * 0.10 : 0;
  var testPoints = testsTotal > 0 ? (testsPassed / testsTotal) * maxPoints * 0.90 : (run.conclusion === 'success' ? maxPoints * 0.90 : 0);
  var score = Math.max(0, Math.min(maxPoints, Math.round((compilePoints + testPoints) * 100) / 100));

  return {
    completed: true,
    sha: run.head_sha || '',
    updatedAt: run.updated_at || run.created_at || '',
    url: run.html_url || '',
    compilation: compilationOk ? 'CORRECTA' : 'ERROR',
    testsPassed: testsPassed,
    testsTotal: testsTotal,
    score: score,
    error: run.conclusion === 'success' ? '' : 'La ejecución terminó con estado ' + run.conclusion + '.',
    observation: 'Resultado automático de GitHub Actions para ' + fullName + '. La nota se conserva como borrador para revisión docente.'
  };
}

function ghApi_(path) {
  var token = PropertiesService.getScriptProperties().getProperty(GH_GRADE_SYNC.TOKEN_PROPERTY);
  var response = UrlFetchApp.fetch(GH_GRADE_SYNC.API + path, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': GH_GRADE_SYNC.USER_AGENT
    }
  });
  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('GitHub API ' + status + ': ' + text.substring(0, 500));
  }
  return text ? JSON.parse(text) : {};
}

function ghDescargarLogJob_(organization, repository, jobId) {
  var token = PropertiesService.getScriptProperties().getProperty(GH_GRADE_SYNC.TOKEN_PROPERTY);
  var response = UrlFetchApp.fetch(
    GH_GRADE_SYNC.API + '/repos/' + encodeURIComponent(organization) + '/' + encodeURIComponent(repository) +
      '/actions/jobs/' + jobId + '/logs',
    {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': GH_GRADE_SYNC.USER_AGENT
      }
    }
  );
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('No fue posible descargar el log del job.');
  }
  return response.getContentText();
}

function ghParseCTest_(text) {
  if (!text) return null;
  var match = text.match(/(\d+)% tests passed,\s*(\d+) tests failed out of\s*(\d+)/i);
  if (!match) return null;
  var failed = Number(match[2]);
  var total = Number(match[3]);
  return {passed: Math.max(0, total - failed), total: total};
}

function ghFindStep_(steps, pattern) {
  for (var i = steps.length - 1; i >= 0; i--) {
    if (pattern.test(steps[i].name)) return steps[i];
  }
  return null;
}

function ghListarEntregas_(courseId, workId) {
  var map = {};
  var pageToken;
  do {
    var response = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, workId, {
      pageSize: 100,
      pageToken: pageToken
    });
    (response.studentSubmissions || []).forEach(function(s) { map[String(s.userId)] = s; });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return map;
}

function ghMapaAlumnos_(courseId) {
  var map = {};
  var pageToken;
  do {
    var response = Classroom.Courses.Students.list(courseId, {pageSize: 100, pageToken: pageToken});
    (response.students || []).forEach(function(s) {
      var profile = s.profile || {};
      if (profile.emailAddress) map[String(profile.emailAddress).toLowerCase()] = String(profile.id);
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return map;
}

function ghLeerTabla_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return {headers: [], records: []};
  var headers = values[0].map(function(x) { return ghClean_(x); });
  var records = [];
  for (var r = 1; r < values.length; r++) {
    var hasValue = values[r].some(function(x) { return ghClean_(x) !== ''; });
    if (!hasValue) continue;
    var obj = {__row: r + 1};
    headers.forEach(function(h, c) { obj[h] = values[r][c]; });
    records.push(obj);
  }
  return {headers: headers, records: records};
}

function ghActualizarEvaluacion_(sheet, headers, row, values) {
  Object.keys(values).forEach(function(header) {
    var index = headers.indexOf(header);
    if (index >= 0) sheet.getRange(row, index + 1).setValue(values[header]);
  });
}

function ghHoja_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('No existe la hoja: ' + name);
  return sheet;
}

function ghClean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function validarConfiguracionGitHub_() {
  var token = PropertiesService.getScriptProperties().getProperty(GH_GRADE_SYNC.TOKEN_PROPERTY);
  if (!token) {
    throw new Error('Falta la propiedad de script GITHUB_TOKEN. Debe contener un token de GitHub con lectura de repositorios privados y Actions.');
  }
  var probe = ghApi_('/user');
  return {login: probe.login || '', tokenConfigurado: true};
}

function existeTriggerGitHub_() {
  return ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === GH_GRADE_SYNC.HANDLER;
  });
}
