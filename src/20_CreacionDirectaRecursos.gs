/**
 * CREACIÓN DIRECTA CANÓNICA DE RECURSOS ACADÉMICOS
 *
 * Los nombres públicos *Directa se conservan solo por compatibilidad y redirigen
 * obligatoriamente a los entrypoints seguros de 22_EntrypointsRecursosSeguros.gs.
 * Los motores con sufijo _ permanecen internos.
 */
function crearActividadDirecta(params){return crearActividad(params);}
function crearTareaDirecta(params){return crearTarea(params);}
function crearPracticaDirecta(params){return crearPractica(params);}
function crearQuizDirecto(params){return crearQuiz(params);}
function crearExamenDirecto(params){return crearExamen(params);}

function normalizarCreacionDirecta_(params,tipo){
  const p=params&&typeof params==='object'?Object.assign({},params):{};
  p.tipo=tipo;
  p.courseId=String(p.courseId||'').trim();
  p.titulo=String(p.titulo||p.title||'').trim();
  p.descripcion=String(p.descripcion||p.description||'').trim();
  if(['ACTIVIDAD','TAREA','PRACTICA'].indexOf(String(tipo||'').toUpperCase())>=0){
    p.descripcion=normalizarInstruccionesDidacticas_(p.descripcion,tipo);
    if(p.contenidoDocumento!==undefined) p.contenidoDocumento=normalizarInstruccionesDidacticas_(p.contenidoDocumento,tipo);
    if(p.googleDocContent!==undefined) p.googleDocContent=normalizarInstruccionesDidacticas_(p.googleDocContent,tipo);
  }
  p.unidad=String(p.unidad||'').trim();
  p.topicName=String(p.topicName||p.tema||'').trim();
  p.topicId=String(p.topicId||'').trim();
  p.courseKey=String(p.courseKey||'').trim().toUpperCase();
  if(!p.courseId) throw new Error('La creación directa requiere courseId.');
  if(!p.titulo) throw new Error('La creación directa requiere titulo.');
  return p;
}

function crearCourseWorkDirecto_(p){
  validarContratoCreacionDirecta_();
  const topicName=resolverNombreTemaDirecto_(p);
  const topicId=resolveTopicId_(p.courseId,p.topicId,topicName);
  const existente=buscarCourseWorkDirectoExacto_(p.courseId,p.titulo,topicId);
  // No reutilizar borradores antiguos con descripciones no conformes:
  // jamás se crea un duplicado ni se modifica el existente por implicación.

  if(existente){
    const verificado=verificarCourseWorkDraftDirecto_(p.courseId,existente.id);
    registrarAuditoriaCourseWorkDirecto_(p,verificado,topicName,'REUTILIZADO');
    return resultadoCreacionCourseWorkDirecto_(p,verificado,topicName,true);
  }

  const body={
    title:p.titulo,
    description:p.descripcion,
    workType:'ASSIGNMENT',
    state:ACADEMIC_POLICY.CLASSROOM.DEFAULT_COURSEWORK_STATE,
    maxPoints:normalizarPuntosDirectos_(p.puntos||p.maxPoints),
    topicId:topicId||undefined
  };
  const due=construirVencimientoDirecto_(p.fechaLimite||p.dueDate,p.horaLimite||p.dueTime);
  if(due.dueDate) body.dueDate=due.dueDate;
  if(due.dueTime) body.dueTime=due.dueTime;
  const materiales=construirMaterialesDirectos_(p);
  if(materiales.length) body.materials=materiales;

  const work=Classroom.Courses.CourseWork.create(body,p.courseId);
  const verificado=verificarCourseWorkDraftDirecto_(p.courseId,work.id);
  registrarAuditoriaCourseWorkDirecto_(p,verificado,topicName,'CREADO');
  return resultadoCreacionCourseWorkDirecto_(p,verificado,topicName,false);
}

