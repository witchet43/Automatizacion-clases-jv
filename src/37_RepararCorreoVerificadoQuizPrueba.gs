/** Reparación directa y verificable del quiz de prueba de 3 preguntas. */
function repararQuizPruebaCorreoVerificado() {
  return ejecutarConNotificacionError_('REPARAR_CORREO_VERIFICADO_QUIZ_PRUEBA', {}, function () {
    const quizId = 'TEST-QUIZ-20260914-SO-3Q-001';
    const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const sheet = requireSheet_(ss, QUIZ_PIPELINE.QUIZZES_SHEET);
    const records = readObjects_(sheet);
    const record = records.find(function(r) { return clean_(r.data['Quiz ID']) === quizId; });
    if (!record) throw new Error('No existe la fila del quiz de prueba ' + quizId + '.');
    const formId = required_(record.data, 'ID del Form');
    const result = repararCorreoVerificadoForm_(formId);
    const form = FormApp.openById(formId);
    assertNoManualEmailQuestions_(form.getItems().map(function(item) { return item.getTitle(); }), 'Form reparado');
    const items = form.getItems().filter(function(item) {
      const type = item.getType();
      return type === FormApp.ItemType.MULTIPLE_CHOICE || type === FormApp.ItemType.CHECKBOX || type === FormApp.ItemType.LIST || type === FormApp.ItemType.TEXT;
    });
    if (items.length !== 3) throw new Error('El Form reparado no contiene exactamente 3 reactivos calificables; encontrados: ' + items.length + '.');
    writeOutputs_(sheet, record, {
      'Última actualización': new Date(),
      'Resultado / error': 'CORREO_VERIFICADO; emailCollectionType=VERIFIED; una respuesta por usuario; 3 reactivos verificados.'
    });
    SpreadsheetApp.flush();
    return {
      ok: true,
      quizId: quizId,
      formId: formId,
      emailCollectionType: result.emailCollectionType,
      limitOneResponse: result.limitOneResponse,
      reactivos: items.length
    };
  });
}
