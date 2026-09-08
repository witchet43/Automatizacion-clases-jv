/** Cierre oficial y auditable de una unidad. */
const UNIT_AVG_REQUEST = Object.freeze({
  SHEET:'Configuración Quizzes', KEY:'SOLICITUD_PROMEDIOS_UNIDAD',
  REQUESTED:'SOLICITAR', PROCESSING:'PROCESANDO', DONE:'PROCESADO', ERROR:'ERROR',
  REPORT_SHEET:'Promedios Unidad'
});

function procesarSolicitudPromediosUnidad_() {
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh=ss.getSheetByName(UNIT_AVG_REQUEST.SHEET);
  if(!sh) throw new Error('No existe la hoja '+UNIT_AVG_REQUEST.SHEET);
  const values=sh.getRange(1,1,Math.max(sh.getLastRow(),1),8).getDisplayValues();
  let row=-1;
  for(let i=1;i<values.length;i++) if(String(values[i][0]||'').trim()===UNIT_AVG_REQUEST.KEY){row=i+1;break;}
  if(row<0) return {procesado:false,motivo:'SIN_SOLICITUD_CONFIGURADA'};
  const estado=String(sh.getRange(row,2).getDisplayValue()||'').trim().toUpperCase();
  if(estado!==UNIT_AVG_REQUEST.REQUESTED) return {procesado:false,motivo:'SIN_SOLICITUD_PENDIENTE',estado:estado};
  const courseId=String(sh.getRange(row,4).getDisplayValue()||'').trim();
  const unidad=String(sh.getRange(row,7).getDisplayValue()||'').trim()||'Unidad 1';
  const unidadSiguienteVerificada=String(sh.getRange(row,8).getDisplayValue()||'').trim();
  if(!courseId) throw new Error('Falta el ID del curso objetivo para calcular promedios.');
  sh.getRange(row,2).setValue(UNIT_AVG_REQUEST.PROCESSING); sh.getRange(row,6).setValue(new Date()); SpreadsheetApp.flush();
  try {
    const movidos=reubicarCourseWorkSinUnidad_(ss,courseId,unidad,unidadSiguienteVerificada);
    const revision=revisarTareasCurso_(courseId,true);
    const instrumentos=importarYConsolidarInstrumentosUnidad_(ss,courseId,unidad);
    const result=calcularPromediosUnidad_(courseId,unidad,true);
    const final=publicarCalificacionUnidadFinal_(ss,courseId,unidad,'Calificación '+unidad);
    sh.getRange(row,2).setValue(UNIT_AVG_REQUEST.DONE);
    sh.getRange(row,3).setValue('Cierre de '+unidad+' completado. '+movidos.movidos+' trabajo(s) sin unidad movidos a '+movidos.unidadDestino+'; '+revision.devueltas+' entregas devueltas; '+instrumentos.instrumentos+' quiz/examen procesados; '+result.alumnos+' promedios calculados; '+final.actualizadas+' calificaciones finales enviadas.');
    sh.getRange(row,5).setValue('ACTIVA'); sh.getRange(row,6).setValue(new Date());
    return {reubicacion:movidos,revision:revision,instrumentos:instrumentos,promedios:result,cierre:final};
  } catch(err) {
    sh.getRange(row,2).setValue(UNIT_AVG_REQUEST.ERROR); sh.getRange(row,3).setValue(String(err&&err.message?err.message:err)); sh.getRange(row,6).setValue(new Date()); throw err;
  }
}