function crearEvaluacionDirecta_(p){
  validarContratoCreacionDirecta_();
  const preguntas=normalizarPreguntasDirectas_(p.preguntas||p.questions||[]);
  if(!preguntas.length) throw new Error('Quiz/examen directo requiere preguntas.');
  const total=preguntas.reduce((s,x)=>s+Number(x.data.Puntos||0),0);
  validarInstrumentoDirecto_(p,preguntas,total);

  const topicName=resolverNombreTemaDirecto_(p);
  const topicId=resolveTopicId_(p.courseId,p.topicId,topicName);
  const existente=buscarRegistroEvaluacionDirecta_(p.courseId,p.titulo,topicName,p.tipo);
  if(existente){
    const work=verificarCourseWorkDraftDirecto_(p.courseId,existente.workId);
    return {
      operacion:'CREACION_DIRECTA',tipo:p.tipo,reutilizado:true,courseId:p.courseId,
      quizId:existente.quizId,formId:existente.formId,workId:existente.workId,
      formUrl:existente.formUrl,classroomUrl:work.alternateLink||'',estado:work.state
    };
  }
  const cwExistente=buscarCourseWorkDirectoExacto_(p.courseId,p.titulo,topicId);
  if(cwExistente) throw new Error('Ya existe CourseWork con ese título/tema pero no tiene registro de evaluación directo; se detiene para evitar duplicado de Form.');

  const quizId=String(p.quizId||generarQuizIdDirecto_(p.tipo,p.courseId,p.unidad||topicName)).trim();
  const quiz={
    'Título':p.titulo,
    'Tipo instrumento':p.tipo,
    'Política retroalimentación':p.tipo==='QUIZ'?'CON_RETROALIMENTACION':'SIN_RETROALIMENTACION',
    'Barajar preguntas':p.barajarPreguntas===true||p.shuffleQuestions===true?'SÍ':'NO',
    'Instrucciones':p.descripcion||QUIZ_NO_DESCRIPTION_SENTINEL
  };

  let form=null;
  try{
    form=buildQuizForm_(quiz,preguntas);
    assertNoManualEmailQuestions_(form.getItems().map(x=>x.getTitle()),'Form directo');
    verifyVerifiedEmail_(form.getId());
    const work=Classroom.Courses.CourseWork.create({
      title:p.titulo,
      description:quizDescriptionForOutput_(quiz.Instrucciones),
      workType:'ASSIGNMENT',
      state:ACADEMIC_POLICY.CLASSROOM.DEFAULT_COURSEWORK_STATE,
      maxPoints:total,
      topicId:topicId||undefined,
      materials:[{link:{url:form.getPublishedUrl(),title:p.titulo}}]
    },p.courseId);
    const verificado=verificarCourseWorkDraftDirecto_(p.courseId,work.id);
    registrarAuditoriaEvaluacionDirecta_(p,quizId,form,verificado,topicName,total);
    return {
      operacion:'CREACION_DIRECTA',tipo:p.tipo,reutilizado:false,courseId:p.courseId,
      quizId:quizId,formId:form.getId(),workId:String(verificado.id),
      formUrl:form.getPublishedUrl(),formEditUrl:form.getEditUrl(),
      classroomUrl:verificado.alternateLink||'',estado:verificado.state,puntos:total
    };
  }catch(err){
    if(form){try{DriveApp.getFileById(form.getId()).setTrashed(true);}catch(ignore){}}
    throw err;
  }
}

function validarContratoCreacionDirecta_(){
  const e=ACADEMIC_POLICY.EXECUTION;
  if(!e||e.RESOURCE_CREATION_MODE!=='DIRECT_SCRIPT'||e.MONITOR_REQUIRED_FOR_CREATION!==false) throw new Error('La política canónica no autoriza creación directa.');
  if(ACADEMIC_POLICY.CLASSROOM.DEFAULT_COURSEWORK_STATE!=='DRAFT') throw new Error('La creación directa solo puede operar con CourseWork DRAFT.');
  return true;
}

function resolverNombreTemaDirecto_(p){
  if(p.topicName) return p.topicName;
  const override=politicaCurso_(p.courseKey);
  const map=override&&override.TOPICS?override.TOPICS:{};
  if(p.tipo==='PRACTICA'&&map.PRACTICE) return map.PRACTICE;
  if(p.tipo==='TAREA'&&map.TASK) return map.TASK;
  if(p.tipo==='ACTIVIDAD'&&map.ACTIVITY) return map.ACTIVITY;
  return p.unidad||'';
}

function normalizarPuntosDirectos_(value){
  if(value===undefined||value===null||value==='') return Number(ACADEMIC_POLICY.CLASSROOM.DEFAULT_POINTS);
  const n=Number(value);
  if(!Number.isFinite(n)||n<0) throw new Error('Puntos inválidos.');
  return n;
}

