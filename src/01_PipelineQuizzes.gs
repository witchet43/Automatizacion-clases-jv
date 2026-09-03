/**
 * Pipeline: Sheets -> Forms -> Classroom.
 * Creation is DRAFT by default. Publication requires explicit state PUBLICAR.
 */
const QUIZ_PIPELINE = Object.freeze({
  SPREADSHEET_ID: '1YLSPcDSpqvaAk7lLeL6O3CTcgeqdrBtmxCgmdF6ISeA',
  QUIZZES_SHEET: 'Quizzes',
  QUESTIONS_SHEET: 'Preguntas Quiz',
  APPROVED: 'APROBADA',
  PUBLISH: 'PUBLICAR',
  PROCESSING: 'PROCESANDO',
  CREATED: 'CREADA',
  ERROR: 'ERROR'
});

const QUIZ_EMAIL_NOTICE = 'Importante: responde el cuestionario utilizando la misma cuenta de Google y el mismo correo electrónico con el que estás registrado en Google Classroom. Si utilizas otra cuenta, tu calificación no podrá asociarse automáticamente.';

const H = Object.freeze({
  TITLE: 'Título',
  LAST_UPDATE: 'Última actualización',
  FORM_EDIT_URL: 'URL edición Form',
  CREATED_AT: 'Fecha creación',
  OPTION_A: 'Opción A',
  OPTION_B: 'Opción B',
  OPTION_C: 'Opción C',
  OPTION_D: 'Opción D',
  GOOD_FEEDBACK: 'Retroalimentación correcta',
  BAD_FEEDBACK: 'Retroalimentación incorrecta'
});

function instalarMonitorQuizzes() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarQuizzesAprobados')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarQuizzesAprobados').timeBased().everyMinutes(1).create();
}

function procesarQuizzesAprobados() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const quizSheet = requireSheet_(ss, QUIZ_PIPELINE.QUIZZES_SHEET);
    const questionSheet = requireSheet_(ss, QUIZ_PIPELINE.QUESTIONS_SHEET);
    const quizzes = readObjects_(quizSheet);
    const questions = readObjects_(questionSheet);
    quizzes
      .filter(x => {
        const state = clean_(x.data.Estado);
        return state === QUIZ_PIPELINE.APPROVED || state === QUIZ_PIPELINE.PUBLISH;
      })
      .forEach(x => processOneQuiz_(quizSheet, x, questions));
  } finally {
    lock.releaseLock();
  }
}

