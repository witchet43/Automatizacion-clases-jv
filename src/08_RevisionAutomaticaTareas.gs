const TASK_REVIEW_REQUEST = Object.freeze({
  SHEET: 'Configuración Quizzes',
  KEY: 'SOLICITUD_REVISAR_TAREAS',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR'
});

function procesarSolicitudRevisionTareas_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(TASK_REVIEW_REQUEST.SHEET);
  if (!sh) throw new Error('No existe la hoja ' + TASK_REVIEW_REQUEST.SHEET);

  const lastRow = Math.max(sh.getLastRow(), 1);
  const values = sh.getRange(1, 1, lastRow, 6).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === TASK_REVIEW_REQUEST.KEY) {
      row = i + 1;
      break;
    }
  }
  if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== TASK_REVIEW_REQUEST.REQUESTED) {
    return {procesado: false, motivo: 'SIN_SOLICITUD_PENDIENTE', estado: estado};
  }

  const courseId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  if (!courseId) throw new Error('Falta el ID del curso objetivo para revisar tareas.');

  sh.getRange(row, 2).setValue(TASK_REVIEW_REQUEST.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = revisarTareasCurso_(courseId, true);
    sh.getRange(row, 2).setValue(TASK_REVIEW_REQUEST.DONE);
    sh.getRange(row, 3).setValue(
      'Revisión de tareas ejecutada. ' + result.calificadas100 + ' con 100; ' +
      result.calificadas0 + ' con 0; ' + result.yaCalificadas +
      ' ya calificadas sin cambios; ' + result.tareasNoPublicadas + ' tareas no publicadas.'
    );
    sh.getRange(row, 5).setValue('ACTIVA');
    sh.getRange(row, 6).setValue(new Date());
    return result;
  } catch (err) {
    sh.getRange(row, 2).setValue(TASK_REVIEW_REQUEST.ERROR);
    sh.getRange(row, 3).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}

function revisarTareasCurso_(courseId, aplicar) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Tareas');
  if (!sh) throw new Error('No existe la hoja Tareas.');

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return {courseId: courseId, tareas: []};
  const h = {};
  data[0].forEach((v, i) => h[String(v)] = i);

  const candidates = [];
  const seen = new Set();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const rowCourse = String(r[h['ID curso']] || '').trim();
    const estado = String(r[h['Estado solicitud']] || '').trim().toUpperCase();
    const title = String(r[h['Título']] || '').trim();
    const type = String(r[h['Tipo de actividad']] || '').trim().toUpperCase();
    const workId = String(r[h['ID Classroom']] || '').trim();

    if (rowCourse !== String(courseId)) continue;
    if (estado !== 'CREADA' || !workId) continue;
    const esTarea = type === 'TAREA' || /^TAREA\s*\d+/i.test(title);
    if (!esTarea) continue;
    if (seen.has(workId)) continue;
    seen.add(workId);
    candidates.push({row: i + 1, title: title, workId: workId});
  }

  let calificadas100 = 0;
  let calificadas0 = 0;
  let yaCalificadas = 0;
  let tareasNoPublicadas = 0;
  let entregasRevisadas = 0;
  const tareas = [];
  const errores = [];

  candidates.forEach(task => {
    try {
      const cw = Classroom.Courses.CourseWork.get(String(courseId), task.workId);
      if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') {
        tareasNoPublicadas++;
        tareas.push({titulo: task.title, classroomId: task.workId, estado: cw.state, accion: 'OMITIDA_NO_PUBLICADA'});
        return;
      }
      if (String(cw.workType || '').toUpperCase() !== 'ASSIGNMENT') {
        tareas.push({titulo: task.title, classroomId: task.workId, estado: cw.state, accion: 'OMITIDA_NO_ASSIGNMENT'});
        return;
      }

      const maxPoints = Number(cw.maxPoints || 100);
      const fullScore = Math.min(100, maxPoints || 100);
      const subs = [];
      let token = null;
      do {
        const p = Classroom.Courses.CourseWork.StudentSubmissions.list(String(courseId), task.workId, {pageToken: token});
        (p.studentSubmissions || []).forEach(x => subs.push(x));
        token = p.nextPageToken;
      } while (token);

      let t100 = 0;
      let t0 = 0;
      let tExisting = 0;
      subs.forEach(sub => {
        entregasRevisadas++;
        const tieneDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
        const tieneAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;
        if (tieneDraft || tieneAssigned) {
          yaCalificadas++;
          tExisting++;
          return;
        }

        const state = String(sub.state || '').toUpperCase();
        const entregada = state === 'TURNED_IN' || state === 'RETURNED';
        const score = entregada ? fullScore : 0;
        if (aplicar) {
          Classroom.Courses.CourseWork.StudentSubmissions.patch(
            {draftGrade: score},
            String(courseId),
            task.workId,
            sub.id,
            {updateMask: 'draftGrade'}
          );
        }
        if (entregada) {
          calificadas100++;
          t100++;
        } else {
          calificadas0++;
          t0++;
        }
      });

      tareas.push({
        titulo: task.title,
        classroomId: task.workId,
        estado: cw.state,
        alumnos: subs.length,
        con100: t100,
        con0: t0,
        yaCalificadas: tExisting,
        accion: aplicar ? 'APLICADA' : 'AUDITORIA'
      });
    } catch (err) {
      errores.push({titulo: task.title, classroomId: task.workId, error: String(err && err.message ? err.message : err)});
    }
  });

  if (errores.length) {
    throw new Error('La revisión encontró errores en ' + errores.length + ' tarea(s): ' + JSON.stringify(errores).slice(0, 3000));
  }

  return {
    courseId: String(courseId),
    aplicar: Boolean(aplicar),
    tareasCandidatas: candidates.length,
    tareasNoPublicadas: tareasNoPublicadas,
    entregasRevisadas: entregasRevisadas,
    calificadas100: calificadas100,
    calificadas0: calificadas0,
    yaCalificadas: yaCalificadas,
    tareas: tareas
  };
}
