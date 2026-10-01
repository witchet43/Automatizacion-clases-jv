/** Una sola operación para Quiz Sencillo / Quiz de Asistencia.
 * Entrada externa del FAST PATH: materia.
 * courseId, requestedAtLocal y requestId son detalles internos del motor.
 * El próximo consecutivo se calcula con TODOS los Quiz N existentes
 * (PUBLISHED y DRAFT). Una nueva solicitud explícita crea el siguiente número.
 * La idempotencia solo reutiliza la MISMA solicitud mediante requestId.
 */
function crearQuizAsistenciaMinimo_(params) {
  const p=params&&typeof params==='object'?params:{};
  const courseId=String(p.courseId||'').trim();
  if(!/^\d+$/.test(courseId))throw new Error('QUIZ_ASISTENCIA_REQUIERE_COURSE_ID');
  const policy=ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ;
  validarPoliticaQuizSencillo_(policy);
  const local=String(p.solicitadoEnLocal||p.requestedAtLocal||
    Utilities.formatDate(new Date(),policy.TIMEZONE,'yyyy-MM-dd HH:mm:ss'));
  const solicitud=resolverInstanteSolicitudQuizSencillo_(local,policy);
  const requestId=String(p.requestId||courseId+'|'+solicitud.texto);
  const props=PropertiesService.getScriptProperties();
  const idempotencyKey=claveIdempotenciaQuizSencillo_(courseId,requestId);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const previous=String(props.getProperty(idempotencyKey)||'').trim();
    if(previous){
      try{
        const old=JSON.parse(previous);
        const oldWork=Classroom.Courses.CourseWork.get(courseId,String(old.workId));
        if(oldWork&&oldWork.id&&String(oldWork.state||'')!=='DELETED'){
          return {ok:true,courseId:courseId,workId:String(oldWork.id),
            title:String(oldWork.title||''),state:String(oldWork.state||''),
            reutilizado:true,creado:false,requestId:requestId,
            postflightVerified:true,
            emptyAssignmentVerified:verificarQuizAsistenciaVacio_(oldWork),
            classroomUrl:oldWork.alternateLink||''};
        }
      }catch(ignorePrevious){}
      props.deleteProperty(idempotencyKey);
    }
    const state=resolverConsecutivoQuizAsistencia_(courseId);
    const due=calcularSiguienteHoraNaturalQuizSencillo_(solicitud,policy);
    if(Date.now()>=due.utcMs)throw new Error('QUIZ_ASISTENCIA_VENCIMIENTO_PASADO');
    const body={title:state.title,workType:'ASSIGNMENT',state:'DRAFT',
      dueDate:{year:due.utcYear,month:due.utcMonth,day:due.utcDay},
      dueTime:{hours:due.utcHours,minutes:0}};
    // Se conserva el tema del último Quiz liberado si existe; jamás se
    // deduce una unidad a partir de otros CourseWork o de un examen.
    if(state.lastPublished&&state.lastPublished.topicId)
      body.topicId=String(state.lastPublished.topicId);
    const created=Classroom.Courses.CourseWork.create(body,courseId);
    const work=Classroom.Courses.CourseWork.get(courseId,String(created.id));
    verificarQuizAsistenciaMinimo_(work,state.title,policy,true);
    props.setProperty(idempotencyKey,JSON.stringify({workId:String(work.id)}));
    registrarAuditoriaCourseWorkDirecto_({
      courseId:courseId,titulo:state.title,tipo:'QUIZ_SENCILLO',
      descripcion:'',fechaLimite:due.fechaUtc,horaLimite:due.horaUtc
    },work,'','CREADO');
    return {ok:true,courseId:courseId,workId:String(work.id),
      title:state.title,numero:state.numero,state:'DRAFT',reutilizado:false,creado:true,
      requestId:requestId,
      ultimoQuizPublicado:state.lastPublished?state.lastPublished.title:'',
      ultimoQuizPublicadoWorkId:state.lastPublished?state.lastPublished.id:'',
      duplicateCount:0,postflightVerified:true,emptyAssignmentVerified:true,
      classroomUrl:work.alternateLink||'',
      fechaLimiteLocal:due.fechaLocal,horaLimiteLocal:due.horaLocal};
  } finally {lock.releaseLock();}
}
function resolverConsecutivoQuizAsistencia_(courseId){
  const works=[];
  ['PUBLISHED','DRAFT'].forEach(function(state){
    let token;
    do{
      const page=Classroom.Courses.CourseWork.list(String(courseId),{
        courseWorkStates:[state],pageSize:100,pageToken:token
      });
      (page.courseWork||[]).forEach(function(w){
        const m=String(w.title||'').trim().match(/^Quiz\s+(\d+)$/i);
        if(m)works.push({id:String(w.id),title:String(w.title),numero:Number(m[1]),
          state:state,topicId:w.topicId||'',creationTime:w.creationTime||''});
      });
      token=page.nextPageToken;
    }while(token);
  });
  const counts={};
  works.forEach(function(w){counts[w.numero]=(counts[w.numero]||0)+1;});
  const duplicate=Object.keys(counts).find(function(n){return counts[n]>1;});
  if(duplicate)throw new Error('QUIZ_ASISTENCIA_CONSECUTIVO_DUPLICADO: Quiz '+duplicate);
  const pub=works.filter(function(w){return w.state==='PUBLISHED';})
    .sort(function(a,b){return b.numero-a.numero;});
  const lastPublished=pub[0]||null;
  const all=works.slice().sort(function(a,b){return b.numero-a.numero;});
  const lastExisting=all[0]||null;
  const numero=lastExisting?lastExisting.numero+1:1, title='Quiz '+numero;
  return {numero:numero,title:title,lastPublished:lastPublished,lastExisting:lastExisting};
}
function verificarQuizAsistenciaVacio_(work){
  return !!(work&&work.id&&work.workType==='ASSIGNMENT'&&
    !String(work.description||'').trim()&&
    (!Array.isArray(work.materials)||!work.materials.length)&&
    (work.maxPoints===undefined||work.maxPoints===null||Number(work.maxPoints)<=0));
}
function verificarQuizAsistenciaMinimo_(work,title,policy,newWork){
  if(!work||!work.id||String(work.title||'').trim()!==title||
      String(work.state||'')!=='DRAFT'||work.workType!=='ASSIGNMENT'||
      !verificarQuizAsistenciaVacio_(work))
    throw new Error('QUIZ_ASISTENCIA_POSTFLIGHT_INVALIDO: '+title);
  if(newWork&&(!work.dueDate||!work.dueTime))
    throw new Error('QUIZ_ASISTENCIA_SIN_VENCIMIENTO');
  return true;
}
/**
 * Course IDs canónicos del periodo julio-diciembre 2026.
 * Configuración estable: no consultar Classroom/Sheets/Calendar para resolverlos.
 */