function processOneQuiz_(sheet, record, allQuestions) {
  const q = record.data;
  const requestedState = clean_(q.Estado);
  const quizId = required_(q, 'Quiz ID');
  const courseId = required_(q, 'ID del curso');
  const statusCol = column_(record, 'Estado');
  const resultCol = column_(record, 'Resultado / error');
  const updatedCol = column_(record, H.LAST_UPDATE);

  sheet.getRange(record.row, statusCol).setValue(QUIZ_PIPELINE.PROCESSING);
  sheet.getRange(record.row, resultCol).setValue('Procesando ' + quizId);
  SpreadsheetApp.flush();

  try {
    const existingFormId = clean_(q['ID del Form']);
    const existingClassroomId = clean_(q['ID actividad Classroom']);

    if (requestedState === QUIZ_PIPELINE.PUBLISH) {
      if (!existingFormId || !existingClassroomId) {
        throw new Error('No se puede publicar: faltan ID del Form o ID de Classroom.');
      }
      const work = Classroom.Courses.CourseWork.patch(
        {state: 'PUBLISHED'},
        courseId,
        existingClassroomId,
        {updateMask: 'state'}
      );
      writeOutputs_(sheet, record, {
        Estado: QUIZ_PIPELINE.CREATED,
        [H.LAST_UPDATE]: new Date(),
        'URL actividad Classroom': work.alternateLink || clean_(q['URL actividad Classroom']),
        'Resultado / error': 'PUBLICADA en Classroom por autorización expresa del docente.'
      });
      return;
    }

    if (existingFormId && existingClassroomId) {
      throw new Error('La fila ya contiene Form y actividad Classroom; se detuvo para evitar duplicados.');
    }
    if (!existingFormId && existingClassroomId) {
      throw new Error('Estado inconsistente: existe ID de Classroom pero falta ID del Form.');
    }

    const items = allQuestions
      .filter(x => clean_(x.data['Quiz ID']) === quizId)
      .filter(x => clean_(x.data['ID del curso']) === courseId)
      .sort((a, b) => Number(a.data.Orden) - Number(b.data.Orden));

    if (!items.length) {
      throw new Error('No hay preguntas asociadas al Quiz ID y curso indicados.');
    }

    const foreign = allQuestions.filter(x =>
      clean_(x.data['Quiz ID']) === quizId &&
      clean_(x.data['ID del curso']) !== courseId
    );
    if (foreign.length) {
      throw new Error('Hay preguntas con el mismo Quiz ID asignadas a otro curso.');
    }

    const total = items.reduce((sum, x) => sum + Number(x.data.Puntos || 0), 0);
    if (Number(q['Puntos totales']) !== total) {
      throw new Error('Los puntos de las preguntas (' + total + ') no coinciden con Puntos totales.');
    }

    validateQuizFeedbackRequirements_(q, items);
    assertNoManualEmailQuestions_(items.map(x => x.data.Pregunta), 'Preguntas Quiz');

    let form;
    let reusedForm = false;
    if (existingFormId) {
      try {
        form = FormApp.openById(existingFormId);
        reusedForm = true;
      } catch (err) {
        throw new Error('No se pudo reutilizar el Form existente ' + existingFormId + ': ' + (err && err.message ? err.message : err));
      }
    } else {
      form = buildQuizForm_(q, items);
    }

    assertNoManualEmailQuestions_(
      form.getItems().map(item => item.getTitle()),
      'Form creado'
    );
    verifyVerifiedEmail_(form.getId());

    const topicId = resolveTopicId_(
      courseId,
      clean_(q['ID del tema']),
      clean_(q['Unidad / tema'])
    );

    const work = Classroom.Courses.CourseWork.create({
      title: clean_(q[H.TITLE]),
      description: quizDescription_(q.Instrucciones),
      workType: 'ASSIGNMENT',
      state: 'DRAFT',
      maxPoints: total,
      topicId: topicId || undefined,
      materials: [{
        link: {
          url: form.getPublishedUrl(),
          title: clean_(q[H.TITLE])
        }
      }]
    }, courseId);

    writeOutputs_(sheet, record, {
      Estado: QUIZ_PIPELINE.CREATED,
      'ID del Form': form.getId(),
      [H.FORM_EDIT_URL]: form.getEditUrl(),
      'URL responder Form': form.getPublishedUrl(),
      'ID actividad Classroom': work.id,
      'URL actividad Classroom': work.alternateLink || '',
      [H.CREATED_AT]: clean_(q[H.CREATED_AT]) || new Date(),
      [H.LAST_UPDATE]: new Date(),
      'Resultado / error': reusedForm
        ? 'CREADA como DRAFT; Form existente reutilizado y actividad Classroom recreada.'
        : 'CREADA como DRAFT; no publicada a alumnos.'
    });
  } catch (err) {
    sheet.getRange(record.row, statusCol).setValue(QUIZ_PIPELINE.ERROR);
    sheet.getRange(record.row, updatedCol).setValue(new Date());
    sheet.getRange(record.row, resultCol)
      .setValue(String(err && err.message ? err.message : err));
  }
}

function validateQuizFeedbackRequirements_(quiz, items) {
  const instrumentType = clean_(quiz['Tipo instrumento']).toUpperCase();
  const feedbackPolicy = clean_(quiz['Política retroalimentación']).toUpperCase();
  const isQuizInstrument = instrumentType === 'QUIZ';

  if (isQuizInstrument && feedbackPolicy === 'SIN_RETROALIMENTACION') {
    throw new Error('Configuración inválida: todo QUIZ debe proporcionar retroalimentación.');
  }

  if (isQuizInstrument) {
    items.forEach(rec => {
      const x = rec.data;
      if (!clean_(x[H.GOOD_FEEDBACK]) || !clean_(x[H.BAD_FEEDBACK])) {
        throw new Error(
          'El QUIZ requiere retroalimentación correcta e incorrecta en la pregunta ' + x.Orden + '.'
        );
      }
    });
  }

  return isQuizInstrument || feedbackPolicy !== 'SIN_RETROALIMENTACION';
}

