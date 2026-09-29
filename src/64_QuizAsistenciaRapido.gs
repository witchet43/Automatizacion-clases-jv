/** Una sola operación para Quiz Sencillo / Quiz de Asistencia.
 * Entradas: courseId; requestedAtLocal y requestId opcionales.
 * Únicamente los Quiz N PUBLISHED deciden el próximo consecutivo.
 * Un Quiz N+1 DRAFT se reutiliza, no se incrementa el número por borradores.
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
            reutilizado:true,requestId:requestId,
            classroomUrl:oldWork.alternateLink||''};
        }
      }catch(ignorePrevious){}
      props.deleteProperty(idempotencyKey);
    }
    const state=resolverConsecutivoQuizAsistencia_(courseId);
    if(state.existing){
      const work=Classroom.Courses.CourseWork.get(courseId,String(state.existing.id));
      verificarQuizAsistenciaMinimo_(work,state.title,policy,false);
      props.setProperty(idempotencyKey,JSON.stringify({workId:String(work.id)}));
      return {ok:true,courseId:courseId,workId:String(work.id),
        title:state.title,numero:state.numero,state:'DRAFT',
        reutilizado:true,requestId:requestId,
        classroomUrl:work.alternateLink||''};
    }
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
      title:state.title,numero:state.numero,state:'DRAFT',reutilizado:false,
      requestId:requestId,classroomUrl:work.alternateLink||'',
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
  const pub=works.filter(function(w){return w.state==='PUBLISHED';})
    .sort(function(a,b){return b.numero-a.numero;});
  const last=pub[0]||null;
  const numero=last?last.numero+1:1, title='Quiz '+numero;
  const hits=works.filter(function(w){return w.numero===numero;});
  if(hits.length>1)throw new Error('QUIZ_ASISTENCIA_CONSECUTIVO_DUPLICADO: '+title);
  if(hits.length&&hits[0].state==='PUBLISHED')
    throw new Error('QUIZ_ASISTENCIA_ESTADO_CONFLICTIVO: '+title);
  return {numero:numero,title:title,lastPublished:last,existing:hits[0]||null};
}
function verificarQuizAsistenciaMinimo_(work,title,policy,newWork){
  if(!work||!work.id||String(work.title||'').trim()!==title||
      String(work.state||'')!=='DRAFT'||work.workType!=='ASSIGNMENT'||
      String(work.description||'').trim()||
      (Array.isArray(work.materials)&&work.materials.length)||
      (work.maxPoints!==undefined&&work.maxPoints!==null&&Number(work.maxPoints)>0))
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
  const objetivo=normalizarNombreCursoRapido_(String(nombreMateria||'Sistemas Operativos').trim());
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
 * Crea/reutiliza el Quiz de Asistencia para un courseId.
 * Único parámetro obligatorio: courseId.
 * El motor canónico conserva DRAFT, consecutivo e idempotencia.
 */
function crearQuizAsistenciaRapido(courseId){
  const id=String(courseId||obtenerCourseIdPorNombre('Sistemas Operativos')).trim();
  if(!/^\d+$/.test(id))throw new Error('QUIZ_ASISTENCIA_REQUIERE_COURSE_ID');

  const requestId='QUIZ_ASISTENCIA_RAPIDO|'+id+'|'+
    Utilities.formatDate(new Date(),'America/Mexico_City','yyyy-MM-dd-HH');

  return crearQuizAsistencia({
    courseId:id,
    requestId:requestId
  });
}
