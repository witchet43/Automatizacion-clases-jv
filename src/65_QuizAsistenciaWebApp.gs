// Canonical context republish requested 2026-10-27; no execution behavior changed.
/**
 * WEB APP ACADÉMICO CANÓNICO
 *
 * Transporte remoto único para operaciones académicas sobre Google Workspace.
 * La lógica académica vive en los entrypoints canónicos; este archivo solo:
 *  - valida acción;
 *  - resuelve courseId desde el registro fijo del periodo;
 *  - normaliza parámetros mínimos;
 *  - delega;
 *  - devuelve JSON verificable.
 *
 * Auditoría transversal disponible: auditarIdentidadClassroom (solo lectura).
 * Operaciones de creación admitidas:
 *  quizAsistencia, actividad, tarea, practica, quiz, examen, material, clase.
 *
 * "clase" es exclusivamente la FASE DE RECURSOS: materializa/reutiliza primero
 * Tareas, Actividades, Prácticas y demás recursos Google ya diseñados.
 * Gamma se genera DESPUÉS, con sus IDs/URLs reales verificados como referencias.
 * La fecha actual y Calendar nunca identifican ni secuencian la clase.
 */
// UAQ_EXECUTOR_SINGLE_ROUTINE_GATEWAY: routine academic mutations enter only through uaqExecutor.
const ACADEMIC_WEB = Object.freeze({
  COURSE_REGISTRY_SOURCE:'ACADEMIC_CONTEXT_CONFIG',
  ACTIONS:Object.freeze(['uaqExecutor','resolverClase','diagnosticarClase','auditarIdentidadClassroom','eliminarDrafts','listarEntregasEvaluables','leerEvidenciaEntrega','guardarEvaluacionDraft','diagnosticarFirma']),
  ROUTINE_OPERATIONS:Object.freeze(['quizAsistencia','actividad','tarea','practica','quiz','examen','material','clase','cerrarUnidad','cerrarMateria']),
  FAST_PATHS:Object.freeze({
    quizAsistencia:Object.freeze({singleExternalInput:'materia',firstExternalAction:'WEB_APP',preflightReadsAllowed:false,documentationRead:false,auxiliaryReads:false,diagnosticOnlyAfterError:true})
  })
});
function cursosAcademicosWeb_(){
  if(typeof ACADEMIC_CONTEXT_CONFIG==='undefined'||!ACADEMIC_CONTEXT_CONFIG.courses)
    throw new Error('ACADEMIC_CONTEXT_CONFIG_MISSING');
  const out={};
  Object.keys(ACADEMIC_CONTEXT_CONFIG.courses).forEach(function(key){
    const c=ACADEMIC_CONTEXT_CONFIG.courses[key]||{};
    if(c.id&&c.materia)out[key]={id:String(c.id),materia:String(c.materia)};
  });
  return out;
}


function doGet(e){
  // No academic mutation may be reached via a URL/query string.
  const params=e&&e.parameter?e.parameter:{};
  if(['diagnosticarClase','auditarIdentidadClassroom'].indexOf(String(params.action||''))<0)
    return respuestaAcademicaWeb_({ok:false,error:'ACADEMIC_READ_ONLY_GET_REQUIRED'});
  return ejecutarServicioAcademicoWeb_(params);
}

function doPost(e){
  let params={};
  const raw=e&&e.postData?String(e.postData.contents||''):'';
  if(raw){
    try{params=JSON.parse(raw);}
    catch(err){return respuestaAcademicaWeb_({ok:false,error:'JSON_INVALIDO'});}
  }else if(e&&e.parameter){
    params=e.parameter;
  }
  return ejecutarServicioAcademicoWeb_(params);
}