function buildQuizForm_(quiz, items) {
  const showFeedback = validateQuizFeedbackRequirements_(quiz, items);

  const form = FormApp.create(clean_(quiz[H.TITLE]));
  form.setDescription(quizDescription_(quiz.Instrucciones));
  form.setIsQuiz(true);
  form.setCollectEmail(true);
  configureVerifiedEmail_(form.getId(), true);
  form.setShuffleQuestions(yes_(quiz['Barajar preguntas']));
  form.setLimitOneResponsePerUser(true);
  form.setShowLinkToRespondAgain(false);
  form.setPublishingSummary(false);

  items.forEach(rec => {
    const x = rec.data;
    const type = normalizeQuizQuestionType_(x.Tipo);

    if (type === 'RESPUESTA_CORTA') {
      createShortAnswerQuestion_(form.getId(), form.getItems().length, x, showFeedback);
      return;
    }

    const options = [H.OPTION_A, H.OPTION_B, H.OPTION_C, H.OPTION_D]
      .map(header => clean_(x[header]))
      .filter(Boolean);
    if (options.length < 2) {
      throw new Error('La pregunta ' + x.Orden + ' necesita al menos 2 opciones.');
    }

    const keys = parseChoiceAnswerKeys_(x['Respuesta correcta']);
    const letters = ['A', 'B', 'C', 'D'];
    if (!keys.length || keys.some(key => letters.indexOf(key) < 0)) {
      throw new Error('Respuesta invalida en pregunta ' + x.Orden + ': ' + clean_(x['Respuesta correcta']));
    }
    if (keys.some(key => letters.indexOf(key) >= options.length)) {
      throw new Error('La respuesta correcta de la pregunta ' + x.Orden + ' apunta a una opción vacía.');
    }

    let item;
    if (type === 'CASILLAS') {
      item = form.addCheckboxItem();
    } else if (type === 'LISTA') {
      if (keys.length !== 1) {
        throw new Error('La pregunta ' + x.Orden + ' de tipo LISTA debe tener una sola respuesta correcta.');
      }
      item = form.addListItem();
    } else if (type === 'OPCION_MULTIPLE') {
      if (keys.length !== 1) {
        throw new Error('La pregunta ' + x.Orden + ' de opción múltiple debe tener una sola respuesta correcta.');
      }
      item = form.addMultipleChoiceItem();
    } else {
      throw new Error('Tipo de pregunta no soportado en pregunta ' + x.Orden + ': ' + clean_(x.Tipo));
    }

    item.setTitle(clean_(x.Pregunta));
    item.setRequired(yes_(x.Obligatoria));
    item.setPoints(Number(x.Puntos));
    item.setChoices(options.map((value, index) =>
      item.createChoice(value, keys.indexOf(letters[index]) >= 0)
    ));

    if (showFeedback) {
      const goodText = clean_(x[H.GOOD_FEEDBACK]);
      const badText = clean_(x[H.BAD_FEEDBACK]);
      if (goodText) {
        item.setFeedbackForCorrect(FormApp.createFeedback().setText(goodText).build());
      }
      if (badText) {
        item.setFeedbackForIncorrect(FormApp.createFeedback().setText(badText).build());
      }
    }
  });

  return form;
}

function normalizeQuizQuestionType_(value) {
  const type = clean_(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();

  if (['OPCION MULTIPLE', 'MULTIPLE CHOICE', 'OPCION'].includes(type)) return 'OPCION_MULTIPLE';
  if (['CASILLAS', 'CHECKBOX', 'CHECKBOXES', 'SELECCION MULTIPLE'].includes(type)) return 'CASILLAS';
  if (['LISTA', 'DESPLEGABLE', 'DROP DOWN', 'DROPDOWN'].includes(type)) return 'LISTA';
  if (['RESPUESTA CORTA', 'TEXTO CORTO', 'SHORT ANSWER'].includes(type)) return 'RESPUESTA_CORTA';
  return type.replace(/ /g, '_');
}

function parseChoiceAnswerKeys_(value) {
  const raw = clean_(value).toUpperCase();
  if (!raw) return [];
  return Array.from(new Set(
    raw.split(/[\s,;|/]+/).map(clean_).filter(Boolean)
  ));
}

function shortAnswerValues_(x) {
  const canonical = clean_(x['Respuesta correcta']);
  const variants = clean_(x['Respuestas aceptadas']);
  const values = [];

  if (canonical) values.push(canonical);
  if (variants) {
    variants.split(/[\n,;|]+/)
      .map(clean_)
      .filter(Boolean)
      .forEach(value => values.push(value));
  }

  const unique = [];
  const seen = new Set();
  values.forEach(value => {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  });

  if (!unique.length) {
    throw new Error('La pregunta ' + x.Orden + ' de respuesta corta no tiene Respuesta correcta ni Respuestas aceptadas.');
  }
  return unique;
}

function createShortAnswerQuestion_(formId, index, x, showFeedback) {
  const answers = shortAnswerValues_(x);
  const points = Number(x.Puntos);
  if (!Number.isFinite(points) || points < 0 || Math.floor(points) !== points) {
    throw new Error('Puntos invalidos en pregunta ' + x.Orden + ': ' + x.Puntos);
  }

  const instruction = clean_(x['Instrucción de formato']);
  const grading = {
    pointValue: points,
    correctAnswers: {
      answers: answers.map(value => ({value: value}))
    }
  };
  if (showFeedback) {
    grading.generalFeedback = {text: 'Respuesta esperada: ' + answers.join(' / ')};
  }

  const item = {
    title: clean_(x.Pregunta),
    questionItem: {
      question: {
        required: yes_(x.Obligatoria),
        grading: grading,
        textQuestion: {paragraph: false}
      }
    }
  };
  if (instruction) item.description = instruction;

  formsBatchUpdate_(formId, [{
    createItem: {
      item: item,
      location: {index: index}
    }
  }]);
}

function formsBatchUpdate_(formId, requests) {
  const response = UrlFetchApp.fetch(
    'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId) + ':batchUpdate',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      payload: JSON.stringify({requests: requests}),
      muteHttpExceptions: true
    }
  );
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      'Forms API batchUpdate falló: HTTP ' + code + ' - ' +
      response.getContentText().slice(0, 500)
    );
  }
  return JSON.parse(response.getContentText() || '{}');
}
