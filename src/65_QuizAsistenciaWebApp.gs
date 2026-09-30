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
const ACADEMIC_WEB = Object.freeze({
  COURSES:Object.freeze({
    'sistemas-distribuidos':Object.freeze({id:'871158466533',materia:'Sistemas Distribuidos'}),
    'analisis-diseno-sistemas-computacionales':Object.freeze({id:'871158479566',materia:'Análisis y Diseño de Sistemas Computacionales'}),
    'analisis-y-diseno-de-sistemas-computacionales':Object.freeze({id:'871158479566',materia:'Análisis y Diseño de Sistemas Computacionales'}),
    'analisis-diseno-sistemas-informacion':Object.freeze({id:'871158479566',materia:'Análisis y Diseño de Sistemas Computacionales'}),
    'analisis-y-diseno-de-sistemas-de-informacion':Object.freeze({id:'871158479566',materia:'Análisis y Diseño de Sistemas Computacionales'}),
    'introduccion-tecnologias-informacion':Object.freeze({id:'871156721160',materia:'Introducción a las Tecnologías de Información'}),
    'administracion':Object.freeze({id:'871158187513',materia:'Administración'}),
    'etica-legislacion-informatica':Object.freeze({id:'871149624583',materia:'Ética y Legislación Informática'}),
    'algoritmos-estructuras-datos':Object.freeze({id:'871156334717',materia:'Algoritmos y Estructuras de Datos'}),
    'sistemas-operativos':Object.freeze({id:'875776451793',materia:'Sistemas Operativos'}),
    'so':Object.freeze({id:'875776451793',materia:'Sistemas Operativos'})
  }),
  ACTIONS:Object.freeze(['quizAsistencia','actividad','tarea','practica','quiz','examen','material','clase','resolverClase','diagnosticarClase','auditarIdentidadClassroom','eliminarDrafts']),
  FAST_PATHS:Object.freeze({
    quizAsistencia:Object.freeze({singleExternalInput:'materia',firstExternalAction:'WEB_APP',preflightReadsAllowed:false,documentationRead:false,auxiliaryReads:false,diagnosticOnlyAfterError:true})
  })
});

function doGet(e){
  return ejecutarServicioAcademicoWeb_(e&&e.parameter?e.parameter:{});
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
    validarContratoOperacionWeb_(action);
    const operationalContext=validarArranqueAcademicoWeb_(action,p);

    if(action==='quizAsistencia')validarEntradaQuizAsistenciaWeb_(p);
    if(action==='auditarIdentidadClassroom'){
      const audit=auditarIdentidadClassroomWeb_(p);
      return respuestaAcademicaWeb_(Object.assign({ok:true,transport:'WEB_APP',action:action,operationalContext:operationalContext},audit));
    }
    const course=resolverCursoFastPathAcademicoWeb_(action,p)||resolverCursoAcademicoWeb_(p);
    let result;

    if(action==='quizAsistencia'){
      result=crearQuizAsistenciaRapido(String(p.materia||'').trim());
    }else if(action==='diagnosticarClase'){
      result=diagnosticarProgresoClaseWeb_(course,p);
    }else if(action==='eliminarDrafts'){
      result=eliminarCourseWorkDraftsWeb_(course,p);
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
    return respuestaAcademicaWeb_({
      ok:false,
      error:String(err&&err.message?err.message:err)
    });
  }
}

function validarContratoOperacionWeb_(action){
  const contracts=ACADEMIC_POLICY&&ACADEMIC_POLICY.EXECUTION?ACADEMIC_POLICY.EXECUTION.OPERATION_CONTRACTS:null;
  if(!contracts||!contracts[action])throw new Error('CONTRATO_OPERACION_NO_DEFINIDO: '+action);
  return contracts[action];
}

function auditarIdentidadClassroomWeb_(p){
  const options=p&&typeof p==='object'?p:{};
  const requested=String(options.materia||options.courseId||'').trim();
  const unique={};
  Object.keys(ACADEMIC_WEB.COURSES).forEach(function(k){
    const course=ACADEMIC_WEB.COURSES[k];
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
    let exists=true;
    try{Classroom.Courses.CourseWork.get(String(course.id),id);}catch(err){exists=false;}
    if(exists)throw new Error('POSTFLIGHT_DELETE_DRAFT_FAILED: '+id);
    deleted.push({workId:id,title:String(w.title||''),previousState:'DRAFT'});
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
  const allowed={action:true,materia:true};
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
  if(ACADEMIC_WEB.COURSES[norm])return ACADEMIC_WEB.COURSES[norm];

  const byId=Object.keys(ACADEMIC_WEB.COURSES).map(function(k){
    return ACADEMIC_WEB.COURSES[k];
  }).find(function(c){return String(c.id)===raw;});
  if(byId)return byId;

  const objetivo=normalizarNombreCursoRapido_(raw);
  const unique={};
  Object.keys(ACADEMIC_WEB.COURSES).forEach(function(k){
    const c=ACADEMIC_WEB.COURSES[k];
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
function crearPaqueteClaseWeb_(course,p){
  if(String(p.gammaUrl||'').trim())
    throw new Error('CLASE_RECURSOS_PRIMERO: gammaUrl no se acepta en la fase de materialización. Genere/verifique Gamma después de obtener IDs/URLs reales de los recursos.');
  const resources=Array.isArray(p.resources)?p.resources:[];
  if(!resources.length)throw new Error('CLASE_REQUIERE_RECURSOS');
  const results=[];
  resources.forEach(function(item,index){
    const type=String(item&&item.type||'').trim().toLowerCase();
    const payload=normalizarPayloadAcademicoWeb_(course,{
      params:item&&item.params&&typeof item.params==='object'?item.params:{}
    });
    let r;
    if(type==='actividad')r=crearActividad(payload);
    else if(type==='tarea')r=crearTarea(payload);
    else if(type==='practica')r=crearPractica(payload);
    else if(type==='quiz')r=crearQuiz(payload);
    else if(type==='examen')r=crearExamen(payload);
    else if(type==='material')r=crearMaterialDidacticoWeb_(course,{params:payload});
    else if(type==='quizasistencia'||type==='quiz-asistencia')r=crearQuizAsistenciaRapido(course.materia);
    else throw new Error('TIPO_RECURSO_NO_PERMITIDO_EN_CLASE_'+index+': '+type);
    if(['actividad','tarea','practica'].indexOf(type)>=0 && r && r.workId){
      r.duplicateDraftsRemoved=deduplicarDraftsExactosClaseWeb_(course.id,payload,r);
    }
    results.push({type:type,result:r});
  });
  const expected=(Array.isArray(p.expectedResourceTypes)?p.expectedResourceTypes:[])
    .map(function(x){return String(x||'').trim().toLowerCase();}).filter(Boolean);
  const actual=results.map(function(x){return x.type;});
  const missing=expected.filter(function(type){return actual.indexOf(type)<0;});
  const resourcePhaseStatus=expected.length?(missing.length?'PARCIAL':'MATERIALES_LISTOS_PARA_GAMMA'):'MATERIALES_SIN_LISTA_ESPERADA';
  return {
    package:false,
    packageStatus:resourcePhaseStatus,
    resourcePhaseStatus:resourcePhaseStatus,
    expectedResourceTypes:expected,
    missingResourceTypes:missing,
    gammaUrl:'',
    nextPhase:missing.length?'COMPLETE_MISSING_RESOURCES':'GENERATE_AND_VERIFY_GAMMA_REFERENCING_RESOURCE_IDS_URLS',
    resources:results
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