function ejecutarServicioAcademicoWeb_(params){
  try{
    const p=params&&typeof params==='object'?params:{};
    const action=String(p.action||'').trim();
    if(!action)throw new Error('ACCION_REQUERIDA');
    if(ACADEMIC_WEB.ACTIONS.indexOf(action)<0)throw new Error('ACCION_NO_PERMITIDA');
    if(action==='diagnosticarFirma'){
      // Dedicated non-mutating diagnostic. Only boolean comparisons are disclosed.
      // Never access Classroom or return keys, full signatures, fingerprints or receipts.
      const d=p.diagnostic;
      if(!d||typeof d!=='object'||
         !/^[a-f0-9]{32}$/.test(String(d.challenge||''))||
         !/^[a-f0-9]{64}$/.test(String(d.proof||'')))
        throw new Error('ACADEMIC_HMAC_DIAGNOSTIC_INVALID');
      const props=PropertiesService.getScriptProperties();
      const key=String(props.getProperty('ACADEMIC_WRITE_HMAC_KEY')||'').trim();
      if(key.length<32)throw new Error('ACADEMIC_WRITE_KEY_NOT_CONFIGURED');
      const expected=bytesHexAcademicWrite_(Utilities.computeHmacSha256Signature(
        'academic-hmac-key-equivalence:'+d.challenge,key,Utilities.Charset.UTF_8));
      const keyEquivalent=constantTimeEqualsAcademicWrite_(expected,d.proof);
      let signatureAccepted=false;
      try{
        validateAcademicWriteAuthorization_(p,props);
        signatureAccepted=true;
      }catch(err){
        if(String(err&&err.message||err)!=='ACADEMIC_WRITE_AUTH_INVALID')throw err;
      }
      return respuestaAcademicaWeb_({
        ok:true,action:'diagnosticarFirma',keyEquivalent,signatureAccepted
      });
    }
    if(['listarEntregasEvaluables','leerEvidenciaEntrega','guardarEvaluacionDraft'].indexOf(action)<0)validarContratoOperacionWeb_(action);
    if(['listarEntregasEvaluables','leerEvidenciaEntrega','guardarEvaluacionDraft'].indexOf(action)>=0){
      // Academic grading operations are POST-only; mutating calls use HMAC + replay protection.
      // Student submissions and evidence are private: authenticate READS too.
      // Unlike mutations, reads require no one-time receipt.
      validateAcademicWriteAuthorization_(p,PropertiesService.getScriptProperties());
      const course=resolverCursoAcademicoWeb_(p);
      const payload=p.params&&typeof p.params==='object'?p.params:p;
      const workId=String(payload.courseWorkId||'');
      if(!/^\d+$/.test(workId))throw new Error('COURSEWORK_ID_INVALID');
      if(action==='listarEntregasEvaluables')
        return respuestaAcademicaWeb_({ok:true,action:action,result:listarEntregasEvaluables_(course.id,workId)});
      if(action==='leerEvidenciaEntrega'){
        const submissionId=String(payload.submissionId||'');
        const fileId=String(payload.driveFileId||'');
        const listing=listarEntregasEvaluables_(course.id,workId);
        const target=listing.submissions.find(function(x){return x.submissionId===submissionId;});
        if(!target||target.state!=='TURNED_IN'||!target.attachments.some(function(a){return a.driveFileId===fileId;}))
          throw new Error('EVIDENCE_NOT_IN_SUBMISSION');
        return respuestaAcademicaWeb_({ok:true,action:action,result:leerEvidenciaEntrega_(fileId)});
      }
      if(action==='guardarEvaluacionDraft'){
        const gradeRequest=Object.assign({},payload,{courseId:String(course.id)});
        const result=executeAuthenticatedAcademicWrite_(p,function(){
          return guardarEvaluacionContenidoDraft_(gradeRequest);
        });
        return respuestaAcademicaWeb_({ok:true,action:action,result:result});
      }
    }
    const operationalContext=validarArranqueAcademicoWeb_(action,p);

    if(action==='uaqExecutor'){
      const gatewayResult=executeAuthenticatedAcademicWrite_(p,function(){
        return ejecutarUaqExecutorWeb_(p);
      });
      return respuestaAcademicaWeb_(Object.assign({
        ok:true,
        transport:'WEB_APP',
        action:'uaqExecutor',
        operation:String(p.operation||'').trim(),
        operationalContext:operationalContext
      },gatewayResult));
    }
    if(action==='quizAsistencia')validarEntradaQuizAsistenciaWeb_(p);
    if(action==='auditarIdentidadClassroom'){
      const audit=auditarIdentidadClassroomWeb_(p);
      return respuestaAcademicaWeb_(Object.assign({ok:true,transport:'WEB_APP',action:action,operationalContext:operationalContext},audit));
    }
    const course=resolverCursoFastPathAcademicoWeb_(action,p)||resolverCursoAcademicoWeb_(p);
    let result;

    if(action==='quizAsistencia'){
      result=crearQuizAsistenciaRapido(String(p.materia||'').trim(),String(p.requestId||'').trim());
    }else if(action==='diagnosticarClase'){
      result=diagnosticarProgresoClaseWeb_(course,p);
    }else if(action==='eliminarDrafts'){
      result=executeAuthenticatedAcademicWrite_(p,function(){
        return eliminarCourseWorkDraftsWeb_(course,p);
      });
    }else if(action==='resolverClase'){
      result=resolverSiguienteClase(
        course.materia,
        String(p.requestedSession||p.sesion||'').trim(),
        p.options&&typeof p.options==='object'?p.options:{}
      );
    }else if(action==='clase'){
      result=crearPaqueteClaseWeb_(course,p);
    }else if(action==='material'){
      result=crearMaterialDidacticoWeb_(course,p);
    }else{
      const payload=normalizarPayloadAcademicoWeb_(course,p);
      if(action==='actividad')result=crearActividad(payload);
      if(action==='tarea')result=crearTarea(payload);
      if(action==='practica')result=crearPractica(payload);
      if(action==='quiz')result=crearQuiz(payload);
      if(action==='examen')result=crearExamen(payload);
    }

    return respuestaAcademicaWeb_(Object.assign({
      ok:true,
      transport:'WEB_APP',
      action:action,
      operationalContext:operationalContext,
      courseId:course.id,
      materia:course.materia
    },result&&typeof result==='object'?result:{result:result}));
  }catch(err){
    const original=String(err&&err.message?err.message:err);
    const request=params&&typeof params==='object'?params:{};
    const details=detallarFalloAcademicoWeb_(err,request);
    // Log only safe codes/locations. No payload, HMAC or student information.
    try{
      PropertiesService.getScriptProperties().setProperty(
        'ACADEMIC_LAST_WEBAPP_WRITE_FAILURE',JSON.stringify(details));
      console.error('ACADEMIC_WEBAPP_FAILURE '+JSON.stringify(details));
    }catch(ignore){}
    // Original explanation stays in the authenticated write response; the
    // read-only diagnostic exposes only code, phase, location and correlation.
    return respuestaAcademicaWeb_({
      ok:false,errorCode:details.code,error:original,
      errorDetails:{code:details.code,stage:details.stage,cause:details.cause,
        requestIdHint:details.requestIdHint,sourceLocation:details.sourceLocation,loggedAt:details.at,
        mismatchFields:Array.isArray(err&&err.mismatchFields)?err.mismatchFields:undefined}
    });
  }
}

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

/**
 * Canonical explicit authorized unit closing operation.
 * Classroom assignment is PUBLISHED; all students' grades remain draftGrade.
 * Cannot be tunneled through the draft-only actividad operation.
 */
function validarCierreUnidadWeb_(p,source){
  const n=normalizarUnidadOperacion_(source&&source.unidad);
  const title=ACADEMIC_POLICY.CLASSROOM.FINAL_GRADE_PREFIX+extraerNumeroUnidad_(n);
  if(String(source&&source.titulo||'').trim()!==title||
     String(p&&p.title||'').trim()!==title)
    throw new Error('UNIT_GRADE_TITLE_MISMATCH');
  if(String(source&&source.modo||'')!=='PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY')
    throw new Error('UNIT_GRADE_EXPLICIT_POSTING_INTENT_REQUIRED');
  if(source&&('alumnos' in source||'notas' in source||'calificaciones' in source))
    throw new Error('UNIT_GRADE_SCORES_MUST_COME_FROM_CLASSROOM');
  return n;
}