function construirVencimientoDirecto_(dateValue,timeValue){
  if(!dateValue) return {};
  const raw=String(dateValue).trim();
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) throw new Error('fechaLimite debe usar YYYY-MM-DD.');
  const out={dueDate:{year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}};
  if(timeValue){
    const t=String(timeValue).trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!t) throw new Error('horaLimite debe usar HH:MM.');
    out.dueTime={hours:Number(t[1]),minutes:Number(t[2])};
  }
  return out;
}

function construirMaterialesDirectos_(p){
  const out=[];
  const docId=String(p.documentId||p.googleDocId||'').trim();
  if(docId){
    const shareMode=resolverShareModeDirecto_(p);
    out.push({driveFile:{driveFile:{id:docId},shareMode:shareMode}});
  }
  const links=Array.isArray(p.links)?p.links:[];
  links.forEach(x=>{
    const url=String((x&&x.url)||'').trim();
    if(url) out.push({link:{url:url,title:String((x&&x.title)||url)}});
  });
  return out;
}

function resolverShareModeDirecto_(p){
  if(p.shareMode) return String(p.shareMode).trim().toUpperCase();
  if(p.studentCopy===true) return 'STUDENT_COPY';
  if(p.studentCopy===false) return 'VIEW';
  if(p.tipo==='PRACTICA'&&ACADEMIC_POLICY.DOCUMENTS.PRACTICE_STUDENT_COPY) return 'STUDENT_COPY';
  if(p.tipo==='ACTIVIDAD'&&ACADEMIC_POLICY.DOCUMENTS.ACTIVITY_DOC_STUDENT_COPY) return 'STUDENT_COPY';
  if(p.tipo==='TAREA'){
    const override=politicaCurso_(p.courseKey);
    if(override.TASK_STUDENT_COPY===true) return 'STUDENT_COPY';
    if(ACADEMIC_POLICY.DOCUMENTS.TASK_STUDENT_COPY_DEFAULT===true) return 'STUDENT_COPY';
  }
  return 'VIEW';
}

function buscarCourseWorkDirectoExacto_(courseId,titulo,topicId){
  let token;
  do{
    const page=Classroom.Courses.CourseWork.list(String(courseId),{pageSize:100,pageToken:token});
    const hit=(page.courseWork||[]).find(w=>String(w.title||'').trim()===titulo&&String(w.topicId||'')===String(topicId||'')&&String(w.state||'').toUpperCase()!=='DELETED');
    if(hit) return hit;
    token=page.nextPageToken;
  }while(token);
  return null;
}

function verificarCourseWorkDraftDirecto_(courseId,workId){
  const work=Classroom.Courses.CourseWork.get(String(courseId),String(workId));
  if(String(work.state||'').toUpperCase()!==ACADEMIC_POLICY.CLASSROOM.DEFAULT_COURSEWORK_STATE) throw new Error('La creación directa no quedó DRAFT: '+workId+'.');
  return work;
}

function resultadoCreacionCourseWorkDirecto_(p,work,topicName,reutilizado){
  return {operacion:'CREACION_DIRECTA',tipo:p.tipo,reutilizado:reutilizado,courseId:p.courseId,workId:String(work.id),classroomUrl:work.alternateLink||'',estado:work.state,tema:topicName,puntos:Number(work.maxPoints||0)};
}