function reubicarCourseWorkSinUnidad_(ss,courseId,unidadActual,unidadSiguienteVerificada) {
  const currentNo=extraerNumeroUnidad_(unidadActual);
  if(!currentNo) throw new Error('No se pudo identificar el número de '+unidadActual+'.');
  let topics=listarTopics_(courseId);
  const allWork=listarCourseWorkPublicacion_(courseId), topicById={};
  topics.forEach(t=>topicById[String(t.topicId)]=t);
  const nums=[];
  const hinted=extraerNumeroUnidad_(unidadSiguienteVerificada);
  if(hinted&&hinted>currentNo) nums.push(hinted);
  topics.forEach(t=>{const n=extraerNumeroUnidad_(t.name);if(n&&n>currentNo)nums.push(n);});

  const tareas=ss.getSheetByName('Tareas');
  if(tareas&&tareas.getLastRow()>1){
    const d=tareas.getDataRange().getValues(),h={}; d[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<d.length;i++){const r=d[i];if(String(r[h['ID curso']]||'').trim()!==String(courseId))continue;const n=extraerNumeroUnidad_(r[h['Tema']]);if(n&&n>currentNo)nums.push(n);}
  }
  const quizzes=ss.getSheetByName('Quizzes');
  if(quizzes&&quizzes.getLastRow()>1){
    const d=quizzes.getDataRange().getValues(),h={}; d[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<d.length;i++){const r=d[i];if(String(r[h['ID del curso']]||'').trim()!==String(courseId))continue;const n=extraerNumeroUnidad_(r[h['Unidad / tema']]);if(n&&n>currentNo)nums.push(n);}
  }
  const unitNumbers=Array.from(new Set(nums)).sort((a,b)=>a-b);
  let targetNo=null;
  for(const n of unitNumbers){const closed=allWork.some(w=>String(w.title||'').trim()==='Calificación Unidad '+n&&String(w.state||'').toUpperCase()==='PUBLISHED');if(!closed){targetNo=n;break;}}
  if(!targetNo) throw new Error('No existe una siguiente unidad verificable y no cerrada después de '+unidadActual+'.');
  const targetName='Unidad '+targetNo;
  let targetTopicId=null;
  try{targetTopicId=buscarTopicIdUnidad_(courseId,targetName);}catch(e){targetTopicId=null;}
  if(!targetTopicId){const created=Classroom.Courses.Topics.create({name:targetName},String(courseId));targetTopicId=String(created.topicId);topics=listarTopics_(courseId);Object.keys(topicById).forEach(k=>delete topicById[k]);topics.forEach(t=>topicById[String(t.topicId)]=t);}

  const candidates=[];
  if(tareas&&tareas.getLastRow()>1){
    const d=tareas.getDataRange().getValues(),h={}; d[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<d.length;i++){
      const r=d[i]; if(String(r[h['ID curso']]||'').trim()!==String(courseId)||String(r[h['Estado solicitud']]||'').trim().toUpperCase()!=='CREADA')continue;
      const id=String(r[h['ID Classroom']]||'').trim(); if(!id)continue; const title=String(r[h['Título']]||'').trim(),type=String(r[h['Tipo de actividad']]||'').trim().toUpperCase();
      const eligible=type==='TAREA'||type==='PRACTICA'||type==='PRÁCTICA'||type==='ACTIVIDAD'||type==='ACTIVIDAD EN CLASE'||/^TAREA\s*\d+/i.test(title)||/^PR[ÁA]CTICA\s*\d+/i.test(title)||/^ACTIVIDAD\s*\d+/i.test(title);
      if(!eligible||type==='EXAMEN'||type==='PROYECTO'||/^EXAMEN\b/i.test(title)||/^PROYECTO\b/i.test(title))continue;
      candidates.push({source:'Tareas',sheet:tareas,row:i+1,col:h['Tema']+1,id:id,title:title});
    }
  }
  if(quizzes&&quizzes.getLastRow()>1){
    const d=quizzes.getDataRange().getValues(),h={}; d[0].forEach((v,i)=>h[String(v)]=i);
    for(let i=1;i<d.length;i++){
      const r=d[i]; if(String(r[h['ID del curso']]||'').trim()!==String(courseId)||String(r[h['Estado']]||'').trim().toUpperCase()!=='CREADA')continue;
      const id=String(r[h['ID actividad Classroom']]||'').trim();if(!id)continue;const title=String(r[h['Título']]||'').trim(),type=String(r[h['Tipo instrumento']]||'').trim().toUpperCase();
      if((type==='QUIZ'||/^QUIZ\b/i.test(title))&&!(type==='EXAMEN'||/^EXAMEN\b/i.test(title))) candidates.push({source:'Quizzes',sheet:quizzes,row:i+1,col:h['Unidad / tema']+1,id:id,title:title});
    }
  }
  const seen=new Set(),moved=[];
  candidates.forEach(x=>{
    if(seen.has(x.id))return;seen.add(x.id);
    const cw=Classroom.Courses.CourseWork.get(String(courseId),String(x.id)); if(String(cw.state||'').toUpperCase()!=='PUBLISHED')return;
    const topic=cw.topicId?topicById[String(cw.topicId)]:null; if(topic&&extraerNumeroUnidad_(topic.name))return;
    if(!cw.associatedWithDeveloper) throw new Error('No se puede mover el trabajo no asociado al proyecto: '+x.title+' ('+x.id+').');
    Classroom.Courses.CourseWork.patch({topicId:String(targetTopicId)},String(courseId),String(x.id),{updateMask:'topicId'}); x.sheet.getRange(x.row,x.col).setValue(targetName);
    moved.push({id:x.id,titulo:x.title,fuente:x.source,unidadDestino:targetName});
  });
  return {unidadActual:unidadActual,unidadDestino:targetName,topicIdDestino:String(targetTopicId),movidos:moved.length,detalle:moved};
}

