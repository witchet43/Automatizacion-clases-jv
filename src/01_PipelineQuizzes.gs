/**
 * Soporte compartido para construcción de Forms de quiz/examen.
 *
 * IMPORTANTE:
 * - Sheets es únicamente configuración/auditoría.
 * - La creación de recursos didácticos ocurre por entrypoints canónicos
 *   invocados mediante el Academic Web App.
 * - El antiguo monitor Sheets -> Forms -> Classroom está descomisionado.
 */
const QUIZ_PIPELINE = Object.freeze({
  SPREADSHEET_ID: '1YLSPcDSpqvaAk7lLeL6O3CTcgeqdrBtmxCgmdF6ISeA',
  QUIZZES_SHEET: 'Quizzes',
  QUESTIONS_SHEET: 'Preguntas Quiz',
  APPROVED: 'APROBADA',
  RETRACT: 'RETIRAR',
  PROCESSING: 'PROCESANDO',
  CREATED: 'CREADA',
  ERROR: 'ERROR'
});

const QUIZ_EMAIL_NOTICE = 'Importante: responde el cuestionario utilizando la misma cuenta de Google y el mismo correo electrónico con el que estás registrado en Google Classroom. Si utilizas otra cuenta, tu calificación no podrá asociarse automáticamente.';
const QUIZ_NO_DESCRIPTION_SENTINEL = '__SIN_DESCRIPCION__';

const H = Object.freeze({
  TITLE: 'Título',
  LAST_UPDATE: 'Última actualización',
  FORM_EDIT_URL: 'URL edición Form',
  CREATED_AT: 'Fecha creación',
  OPTION_A: 'Opción A',
  OPTION_B: 'Opción B',
  OPTION_C: 'Opción C',
  OPTION_D: 'Opción D',
  OPTION_E: 'Opción E',
  OPTION_F: 'Opción F',
  OPTION_G: 'Opción G',
  OPTION_H: 'Opción H',
  GOOD_FEEDBACK: 'Retroalimentación correcta',
  BAD_FEEDBACK: 'Retroalimentación incorrecta'
});

function quizDescriptionForOutput_(value) {
  return clean_(value) === QUIZ_NO_DESCRIPTION_SENTINEL ? '' : quizDescription_(value);
}

/**
 * Compatibilidad de desinstalación.
 * Nunca instala el monitor histórico; elimina cualquier trigger residual.
 */
function instalarMonitorQuizzes() {
  const removed = desinstalarMonitorCreacionQuizzes_();
  return {
    ok: true,
    instalado: false,
    descomisionado: true,
    triggersEliminados: removed,
    motivo: 'La creación académica usa exclusivamente el Academic Web App.'
  };
}

/**
 * Stub de transición para triggers ya existentes en Apps Script.
 * Si un trigger histórico lo invoca después del despliegue, se elimina a sí
 * mismo y NO crea, modifica ni publica recursos académicos.
 */
function procesarQuizzesAprobados() {
  const removed = desinstalarMonitorCreacionQuizzes_();
  return {
    ok: true,
    descomisionado: true,
    triggersEliminados: removed,
    recursosCreados: 0
  };
}

function desinstalarMonitorCreacionQuizzes_() {
  let removed = 0;
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'procesarQuizzesAprobados'; })
    .forEach(function(t) {
      ScriptApp.deleteTrigger(t);
      removed++;
    });
  return removed;
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

/**
 * Build ALL exam multiple-choice items before creating the Form, so invalid
 * answers do not cause partial resources. One Forms API batchUpdate avoids
 * 25 serial FormApp round trips that can exceed the Site's request timeout.
 * Only EXAMEN uses this optimized path; QUIZ feedback remains unchanged.
 */
function prepararReactivosExamenBatch_(items) {
  const letters=['A','B','C','D','E','F','G','H'];
  return items.map(function(rec,index){
    const x=rec.data;
    if(normalizeQuizQuestionType_(x.Tipo)!=='OPCION_MULTIPLE')
      throw new Error('EXAMEN_BATCH_UNSUPPORTED_TYPE: '+String(x.Tipo||''));
    const pairs=letters.map(function(letter,i){
      return {letter:letter,text:clean_(x['Opción '+letter])};
    }).filter(function(o){return Boolean(o.text);});
    const keys=parseChoiceAnswerKeys_(x['Respuesta correcta']);
    if(pairs.length<2 || keys.length!==1 ||
       !pairs.some(function(o){return o.letter===keys[0];}))
      throw new Error('EXAMEN_RESPUESTA_INVALIDA_PREGUNTA_'+String(index+1));
    if(new Set(pairs.map(function(o){return o.text;})).size!==pairs.length)
      throw new Error('EXAMEN_OPCIONES_DUPLICADAS_PREGUNTA_'+String(index+1));
    const points=Number(x.Puntos);
    if(!Number.isInteger(points)||points<0)
      throw new Error('EXAMEN_PUNTOS_INVALIDOS_PREGUNTA_'+String(index+1));
    const correct=pairs.find(function(o){return o.letter===keys[0];}).text;
    return {createItem:{
      item:{
        title:clean_(x.Pregunta),
        questionItem:{question:{
          required:yes_(x.Obligatoria),
          grading:{pointValue:points,correctAnswers:{answers:[{value:correct}]}},
          choiceQuestion:{type:'RADIO',options:pairs.map(function(o){return {value:o.text};})}
        }}
      },
      location:{index:index}
    }};
  });
}

