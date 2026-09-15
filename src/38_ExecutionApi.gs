/** Contrato verificable para invocaciones mediante Apps Script Execution API. */
function diagnosticarInfraestructuraEjecucion() {
  const expectedScriptId = '1jR91MDwOUlEdWaLQkuKLca5x1Qz1tqPncgc-PApPB-dFDLYAdD2y_4FE';
  if (ScriptApp.getScriptId() !== expectedScriptId) throw new Error('La ejecución llegó a un scriptId inesperado.');

  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  requireSheet_(ss, QUIZ_PIPELINE.QUIZZES_SHEET);
  requireSheet_(ss, QUIZ_PIPELINE.QUESTIONS_SHEET);

  const formId = '1kTGYxRqC6kka6mpCtUvrVKeMiYkYFToWLTPMK18uU7o';
  const formApi = formsGet_(formId);
  const driveFile = Drive.Files.get(formId, {fields:'id,name,mimeType,trashed'});
  if (!formApi.formId || String(formApi.formId) !== formId) throw new Error('Forms API no devolvió el Form de prueba esperado.');
  if (!driveFile || String(driveFile.id) !== formId || driveFile.trashed === true) throw new Error('Drive API no confirmó el Form de prueba.');

  const courses = Classroom.Courses.list({pageSize:1, courseStates:['ACTIVE']});
  Calendar.CalendarList.list({maxResults:1});

  return {
    ok:true,
    safe:true,
    scriptId:expectedScriptId,
    spreadsheetId:QUIZ_PIPELINE.SPREADSHEET_ID,
    formId:formId,
    formTitle:String(formApi.info && formApi.info.title || ''),
    driveMimeType:String(driveFile.mimeType || ''),
    classroomReadable:Array.isArray(courses.courses),
    calendarReadable:true
  };
}

function verificarEjecucionRemota(envelope) {
  const e = envelope && typeof envelope === 'object' ? envelope : {};
  const functionName = String(e.functionName || '').trim();
  const result = e.result && typeof e.result === 'object' ? e.result : {};
  const parameters = Array.isArray(e.parameters) ? e.parameters : [];
  if (!functionName) throw new Error('La verificación requiere functionName.');

  if (functionName === 'diagnosticarInfraestructuraEjecucion') {
    if (result.ok !== true || result.safe !== true) throw new Error('El diagnóstico seguro no confirmó ok/safe.');
    return Object.assign({verification:'SAFE_DIAGNOSTIC'}, result);
  }

  if (functionName === 'repararQuizPruebaCorreoVerificado' || functionName === 'verificarQuizPruebaCorreoVerificado') {
    return verificarQuizPruebaCorreoVerificado();
  }

  const courseId = String(result.courseId || (parameters[0] && parameters[0].courseId) || '').trim();
  const workId = String(result.workId || '').trim();
  if (courseId && workId) {
    const work = Classroom.Courses.CourseWork.get(courseId, workId);
    if (String(work.state || '').toUpperCase() !== 'DRAFT') throw new Error('CourseWork real no está DRAFT: ' + workId + '.');

    const verification = {
      ok:true,
      verification:'CLASSROOM_REAL_RESOURCE',
      courseId:courseId,
      workId:workId,
      state:String(work.state || ''),
      title:String(work.title || '')
    };

    const formId = String(result.formId || '').trim();
    if (formId) {
      const apiForm = formsGet_(formId);
      const driveForm = Drive.Files.get(formId, {fields:'id,name,mimeType,trashed'});
      verifyVerifiedEmail_(formId);
      if (driveForm.trashed === true || String(driveForm.mimeType) !== 'application/vnd.google-apps.form') {
        throw new Error('Drive no confirmó un Google Form activo: ' + formId + '.');
      }
      const linked = (work.materials || []).some(function(material) {
        return material.link && String(material.link.url || '').indexOf(formId) >= 0;
      });
      if (!linked) throw new Error('Classroom no contiene el enlace al Form creado.');
      verification.formId = String(apiForm.formId || '');
      verification.formVerified = true;
    }

    const documentId = String(result.documentId || '').trim();
    if (documentId) {
      const file = Drive.Files.get(documentId, {fields:'id,name,mimeType,trashed'});
      if (file.trashed === true || String(file.mimeType) !== 'application/vnd.google-apps.document') {
        throw new Error('Drive no confirmó el Google Doc de la práctica.');
      }
      const studentCopy = (work.materials || []).some(function(material) {
        return material.driveFile && material.driveFile.driveFile &&
          String(material.driveFile.driveFile.id) === documentId &&
          String(material.driveFile.shareMode || '').toUpperCase() === 'STUDENT_COPY';
      });
      if (!studentCopy) throw new Error('La práctica real no conserva STUDENT_COPY.');
      verification.documentId = documentId;
      verification.documentVerified = true;
    }

    verificarAuditoriaRemota_(result, courseId, workId);
    verification.sheetAuditVerified = true;
    return verification;
  }

  if (result.ok !== true) throw new Error('La función no devolvió un recurso verificable ni ok=true: ' + functionName + '.');
  return {ok:true, verification:'RESULT_CONTRACT', functionName:functionName};
}