function importarYConsolidarInstrumentosUnidad_(ss,courseId,unidad){
  const sh=ss.getSheetByName('Quizzes');if(!sh)throw new Error('No existe la hoja Quizzes.');
  const d=sh.getDataRange().getValues(),h={};d[0].forEach((v,i)=>h[String(v)]=i);const un=String(unidad).trim().toLowerCase(),detalle=[];
  for(let i=1;i<d.length;i++){
    const r=d[i];if(String(r[h['ID del curso']]||'').trim()!==String(courseId)||String(r[h['Unidad / tema']]||'').trim().toLowerCase()!==un||String(r[h['Estado']]||'').trim().toUpperCase()!=='CREADA')continue;
    const workId=String(r[h['ID actividad Classroom']]||'').trim(),formId=String(r[h['ID del Form']]||'').trim(),quizId=String(r[h['Quiz ID']]||'').trim();if(!workId||!formId||!quizId)continue;
    const cw=Classroom.Courses.CourseWork.get(String(courseId),workId);if(String(cw.state||'').toUpperCase()!=='PUBLISHED')continue;
    const imported=procesarCalificacionesQuiz_(String(courseId),workId,formId,true,quizId),subs=entregasPorAlumnoPromedio_(courseId,workId);let ceros=0,borradoresFinalizados=0;
    Object.keys(subs).forEach(uid=>{const sub=subs[uid],ha=sub.assignedGrade!==undefined&&sub.assignedGrade!==null,hd=sub.draftGrade!==undefined&&sub.draftGrade!==null;if(ha)return;const grade=hd?Number(sub.draftGrade):0;Classroom.Courses.CourseWork.StudentSubmissions.patch({draftGrade:grade,assignedGrade:grade},String(courseId),workId,String(sub.id),{updateMask:'draftGrade,assignedGrade'});if(hd)borradoresFinalizados++;else ceros++;});
    detalle.push({quizId:quizId,workId:workId,importadas:imported.actualizadas,ceros:ceros,borradoresFinalizados:borradoresFinalizados});
  }
  return {instrumentos:detalle.length,detalle:detalle};
}

function calcularPromediosUnidad_(courseId,unidad,exigirCalificacion){
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID),candidatos=inventarioUnidadDesdeFuentes_(ss,courseId,unidad),publicados=[],seen=new Set();
  candidatos.forEach(x=>{if(!x.classroomId||seen.has(x.classroomId))return;const cw=Classroom.Courses.CourseWork.get(String(courseId),String(x.classroomId));if(String(cw.state||'').toUpperCase()!=='PUBLISHED'||!cw.maxPoints||Number(cw.maxPoints)<=0)return;seen.add(String(x.classroomId));publicados.push({classroomId:String(x.classroomId),titulo:String(cw.title||x.titulo||''),tipo:x.tipo,esExamen:Boolean(x.esExamen),maxPoints:Number(cw.maxPoints)});});
  const examenes=publicados.filter(x=>x.esExamen),noExamen=publicados.filter(x=>!x.esExamen);if(examenes.length!==1)throw new Error('Se esperaba exactamente 1 examen publicado para '+unidad+'; encontrados: '+examenes.length+'.');if(!noExamen.length)throw new Error('No hay trabajos no-examen publicados para '+unidad+'.');
  const grades={};publicados.forEach(w=>grades[w.classroomId]=entregasPorAlumnoPromedio_(courseId,w.classroomId));const students=listarAlumnosPromedio_(courseId),rows=[],faltantes=[];
  students.forEach(student=>{const uid=String(student.userId),nombre=student.profile&&student.profile.name?student.profile.name.fullName:uid,email=student.profile&&student.profile.emailAddress?student.profile.emailAddress:'';publicados.forEach(w=>{if(!tieneNota_(grades[w.classroomId][uid]))faltantes.push({alumno:nombre,userId:uid,trabajo:w.titulo,classroomId:w.classroomId});});const ev=examenes.map(w=>normalizarNota_(grades[w.classroomId][uid],w.maxPoints)),nv=noExamen.map(w=>normalizarNota_(grades[w.classroomId][uid],w.maxPoints)),exam=promedioSimple_(ev),non=promedioSimple_(nv),final=redondearPromedio_(exam*.70+non*.30),mn=noExamen.reduce((n,w)=>n+(tieneNota_(grades[w.classroomId][uid])?0:1),0),me=examenes.reduce((n,w)=>n+(tieneNota_(grades[w.classroomId][uid])?0:1),0);rows.push([new Date(),String(courseId),unidad,uid,nombre,email,redondearPromedio_(exam),redondearPromedio_(exam*.70),redondearPromedio_(non),redondearPromedio_(non*.30),final,noExamen.length,mn,me]);});
  if(exigirCalificacion&&faltantes.length)throw new Error('El cierre se bloqueó: existen '+faltantes.length+' calificaciones faltantes después de la consolidación. '+JSON.stringify(faltantes).slice(0,3000));
  escribirReportePromedios_(ss,courseId,unidad,rows);return {courseId:String(courseId),unidad:unidad,alumnos:rows.length,examenes:examenes,noExamen:noExamen,reporte:UNIT_AVG_REQUEST.REPORT_SHEET,faltantes:faltantes.length};
}