function normalizarPreguntasDirectas_(questions){
  if(!Array.isArray(questions)) throw new Error('preguntas debe ser un arreglo.');
  const optionHeaders=['Opción A','Opción B','Opción C','Opción D','Opción E','Opción F','Opción G','Opción H'];
  return questions.map((q,index)=>{
    const x=q&&typeof q==='object'?q:{};
    const options=Array.isArray(x.opciones)?x.opciones:(Array.isArray(x.options)?x.options:[]);
    const correct=x.respuestaCorrecta!==undefined?x.respuestaCorrecta:x.correctAnswer;
    const data={
      Orden:index+1,
      Tipo:String(x.tipo||x.type||'OPCION_MULTIPLE'),
      Pregunta:String(x.pregunta||x.question||'').trim(),
      Puntos:Number(x.puntos!==undefined?x.puntos:x.points),
      Obligatoria:(x.obligatoria===false||x.required===false)?'NO':'SÍ',
      'Respuesta correcta':Array.isArray(correct)?correct.join(','):String(correct===undefined?'':correct),
      'Respuestas aceptadas':Array.isArray(x.respuestasAceptadas||x.acceptedAnswers)?(x.respuestasAceptadas||x.acceptedAnswers).join('|'):String(x.respuestasAceptadas||x.acceptedAnswers||''),
      'Instrucción de formato':String(x.instruccionFormato||x.formatInstruction||''),
      'Retroalimentación correcta':String(x.retroalimentacionCorrecta||x.feedbackCorrect||''),
      'Retroalimentación incorrecta':String(x.retroalimentacionIncorrecta||x.feedbackIncorrect||'')
    };
    if(!data.Pregunta) throw new Error('La pregunta '+(index+1)+' no tiene texto.');
    if(!Number.isFinite(data.Puntos)||data.Puntos<0) throw new Error('Puntos inválidos en pregunta '+(index+1)+'.');
    optionHeaders.forEach((h,i)=>data[h]=String(options[i]===undefined?'':options[i]));
    return {data:data};
  });
}

function validarInstrumentoDirecto_(p,preguntas,total){
  if(p.tipo==='EXAMEN'&&p.excepcionAcademica!==true){
    if(preguntas.length!==ACADEMIC_POLICY.EXAM.STANDARD_ITEM_COUNT) throw new Error('El examen estándar requiere '+ACADEMIC_POLICY.EXAM.STANDARD_ITEM_COUNT+' reactivos; use excepcionAcademica=true solo por instrucción docente explícita.');
    if(total!==ACADEMIC_POLICY.EXAM.STANDARD_TOTAL_POINTS) throw new Error('El examen estándar debe sumar '+ACADEMIC_POLICY.EXAM.STANDARD_TOTAL_POINTS+' puntos.');
  }
  if(p.tipo==='QUIZ'&&ACADEMIC_POLICY.QUIZ.FEEDBACK_REQUIRED){
    preguntas.forEach((r,i)=>{
      if(!String(r.data['Retroalimentación correcta']||'').trim()||!String(r.data['Retroalimentación incorrecta']||'').trim()) throw new Error('El quiz requiere retroalimentación correcta e incorrecta en la pregunta '+(i+1)+'.');
    });
  }
  return true;
}

function generarQuizIdDirecto_(tipo,courseId,unidad){
  const prefix=tipo==='EXAMEN'?'EXAM':'QUIZ';
  const unit=extraerNumeroUnidad_(unidad)||'X';
  const stamp=Utilities.formatDate(new Date(),'America/Mexico_City','yyyyMMdd-HHmmss');
  const suffix=String(Math.floor(Math.random()*9000)+1000);
  return prefix+'-'+stamp+'-'+String(courseId).slice(-6)+'-U'+unit+'-'+suffix;
}

function registrarAuditoriaCourseWorkDirecto_(p,work,topicName,accion){
  const data={
    'ID curso':p.courseId,
    'Materia':obtenerNombreCursoDirecto_(p.courseId),
    'Tema':p.unidad||topicName,
    'Título':p.titulo,
    'Instrucciones':p.descripcion,
    'Fecha límite':p.fechaLimite||p.dueDate||'',
    'Hora límite':p.horaLimite||p.dueTime||'',
    'Puntos':Number(work.maxPoints||0),
    'Estado solicitud':'CREADA',
    'ID Classroom':String(work.id),
    'Resultado':accion+' directamente por script; DRAFT verificado.',
    'Fecha procesamiento':new Date(),
    'Archivo adjunto (Google Doc)':p.documentId||p.googleDocId||'',
    'Modo de copia':(p.documentId||p.googleDocId)?resolverShareModeDirecto_(p):'',
    'Tipo de actividad':p.tipo
  };
  upsertAuditoriaDirecta_('Tareas','ID Classroom',String(work.id),data);
}

