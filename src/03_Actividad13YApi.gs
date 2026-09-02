function autorizarPermisosQuizzes() {
  UrlFetchApp.fetch(
    'https://forms.googleapis.com/v1/forms',
    {muteHttpExceptions: true}
  );
}


/**
 * Importa las puntuaciones del Form de la Actividad 13 como calificaciones
 * en borrador. No devuelve trabajos ni publica notas a los alumnos.
 */
function auditarImportacionActividad13() {
  const reporte = prepararImportacionActividad13_(false);
  console.log(JSON.stringify(reporte, null, 2));
  return reporte;
}

function importarCalificacionesActividad13() {
  const reporte = prepararImportacionActividad13_(true);
  console.log(JSON.stringify(reporte, null, 2));
  return reporte;
}

function prepararImportacionActividad13_(aplicar) {
  const COURSE_ID = '871156721160';
  const COURSEWORK_ID = '826110045492';
  const FORM_ID = '1s4kbGN-OXozdDvlogy391sV5nH7tt0FggUxoy9F-aLo';

  const respuestas = FormApp.openById(FORM_ID).getResponses();
  const ultimaPorCorreo = {};
  respuestas.forEach(r => {
    const correo = String(r.getRespondentEmail() || '').trim().toLowerCase();
    if (!correo) return;
    const puntos = r.getGradableItemResponses().reduce((s, ir) => s + Number(ir.getScore() || 0), 0);
    const anterior = ultimaPorCorreo[correo];
    if (!anterior || r.getTimestamp() > anterior.fecha) {
      ultimaPorCorreo[correo] = { correoForms: correo, puntos: puntos, fecha: r.getTimestamp() };
    }
  });

  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const mapaHoja = {};
  const hoja = ss.getSheetByName('Correspondencia de correos');
  if (hoja && hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).getDisplayValues().forEach(f => {
      if (String(f[0]).trim() !== COURSE_ID || String(f[5]).trim().toUpperCase() !== 'ACTIVA') return;
      const classroom = String(f[3] || '').trim().toLowerCase();
      const forms = String(f[4] || '').trim().toLowerCase();
      if (classroom) mapaHoja[classroom] = classroom;
      if (forms && classroom) mapaHoja[forms] = classroom;
    });
  }

  const alumnos = [];
  let tokenAlumnos;
  do {
    const pagina = Classroom.Courses.Students.list(COURSE_ID, {pageToken: tokenAlumnos});
    (pagina.students || []).forEach(s => alumnos.push(s));
    tokenAlumnos = pagina.nextPageToken;
  } while (tokenAlumnos);

  const alumnoPorCorreo = {};
  alumnos.forEach(a => {
    const correo = String((a.profile && a.profile.emailAddress) || '').trim().toLowerCase();
    if (correo) alumnoPorCorreo[correo] = a;
  });

  const entregas = [];
  let tokenEntregas;
  do {
    const pagina = Classroom.Courses.CourseWork.StudentSubmissions.list(
      COURSE_ID, COURSEWORK_ID, {pageToken: tokenEntregas}
    );
    (pagina.studentSubmissions || []).forEach(e => entregas.push(e));
    tokenEntregas = pagina.nextPageToken;
  } while (tokenEntregas);
  const entregaPorAlumno = {};
  entregas.forEach(e => entregaPorAlumno[String(e.userId)] = e);

  const importadas = [];
  const sinCorrespondencia = [];
  Object.keys(ultimaPorCorreo).sort().forEach(correoForms => {
    const correoClassroom = alumnoPorCorreo[correoForms] ? correoForms : (mapaHoja[correoForms] || '');
    const alumno = alumnoPorCorreo[correoClassroom];
    const dato = ultimaPorCorreo[correoForms];
    if (!alumno) {
      sinCorrespondencia.push({correoForms: correoForms, puntos: dato.puntos});
      return;
    }
    const entrega = entregaPorAlumno[String(alumno.userId)];
    if (!entrega) {
      sinCorrespondencia.push({correoForms: correoForms, correoClassroom: correoClassroom, puntos: dato.puntos, motivo: 'Sin entrega de Classroom'});
      return;
    }
    if (aplicar) {
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        {draftGrade: dato.puntos},
        COURSE_ID,
        COURSEWORK_ID,
        entrega.id,
        {updateMask: 'draftGrade'}
      );
    }
    importadas.push({
      alumno: alumno.profile.name.fullName,
      correoForms: correoForms,
      correoClassroom: correoClassroom,
      puntos: dato.puntos,
      submissionId: entrega.id
    });
  });

  return {
    aplicar: aplicar,
    respuestasUnicas: Object.keys(ultimaPorCorreo).length,
    alumnosClassroom: alumnos.length,
    entregasClassroom: entregas.length,
    coincidencias: importadas.length,
    importadas: importadas,
    sinCorrespondencia: sinCorrespondencia
  };
}


/**
 * Crea por API la copia DRAFT de la Actividad 13.1.
 * Es idempotente por título y registra el CourseWork en Quizzes.
 */
