const QUIZ100_REQUEST = Object.freeze({
  SHEET: 'Configuración Quizzes',
  KEY: 'SOLICITUD_CALIFICAR_QUIZZES_100',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR'
});

function procesarSolicitudCalificarQuizzes100_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName(QUIZ100_REQUEST.SHEET);
  if (!sh) throw new Error('No existe la hoja ' + QUIZ100_REQUEST.SHEET);

  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 8).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === QUIZ100_REQUEST.KEY) {
      row = i + 1;
      break;
    }
  }
  if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== QUIZ100_REQUEST.REQUESTED) {
    return {procesado: false, motivo: 'SIN_SOLICITUD_PENDIENTE', estado: estado};
  }

  const courseId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  if (!courseId) throw new Error('Falta el ID del curso objetivo.');

  sh.getRange(row, 2).setValue(QUIZ100_REQUEST.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    const result = calificarQuizzesNumerados100_(courseId, [1, 2, 3]);
    sh.getRange(row, 2).setValue(QUIZ100_REQUEST.DONE);
    sh.getRange(row, 3).setValue(
      'Quiz 1, 2 y 3 procesados por ID real de Classroom: ' + result.trabajosEncontrados +
      ' trabajos; ' + result.alumnosCalificados + ' StudentSubmissions con 100; ' +
      result.errores.length + ' errores.'
    );
    sh.getRange(row, 5).setValue('ACTIVA');
    sh.getRange(row, 6).setValue(new Date());
    if (result.errores.length) {
      sh.getRange(row, 2).setValue(QUIZ100_REQUEST.ERROR);
      sh.getRange(row, 3).setValue('Errores: ' + JSON.stringify(result.errores).slice(0, 3000));
    }
    return result;
  } catch (err) {
    sh.getRange(row, 2).setValue(QUIZ100_REQUEST.ERROR);
    sh.getRange(row, 3).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}

function calificarQuizzesNumerados100_(courseId, numeros) {
  const wanted = {};
  numeros.forEach(n => wanted[String(n)] = true);
  const encontrados = [];
  let token = null;

  do {
    const page = Classroom.Courses.CourseWork.list(String(courseId), {
      pageToken: token,
      pageSize: 100,
      courseWorkStates: ['PUBLISHED']
    });
    (page.courseWork || []).forEach(cw => {
      const title = String(cw.title || '').trim();
      const m = title.match(/^Quiz\s*0*([1-9]\d*)\b/i);
      if (m && wanted[m[1]]) {
        encontrados.push({id: String(cw.id), title: title});
      }
    });
    token = page.nextPageToken;
  } while (token);

  const faltantes = numeros.filter(n => !encontrados.some(x => {
    const m = x.title.match(/^Quiz\s*0*([1-9]\d*)\b/i);
    return m && Number(m[1]) === Number(n);
  }));
  if (faltantes.length) {
    throw new Error('No se localizaron en Classroom PUBLISHED los quizzes: ' + faltantes.join(', '));
  }

  let alumnosCalificados = 0;
  const trabajos = [];
  const errores = [];

  encontrados.forEach(cw => {
    try {
      const subs = [];
      let st = null;
      do {
        const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
          String(courseId), cw.id, {pageToken: st, pageSize: 100}
        );
        (page.studentSubmissions || []).forEach(s => subs.push(s));
        st = page.nextPageToken;
      } while (st);

      let cambiadas = 0;
      subs.forEach(sub => {
        Classroom.Courses.CourseWork.StudentSubmissions.patch(
          {draftGrade: 100, assignedGrade: 100},
          String(courseId), cw.id, String(sub.id),
          {updateMask: 'draftGrade,assignedGrade'}
        );
        cambiadas++;
        alumnosCalificados++;
      });

      trabajos.push({titulo: cw.title, classroomId: cw.id, alumnosAsignados: subs.length, calificados100: cambiadas});
    } catch (err) {
      errores.push({titulo: cw.title, classroomId: cw.id, error: String(err && err.message ? err.message : err)});
    }
  });

  return {
    courseId: String(courseId),
    trabajosEncontrados: encontrados.length,
    alumnosCalificados: alumnosCalificados,
    trabajos: trabajos,
    errores: errores
  };
}
