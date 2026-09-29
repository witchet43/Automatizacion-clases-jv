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
 * Operaciones de creación admitidas:
 *  quizAsistencia, actividad, tarea, practica, quiz, examen, material, clase.
 *
 * "clase" orquesta exclusivamente recursos Google ya especificados en
 * resources[]. Gamma se incorpora mediante gammaUrl ya creado por su conector
 * nativo; este Web App no duplica la API de Gamma.
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
  ACTIONS:Object.freeze(['quizAsistencia','actividad','tarea','practica','quiz','examen','material','clase','resolverClase','diagnosticarClase']),
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

    if(action==='quizAsistencia')validarEntradaQuizAsistenciaWeb_(p);
    const course=resolverCursoFastPathAcademicoWeb_(action,p)||resolverCursoAcademicoWeb_(p);
    let result;

    if(action==='quizAsistencia'){
      result=crearQuizAsistenciaRapido(String(p.materia||'').trim());
    }else if(action==='diagnosticarClase'){
      result=diagnosticarProgresoClaseWeb_(course,p);
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

function diagnosticarProgresoClaseWeb_(course,p){
  const options=p&&typeof p==='object'?p:{};
  const soloClassroom=options.soloClassroom===true;
  const plan=soloClassroom?null:leerPlaneacionSiguienteClase_(course.materia);
  const works=listarCourseWorkClase_(course.id);
  const active=works.map(function(w){
    return {
      id:String(w.id||''),
      title:String(w.title||''),
      state:String(w.state||''),
      topicId:String(w.topicId||''),
      creationTime:String(w.creationTime||'')
    };
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
    results.push({type:type,result:r});
  });
  const expected=(Array.isArray(p.expectedResourceTypes)?p.expectedResourceTypes:[])
    .map(function(x){return String(x||'').trim().toLowerCase();}).filter(Boolean);
  const actual=results.map(function(x){return x.type;});
  const missing=expected.filter(function(type){return actual.indexOf(type)<0;});
  const packageStatus=expected.length?(missing.length?'PARCIAL':'COMPLETO'):'PARCIAL_NO_VERIFICABLE';
  return {
    package:packageStatus==='COMPLETO',
    packageStatus:packageStatus,
    expectedResourceTypes:expected,
    missingResourceTypes:missing,
    gammaUrl:String(p.gammaUrl||'').trim(),
    resources:results
  };
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
