/**
 * Prueba controlada: quiz abierto con doble evaluación Gemini + OpenAI.
 * No publica actividades ni devuelve calificaciones.
 */
const OPEN_AI_QUIZ = Object.freeze({
  COURSE_ID: '871156721160',
  TOPIC: 'Unidad 1',
  TITLE: 'Actividad 13.2 - Prueba: Quiz de respuestas abiertas con IA',
  QUIZ_ID: 'QUIZ-20260824-ABIERTA-DOBLE-IA-001',
  SHEET: 'Evaluaciones IA',
  GEMINI_MODEL: 'gemini-3.6-flash',
  OPENAI_MODEL: 'gpt-5',
  QUESTIONS: [
    {
      title: 'Explica con tus propias palabras qué diferencia existe entre digitalización y automatización.',
      reference: 'La digitalización convierte información o procesos analógicos a formato digital; la automatización usa tecnología para ejecutar tareas o flujos con menor intervención humana.',
      required: ['distinguir conversión a formato digital', 'distinguir ejecución automática o menor intervención humana'],
      points: 10
    },
    {
      title: 'Describe un ejemplo de transformación organizacional producida por las Tecnologías de Información.',
      reference: 'Debe describir un cambio integral en procesos, estructura, modelo de servicio o toma de decisiones, no solamente sustituir papel por archivos digitales.',
      required: ['ejemplo concreto', 'cambio integral de proceso, estructura, servicio o decisiones', 'papel habilitador de TI'],
      points: 10
    },
    {
      title: '¿Por qué el uso de tecnología no garantiza por sí solo una transformación exitosa?',
      reference: 'Porque también se requieren estrategia, rediseño de procesos, personas capacitadas, gestión del cambio, liderazgo y medición de resultados.',
      required: ['la tecnología por sí sola es insuficiente', 'mencionar al menos dos factores organizacionales pertinentes'],
      points: 10
    }
  ]
});

function crearPruebaQuizAbiertoDobleIA() {
  const props = PropertiesService.getScriptProperties();
  const existingFormId = props.getProperty('OPEN_AI_TEST_FORM_ID');
  const existingWorkId = props.getProperty('OPEN_AI_TEST_WORK_ID');
  if (existingFormId || existingWorkId) {
    throw new Error('La prueba ya existe. IDs: Form=' + existingFormId + ', Classroom=' + existingWorkId);
  }

  const notice = 'Importante: responde utilizando la misma cuenta y el mismo correo con el que estás registrado en Google Classroom. Las respuestas serán evaluadas automáticamente por OpenAI. La calificación quedará como borrador para auditoría y no se publicará automáticamente.';
  const form = FormApp.create(OPEN_AI_QUIZ.TITLE);
  form.setDescription(notice);
  form.setIsQuiz(true);
  form.setCollectEmail(true);
  try { form.setLimitOneResponsePerUser(true); } catch (e) {}

  OPEN_AI_QUIZ.QUESTIONS.forEach(q => {
    const item = form.addParagraphTextItem();
    item.setTitle(q.title);
    item.setRequired(true);
    item.setPoints(q.points);
    item.setGeneralFeedback(FormApp.createFeedback()
      .setText('La respuesta se evaluará automáticamente con la rúbrica y la respuesta de referencia.')
      .build());
  });

  const topics = Classroom.Courses.Topics.list(OPEN_AI_QUIZ.COURSE_ID).topic || [];
  const topic = topics.find(t => t.name === OPEN_AI_QUIZ.TOPIC);
  if (!topic) throw new Error('No se encontró el tema ' + OPEN_AI_QUIZ.TOPIC);

  const work = Classroom.Courses.CourseWork.create({
    title: OPEN_AI_QUIZ.TITLE,
    description: notice,
    workType: 'ASSIGNMENT',
    state: 'DRAFT',
    maxPoints: 30,
    topicId: topic.topicId,
    materials: [{link: {url: form.getPublishedUrl(), title: form.getTitle()}}]
  }, OPEN_AI_QUIZ.COURSE_ID);

  props.setProperties({
    OPEN_AI_TEST_FORM_ID: form.getId(),
    OPEN_AI_TEST_WORK_ID: String(work.id)
  });
  prepararHojaAuditoriaIA_();
  registrarPruebaAbiertaEnQuizzes_(form, work, notice);
  console.log(JSON.stringify({formId: form.getId(), formUrl: form.getPublishedUrl(), workId: work.id}, null, 2));
}

function instalarMonitorQuizAbiertoOpenAI() {
  validarClavesIA_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'monitorearQuizAbiertoOpenAI')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monitorearQuizAbiertoOpenAI').timeBased().everyMinutes(1).create();
}