function verificarAuditoriaRemota_(result, courseId, workId) {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  if (result.quizId || result.formId) {
    const sheet = requireSheet_(ss, QUIZ_PIPELINE.QUIZZES_SHEET);
    const records = readObjects_(sheet);
    const hit = records.find(function(r) {
      return clean_(r.data['ID del curso']) === courseId &&
        clean_(r.data['ID actividad Classroom']) === workId &&
        (!result.formId || clean_(r.data['ID del Form']) === String(result.formId));
    });
    if (!hit) throw new Error('Sheets no contiene la auditoría del quiz/examen creado.');
    return true;
  }

  const sheet = requireSheet_(ss, 'Tareas');
  const hit = readObjects_(sheet).find(function(r) {
    return clean_(r.data['ID curso']) === courseId && clean_(r.data['ID Classroom']) === workId;
  });
  if (!hit) throw new Error('Sheets no contiene la auditoría del CourseWork creado.');
  return true;
}

function verificarQuizPruebaCorreoVerificado() {
  const quizId = 'TEST-QUIZ-20260914-SO-3Q-001';
  const expectedFormId = '1kTGYxRqC6kka6mpCtUvrVKeMiYkYFToWLTPMK18uU7o';
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sheet = requireSheet_(ss, QUIZ_PIPELINE.QUIZZES_SHEET);
  const record = readObjects_(sheet).find(function(r) { return clean_(r.data['Quiz ID']) === quizId; });
  if (!record) throw new Error('No existe la fila del quiz de prueba ' + quizId + '.');
  const formId = required_(record.data, 'ID del Form');
  if (formId !== expectedFormId) throw new Error('El Quiz ID de prueba apunta a un Form inesperado: ' + formId + '.');

  const email = verifyVerifiedEmail_(formId);
  const form = FormApp.openById(formId);
  const titles = form.getItems().map(function(item) { return item.getTitle(); });
  assertNoManualEmailQuestions_(titles, 'Form de prueba verificado');
  const gradable = form.getItems().filter(function(item) {
    const type = item.getType();
    return type === FormApp.ItemType.MULTIPLE_CHOICE ||
      type === FormApp.ItemType.CHECKBOX ||
      type === FormApp.ItemType.LIST ||
      type === FormApp.ItemType.TEXT;
  });
  if (gradable.length !== 3) throw new Error('El Form de prueba debe tener exactamente 3 reactivos; encontrados: ' + gradable.length + '.');
  const driveFile = Drive.Files.get(formId, {fields:'id,mimeType,trashed'});
  if (driveFile.trashed === true || String(driveFile.mimeType) !== 'application/vnd.google-apps.form') {
    throw new Error('Drive no confirmó el Form de prueba activo.');
  }
  return {
    ok:true,
    verification:'TEST_QUIZ_REAL_RESOURCES',
    quizId:quizId,
    formId:formId,
    emailCollectionType:email.emailCollectionType,
    limitOneResponse:email.limitOneResponse,
    manualEmailQuestions:0,
    reactivos:gradable.length,
    sheetRow:record.row,
    driveVerified:true
  };
}