function buildQuizForm_(quiz, items) {
  const showFeedback = validateQuizFeedbackRequirements_(quiz, items);
  const isExam=clean_(quiz['Tipo instrumento']).toUpperCase()==='EXAMEN';
  const examRequests=isExam && items.length>=10 &&
    items.every(function(rec){return normalizeQuizQuestionType_(rec.data.Tipo)==='OPCION_MULTIPLE';})
    ? prepararReactivosExamenBatch_(items) : null;

  // Un Form nuevo se crea SIN publicar desde el primer instante: un Classroom
  // DRAFT por sí solo no impide que se abra directamente el enlace del Form.
  const form = FormApp.create(clean_(quiz[H.TITLE]), false);
  try {
  assertQuizFormNotPublished_(form);
  form.setDescription(quizDescriptionForOutput_(quiz.Instrucciones));
  form.setIsQuiz(true);
  form.setCollectEmail(true);
  configureVerifiedEmail_(form.getId(), true);
  form.setShuffleQuestions(yes_(quiz['Barajar preguntas']));
  form.setLimitOneResponsePerUser(true);
  form.setShowLinkToRespondAgain(false);
  form.setPublishingSummary(false);

  if(examRequests){
    formsBatchUpdate_(form.getId(),examRequests);
    const actual=form.getItems();
    if(actual.length!==items.length ||
       actual.some(function(item,i){return clean_(item.getTitle())!==clean_(items[i].data.Pregunta);}))
      throw new Error('EXAMEN_BATCH_POSTFLIGHT_ITEMS_MISMATCH');
    assertQuizFormNotPublished_(form);
    return form;
  }

  items.forEach(rec => {
    const x = rec.data;
    const type = normalizeQuizQuestionType_(x.Tipo);

    if (type === 'RESPUESTA_CORTA') {
      createShortAnswerQuestion_(form.getId(), form.getItems().length, x, showFeedback);
      return;
    }

    const optionHeaders = [
      H.OPTION_A, H.OPTION_B, H.OPTION_C, H.OPTION_D,
      H.OPTION_E, H.OPTION_F, H.OPTION_G, H.OPTION_H
    ];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const optionPairs = optionHeaders
      .map((header, index) => ({letter: letters[index], value: clean_(x[header])}))
      .filter(pair => Boolean(pair.value));
    const options = optionPairs.map(pair => pair.value);
    if (options.length < 2) {
      throw new Error('La pregunta ' + x.Orden + ' necesita al menos 2 opciones.');
    }

    const keys = parseChoiceAnswerKeys_(x['Respuesta correcta']);
    const availableLetters = optionPairs.map(pair => pair.letter);
    if (!keys.length || keys.some(key => availableLetters.indexOf(key) < 0)) {
      throw new Error('Respuesta invalida en pregunta ' + x.Orden + ': ' + clean_(x['Respuesta correcta']));
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
    item.setChoices(optionPairs.map(pair =>
      item.createChoice(pair.value, keys.indexOf(pair.letter) >= 0)
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

  assertQuizFormNotPublished_(form);
  return form;
  } catch(err) {
    // buildQuizForm_ may throw BEFORE returning 'form' to its caller.
    // The outer caller cannot trash a partially constructed Form it never
    // received, so the builder itself must clean up that partial resource.
    try { DriveApp.getFileById(form.getId()).setTrashed(true); }
    catch(cleanupErr) { console.warn('FORM_INCOMPLETO_LIMPIEZA_FALLIDA'); }
    throw err;
  }
}

/** Bloquea un quiz creado/publicado por omisión antes de adjuntarlo a Classroom. */
function assertQuizFormNotPublished_(form) {
  if(!form || !form.supportsAdvancedResponderPermissions ||
      form.supportsAdvancedResponderPermissions()!==true ||
      !form.isPublished || form.isPublished()!==false)
    throw new Error('BLOCKED_FORMS_DRAFT: el Google Form del quiz debe estar sin publicar antes de crear Classroom.');
  return true;
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