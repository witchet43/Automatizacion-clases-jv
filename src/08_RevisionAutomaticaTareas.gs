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

  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 6).getDisplayValues();
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
      'Revisión directa de Classroom ejecutada. ' + result.calificadas100 + ' con puntaje completo; ' +
      result.calificadas0 + ' con 0; ' + result.borradoresFinalizados + ' borradores finalizados; ' +
      result.devueltas + ' entregas devueltas; ' + result.yaAsignadas +
      ' ya tenían assignedGrade sin cambios; ' + result.trabajosCandidatos + ' trabajos revisados.'
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

/**
 * Revisión transversal de cumplimiento directamente sobre Classroom.
 * No depende de que el trabajo exista en la hoja Tareas.
 * Incluye Tareas, Prácticas y Actividades publicadas.
 * Excluye quizzes, exámenes, proyectos y cierres de unidad.
 *
 * Reglas:
 * - assignedGrade existente: intocable; si sigue TURNED_IN, se devuelve.
 * - draftGrade sin assignedGrade: conserva el valor y lo finaliza.
 * - sin calificación: TURNED_IN/RETURNED = puntaje completo; resto = 0.
 * - escribe draftGrade + assignedGrade cuando falta assignedGrade.
 * - devuelve toda entrega TURNED_IN después de asegurar su calificación.
 */
function revisarTareasCurso_(courseId, aplicar) {
  const candidates = [];
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.list(String(courseId), {
      pageToken: token,
      pageSize: 100,
      courseWorkStates: ['PUBLISHED']
    });
    (page.courseWork || []).forEach(cw => {
      const title = String(cw.title || '').trim();
      const upper = title.toUpperCase();
      const esAssignment = String(cw.workType || '').toUpperCase() === 'ASSIGNMENT';
      const esTarea = /^TAREA\b/i.test(title);
      const esPractica = /^PR[ÁA]CTICA\b/i.test(title);
      const esActividad = /^ACTIVIDAD\b/i.test(title);
      const excluida = /^(QUIZ|EXAMEN|PROYECTO)\b/i.test(title) || /^CALIFICACI[ÓO]N\s+UNIDAD\b/i.test(title);
      if (esAssignment && !excluida && (esTarea || esPractica || esActividad)) {
        candidates.push({workId: String(cw.id), title: title, cw: cw});
      }
    });
    token = page.nextPageToken;
  } while (token);

  let calificadas100 = 0;
  let calificadas0 = 0;
  let borradoresFinalizados = 0;
  let yaAsignadas = 0;
  let devueltas = 0;
  let entregasRevisadas = 0;
  const trabajos = [];
  const errores = [];

  candidates.forEach(task => {
    try {
      const cw = task.cw;
      const maxPoints = Number(cw.maxPoints || 100);
      const fullScore = maxPoints > 0 ? maxPoints : 100;
      const subs = [];
      let st = null;
      do {
        const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
          String(courseId), task.workId, {pageToken: st, pageSize: 100}
        );
        (page.studentSubmissions || []).forEach(s => subs.push(s));
        st = page.nextPageToken;
      } while (st);

      let t100 = 0, t0 = 0, tDraft = 0, tAssigned = 0, tReturned = 0;

      subs.forEach(sub => {
        entregasRevisadas++;
        const tieneDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
        const tieneAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;
        const state = String(sub.state || '').toUpperCase();

        if (tieneAssigned) {
          yaAsignadas++;
          tAssigned++;
          if (aplicar && state === 'TURNED_IN') {
            Classroom.Courses.CourseWork.StudentSubmissions.return({}, String(courseId), task.workId, String(sub.id));
            devueltas++;
            tReturned++;
          }
          return;
        }

        const entregada = state === 'TURNED_IN' || state === 'RETURNED';
        const score = tieneDraft ? Number(sub.draftGrade) : (entregada ? fullScore : 0);

        if (aplicar) {
          Classroom.Courses.CourseWork.StudentSubmissions.patch(
            {draftGrade: score, assignedGrade: score},
            String(courseId), task.workId, String(sub.id),
            {updateMask: 'draftGrade,assignedGrade'}
          );
          if (state === 'TURNED_IN') {
            Classroom.Courses.CourseWork.StudentSubmissions.return({}, String(courseId), task.workId, String(sub.id));
            devueltas++;
            tReturned++;
          }
        }

        if (tieneDraft) {
          borradoresFinalizados++;
          tDraft++;
        } else if (entregada) {
          calificadas100++;
          t100++;
        } else {
          calificadas0++;
          t0++;
        }
      });

      trabajos.push({
        titulo: task.title,
        classroomId: task.workId,
        alumnos: subs.length,
        conPuntajeCompleto: t100,
        con0: t0,
        borradoresFinalizados: tDraft,
        yaAsignadas: tAssigned,
        devueltas: tReturned,
        accion: aplicar ? 'APLICADA_Y_FINALIZADA' : 'AUDITORIA'
      });
    } catch (err) {
      errores.push({titulo: task.title, classroomId: task.workId, error: String(err && err.message ? err.message : err)});
    }
  });

  if (errores.length) {
    throw new Error('La revisión encontró errores en ' + errores.length + ' trabajo(s): ' + JSON.stringify(errores).slice(0, 3000));
  }

  return {
    courseId: String(courseId),
    aplicar: Boolean(aplicar),
    trabajosCandidatos: candidates.length,
    entregasRevisadas: entregasRevisadas,
    calificadas100: calificadas100,
    calificadas0: calificadas0,
    borradoresFinalizados: borradoresFinalizados,
    yaAsignadas: yaAsignadas,
    devueltas: devueltas,
    trabajos: trabajos
  };
}
