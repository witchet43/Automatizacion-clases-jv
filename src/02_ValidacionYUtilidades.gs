function validarSoporteTiposQuiz() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sheet = requireSheet_(ss, QUIZ_PIPELINE.QUESTIONS_SHEET);
  const rows = readObjects_(sheet);
  const errores = [];
  const tipos = {};

  rows.forEach(rec => {
    const x = rec.data;
    if (!clean_(x['Quiz ID'])) return;
    const type = normalizeQuizQuestionType_(x.Tipo);
    tipos[type] = (tipos[type] || 0) + 1;
    try {
      if (type === 'RESPUESTA_CORTA') {
        shortAnswerValues_(x);
      } else if (['OPCION_MULTIPLE', 'LISTA', 'CASILLAS'].includes(type)) {
        const keys = parseChoiceAnswerKeys_(x['Respuesta correcta']);
        if (!keys.length) throw new Error('sin respuesta correcta');
        if (type !== 'CASILLAS' && keys.length !== 1) throw new Error('requiere una sola respuesta correcta');
      } else {
        throw new Error('tipo no soportado');
      }
    } catch (err) {
      errores.push({fila: rec.row, quizId: clean_(x['Quiz ID']), orden: x.Orden, tipo: clean_(x.Tipo), error: String(err.message || err)});
    }
  });

  const reporte = {ok: errores.length === 0, tipos: tipos, errores: errores};
  console.log(JSON.stringify(reporte, null, 2));
  return reporte;
}

function normalizedQuestionTitle_(value) {
  return clean_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.:*]+$/g, '')
    .trim();
}

function isManualEmailQuestion_(title) {
  return ['correo', 'email', 'correo electronico']
    .includes(normalizedQuestionTitle_(title));
}

function assertNoManualEmailQuestions_(titles, context) {
  const invalid = titles.map(clean_).filter(isManualEmailQuestion_);
  if (invalid.length) {
    throw new Error(
      'Pregunta manual de correo no permitida en ' + context + ': ' +
      invalid.join(', ') +
      '. La identidad debe provenir solo del correo verificado de Google.'
    );
  }
}

function configureVerifiedEmail_(formId, enabled) {
  if (!enabled) return;
  try {
    Forms.Forms.batchUpdate({
      requests: [{
        updateSettings: {
          settings: {emailCollectionType: 'VERIFIED'},
          updateMask: 'emailCollectionType'
        }
      }]
    }, formId);
  } catch (err) {
    throw new Error('No se pudo configurar correo verificado con Forms API: ' +
      String(err && err.message ? err.message : err));
  }
}

function verifyVerifiedEmail_(formId) {
  let data;
  try {
    data = Forms.Forms.get(formId);
  } catch (err) {
    throw new Error('No se pudo verificar la configuración del Form con Forms API: ' +
      String(err && err.message ? err.message : err));
  }
  const type = data.settings && data.settings.emailCollectionType;
  if (type !== 'VERIFIED') {
    throw new Error(
      'El Form no quedó con correo verificado (emailCollectionType=' +
      (type || 'NO INFORMADO') + ').'
    );
  }
}

function resolveTopicId_(courseId, explicitId, topicName) {
  if (explicitId) return explicitId;
  if (!topicName) return '';
  let token;
  do {
    const page = Classroom.Courses.Topics.list(courseId, {
      pageToken: token,
      pageSize: 100
    });
    const match = (page.topic || []).find(t => clean_(t.name) === topicName);
    if (match) return match.topicId;
    token = page.nextPageToken;
  } while (token);
  const created = Classroom.Courses.Topics.create({name: topicName}, courseId);
  return created.topicId;
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0].map(clean_);
  return values.slice(1).map((row, index) => ({
    row: index + 2,
    headers: headers,
    data: Object.fromEntries(headers.map((header, col) => [header, row[col]]))
  }));
}

function writeOutputs_(sheet, record, values) {
  Object.keys(values).forEach(header => {
    sheet.getRange(record.row, column_(record, header)).setValue(values[header]);
  });
}

function column_(record, header) {
  const column = record.headers.indexOf(header) + 1;
  if (column < 1) throw new Error('Falta la columna ' + header);
  return column;
}

function requireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Falta la pestana ' + name);
  return sheet;
}

function required_(obj, key) {
  const value = clean_(obj[key]);
  if (!value) throw new Error('Falta ' + key);
  return value;
}

function clean_(value) {
  return value == null ? '' : String(value).trim();
}

function quizDescription_(value) {
  const base = clean_(value);
  if (base.includes(QUIZ_EMAIL_NOTICE)) return base;
  return base ? base + '\n\n' + QUIZ_EMAIL_NOTICE : QUIZ_EMAIL_NOTICE;
}

function yes_(value) {
  return ['SÍ', 'SI', 'TRUE', '1', 'YES']
    .includes(clean_(value).toUpperCase());
}
