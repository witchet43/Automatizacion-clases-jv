/**
 * Limpieza final de la reconciliación excepcional de Sistemas Operativos.
 * Corrige SOLO recursos creados accidentalmente durante esta reconciliación.
 * No toca los dos recursos históricos publicados de la clase 9.
 */
function limpiarReconciliacionSistemasOperativosITQ(){
  const course=resolverCursoClassroomPorMateria_('Sistemas Operativos'), courseId=String(course.id);
  if(courseId!=='875776451793') throw new Error('Curso distinto al auditado.');

  // Borradores no canónicos creados en intentos previos de la misma reconciliación.
  const duplicateDraftIds=['869745724502','869746014622','869745931714','869746011560'];
  const deletedDrafts=[];
  duplicateDraftIds.forEach(function(id){
    try{
      const w=Classroom.Courses.CourseWork.get(courseId,id);
      if(String(w.state||'').toUpperCase()==='DRAFT'){
        Classroom.Courses.CourseWork.remove(courseId,id);
        deletedDrafts.push({id:id,title:String(w.title||'')});
      }
    }catch(ignore){}
  });

  // Tres recursos de reconciliación se publicaron accidentalmente por un flujo legado.
  // Como Classroom no permite PUBLISHED -> DRAFT, se valida que nadie haya entregado
  // ni recibido calificación y se reemplazan por copias DRAFT idénticas, sin vencimiento.
  const accidentalPublishedIds=['869746083411','869745924417','869745654009'];
  const replaced=[];
  accidentalPublishedIds.forEach(function(id){
    let old;
    try{old=Classroom.Courses.CourseWork.get(courseId,id);}catch(e){return;}
    if(String(old.state||'').toUpperCase()!=='PUBLISHED') return;
    let token, risky=[];
    do{
      const page=Classroom.Courses.CourseWork.StudentSubmissions.list(courseId,id,{pageSize:100,pageToken:token});
      (page.studentSubmissions||[]).forEach(function(s){
        const st=String(s.state||'').toUpperCase();
        if(st==='TURNED_IN'||st==='RETURNED'||s.draftGrade!=null||s.assignedGrade!=null) risky.push(String(s.id||''));
      });
      token=page.nextPageToken;
    }while(token);
    if(risky.length) throw new Error('No se reemplaza '+id+' porque ya tiene entregas/calificaciones: '+risky.length);

    const body={
      title:String(old.title||''),
      description:String(old.description||''),
      workType:String(old.workType||'ASSIGNMENT'),
      state:'DRAFT',
      maxPoints:Number(old.maxPoints||100),
      topicId:old.topicId||undefined,
      materials:Array.isArray(old.materials)?old.materials:[]
    };
    Classroom.Courses.CourseWork.remove(courseId,id);
    const nw=Classroom.Courses.CourseWork.create(body,courseId);
    const verified=Classroom.Courses.CourseWork.get(courseId,String(nw.id));
    if(String(verified.state||'').toUpperCase()!=='DRAFT'||verified.dueDate||verified.dueTime)
      throw new Error('Reemplazo no quedó DRAFT/sin vencimiento: '+nw.id);
    replaced.push({oldId:id,newId:String(nw.id),title:String(nw.title||''),state:String(verified.state||'')});
  });

  return {ok:true,courseId:courseId,deletedDuplicateDrafts:deletedDrafts,replacedAccidentalPublished:replaced};
}

function auditarIntegridadReconciliacionSistemasOperativosITQ(){
  const course=resolverCursoClassroomPorMateria_('Sistemas Operativos'), courseId=String(course.id);
  const works=listarCourseWorkClase_(courseId);
  const historicalAllowed={
    'Práctica 03 - Programa vs proceso; concepto de proceso':'869479699024',
    'Tarea 09 - Estados y transición de procesos':'869479870859'
  };
  const expected=[
    'Tarea 08 - Programa vs proceso; concepto de proceso',
    'Práctica 03 - Programa vs proceso; concepto de proceso',
    'Tarea 09 - Estados y transición de procesos',
    'Actividad 06 - Diagrama de estados de procesos',
    'Tarea 10 - Control e información de procesos',
    'Práctica 04 - Control e información de procesos',
    'Tarea 11 - Creación y terminación de procesos',
    'Práctica 05 - Creación y terminación de procesos',
    'Tarea 12 - Procesos e hilos',
    'Práctica 06 - Procesos e hilos',
    'Tarea 13 - Fundamentos de planificación del procesador',
    'Actividad 07 - Dashboard de métricas de planificación de CPU',
    'Tarea 14 - FCFS y SJF',
    'Actividad 08 - Gantt comparativo FCFS y SJF',
    'Tarea 15 - Round Robin y prioridades',
    'Actividad 09 - Simulador Round Robin y prioridades',
    'Tarea 16 - Comunicación entre procesos (IPC)'
  ];
  const nonCanonical=[
    'Actividad 05 - Estados y transición de procesos',
    'Actividad 06 - Fundamentos de planificación del procesador',
    'Actividad 07 - FCFS y SJF',
    'Actividad 08 - Round Robin y prioridades'
  ];
  const checks=[],errors=[];
  expected.forEach(function(title){
    const m=works.filter(function(w){return String(w.title||'').trim()===title;});
    if(m.length!==1){errors.push({title:title,error:'COUNT_'+m.length});return;}
    const w=m[0],id=String(w.id),state=String(w.state||'').toUpperCase();
    const historical=historicalAllowed[title]===id;
    if(historical){
      if(state!=='PUBLISHED') errors.push({title:title,id:id,error:'HISTORICAL_STATE_'+state});
    }else{
      if(state!=='DRAFT') errors.push({title:title,id:id,error:'NOT_DRAFT_'+state});
      if(w.dueDate||w.dueTime) errors.push({title:title,id:id,error:'HAS_DUE'});
    }
    const mats=Array.isArray(w.materials)?w.materials:[];
    const studentCopy=mats.some(function(m){return m&&m.driveFile&&String(m.driveFile.shareMode||'').toUpperCase()==='STUDENT_COPY'&&m.driveFile.driveFile&&m.driveFile.driveFile.id;});
    if(!studentCopy) errors.push({title:title,id:id,error:'NO_STUDENT_COPY_DOC'});
    checks.push({title:title,id:id,state:state,dueDate:w.dueDate||null,studentCopy:studentCopy,historicalPublished:historical});
  });
  nonCanonical.forEach(function(title){
    const m=works.filter(function(w){return String(w.title||'').trim()===title;});
    if(m.length) errors.push({title:title,error:'NON_CANONICAL_REMAINS',ids:m.map(function(w){return String(w.id);})});
  });
  return {
    ok:errors.length===0,
    clean:errors.length===0,
    courseId:courseId,
    scope:'Clases 9-16: Programa vs proceso -> Round Robin y prioridades',
    expectedCount:expected.length,
    verifiedCount:checks.length,
    historicalPublishedExceptions:Object.keys(historicalAllowed).map(function(t){return{title:t,id:historicalAllowed[t]};}),
    checks:checks,
    errors:errors
  };
}