/**
 * Puente interno para resolver/asignar la unidad bajo la autorización del
 * propietario del Apps Script cuando la llamada remota Execution API no porta
 * el scope incremental classroom.courseworkmaterials.readonly.
 */
const QUIZ_UNIT_TRIGGER_REQUEST_KEY = 'QUIZ_UNIT_TRIGGER_REQUEST_V1';
const QUIZ_UNIT_TRIGGER_RESULT_KEY = 'QUIZ_UNIT_TRIGGER_RESULT_V1';
const QUIZ_UNIT_TRIGGER_HANDLER = 'ejecutarAsignacionUnidadQuizSencilloTrigger_';

function programarAsignacionUnidadQuizSencilloExistente(courseId, workId) {
  const id = String(courseId || '').trim();
  const wid = String(workId || '').trim();
  if (!id || !wid) throw new Error('courseId y workId son obligatorios.');

  const requestId = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  props.setProperty(QUIZ_UNIT_TRIGGER_REQUEST_KEY, JSON.stringify({
    requestId: requestId,
    courseId: id,
    workId: wid,
    createdAt: new Date().toISOString()
  }));
  props.deleteProperty(QUIZ_UNIT_TRIGGER_RESULT_KEY);

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === QUIZ_UNIT_TRIGGER_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(QUIZ_UNIT_TRIGGER_HANDLER).timeBased().after(1000).create();

  return {ok:true,status:'SCHEDULED',requestId:requestId,courseId:id,workId:wid};
}

function ejecutarAsignacionUnidadQuizSencilloTrigger_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(QUIZ_UNIT_TRIGGER_REQUEST_KEY);
  let request = null;
  let result;
  try {
    if (!raw) throw new Error('No existe solicitud pendiente de asignación de unidad.');
    request = JSON.parse(raw);
    const assigned = asignarUnidadAQuizSencilloExistente(request.courseId, request.workId);
    result = {
      ok:true,
      status:'COMPLETED',
      requestId:String(request.requestId || ''),
      completedAt:new Date().toISOString(),
      assigned:assigned
    };
  } catch (err) {
    result = {
      ok:false,
      status:'ERROR',
      requestId:String(request && request.requestId || ''),
      completedAt:new Date().toISOString(),
      error:String(err && err.message || err)
    };
  } finally {
    props.setProperty(QUIZ_UNIT_TRIGGER_RESULT_KEY, JSON.stringify(result));
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === QUIZ_UNIT_TRIGGER_HANDLER) ScriptApp.deleteTrigger(trigger);
    });
  }
}

function leerResultadoAsignacionUnidadQuizSencillo() {
  const raw = PropertiesService.getScriptProperties().getProperty(QUIZ_UNIT_TRIGGER_RESULT_KEY);
  if (!raw) return {ok:true,status:'PENDING'};
  return JSON.parse(raw);
}