function registrarAuditoriaEvaluacionDirecta_(p,quizId,form,work,topicName,total){
  const data={
    'Quiz ID':quizId,
    'ID del curso':p.courseId,
    'Nombre del curso':obtenerNombreCursoDirecto_(p.courseId),
    'Unidad / tema':p.unidad||topicName,
    'ID del tema':String(work.topicId||''),
    'Título':p.titulo,
    'Instrucciones':p.descripcion||QUIZ_NO_DESCRIPTION_SENTINEL,
    'Puntos totales':total,
    'Estado':'CREADA',
    'Recopilar correo':'SÍ',
    'Limitar a 1 respuesta':'SÍ',
    'Barajar preguntas':p.barajarPreguntas===true||p.shuffleQuestions===true?'SÍ':'NO',
    'ID del Form':form.getId(),
    'URL edición Form':form.getEditUrl(),
    'URL responder Form':form.getPublishedUrl(),
    'ID actividad Classroom':String(work.id),
    'URL actividad Classroom':work.alternateLink||'',
    'Fecha creación':new Date(),
    'Última actualización':new Date(),
    'Resultado / error':'CREADA directamente por script como DRAFT; monitor no utilizado.',
    'Tipo instrumento':p.tipo,
    'Política retroalimentación':p.tipo==='QUIZ'?'CON_RETROALIMENTACION':'SIN_RETROALIMENTACION'
  };
  upsertAuditoriaDirecta_('Quizzes','Quiz ID',quizId,data);
}

function upsertAuditoriaDirecta_(sheetName,keyHeader,keyValue,data){
  try{
    const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const sh=requireSheet_(ss,sheetName);
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(clean_);
    const keyCol=headers.indexOf(keyHeader);
    if(keyCol<0) throw new Error('Falta columna de auditoría '+keyHeader+'.');
    const last=Math.max(sh.getLastRow(),1);
    let row=0;
    if(last>1){
      const vals=sh.getRange(2,keyCol+1,last-1,1).getDisplayValues();
      for(let i=0;i<vals.length;i++) if(String(vals[i][0]||'').trim()===String(keyValue)){row=i+2;break;}
    }
    const values=headers.map(h=>Object.prototype.hasOwnProperty.call(data,h)?data[h]:'');
    if(row) sh.getRange(row,1,1,headers.length).setValues([values]);
    else sh.appendRow(values);
    SpreadsheetApp.flush();
  }catch(err){
    console.error('Auditoría no bloqueante '+sheetName+': '+String(err&&err.message?err.message:err));
  }
}

function buscarRegistroEvaluacionDirecta_(courseId,titulo,topicName,tipo){
  try{
    const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const sh=ss.getSheetByName('Quizzes');
    if(!sh||sh.getLastRow()<2) return null;
    const d=sh.getDataRange().getDisplayValues(),h={};d[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<d.length;i++){
      const r=d[i];
      if(String(r[h['ID del curso']]||'').trim()!==String(courseId)) continue;
      if(String(r[h['Título']]||'').trim()!==titulo) continue;
      if(String(r[h['Unidad / tema']]||'').trim()!==String(topicName||'')) continue;
      if(String(r[h['Tipo instrumento']]||'').trim().toUpperCase()!==tipo) continue;
      if(String(r[h['Estado']]||'').trim().toUpperCase()!=='CREADA') continue;
      const workId=String(r[h['ID actividad Classroom']]||'').trim(),formId=String(r[h['ID del Form']]||'').trim();
      if(workId&&formId) return {quizId:String(r[h['Quiz ID']]||''),workId:workId,formId:formId,formUrl:String(r[h['URL responder Form']]||'')};
    }
  }catch(ignore){}
  return null;
}

function obtenerNombreCursoDirecto_(courseId){
  try{return String(Classroom.Courses.get(String(courseId)).name||'');}catch(e){return '';}
}

function validarCreacionDirectaCanonica(){
  validarContratoCreacionDirecta_();
  const tipos=ACADEMIC_POLICY.EXECUTION.DIRECT_RESOURCE_TYPES;
  ['ACTIVIDAD','TAREA','PRACTICA','QUIZ','EXAMEN'].forEach(x=>{if(tipos.indexOf(x)<0)throw new Error('Falta tipo directo '+x);});
  if(resolverShareModeDirecto_({tipo:'PRACTICA',courseKey:''})!=='STUDENT_COPY') throw new Error('Práctica debe usar STUDENT_COPY.');
  return {ok:true,modo:'DIRECT_SCRIPT',sheets:'AUDIT_ONLY',monitorRequerido:false,guardrails:'CANONICAL_ENTRYPOINTS',funciones:['crearActividadDirecta','crearTareaDirecta','crearPracticaDirecta','crearQuizDirecto','crearExamenDirecto']};
}