function ejecutarUaqExecutorWeb_(p){
  const operation=String(p&&p.operation||'').trim();
  if(ACADEMIC_WEB.ROUTINE_OPERATIONS.indexOf(operation)<0)
    throw new Error('UAQ_EXECUTOR_OPERATION_INVALID: '+operation);
  const source=p&&p.params&&typeof p.params==='object'?Object.assign({},p.params):{};
  const course=resolverCursoAcademicoWeb_({
    courseId:String(p&&p.courseId||source.courseId||'').trim(),
    course:String(p&&p.course||'').trim(),
    courseKey:String(p&&p.courseKey||'').trim(),
    materia:String(p&&p.materia||source.materia||'').trim()
  });
  let result;
  if(operation==='quizAsistencia'){
    result=crearQuizAsistenciaRapido(String(course.materia||'').trim(),String(p&&p.requestId||source.requestId||'').trim());
  }else if(operation==='clase'){
    result=crearPaqueteClaseWeb_(course,source);
  }else if(operation==='material'){
    result=crearMaterialDidacticoWeb_(course,{params:source});
  }else if(operation==='cerrarMateria'){
    const unidades=Array.isArray(source.unidades)?source.unidades:[];
    const ponderaciones=Array.isArray(source.ponderaciones)?source.ponderaciones:undefined;
    if(String(source.titulo||'')!=='Calificación Final del Curso'||
       String(p.title||'')!=='Calificación Final del Curso'||
       String(source.modo||'')!=='PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY')
      throw new Error('COURSE_CLOSE_TITLE_OR_MODE_INVALID');
    result=cerrarMateria({courseId:String(course.id),unidades:unidades,ponderaciones:ponderaciones});
  }else if(operation==='cerrarUnidad'){
    const unidad=validarCierreUnidadWeb_(p,source);
    result=cerrarUnidad({courseId:String(course.id),unidad:unidad});
  }else{
    const payload=normalizarPayloadAcademicoWeb_(course,{params:source});
    if(operation==='actividad')result=crearActividad(payload);
    if(operation==='tarea')result=crearTarea(payload);
    if(operation==='practica')result=crearPractica(payload);
    if(operation==='quiz')result=crearQuiz(payload);
    if(operation==='examen')result=crearExamen(payload);
  }
  return Object.assign({
    gateway:'UAQ_EXECUTOR',
    operation:operation,
    courseId:String(course.id),
    materia:String(course.materia),
    alternativeRouteUsed:false,
    gatewayPostflight:'ENTRYPOINT_RESULT'
  },result&&typeof result==='object'?result:{result:result});
}

function validarContratoOperacionWeb_(action){
  if(action==='uaqExecutor')return {mode:'GATEWAY',state:'DRAFT'};
  const contracts=ACADEMIC_POLICY&&ACADEMIC_POLICY.EXECUTION?ACADEMIC_POLICY.EXECUTION.OPERATION_CONTRACTS:null;
  if(!contracts||!contracts[action])throw new Error('CONTRATO_OPERACION_NO_DEFINIDO: '+action);
  return contracts[action];
}

function auditarIdentidadClassroomWeb_(p){
  const options=p&&typeof p==='object'?p:{};
  const requested=String(options.materia||options.courseId||'').trim();
  const unique={};
  Object.keys(cursosAcademicosWeb_()).forEach(function(k){
    const course=cursosAcademicosWeb_()[k];
    unique[String(course.id)]=course;
  });
  const materias=[];
  Object.keys(unique).forEach(function(id){
    const course=unique[id];
    if(requested){
      const reqNorm=normalizarNombreCursoRapido_(requested);
      const courseNorm=normalizarNombreCursoRapido_(course.materia);
      if(String(course.id)!==requested && reqNorm!==courseNorm && courseNorm.indexOf(reqNorm)<0 && reqNorm.indexOf(courseNorm)<0)return;
    }
    const works=listarCourseWorkClase_(course.id).filter(function(w){
      return /^(?:tarea|actividad|pr[aá]ctica)\b/i.test(String(w.title||'').trim()) &&
        ['DRAFT','PUBLISHED'].indexOf(String(w.state||'').toUpperCase())>=0;
    });
    const recursos=[];
    works.forEach(function(w){
      const docs=extraerDocumentosAdjuntosAuditoria_(w).map(function(doc){
        return inspeccionarEncabezadoIdentidadDocumento_(doc);
      });
      recursos.push({
        workId:String(w.id||''),
        title:String(w.title||''),
        state:String(w.state||''),
        documents:docs
      });
    });
    materias.push({
      materia:course.materia,
      courseId:String(course.id),
      recursosRevisados:recursos.length,
      documentosRevisados:recursos.reduce(function(n,r){return n+r.documents.length;},0),
      documentosConEncabezado:recursos.reduce(function(n,r){return n+r.documents.filter(function(d){return d.hasIdentityHeader===true;}).length;},0),
      recursos:recursos
    });
  });
  return {
    diagnostic:true,
    readOnly:true,
    scope:'7_CLASSROOM_COURSES_TASK_ACTIVITY_PRACTICE_DRAFT_PUBLISHED',
    materias:materias,
    requestedMateria:requested,
    totalMaterias:materias.length,
    totalRecursos:materias.reduce(function(n,m){return n+m.recursosRevisados;},0),
    totalDocumentos:materias.reduce(function(n,m){return n+m.documentosRevisados;},0),
    totalConEncabezado:materias.reduce(function(n,m){return n+m.documentosConEncabezado;},0)
  };
}

function extraerDocumentosAdjuntosAuditoria_(work){
  const out=[],seen={};
  (work.materials||[]).forEach(function(m){
    const holder=m&&m.driveFile&&m.driveFile.driveFile?m.driveFile.driveFile:(m&&m.driveFile?m.driveFile:null);
    const id=String(holder&&holder.id||'').trim();
    if(!id||seen[id])return;
    seen[id]=true;
    let file=null;
    try{file=Drive.Files.get(id,{fields:'id,name,mimeType,webViewLink'});}catch(ignore){}
    if(!file)return;
    out.push({
      id:String(file.id||id),
      name:String(file.name||holder.title||''),
      mimeType:String(file.mimeType||''),
      url:String(file.webViewLink||holder.alternateLink||'')
    });
  });
  return out;
}

function inspeccionarEncabezadoIdentidadDocumento_(doc){
  const result=Object.assign({},doc,{hasIdentityHeader:false,identityFields:[],inspection:'UNSUPPORTED_NON_GOOGLE_DOC'});
  if(String(doc.mimeType)!=='application/vnd.google-apps.document')return result;
  try{
    const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(String(doc.id))+
      '/export?mimeType='+encodeURIComponent('text/plain');
    const response=UrlFetchApp.fetch(url,{
      method:'get',
      headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      muteHttpExceptions:true
    });
    const code=Number(response.getResponseCode());
    if(code<200||code>=300)throw new Error('Drive export HTTP '+code+': '+String(response.getContentText()||'').slice(0,250));
    const text=String(response.getContentText()||'');
    const fields=[];
    if(/Nombre del alumno\s*:/i.test(text))fields.push('Nombre del alumno');
    if(/(?:^|\n)\s*Grupo\s*:/i.test(text))fields.push('Grupo');
    if(/(?:^|\n).*\bFecha\s*:/i.test(text))fields.push('Fecha');
    result.hasIdentityHeader=fields.length>0;
    result.identityFields=fields;
    result.inspection='DRIVE_EXPORT_TEXT';
  }catch(err){
    result.inspection='ERROR: '+String(err&&err.message?err.message:err);
  }
  return result;
}