function monitorearQuizAbiertoOpenAI() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty('OPEN_AI_TEST_FORM_ID');
  const workId = props.getProperty('OPEN_AI_TEST_WORK_ID');
  if (!formId || !workId) return;
  validarClavesIA_();

  const form = FormApp.openById(formId);
  const sheet = prepararHojaAuditoriaIA_();
  const done = new Set(sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat()
    : []);
  const submissions = listarEntregasIA_(OPEN_AI_QUIZ.COURSE_ID, workId);
  const byEmail = {};
  submissions.forEach(s => {
    const profile = Classroom.UserProfiles.get(s.userId);
    if (profile.emailAddress) byEmail[profile.emailAddress.toLowerCase()] = s;
  });

  form.getResponses().forEach(response => {
    const responseId = response.getId();
    if (done.has(responseId)) return;
    const email = String(response.getRespondentEmail() || '').toLowerCase();
    const submission = byEmail[email];
    const answers = response.getItemResponses();
    const evaluations = [];
    let total = 0;

    OPEN_AI_QUIZ.QUESTIONS.forEach((q, i) => {
      const answer = String(answers[i] ? answers[i].getResponse() : '');
      const gemini = evaluarConGemini_(q, answer);
      const openai = evaluarConOpenAI_(q, answer);
      const final = resolverDobleEvaluacion_(q, answer, gemini, openai);
      total += final.points;
      evaluations.push({question: q.title, answer: answer, gemini: gemini, openai: openai, final: final});
    });

    let classroomResult = 'SIN_ENTREGA_TURNED_IN';
    if (submission && submission.state === 'TURNED_IN' && submission.draftGrade == null) {
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        {draftGrade: total},
        OPEN_AI_QUIZ.COURSE_ID,
        workId,
        submission.id,
        {updateMask: 'draftGrade'}
      );
      classroomResult = 'DRAFT_GRADE_CARGADA';
    }

    sheet.appendRow([
      responseId, new Date(), email, total, 30,
      JSON.stringify(evaluations), classroomResult,
      submission ? submission.id : ''
    ]);
  });
}

function evaluarConGemini_(q, answer) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const prompt = construirPromptEvaluacion_(q, answer);
  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      OPEN_AI_QUIZ.GEMINI_MODEL + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {'x-goog-api-key': key},
      payload: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {responseMimeType: 'application/json'}
      }),
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  const body = JSON.parse(res.getContentText());
  return normalizarEvaluacion_(JSON.parse(body.candidates[0].content.parts[0].text), q.points);
}

function evaluarConOpenAI_(q, answer) {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + key},
    payload: JSON.stringify({
      model: OPEN_AI_QUIZ.OPENAI_MODEL,
      input: construirPromptEvaluacion_(q, answer),
      text: {format: {type: 'json_schema', name: 'evaluacion_quiz', strict: true, schema: {
        type: 'object',
        properties: {
          classification: {type: 'string', enum: ['CORRECTA', 'INCOMPLETA', 'INCORRECTA']},
          justification: {type: 'string'},
          confidence: {type: 'number', minimum: 0, maximum: 1}
        },
        required: ['classification', 'justification', 'confidence'],
        additionalProperties: false
      }}}
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('OpenAI HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  const body = JSON.parse(res.getContentText());
  const text = body.output_text || extraerTextoOpenAI_(body);
  return normalizarEvaluacion_(JSON.parse(text), q.points);
}

function resolverDobleEvaluacion_(q, answer, a, b) {
  if (a.classification === b.classification) {
    return {classification: a.classification, points: puntosClase_(a.classification, q.points),
      discrepancy: false, feedback: a.justification + ' | ' + b.justification};
  }
  const rank = {INCORRECTA: 0, INCOMPLETA: 1, CORRECTA: 2};
  const conservative = rank[a.classification] <= rank[b.classification] ? a : b;
  return {classification: conservative.classification,
    points: puntosClase_(conservative.classification, q.points),
    discrepancy: true,
    feedback: 'Discrepancia automática; se aplicó el criterio conservador. Gemini: ' +
      a.justification + ' | OpenAI: ' + b.justification};
}

function construirPromptEvaluacion_(q, answer) {
  return [
    'Evalúa una respuesta académica sin conocer la identidad del alumno.',
    'Clasifica exclusivamente como CORRECTA, INCOMPLETA o INCORRECTA.',
    'CORRECTA: satisface todos los conceptos indispensables y es conceptualmente válida.',
    'INCOMPLETA: contiene parte sustancial correcta, pero omite uno o más conceptos indispensables.',
    'INCORRECTA: es vacía, irrelevante o contiene errores centrales.',
    'Pregunta: ' + q.title,
    'Respuesta de referencia: ' + q.reference,
    'Conceptos indispensables: ' + q.required.join('; '),
    'Respuesta del alumno: ' + answer,
    'Devuelve solo JSON con classification, justification y confidence entre 0 y 1.'
  ].join('\n');
}

function normalizarEvaluacion_(x, maxPoints) {
  const allowed = ['CORRECTA', 'INCOMPLETA', 'INCORRECTA'];
  const c = String(x.classification || '').toUpperCase();
  if (!allowed.includes(c)) throw new Error('Clasificación IA inválida');
  return {classification: c, points: puntosClase_(c, maxPoints),
    justification: String(x.justification || ''), confidence: Number(x.confidence || 0)};
}

function puntosClase_(classification, maxPoints) {
  if (classification === 'CORRECTA') return maxPoints;
  if (classification === 'INCOMPLETA') return maxPoints / 2;
  return 0;
}

function extraerTextoOpenAI_(body) {
  const outputs = body.output || [];
  for (const out of outputs) {
    for (const c of (out.content || [])) if (c.text) return c.text;
  }
  throw new Error('OpenAI no devolvió texto evaluable');
}

function validarClavesIA_() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('GEMINI_API_KEY') || !p.getProperty('OPENAI_API_KEY')) {
    throw new Error('Faltan GEMINI_API_KEY y/o OPENAI_API_KEY en Propiedades del script.');
  }
}

