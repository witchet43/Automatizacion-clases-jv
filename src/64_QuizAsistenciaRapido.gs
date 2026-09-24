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
/** Alias heredado sin lógica de secuencia ni ruta alternativa. */
function crearQuizAsistenciaRapido(params){
  return crearQuizAsistencia(params);
}