function eliminarCourseWorkDraftsWeb_(course,p){
  const ids=Array.isArray(p&&p.workIds)?p.workIds.map(function(x){return String(x||'').trim();}).filter(Boolean):[];
  if(!ids.length)throw new Error('ELIMINAR_DRAFTS_REQUIERE_WORKIDS');
  const deleted=[];
  ids.forEach(function(id){
    const w=Classroom.Courses.CourseWork.get(String(course.id),id);
    if(String(w.state||'').toUpperCase()!=='DRAFT')throw new Error('BLOCKED_DELETE_NON_DRAFT: '+id+' '+String(w.title||''));
    Classroom.Courses.CourseWork.remove(String(course.id),id);
    let postState='NOT_FOUND';
    try{
      const after=Classroom.Courses.CourseWork.get(String(course.id),id);
      postState=String(after&&after.state||'').toUpperCase();
    }catch(err){postState='NOT_FOUND';}
    if(postState!=='NOT_FOUND'&&postState!=='DELETED')throw new Error('POSTFLIGHT_DELETE_DRAFT_FAILED: '+id+' state='+postState);
    deleted.push({workId:id,title:String(w.title||''),previousState:'DRAFT',postState:postState});
  });
  return {deleted:deleted,deletedCount:deleted.length,postflightVerified:true};
}