function prepararHojaAuditoriaIA_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(OPEN_AI_QUIZ.SHEET);
  if (!sheet) sheet = ss.insertSheet(OPEN_AI_QUIZ.SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID respuesta Form', 'Fecha evaluación', 'Correo verificado',
      'Puntos obtenidos', 'Puntos máximos', 'Detalle doble IA',
      'Resultado Classroom', 'ID entrega Classroom']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function listarEntregasIA_(courseId, workId) {
  let token;
  const all = [];
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, workId, {
      pageToken: token, pageSize: 100
    });
    all.push.apply(all, page.studentSubmissions || []);
    token = page.nextPageToken;
  } while (token);
  return all;
}

function registrarPruebaAbiertaEnQuizzes_(form, work, notice) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const row = {};
  row['Quiz ID'] = OPEN_AI_QUIZ.QUIZ_ID;
  row['ID del curso'] = OPEN_AI_QUIZ.COURSE_ID;
  row['Nombre del curso'] = 'UAQ - Introducción a las Tecnologías de Información';
  row['Unidad / tema'] = OPEN_AI_QUIZ.TOPIC;
  row['ID del tema'] = work.topicId || '';
  row['Título'] = OPEN_AI_QUIZ.TITLE;
  row['Instrucciones'] = notice;
  row['Puntos totales'] = 30;
  row['Estado'] = 'CREADA';
  row['Recopilar correo'] = 'SÍ';
  row['Limitar a 1 respuesta'] = 'SÍ';
  row['ID del Form'] = form.getId();
  row['URL edición Form'] = form.getEditUrl();
  row['URL responder Form'] = form.getPublishedUrl();
  row['ID actividad Classroom'] = String(work.id);
  row['Fecha creación'] = new Date();
  row['Última actualización'] = new Date();
  row['Resultado / error'] = 'Prueba abierta creada como DRAFT; evaluación automática configurada con OpenAI.';
  sheet.appendRow(headers.map(h => row[h] == null ? '' : row[h]));
}


function probarConexionesDobleIA() {
  validarClavesIA_();
  const q = OPEN_AI_QUIZ.QUESTIONS[0];
  const answer = 'La digitalización convierte información analógica en digital, mientras que la automatización ejecuta tareas con menor intervención humana.';
  const gemini = evaluarConGemini_(q, answer);
  const openai = evaluarConOpenAI_(q, answer);
  console.log(JSON.stringify({
    gemini: {classification: gemini.classification, confidence: gemini.confidence},
    openai: {classification: openai.classification, confidence: openai.confidence}
  }));
  return true;
}


function probarOpenAIQuizAbierto() {
  validarClavesIA_();
  const q = OPEN_AI_QUIZ.QUESTIONS[0];
  const answer = 'La digitalización convierte información analógica en digital, mientras que la automatización ejecuta tareas con menor intervención humana.';
  const result = evaluarConOpenAI_(q, answer);
  console.log(JSON.stringify({classification: result.classification, confidence: result.confidence}));
  return true;
}


function convertirPruebaAOpenAISolo() {
  const p = PropertiesService.getScriptProperties();
  const formId = p.getProperty('OPEN_AI_TEST_FORM_ID');
  const workId = p.getProperty('OPEN_AI_TEST_WORK_ID');
  const title = 'Actividad 13.2 - Prueba: Quiz de respuestas abiertas con IA';
  const notice = 'Importante: responde utilizando la misma cuenta y el mismo correo con el que estás registrado en Google Classroom. Las respuestas serán evaluadas automáticamente por OpenAI. La calificación quedará como borrador para auditoría y no se publicará automáticamente.';
  const form = FormApp.openById(formId);
  form.setTitle(title);
  form.setDescription(notice);
  Classroom.Courses.CourseWork.patch(
    {title: title, description: notice},
    OPEN_AI_QUIZ.COURSE_ID,
    workId,
    {updateMask: 'title,description'}
  );
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];
  const row = values.findIndex((r, i) => i > 0 && r[headers.indexOf('Quiz ID')] === OPEN_AI_QUIZ.QUIZ_ID);
  if (row > 0) {
    sheet.getRange(row + 1, headers.indexOf('Título') + 1).setValue(title);
    sheet.getRange(row + 1, headers.indexOf('Instrucciones') + 1).setValue(notice);
    sheet.getRange(row + 1, headers.indexOf('Resultado / error') + 1)
      .setValue('Prueba abierta DRAFT; evaluación automática configurada con OpenAI.');
    sheet.getRange(row + 1, headers.indexOf('Última actualización') + 1).setValue(new Date());
  }
  console.log('Prueba convertida a evaluación automática con OpenAI.');
}
