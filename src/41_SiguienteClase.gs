/** Generación end-to-end de la siguiente sesión canónica. */
function resolverCursoClassroomPorMateria_(materia){
  const wanted=normalizeGuard_(materia), aliases=[wanted,normalizeGuard_('UAQ - '+materia)]; let token, hits=[];
  do{const page=Classroom.Courses.list({pageSize:100,pageToken:token,courseStates:['ACTIVE']});(page.courses||[]).forEach(function(c){const n=normalizeGuard_(c.name);if(aliases.indexOf(n)>=0||n.indexOf(wanted)>=0)hits.push(c);});token=page.nextPageToken;}while(token);
  if(!hits.length)throw new Error('No se encontró curso ACTIVE de Classroom para '+materia+'.');
  const exact=hits.find(function(c){return normalizeGuard_(c.name)===normalizeGuard_('UAQ - '+materia);}); return exact||hits[0];
}
function leerPlaneacionSiguienteClase_(materia){
  const source=resolvePlanningSource_(materia),ss=SpreadsheetApp.openById(source.spreadsheetId);let sh=ss.getSheetByName(source.preferredSheet);if(!sh&&ss.getSheets().length===1)sh=ss.getSheets()[0];if(!sh)throw new Error('No existe hoja canónica.');
  const v=sh.getDataRange().getDisplayValues();let hi=-1;for(let i=0;i<Math.min(v.length,12);i++){const h=v[i].map(normalizeGuard_);if(findHeaderGuard_(h,['tema / subtema','tema/subtema','tema'])>=0){hi=i;break;}}if(hi<0)throw new Error('No se encontró encabezado canónico.');
  const h=v[hi].map(normalizeGuard_),col=function(a){return findHeaderGuard_(h,a);};
  const C={session:col(['sesion','sesión','clase']),date:col(['fecha']),day:col(['dia','día']),time:col(['horario']),room:col(['aula']),unit:col(['unidad']),topic:col(['tema / subtema','tema/subtema','tema']),practice:col(['practica del dia','práctica del día']),previous:col(['tarea previa a esta clase']),next:col(['tarea siguiente / preparacion para la proxima clase','tarea siguiente / preparación para la próxima clase']),gamma:col(['presentacion gamma','presentación gamma']),gammaUrl:col(['enlace gamma']),prompt:col(['prompt gamma de la clase (incluye link a la practica)','prompt gamma de la clase (incluye link a la práctica)'])};
  const rows=v.slice(hi+1).map(function(r,i){const o={row:hi+i+2};Object.keys(C).forEach(function(k){o[k]=C[k]>=0?r[C[k]]:'';});return o;}).filter(function(x){return String(x.topic||'').trim();});
  return {source:source,sheet:sh,rows:rows};
}
function extraerDocIdPractica_(row){const text=[row.prompt,row.practice].join(' ');const m=text.match(/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/);return m?m[1]:'';}
function tituloTareaPreviaClase_(row){return 'Tarea previa - '+String(row.topic||'').trim();}
function tituloPracticaClase_(row){return String(row.practice||'').trim();}
function listarCourseWorkClase_(courseId){let token,out=[];do{const p=Classroom.Courses.CourseWork.list(String(courseId),{pageSize:100,pageToken:token});out=out.concat(p.courseWork||[]);token=p.nextPageToken;}while(token);return out.filter(function(w){return String(w.state||'').toUpperCase()!=='DELETED';});}
function buscarWorkTitulo_(works,title){return works.find(function(w){return String(w.title||'').trim()===String(title||'').trim();})||null;}
function resolverSiguienteClase(materia){
  const subject=String(materia||'').trim();if(!subject)throw new Error('materia es obligatoria.');const plan=leerPlaneacionSiguienteClase_(subject),course=resolverCursoClassroomPorMateria_(subject),works=listarCourseWorkClase_(course.id);
  for(let i=0;i<plan.rows.length;i++){const r=plan.rows[i];if(/evaluacion/i.test(r.topic))continue;const prev=buscarWorkTitulo_(works,tituloTareaPreviaClase_(r)),practice=buscarWorkTitulo_(works,tituloPracticaClase_(r));const gammaOk=/^https:\/\/gamma\.app\//i.test(String(r.gammaUrl||''));if(!prev||!practice||!gammaOk)return{ok:true,complete:false,materia:subject,courseId:String(course.id),courseName:course.name,planningSpreadsheetId:plan.source.spreadsheetId,planningSheet:plan.sheet.getName(),target:r,missing:{tareaPrevia:!prev,gamma:!gammaOk,practica:!practice},resourceState:'DRAFT'};}
  return{ok:true,complete:true,materia:subject,courseId:String(course.id),courseName:course.name};
}
function crearTareaPaquete_(courseId,materia,row,title,description,dueDate,dueTime){
  const existing=buscarWorkTitulo_(listarCourseWorkClase_(courseId),title);if(existing)return{workId:String(existing.id),estado:existing.state,reutilizado:true,classroomUrl:existing.alternateLink||''};
  const req={operation:'RESOURCE_CREATE',materia:materia,temaSubtema:row.topic,resourceType:'TAREA',resourceState:'DRAFT'};preflightDocumentoMaestro(req);
  const body={title:title,description:description,workType:'ASSIGNMENT',state:'DRAFT',maxPoints:100};const topicId=resolveTopicId_(courseId,'',row.unit);if(topicId)body.topicId=topicId;
  if(dueDate){const m=dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/),t=String(dueTime||'11:00').match(/^(\d{1,2}):(\d{2})$/);if(m&&t){body.dueDate={year:+m[1],month:+m[2],day:+m[3]};body.dueTime={hours:+t[1],minutes:+t[2]};}}
  const w=Classroom.Courses.CourseWork.create(body,String(courseId)),verified=verificarCourseWorkDraftDirecto_(courseId,w.id);postflightDocumentoMaestro({ok:true,state:verified.state,workId:verified.id},req);return{workId:String(verified.id),estado:verified.state,reutilizado:false,classroomUrl:verified.alternateLink||''};
}
function fechaIsoPlaneacion_(s){const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';}
function horaInicio_(s){const m=String(s||'').match(/(\d{1,2}:\d{2})/);return m?m[1]:'11:00';}
function generarSiguienteClase(params){
  const p=params&&typeof params==='object'?params:{},materia=String(p.materia||'Sistemas Distribuidos').trim(),plan=leerPlaneacionSiguienteClase_(materia),resolved=resolverSiguienteClase(materia);if(resolved.complete)return Object.assign({mode:'END_TO_END',verified:true},resolved);
  const row=resolved.target,idx=plan.rows.findIndex(function(x){return x.row===row.row;}),nextRow=idx>=0&&idx+1<plan.rows.length?plan.rows[idx+1]:null,courseId=resolved.courseId,results={};
  const prevTitle=tituloTareaPreviaClase_(row);results.tareaPrevia=crearTareaPaquete_(courseId,materia,row,prevTitle,row.previous,'','');
  if(!/^https:\/\/gamma\.app\//i.test(String(row.gammaUrl||'')))throw new Error('PAQUETE_INCOMPLETO: falta Gamma canónica para '+row.topic+'.');
  results.gamma={url:row.gammaUrl,verified:true};
  const docId=extraerDocIdPractica_(row);if(!docId)throw new Error('PAQUETE_INCOMPLETO: no se pudo resolver Google Doc de la práctica '+row.practice+'.');
  results.practica=crearPractica({courseId:courseId,materia:materia,temaSubtema:row.topic,courseKey:'UAQ_SISTEMAS_DISTRIBUIDOS',unidad:row.unit,topicName:row.unit,titulo:row.practice,descripcion:'Realiza la práctica canónica de la sesión '+row.session+': '+row.topic+'.\n\nEvidencia y pasos completos en el documento adjunto.',documentId:docId,studentCopy:true});
  if(nextRow&&String(row.next||'').trim()){const nextTitle=tituloTareaPreviaClase_(nextRow);results.tareaSiguiente=crearTareaPaquete_(courseId,materia,row,nextTitle,row.next,fechaIsoPlaneacion_(nextRow.date),horaInicio_(nextRow.time));}
  const works=listarCourseWorkClase_(courseId),checks={tareaPrevia:!!buscarWorkTitulo_(works,prevTitle),practica:!!buscarWorkTitulo_(works,row.practice),gamma:/^https:\/\/gamma\.app\//i.test(String(row.gammaUrl||'')),tareaSiguiente:!nextRow||!String(row.next||'').trim()||!!buscarWorkTitulo_(works,tituloTareaPreviaClase_(nextRow))};
  if(Object.keys(checks).some(function(k){return !checks[k];}))throw new Error('POSTFLIGHT_PAQUETE_INCOMPLETO: '+JSON.stringify(checks));
  return{ok:true,mode:'END_TO_END',verified:true,materia:materia,courseId:courseId,target:row,checks:checks,results:results,resourceState:'DRAFT'};
}
function generarSiguienteClaseSistemasDistribuidos(){return generarSiguienteClase({materia:'Sistemas Distribuidos'});}
