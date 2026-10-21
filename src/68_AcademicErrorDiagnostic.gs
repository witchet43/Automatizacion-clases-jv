/**
 * Read-only academic write diagnostics. No new transport, endpoint, or service.
 * Never persist the request body, HMAC, raw exception message, students, or credentials.
 * Original exception is retained in the signed failure response and Apps Script runtime.
 */
function detallarFalloAcademicoWeb_(err,request) {
  const original=String(err&&err.message?err.message:err);
  const match=original.match(/^([A-Z][A-Z0-9_]{2,79})(?::|$)/);
  let code=match?match[1]:'ACADEMIC_WEBAPP_EXECUTION_FAILED';
  let cause=match?'CANONICAL_ERROR_CODE':'UNCLASSIFIED_EXECUTION_FAILURE';
  if(/TAREA requiere fechaSiguienteSesion|horaInicioSiguienteSesion/i.test(original)){
    code='TASK_NEXT_SESSION_CONTEXT_MISSING';cause='MISSING_SESSION_CONTEXT';
  }else if(/No se puede crear una TAREA después|vencimiento de una TAREA debe seguir estando en el futuro/i.test(original)){
    code='TASK_DUE_PAST';cause='PAST_TASK_DUE';
  }else if(/El vencimiento de una TAREA no puede ser posterior/i.test(original)){
    code='TASK_DUE_AFTER_SESSION';cause='INVALID_TASK_DUE';
  }
  const stage=/^(ACADEMIC_WRITE_|ACADEMIC_CONTEXT_|UNKNOWN_CANONICAL_COURSE)/.test(code)
    ? 'AUTHORIZATION_OR_CONTEXT' :
    /^(TASK_|BLOCKED_|ACADEMIC_READINESS_)/.test(code)
    ? 'PREFLIGHT_OR_POLICY' : 'ACADEMIC_EXECUTION';
  const requestId=String(request&&request.requestId||'');
  const courseId=String(request&&request.courseId||'');
  const frames=String(err&&err.stack||'').split('\n').slice(1,6);
  const sourceLocation=frames.map(function(line){
    const m=String(line).match(/at\s+([A-Za-z_$][\w.$]*)(?:\s*\(|\s|$)/);
    return m?m[1].slice(0,80):'';
  }).filter(Boolean).slice(0,3);
  return {
    code:code,stage:stage,cause:cause,
    action:String(request&&request.action||'').slice(0,30),
    operation:String(request&&(request.operation||request.action)||'').slice(0,30),
    courseId:/^\d{8,20}$/.test(courseId)?courseId:'',
    requestIdHint:/^[A-Za-z0-9_-]{12,96}$/.test(requestId)?requestId.slice(-12):'',
    sourceLocation:sourceLocation,
    at:new Date().toISOString()
  };
}

function leerUltimoFalloAcademicoWeb_(courseId) {
  try {
    const raw=PropertiesService.getScriptProperties().getProperty('ACADEMIC_LAST_WEBAPP_WRITE_FAILURE');
    if(!raw)return null;
    const x=JSON.parse(String(raw));
    // Diagnostic is available only in the specific course and never discloses
    // another course's request, student data or original exception.
    if(!x||x.courseId!==String(courseId))return null;
    return {
      code:String(x.code||'').slice(0,80),
      stage:String(x.stage||'').slice(0,40),
      cause:String(x.cause||'').slice(0,60),
      operation:String(x.operation||'').slice(0,30),
      action:String(x.action||'').slice(0,30),
      requestIdHint:String(x.requestIdHint||'').slice(0,12),
      sourceLocation:Array.isArray(x.sourceLocation)?x.sourceLocation.slice(0,3):[],
      at:String(x.at||'').slice(0,30)
    };
  }catch(ignore){return null;}
}