function crearCopiaApiActividad131() {
  const courseId = '871156721160';
  const formId = '1s4kbGN-OXozdDvlogy391sV5nH7tt0FggUxoy9F-aLo';
  const title = 'Actividad 13.1 - Quiz: Niveles de cambio mediante Tecnologías de Información';
  const description = quizDescription_('Responde el cuestionario sobre los niveles de cambio mediante Tecnologías de Información. El formulario publica la retroalimentación y la calificación inmediatamente después de cada entrega. Tu resultado quedará asociado a tu correo verificado para importar las calificaciones posteriormente.');

  let existente = null;
  let pageToken;
  do {
    const page = Classroom.Courses.CourseWork.list(courseId, {pageToken: pageToken});
    (page.courseWork || []).some(cw => {
      if (cw.title === title) {
        existente = cw;
        return true;
      }
      return false;
    });
    pageToken = page.nextPageToken;
  } while (!existente && pageToken);

  let cw = existente;
  if (!cw) {
    const topics = Classroom.Courses.Topics.list(courseId).topic || [];
    const topic = topics.find(t => t.name === 'Unidad 1');
    if (!topic) throw new Error('No se encontró el tema Unidad 1.');

    const form = FormApp.openById(formId);
    cw = Classroom.Courses.CourseWork.create({
      title: title,
      description: description,
      workType: 'ASSIGNMENT',
      state: 'DRAFT',
      maxPoints: 100,
      topicId: topic.topicId,
      materials: [{
        link: {
          url: form.getPublishedUrl(),
          title: form.getTitle()
        }
      }]
    }, courseId);
  }

  registrarQuizApi131_(cw, courseId, formId, title, description);
  console.log(JSON.stringify(cw, null, 2));
  return cw;
}

function aplicarAvisoCorreoQuizActual() {
  const courseId = '871156721160';
  const workId = '875707042272';
  const formId = '1s4kbGN-OXozdDvlogy391sV5nH7tt0FggUxoy9F-aLo';
  const form = FormApp.openById(formId);
  const description = quizDescription_(form.getDescription());
  form.setDescription(description);
  try { form.setLimitOneResponsePerUser(true); } catch (e) {}

  const work = Classroom.Courses.CourseWork.get(courseId, workId);
  Classroom.Courses.CourseWork.patch(
    {description: quizDescription_(work.description)},
    courseId,
    workId,
    {updateMask: 'description'}
  );

  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];
  const quizIdCol = headers.indexOf('Quiz ID');
  const instructionsCol = headers.indexOf('Instrucciones');
  const updatedCol = headers.indexOf(H.LAST_UPDATE);
  const rowIndex = values.findIndex((row, index) =>
    index > 0 && row[quizIdCol] === 'QUIZ-20260824-NIVELES-CAMBIO-API-001'
  );
  if (rowIndex > 0) {
    sheet.getRange(rowIndex + 1, instructionsCol + 1).setValue(quizDescription_(values[rowIndex][instructionsCol]));
    sheet.getRange(rowIndex + 1, updatedCol + 1).setValue(new Date());
  }
  console.log('Aviso aplicado al Form, a la Actividad 13.1 y al registro maestro.');
}

function registrarQuizApi131_(cw, courseId, formId, title, description) {
  const quizId = 'QUIZ-20260824-NIVELES-CAMBIO-API-001';
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = sheet.getDataRange().getDisplayValues();
  let row = values.findIndex((r, i) => i > 0 && r[0] === quizId) + 1;
  if (!row) row = Math.max(2, sheet.getLastRow() + 1);

  const courseEncoded = Utilities.base64EncodeWebSafe(courseId).replace(/=+$/g, '');
  const workEncoded = Utilities.base64EncodeWebSafe(String(cw.id)).replace(/=+$/g, '');
  const classroomUrl = 'https://classroom.google.com/c/' + courseEncoded + '/a/' + workEncoded + '/details';
  const form = FormApp.openById(formId);
  const record = {
    'Quiz ID': quizId,
    'ID del curso': courseId,
    'Nombre del curso': 'UAQ - Introducción a las Tecnologías de Información',
    'Unidad / tema': 'Unidad 1',
    'ID del tema': cw.topicId || '',
    'Título': title,
    'Instrucciones': description,
    'Puntos totales': 100,
    'Estado': 'CREADA',
    'Recopilar correo': 'SÍ',
    'Limitar a 1 respuesta': 'SÍ',
    'Barajar preguntas': 'NO',
    'ID del Form': formId,
    'URL edición Form': form.getEditUrl(),
    'URL responder Form': form.getPublishedUrl(),
    'ID actividad Classroom': String(cw.id),
    'URL actividad Classroom': classroomUrl,
    'Fecha creación': new Date(),
    'Última actualización': new Date(),
    'Resultado / error': 'Copia API creada como DRAFT; lista para monitor automático de calificaciones.'
  };
  const output = headers.map(h => Object.prototype.hasOwnProperty.call(record, h) ? record[h] : '');
  sheet.getRange(row, 1, 1, output.length).setValues([output]);
}

// Actividad 13.1 API