const COURSE_IDS_2026_JUL_DIC = Object.freeze({
  'sistemas distribuidos':'871158466533',
  'analisis y diseno de sistemas computacionales':'871158479566',
  'analisis y diseno de sistemas de informacion':'871158479566',
  'introduccion a las tecnologias de informacion':'871156721160',
  'administracion':'871158187513',
  'etica y legislacion informatica':'871149624583',
  'algoritmos y estructuras de datos':'871156334717',
  'sistemas operativos':'875776451793'
});

/**
 * Resuelve courseId exclusivamente desde el registro canónico local.
 * No llama a Classroom ni a ninguna fuente externa.
 */
function obtenerCourseIdPorNombre(nombreMateria){
  const objetivo=normalizarNombreCursoRapido_(String(nombreMateria||'').trim());
  if(!objetivo)throw new Error('NOMBRE_MATERIA_REQUERIDO');

  if(COURSE_IDS_2026_JUL_DIC[objetivo]) return COURSE_IDS_2026_JUL_DIC[objetivo];

  const hits=Object.keys(COURSE_IDS_2026_JUL_DIC).filter(function(nombre){
    return objetivo.indexOf(nombre)>=0 || nombre.indexOf(objetivo)>=0;
  });
  if(hits.length===1)return COURSE_IDS_2026_JUL_DIC[hits[0]];
  if(hits.length===0)throw new Error('CURSO_NO_REGISTRADO: '+nombreMateria);
  throw new Error('CURSO_AMBIGUO: '+nombreMateria);
}

function normalizarNombreCursoRapido_(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ')
    .toLowerCase();
}

/**
 * Crea/reutiliza el Quiz de Asistencia desde una sola entrada: materia.
 * La resolución de alias/courseId ocurre exclusivamente dentro del código.
 * El motor canónico conserva DRAFT, consecutivo, idempotencia y postflight.
 */
function crearQuizAsistenciaRapido(materia,requestIdExterno){
  const nombre=String(materia||'').trim();
  if(!nombre)throw new Error('QUIZ_ASISTENCIA_REQUIERE_MATERIA');
  const id=obtenerCourseIdPorNombre(nombre);
  const requestId=String(requestIdExterno||'').trim() ||
    ('QUIZ_ASISTENCIA_RAPIDO|'+id+'|'+
      Utilities.formatDate(new Date(),'America/Mexico_City','yyyy-MM-dd-HH-mm-ss'));

  return crearQuizAsistencia({
    courseId:id,
    requestId:requestId
  });
}