function inventarioUnidadDesdeFuentes_(ss,courseId,unidad){
  const out=[],norm=s=>String(s||'').trim().toLowerCase(),un=norm(unidad),t=ss.getSheetByName('Tareas');
  if(t){const d=t.getDataRange().getValues(),h={};d[0].forEach((v,i)=>h[String(v)]=i);for(let i=1;i<d.length;i++){const r=d[i];if(String(r[h['ID curso']]||'').trim()!==String(courseId))continue;const tema=norm(r[h['Tema']]);if(!(tema===un||tema.indexOf(un+' -')===0)||String(r[h['Estado solicitud']]||'').trim().toUpperCase()!=='CREADA')continue;const id=String(r[h['ID Classroom']]||'').trim();if(!id)continue;const title=String(r[h['Título']]||'').trim(),type=String(r[h['Tipo de actividad']]||'').trim().toUpperCase(),exam=type==='EXAMEN'||/^EXAMEN\b/i.test(title),proj=type==='PROYECTO'||/^PROYECTO\b/i.test(title);if(!proj)out.push({classroomId:id,titulo:title,tipo:type||'COURSEWORK',esExamen:exam});}}
  const q=ss.getSheetByName('Quizzes');if(q){const d=q.getDataRange().getValues(),h={};d[0].forEach((v,i)=>h[String(v)]=i);for(let i=1;i<d.length;i++){const r=d[i];if(String(r[h['ID del curso']]||'').trim()!==String(courseId)||norm(r[h['Unidad / tema']])!==un||String(r[h['Estado']]||'').trim().toUpperCase()!=='CREADA')continue;const id=String(r[h['ID actividad Classroom']]||'').trim();if(!id)continue;const title=String(r[h['Título']]||'').trim(),type=String(r[h['Tipo instrumento']]||'').trim().toUpperCase();out.push({classroomId:id,titulo:title,tipo:type||'QUIZ',esExamen:type==='EXAMEN'||/^EXAMEN\b/i.test(title)});}}
  return out;
}

function listarAlumnosPromedio_(courseId){const out=[];let token=null;do{const p=Classroom.Courses.Students.list(String(courseId),{pageToken:token,pageSize:100});(p.students||[]).forEach(s=>out.push(s));token=p.nextPageToken;}while(token);return out;}
function entregasPorAlumnoPromedio_(courseId,workId){const out={};let token=null;do{const p=Classroom.Courses.CourseWork.StudentSubmissions.list(String(courseId),String(workId),{pageToken:token,pageSize:100});(p.studentSubmissions||[]).forEach(s=>out[String(s.userId)]=s);token=p.nextPageToken;}while(token);return out;}
function tieneNota_(s){return !!s&&((s.assignedGrade!==undefined&&s.assignedGrade!==null)||(s.draftGrade!==undefined&&s.draftGrade!==null));}
function normalizarNota_(s,max){if(!tieneNota_(s))return 0;const g=s.assignedGrade!==undefined&&s.assignedGrade!==null?Number(s.assignedGrade):Number(s.draftGrade);return Math.max(0,Math.min(100,(g/Number(max))*100));}
function promedioSimple_(v){return v.length?v.reduce((a,b)=>a+Number(b||0),0)/v.length:0;}
function redondearPromedio_(v){return Math.round(Number(v)*100)/100;}
function escribirReportePromedios_(ss,courseId,unidad,rows){let sh=ss.getSheetByName(UNIT_AVG_REQUEST.REPORT_SHEET);if(!sh)sh=ss.insertSheet(UNIT_AVG_REQUEST.REPORT_SHEET);const headers=['Fecha cálculo','ID curso','Unidad','User ID','Alumno','Correo','Examen (0-100)','Aporte examen 70%','Promedio no examen (0-100)','Aporte no examen 30%','Promedio final','Trabajos no examen incluidos','No examen sin calificación','Examen sin calificación'],data=sh.getDataRange().getValues(),keep=[];if(data.length>1)for(let i=1;i<data.length;i++){if(String(data[i][1]||'')===String(courseId)&&String(data[i][2]||'')===String(unidad))continue;if(data[i].some(v=>v!==''))keep.push(data[i].slice(0,headers.length));}sh.clearContents();sh.getRange(1,1,1,headers.length).setValues([headers]);const all=keep.concat(rows);if(all.length)sh.getRange(2,1,all.length,headers.length).setValues(all);sh.setFrozenRows(1);}