function diagnosticarProgresoClaseWeb_(course,p){
  const options=p&&typeof p==='object'?p:{};
  const soloClassroom=options.soloClassroom===true;
  const plan=soloClassroom?null:leerPlaneacionSiguienteClase_(course.materia);
  let works=listarCourseWorkClase_(course.id);
  if(options.soloDrafts===true)works=works.filter(function(w){return String(w.state||'').toUpperCase()==='DRAFT';});
  const detalle=options.detalle===true;
  const active=works.map(function(w){
    const item={
      id:String(w.id||''),
      title:String(w.title||''),
      state:String(w.state||''),
      topicId:String(w.topicId||''),
      creationTime:String(w.creationTime||'')
    };
    if(detalle){
      item.description=String(w.description||'');
      item.workType=String(w.workType||'');
      item.maxPoints=w.maxPoints===undefined||w.maxPoints===null?null:Number(w.maxPoints);
      item.materials=(w.materials||[]).map(function(m){
        if(m&&m.form){
          const formUrl=String(m.form.formUrl||'');
          return {type:'FORM',formUrl:formUrl,title:String(m.form.title||''),formSnapshot:inspeccionarFormularioDiagnosticoWeb_(formUrl)};
        }
        if(m&&m.link){
          const linkUrl=String(m.link.url||'');
          return {type:'LINK',url:linkUrl,title:String(m.link.title||''),formSnapshot:/docs\.google\.com\/forms\//i.test(linkUrl)?inspeccionarFormularioDiagnosticoWeb_(linkUrl):null};
        }
        if(m&&m.driveFile){
          const h=m.driveFile.driveFile||m.driveFile;
          return {type:'DRIVE_FILE',id:String(h.id||''),title:String(h.title||''),alternateLink:String(h.alternateLink||'')};
        }
        if(m&&m.youtubeVideo)return {type:'YOUTUBE',id:String(m.youtubeVideo.id||''),title:String(m.youtubeVideo.title||'')};
        return {type:'OTHER'};
      });
    }
    return item;
  }).sort(function(a,b){return String(a.creationTime).localeCompare(String(b.creationTime));});
  return {
    diagnostic:true,
    readOnly:true,
    planningRows:soloClassroom?[]:plan.rows.map(function(r){
      return {session:String(r.session||''),unit:String(r.unit||''),topic:String(r.topic||''),practice:String(r.practice||''),gammaUrl:String(r.gammaUrl||''),gammaState:String(r.gammaState||'')};
    }),
    planningSkipped:soloClassroom,
    ultimoFalloGateway:leerUltimoFalloAcademicoWeb_(course.id),
    courseWork:active
  };
}

function inspeccionarFormularioDiagnosticoWeb_(url){
  const out={ok:false,title:'',description:'',published:null,items:[],error:''};
  if(!String(url||'').trim())return out;
  try{
    const form=FormApp.openByUrl(String(url));
    out.ok=true;
    out.title=String(form.getTitle()||'');
    out.description=String(form.getDescription()||'');
    try{out.published=form.supportsAdvancedResponderPermissions&&form.supportsAdvancedResponderPermissions()===true?form.isPublished():null;}catch(ignore){}
    out.items=form.getItems().map(function(item,index){
      let title='';
      try{title=String(item.getTitle()||'');}catch(ignore){}
      return {index:index+1,type:String(item.getType()||''),title:title};
    });
  }catch(err){out.error=String(err&&err.message?err.message:err);}
  return out;
}

function validarEntradaQuizAsistenciaWeb_(p){
  const allowed={action:true,materia:true,requestId:true};
  Object.keys(p||{}).forEach(function(key){
    if(!allowed[key])throw new Error('QUIZ_ASISTENCIA_PARAMETRO_NO_PERMITIDO: '+key);
  });
  if(!String(p&&p.materia||'').trim())
    throw new Error('QUIZ_ASISTENCIA_REQUIERE_MATERIA');
  return true;
}

function resolverCursoFastPathAcademicoWeb_(action,p){
  const cfg=ACADEMIC_WEB.FAST_PATHS[action];
  if(!cfg)return null;
  if(action==='quizAsistencia'){
    return resolverCursoAcademicoWeb_({materia:String(p.materia||'').trim()});
  }
  return null;
}

function resolverCursoAcademicoWeb_(p){
  const raw=String(p.courseId||p.course||p.courseKey||p.materia||'').trim();
  if(!raw)throw new Error('CURSO_REQUERIDO');
  const norm=normalizarNombreCursoRapido_(raw).replace(/\s+/g,'-');
  if(cursosAcademicosWeb_()[norm])return cursosAcademicosWeb_()[norm];

  const byId=Object.keys(cursosAcademicosWeb_()).map(function(k){
    return cursosAcademicosWeb_()[k];
  }).find(function(c){return String(c.id)===raw;});
  if(byId)return byId;

  const objetivo=normalizarNombreCursoRapido_(raw);
  const unique={};
  Object.keys(cursosAcademicosWeb_()).forEach(function(k){
    const c=cursosAcademicosWeb_()[k];
    unique[c.id]=c;
  });
  const hits=Object.keys(unique).map(function(id){return unique[id];}).filter(function(c){
    const n=normalizarNombreCursoRapido_(c.materia);
    return n===objetivo||n.indexOf(objetivo)>=0||objetivo.indexOf(n)>=0;
  });
  if(hits.length===1)return hits[0];
  if(!hits.length)throw new Error('CURSO_NO_PERMITIDO');
  throw new Error('CURSO_AMBIGUO');
}

function normalizarPayloadAcademicoWeb_(course,p){
  const source=p.params&&typeof p.params==='object'?p.params:p;
  const out=Object.assign({},source);
  delete out.action;
  delete out.course;
  delete out.courseKey;
  delete out.courseId;
  delete out.params;
  delete out.operationalContext;
  out.courseId=course.id;
  if(!String(out.materia||'').trim())out.materia=course.materia;
  return out;
}

/**
 * Orquesta una clase ya diseñada.
 * resources[] debe contener objetos {type, params}.
 * No inventa contenido ni secuencia y no publica nada.
 */
/**
 * Two deterministic phases through the EXISTING class operation:
 * PLAN: read canonical planning + Classroom once, never create a resource.
 * EXECUTE: reuse live resources; normalize/prepare ALL missing documents in
 * memory before the first external write. No extra postflight reads are added.
 */
/**
 * Contrato obligatorio para Gamma. La IA no decide título, carpeta o tema:
 * vienen del curso registrado y del subtema exacto de la planeación.
 * Ninguna URL o texto generado por IA puede sobrescribir este contrato.
 */
function contratoGammaClaseCanonicaWeb_(course,row){
  const courses=typeof ACADEMIC_CONTEXT_CONFIG!=='undefined'&&ACADEMIC_CONTEXT_CONFIG.courses
    ? ACADEMIC_CONTEXT_CONFIG.courses:{};
  const matches=Object.keys(courses).map(function(key){return courses[key];}).filter(function(item){
    return item&&String(item.id||'')===String(course.id||'');
  });
  const configured=matches[0];
  if(!configured||!String(configured.gammaThemeId||'').trim()||
     !String(configured.gammaFolderId||'').trim())
    throw new Error('GAMMA_IDENTITY_MANIFEST_REQUIRED: '+String(course.id||''));
  if(matches.some(function(item){
    return String(item.gammaThemeId)!==String(configured.gammaThemeId)||
      String(item.gammaFolderId)!==String(configured.gammaFolderId);
  }))throw new Error('GAMMA_IDENTITY_MANIFEST_AMBIGUOUS: '+String(course.id));
  const topic=String(row&&row.topic||'').trim();
  if(!topic)throw new Error('GAMMA_CANONICAL_TOPIC_MISSING');
  // Inserta el separador oficial en cada subtema, incluidos temas compuestos.
  const title=topic.replace(/(^|\s+\+\s+)(\d+(?:\.\d+)+)(?:\s*[-–—]\s*|\s+)/g,
    function(_,prefix,num){return prefix+num+' - ';}).replace(/\s+/g,' ').trim();
  return {
    source:'MANIFEST_COURSE_AND_CANONICAL_PLANNING',
    title:title,
    coverTitle:String(row.unit||'').trim()+' · Tema '+title,
    themeId:String(configured.gammaThemeId),
    themeName:String(configured.gammaThemeName||''),
    folderId:String(configured.gammaFolderId),
    folderName:String(configured.gammaFolderName||''),
    requireExactTitle:true,requireExactTheme:true,requireExactFolder:true,
    noDefaultTheme:true,
    instruction:'Gamma.generate debe recibir title, themeId y folderId exactamente como se indican; verificar antes de FINALIZE.'
  };
}
/** Error no bloqueante: solicita reparar el Gamma existente, nunca duplicarlo. */
function verificarIdentidadGammaClaseWeb_(raw,contract){
  const evidence=raw&&typeof raw==='object'?raw:{};
  const issues=[];
  if(String(evidence.title||'').trim()!==contract.title)issues.push('GAMMA_TITLE_MISMATCH');
  if(String(evidence.themeIdSent||'').trim()!==contract.themeId)
    issues.push('GAMMA_THEME_NOT_SENT_FROM_MANIFEST');
  if(evidence.themeRequestVerified!==true)
    issues.push('GAMMA_THEME_REQUEST_UNVERIFIED');
  if(evidence.themeIdReturned!=null&&String(evidence.themeIdReturned)!==contract.themeId)
    issues.push('GAMMA_THEME_RETURNED_MISMATCH');
  // NULL de Gamma no demuestra un tema incorrecto ni uno correcto:
  // exige prueba independiente de aplicación, no basta el argumento enviado.
  if(evidence.themeIdReturned==null&&evidence.themeAppliedVerified!==true)
    issues.push('GAMMA_THEME_APPLIED_NOT_VERIFIED');
  if(String(evidence.folderIdSent||'').trim()!==contract.folderId)
    issues.push('GAMMA_FOLDER_NOT_SENT_FROM_MANIFEST');
  if(evidence.folderRequestVerified!==true)
    issues.push('GAMMA_FOLDER_REQUEST_UNVERIFIED');
  return {valid:issues.length===0,issues:issues,
    action:issues.length?'REPAIR_EXISTING_GAMMA_IDENTITY':'REUSE',
    expected:contract};
}
function planificarClaseCanonicaWeb_(course,p,works){
  const planning=leerPlaneacionSiguienteClase_(course.materia);
  const target=p&&p.target&&typeof p.target==='object'?p.target:{};
  const requested=String(p.requestedSession||p.sesion||target.session||'').trim();
  const supplied=p&&p.options&&typeof p.options==='object'?p.options:{};
  const options={
    explicitTarget:requested!=='',
    gammaLiveEvidence:supplied.gammaLiveEvidence||{},
    notionLiveEvidence:supplied.notionLiveEvidence||{}
  };
  const selection=seleccionarSiguienteClasePorEstadoReal_(planning.rows,works,requested,options);
  if(selection.complete)return {
    package:false,packageStatus:'SEQUENCE_COMPLETE',readOnly:true,
    planningComplete:true,courseId:String(course.id),createdCount:0,reusedCount:0,
    nextPhase:'NONE',resources:[]
  };
  const row=selection.target;
  const evidence=selection.evidence;
  const gammaGeneration=contratoGammaClaseCanonicaWeb_(course,row);
  const gammaRaw=(supplied.gammaLiveEvidence||{})[String(row.session||'')];
  const gammaIdentity=verificarIdentidadGammaClaseWeb_(gammaRaw,gammaGeneration);
  const gammaReady=!evidence.gammaRequired||
    (evidence.gammaVerificada&&gammaIdentity.valid);
  const missingComponents=[];
  if(!evidence.recursoPreparado)missingComponents.push('CLASSROOM');
  if(evidence.gammaRequired&&!gammaReady)missingComponents.push('GAMMA');
  if(!evidence.notionVerificada||
     (evidence.gammaRequired&&!evidence.notionGammaReferenceVerified))
    missingComponents.push('NOTION');
  const canonicalComplete=missingComponents.length===0;
  const existingIds={};
  (evidence.classroomIds||[]).forEach(function(id){existingIds[String(id)]=true;});
  return {
    package:canonicalComplete,packageStatus:canonicalComplete?'COMPLETE':'PLAN_READY',
    complete:canonicalComplete,readOnly:true,
    requiredComponents:['CLASSROOM'].concat(evidence.gammaRequired?['GAMMA']:[],['NOTION']),
    gammaGeneration:gammaGeneration,
    gammaIdentity:gammaIdentity,
    missingComponents:missingComponents,
    courseId:String(course.id),materia:String(course.materia),
    target:{session:String(row.session||''),unit:String(row.unit||''),
      topic:String(row.topic||''),kind:String(row.kind||''),
      practice:String(row.practice||''),previous:String(row.previous||''),
      next:String(row.next||''),gammaState:String(row.gammaState||''),
      gammaUrlCandidate:String(row.gammaUrl||'')},
    sequenceSource:String(selection.source||''),
    historicalBacklog:selection.historicalBacklog||[],
    requiresExternalEvidence:selection.gammaVerificationOnly===true||
      selection.notionVerificationOnly===true,
    gammaDecision:gammaReady?String(evidence.gammaDecision||''):
      gammaIdentity.issues.length?'REPAIR_EXISTING_GAMMA_IDENTITY':String(evidence.gammaDecision||''),
    notionDecision:String(evidence.notionDecision||''),
    existingResources:works.filter(function(w){
      return existingIds[String(w.id||'')]===true;
    }).map(function(w){return {workId:String(w.id),title:String(w.title||''),
      state:String(w.state||'')};}),
    createdCount:0,reusedCount:0,resources:[],
    nextPhase:canonicalComplete?'NONE':
      missingComponents[0]==='CLASSROOM'?'CLASSROOM_RESOURCES':
      missingComponents[0]==='GAMMA'&&gammaRaw?'REPAIR_EXISTING_GAMMA_IDENTITY':
      missingComponents[0]==='GAMMA'?'GENERATE_OR_REUSE_GAMMA':
      'CREATE_OR_REUSE_NOTION_NOTES'
  };
}

function prepararDocumentoRecursoClaseWeb_(item){
  const kind=String(item.type||'').toUpperCase();
  const original=item.payload;
  if(['ACTIVIDAD','TAREA','PRACTICA'].indexOf(kind)<0)return original;
  const p=normalizarCreacionDirecta_(original,kind);
  // An activity requested without a scheduled end is a DRAFT backfill, not
  // a reason to invent an end time or require the caller to know two flags.
  // An explicitly scheduled activity still follows the original due policy.
  if(kind==='ACTIVIDAD'&&!String(p.fechaSesion||p.fechaClase||p.sessionDate||p.classDate||'').trim()&&
      !String(p.horaFinSesion||p.horaFinClase||p.sessionEndTime||p.classEndTime||'').trim()){
    p.backfillDraft=true;
    p.explicitSequenceOverride=true;
  }
  const raw=p.contenidoDocumento!==undefined?p.contenidoDocumento:p.googleDocContent;
  if(raw!==undefined&&String(raw||'').trim()!==''){
    const html=kind==='PRACTICA'
      ? construirHtmlPractica_(item.title,p.descripcion,
          normalizarContenidoPractica_(raw))
      : construirHtmlDocumentoAcademico_(item.title,p.descripcion,raw);
    // Use the same canonical document formatter already invoked during
    // creation, now before any external mutation can take place.
    validarFormatoHtmlDocumentoAcademico_(html,item.title);
  }
  return p;
}

function crearPaqueteClaseWeb_(course,p){
  // Capture timing inside the canonical WebApp invocation: no extra API reads.
  const startedMs=Date.now();
  if(String(p.gammaUrl||'').trim())
    throw new Error('CLASE_RECURSOS_PRIMERO: gammaUrl solo se verifica después de preparar los recursos.');
  const mode=String(p.mode||p.executionMode||'EXECUTE').trim().toUpperCase();
  if(['PLAN','EXECUTE','FINALIZE'].indexOf(mode)<0)
    throw new Error('CLASE_MODO_INVALIDO: PLAN, EXECUTE o FINALIZE');
  if(mode==='FINALIZE'&&!String(p.requestedSession||p.sesion||p.target&&p.target.session||'').trim())
    throw new Error('CLASE_FINALIZE_REQUIERE_SESION_EXPLICITA');
  const resources=Array.isArray(p.resources)?p.resources:[];
  const readStartedMs=Date.now();
  const works=listarCourseWorkClase_(course.id);
  const classroomReadMs=Date.now()-readStartedMs;
  // La sesión de un paquete se infiere de la planeación+Classroom cuando no fue
  // informada. El guardrail de cada recurso valida igualdad exacta del tema y
  // de la sesión antes de aceptar cualquier reconciliación retrospectiva.
  let canonicalSession=String(p.requestedSession||p.sesion||p.target&&p.target.session||'').trim();
  if(mode==='EXECUTE'&&resources.length&&!canonicalSession){
    const planning=leerPlaneacionSiguienteClase_(course.materia);
    const selection=seleccionarSiguienteClasePorEstadoReal_(planning.rows,works,'',{});
    if(selection.complete)return {package:false,complete:true,packageStatus:'SEQUENCE_COMPLETE',
      createdCount:0,reusedCount:0,resources:[],nextPhase:'NONE'};
    canonicalSession=String(selection.target.session||'').trim();
  }
  if(mode==='PLAN'||mode==='FINALIZE'||!resources.length){
    const result=planificarClaseCanonicaWeb_(course,p,works);
    result.timingsMs={classroomRead:classroomReadMs,total:Date.now()-startedMs};
    if(mode==='FINALIZE'){
      result.finalizationAttempted=true;
      // Never mark a package complete from a Gamma link in planning or a
      // bare URL supplied by the caller. FINALIZE needs authenticated LIVE
      // evidence for Classroom, Gamma (unless exempt) and Notion.
      result.packageStatus=result.complete?'COMPLETE':'INCOMPLETE';
      result.nextPhase=result.complete?'NONE':result.nextPhase;
    }
    return result;
  }
  // Reuse one title index instead of scanning the whole CourseWork inventory
  // for every resource. Keep all topic, state and duplicate checks unchanged.
  const worksByTitle=Object.create(null);
  works.forEach(function(w){
    const key=String(w.title||'').trim();
    if(!worksByTitle[key])worksByTitle[key]=[];
    worksByTitle[key].push(w);
  });
  const allowed=['actividad','tarea','practica','quiz','material'];
  const seen={};
  const prepared=resources.map(function(item,index){
    const type=String(item&&item.type||'').trim().toLowerCase();
    if(allowed.indexOf(type)<0)
      throw new Error('TIPO_RECURSO_NO_PERMITIDO_EN_CLASE_'+index);
    const payload=normalizarPayloadAcademicoWeb_(course,{
      params:item&&item.params&&typeof item.params==='object'?item.params:{}
    });
    if(canonicalSession){
      payload.sesionCanonica=canonicalSession;
      payload.explicitSequenceOverride=true;
    }
    const title=String(payload.titulo||payload.title||'').trim();
    if(!title)throw new Error('CLASE_RECURSO_TITULO_REQUERIDO_'+index);
    const key=type+'|'+title;
    if(seen[key])throw new Error('CLASE_RECURSO_DUPLICADO_EN_SOLICITUD_'+index);
    seen[key]=true;
    return {type:type,payload:payload,title:title};
  });

  const results=[];
  const pending=[];
  const requiresContent=[];
  prepared.forEach(function(item){
    const type=item.type,payload=item.payload,title=item.title;
    let existing=null;
    if(type!=='material'){
      const matches=(worksByTitle[title]||[]).filter(function(w){
        const state=String(w.state||'').toUpperCase();
        return (state==='DRAFT'||state==='PUBLISHED') &&
          String(w.title||'').trim()===title &&
          (!String(payload.topicId||'').trim() ||
            String(w.topicId||'')===String(payload.topicId));
      });
      if(matches.length>1){
        results.push({type:type,title:title,status:'BLOCKED',result:{
          errorCode:'CLASE_RECURSO_IDENTIDAD_AMBIGUA',
          matchCount:matches.length,creado:false,reutilizado:false
        }});
        return;
      }
      existing=matches[0]||null;
    }
    if(existing){
      const state=String(existing.state||'').toUpperCase();
      const hasDocument=(existing.materials||[]).some(function(m){
        const d=m&&m.driveFile;
        return d&&(d.driveFile||d).id&&
          String(d.shareMode||'').toUpperCase()==='STUDENT_COPY';
      });
      if((type==='practica'||type==='actividad'||type==='tarea')&&!hasDocument){
        if(state==='PUBLISHED'){
          results.push({type:type,title:title,status:'BLOCKED',result:{
            errorCode:'CLASE_RECURSO_PUBLICADO_SIN_DOCUMENTO',
            workId:String(existing.id),creado:false,reutilizado:false
          }});
          return;
        }
        // An existing incomplete DRAFT is repaired only by its established
        // idempotent entrypoint, with no new CourseWork identity.
      }else{
        results.push({type:type,title:title,status:'REUSED',result:{
          workId:String(existing.id),state:state,creado:false,
          reutilizado:true,classroomUrl:String(existing.alternateLink||'')
        }});
        return;
      }
    }
    const source=payload.contenidoDocumento!==undefined
      ?payload.contenidoDocumento:payload.googleDocContent;
    if(['actividad','tarea','practica'].indexOf(type)>=0 &&
       !String(source||'').trim() &&
       !String(payload.documentId||payload.googleDocId||'').trim()){
      requiresContent.push({type:type,title:title,
        errorCode:'CLASE_RECURSO_CONTENIDO_REQUERIDO'});
      return;
    }
    pending.push(item);
  });
  // No mutation until every missing component has content AND the canonical
  // HTML/description can be prepared. This is one batch preparation, not
  // another round of readback or manual validation.
  if(requiresContent.length&&!pending.length)return {
    package:false,packageStatus:'CONTENT_REQUIRED',
    resourcePhaseStatus:'CONTENT_REQUIRED',createdCount:0,
    reusedCount:results.filter(function(r){return r.status==='REUSED';}).length,
    missingResourceContent:requiresContent,
    resourceErrors:results.filter(function(r){return r.status==='BLOCKED';})
      .map(function(r){return {type:r.type,title:r.title,errorCode:r.result.errorCode};}),
    resources:results,nextPhase:'PROVIDE_ONLY_MISSING_CONTENT',
    timingsMs:{classroomRead:classroomReadMs,total:Date.now()-startedMs}
  };
  const preparationStartedMs=Date.now();
  // Un documento faltante o mal formado afecta solamente a su recurso. Los
  // demás continúan; nunca se inventa contenido ni se duplica un CourseWork.
  requiresContent.forEach(function(item){
    results.push({type:item.type,title:item.title,status:'BLOCKED',result:{
      errorCode:item.errorCode,creado:false,reutilizado:false
    }});
  });
  const ready=[];
  pending.forEach(function(item){
    try{
      const payload=prepararDocumentoRecursoClaseWeb_(item);
      ready.push({type:item.type,title:item.title,payload:payload});
    }catch(err){
      results.push({type:item.type,title:item.title,status:'BLOCKED',result:{
        errorCode:String(err&&err.message||err).slice(0,240),
        creado:false,reutilizado:false
      }});
    }
  });
  const resourcePreparationMs=Date.now()-preparationStartedMs;
  const resourceTimings=[];
  const writesStartedMs=Date.now();
  ready.forEach(function(item){
    const resourceStartedMs=Date.now();
    const type=item.type,payload=item.payload,title=item.title;
    let r,retries=0;
    for(let attempt=0;attempt<2;attempt++){
      try{
        if(type==='actividad')r=crearActividad(payload);
        else if(type==='tarea')r=crearTarea(payload);
        else if(type==='practica')r=crearPractica(payload);
        else if(type==='quiz')r=crearQuiz(payload);
        else if(type==='material')r=crearMaterialDidacticoWeb_(course,{params:payload});
        if(!r||r.ok===false||(!r.workId&&!r.documentId&&!r.formId))
          throw new Error('CLASE_RECURSO_RESULTADO_INCIERTO_RECONCILIAR');
        break;
      }catch(err){
        // Únicamente lock-busy se reintenta: ocurrió antes de la escritura.
        // Todo fallo posterior se reporta como incierto y no se reintenta.
        if(attempt===0&&String(err&&err.message||err).indexOf('IDEMPOTENCY_LOCK_BUSY')>=0){
          retries++;
          Utilities.sleep(1000);
          continue;
        }
        results.push({type:type,title:title,status:'BLOCKED',result:{
          errorCode:String(err&&err.message||err).slice(0,240),
          creado:false,reutilizado:false,writeOutcome:'RECONCILE_BEFORE_RETRY'
        }});
        resourceTimings.push({type:type,elapsed:Date.now()-resourceStartedMs,retries:retries});
        return;
      }
    }
    results.push({type:type,title:title,status:r&&r.reutilizado?'REUSED':'CREATED',result:r});
    resourceTimings.push({type:type,elapsed:Date.now()-resourceStartedMs,retries:retries});
  });
  const resourceWritesMs=Date.now()-writesStartedMs;
  const expected=(Array.isArray(p.expectedResourceTypes)?p.expectedResourceTypes:[])
    .map(function(x){return String(x||'').trim().toLowerCase();}).filter(Boolean);
  const actual=results.filter(function(x){return x.status!=='BLOCKED';})
    .map(function(x){return x.type;});
  const missing=expected.filter(function(type){return actual.indexOf(type)<0;});
  const failures=results.filter(function(x){return x.status==='BLOCKED';});
  const created=results.filter(function(x){return x.status==='CREATED';}).length;
  const reused=results.filter(function(x){return x.status==='REUSED';}).length;
  const resourcePhaseStatus=failures.length||missing.length?'PARCIAL':'MATERIALES_LISTOS_PARA_GAMMA';
  return {
    package:false,complete:false,packageStatus:resourcePhaseStatus,
    requiredComponents:['CLASSROOM','GAMMA','NOTION'],
    missingComponents:resourcePhaseStatus==='PARCIAL'?
      ['CLASSROOM','GAMMA','NOTION']:['GAMMA','NOTION'],
    resourcePhaseStatus:resourcePhaseStatus,
    expectedResourceTypes:expected,missingResourceTypes:missing,
    resourceErrors:failures.map(function(x){return {type:x.type,title:x.title,
      errorCode:x.result.errorCode};}),
    createdCount:created,reusedCount:reused,
    allResourcesAlreadyExisted:reused===results.length&&failures.length===0,
    gammaUrl:'',
    nextPhase:'GENERATE_OR_REUSE_GAMMA_AND_NOTION',
    resourceRepairPending:resourcePhaseStatus==='PARCIAL',
    resources:results,
    timingsMs:{classroomRead:classroomReadMs,resourcePreparation:resourcePreparationMs,
      resourceWrites:resourceWritesMs,resources:resourceTimings,total:Date.now()-startedMs}
  };
}

function deduplicarDraftsExactosClaseWeb_(courseId,payload,result){
  const keepId=String(result&&result.workId||'').trim();
  const title=String(payload&&payload.titulo||payload&&payload.title||'').trim();
  if(!keepId||!title)return [];
  let keep;
  try{keep=Classroom.Courses.CourseWork.get(String(courseId),keepId);}catch(err){return [];}
  const topicId=String(keep&&keep.topicId||'');
  const matches=listarCourseWorkClase_(courseId).filter(function(w){
    return String(w.state||'').toUpperCase()==='DRAFT' &&
      String(w.title||'').trim()===title && String(w.topicId||'')===topicId;
  });
  if(matches.length<=1)return [];
  const removed=[];
  matches.forEach(function(w){
    if(String(w.id)===keepId)return;
    Classroom.Courses.CourseWork.remove(String(courseId),String(w.id));
    removed.push({workId:String(w.id),title:String(w.title||'')});
  });
  const remaining=listarCourseWorkClase_(courseId).filter(function(w){
    return String(w.state||'').toUpperCase()==='DRAFT' &&
      String(w.title||'').trim()===title && String(w.topicId||'')===topicId;
  });
  if(remaining.length!==1 || String(remaining[0].id)!==keepId)
    throw new Error('POSTFLIGHT_DUPLICATE_DRAFT: no quedó un único DRAFT canónico para '+title+'.');
  return removed;
}

function crearMaterialDidacticoWeb_(course,p){
  const payload=normalizarPayloadAcademicoWeb_(course,p);
  const titulo=String(payload.titulo||payload.title||'').trim();
  if(!titulo)throw new Error('MATERIAL_REQUIERE_TITULO');
  // Si un material ya existe, su ID verificado permite reutilizarlo,
  // sin crear un documento duplicado ni alterar contenido previo.
  const existingId=String(payload.documentId||'').trim();
  if(existingId){
    const previous=Drive.Files.get(existingId,{fields:'id,name,mimeType,trashed'});
    if(previous.trashed===true ||
       previous.mimeType!=='application/vnd.google-apps.document' ||
       String(previous.name||'').trim()!==titulo)
      throw new Error('MATERIAL_DOCUMENT_IDENTITY_CONFLICT');
    return {material:true,courseId:course.id,documentId:existingId,
      documentName:titulo,documentMime:previous.mimeType,reutilizado:true,creado:false};
  }
  const contenido=payload.contenidoDocumento!==undefined?payload.contenidoDocumento:payload.googleDocContent;
  if(!String(Array.isArray(contenido)?contenido.join('\n'):contenido||'').trim())throw new Error('MATERIAL_REQUIERE_CONTENIDO');
  const doc=crearGoogleDocumentoAcademico_({
    titulo:titulo,
    descripcion:String(payload.descripcion||payload.description||'').trim(),
    contenidoDocumento:contenido
  });
  return {
    material:true,
    courseId:course.id,
    documentId:String(doc.id),
    documentName:String(doc.name||titulo),
    documentMime:String(doc.mimeType||'')
  };
}

function respuestaAcademicaWeb_(payload){
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
