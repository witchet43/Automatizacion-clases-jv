/**
 * Auditoría transversal de SOLO LECTURA por courseId o nombre inequívoco.
 * La fuente de verdad de sesión/tema es MASTER_GUARDRAILS.PLANNING_SOURCES.
 * NO infiere una planeación de un curso sin fuente canónica configurada.
 * Nunca crea, edita, publica, califica, envía correos ni consume créditos Gamma.
 *
 * auditarMateriaAcademica('871149624583')
 * auditarMateriaAcademica('UAQ - Ética y Legislación Informática')
 * auditarMateriaAcademica({materia:'Ética y Legislación Informática'})
 *
 * Nota: Gamma se contrasta contra URL/estado registrado, NO contra la API remota
 * de Gamma (no conectada con Apps Script). Un enlace verificado en Sheets nunca
 * equivale aquí a comprobación de existencia/contenido de la Gamma remota.
 */
function auditarMateriaAcademica(identificador) {
  const input = identificador && typeof identificador === 'object'
    ? identificador : (/^\d{10,}$/.test(String(identificador||'').trim())
      ? {courseId:String(identificador)} : {materia:String(identificador||'')});
  const identity=auditoriaResolverIdentidad_(input);
  const source=resolvePlanningSource_(identity.materiaCanonica);
  const planning=auditoriaLeerPlan_(source);
  const course=Classroom.Courses.get(identity.courseId);
  if(String(course.id)!==identity.courseId)throw new Error('AUDITORIA_IDENTIDAD: Classroom devolvió otro curso.');
  const works=auditoriaListarCourseWork_(identity.courseId);
  const workById={};const workByTitle={};
  works.forEach(function(w){
    workById[String(w.id)]=w;
    const key=auditoriaNormalizar_(w.title);
    (workByTitle[key]||(workByTitle[key]=[])).push(w);
  });
  const sheet=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const taskRecords=auditoriaLeerRegistros_(sheet,'Tareas','ID curso',identity.courseId);
  const quizRecords=auditoriaLeerRegistros_(sheet,'Quizzes','ID del curso',identity.courseId);
  const tasksById={},tasksByTitle={};
  taskRecords.forEach(function(r){
    const id=String(r.data['ID Classroom']||'').trim();
    if(id)(tasksById[id]||(tasksById[id]=[])).push(r);
    const key=auditoriaNormalizar_(r.data['Título']);
    if(key)(tasksByTitle[key]||(tasksByTitle[key]=[])).push(r);
  });
  const quizById={};
  quizRecords.forEach(function(r){
    const id=String(r.data['ID actividad Classroom']||'').trim();
    if(id)(quizById[id]||(quizById[id]=[])).push(r);
  });
  const issues=[], driveCache={};
  const add=function(category,code,detail){
    issues.push(Object.assign({categoria:category,codigo:code},detail||{}));
  };
  const inspectDrive=function(id){
    const fileId=String(id||'').trim();
    if(!fileId)return {estado:'SIN_ID'};
    if(driveCache[fileId])return driveCache[fileId];
    try {
      const f=Drive.Files.get(fileId,{fields:'id,name,mimeType,trashed,parents,webViewLink'});
      driveCache[fileId]={estado:f.trashed?'EN_PAPELERA':'CONFIRMADO',
        id:String(f.id||fileId),nombre:String(f.name||''),mimeType:String(f.mimeType||''),
        parents:f.parents||[],url:String(f.webViewLink||'')};
    } catch(err) {
      driveCache[fileId]={estado:'NO_VERIFICABLE',id:fileId,error:String(err.message||err)};
    }
    return driveCache[fileId];
  };
  const expectedById={};
  const markExpected=function(ids,session){
    ids.forEach(function(id){(expectedById[id]||(expectedById[id]=[])).push(session);});
  };
  const sessions=planning.rows.map(function(p){
    const status=auditoriaEstadoSesion_(p.fecha,new Date());
    const result={sesion:p.sesion,fecha:p.fecha||'',periodo:status,unidad:p.unidad,
      tema:p.tema,filaPlaneacion:p.fila,recursos:[],incidencias:[]};
    const addSession=function(category,code,detail){
      const d=Object.assign({sesion:p.sesion,filaPlaneacion:p.fila,tema:p.tema},detail||{});
      add(category,code,d);result.incidencias.push(code);
    };
    const gamma=String(p.gammaUrl||'').trim();
    const gammaTitle=String(p.gammaTitle||'').trim();
    const gammaState=String(p.gammaState||'').trim();
    result.gamma={titulo:gammaTitle,url:gamma,estadoRegistrado:gammaState,
      existenciaRemota:'NO_VERIFICADA_POR_ESTA_FUNCION'};
    if(gamma) {
      if(!/^https:\/\/gamma\.app\/docs\/[a-z0-9-]+\/?$/i.test(gamma))
        addSession('INCIDENCIA','URL_GAMMA_INVALIDA',{url:gamma});
      if(!/\bverificad[ao]\b/i.test(gammaState))
        addSession('PENDIENTE_VERIFICACION','GAMMA_NO_MARCADA_VERIFICADA',{url:gamma});
    } else if(gammaTitle && !auditoriaEsMarcador_(gammaTitle) && status==='PASADA') {
      addSession('OMISION_DE_REGISTRO','GAMMA_DECLARADA_SIN_URL',{titulo:gammaTitle});
    } else if(status==='PASADA' && /pendiente/i.test(gammaTitle+' '+gammaState)) {
      addSession('PENDIENTE_VERIFICACION','GAMMA_SIN_DETERMINAR_APLICABILIDAD');
    }
    const candidates=auditoriaTitulosExplicitos_([p.actividad,p.actividadDia,p.previa,p.siguiente]);
    candidates.forEach(function(title){
      const matches=workByTitle[auditoriaNormalizar_(title)]||[];
      const records=tasksByTitle[auditoriaNormalizar_(title)]||[];
      const datum={titulo:title,ids:matches.map(function(w){return String(w.id);}),
        estados:matches.map(function(w){return String(w.state);}),
        registroOperativo:records.map(function(r){return r.fila;})};
      result.recursos.push(datum);
      markExpected(datum.ids,p.sesion);
      if(matches.length>1)addSession('DUPLICADO','COURSEWORK_TITULO_DUPLICADO',{titulo:title,ids:datum.ids});
      if(matches.length===0 && records.length===0)
        addSession(status==='FUTURA'?'PENDIENTE_FUTURO':'OMISION_DE_REGISTRO',
          'RECURSO_DECLARADO_NO_LOCALIZADO',{titulo:title});
      else if(matches.length===0 && records.length && records.some(function(r){return String(r.data['ID Classroom']||'').trim();}))
        addSession('INCIDENCIA','REGISTRO_NO_COINCIDE_CON_CLASSROOM',{titulo:title,
          idsRegistrados:records.map(function(r){return String(r.data['ID Classroom']||'');})});
      else if(matches.length && !records.length && !quizRecords.some(function(q){
        return matches.some(function(w){return String(q.data['ID actividad Classroom']||'')===String(w.id);});
      }))addSession('DESVINCULADO','SIN_REGISTRO_OPERATIVO',{titulo:title,ids:datum.ids});
    });
    const ids=[];
    const plannedDocId=auditoriaExtraerDocId_(p.documento);
    if(plannedDocId) {
      const file=inspectDrive(plannedDocId);
      result.documento={id:plannedDocId,estado:file.estado,nombre:file.nombre||'',url:p.documento};
      if(file.estado!=='CONFIRMADO'||file.mimeType!=='application/vnd.google-apps.document')
        addSession('INCIDENCIA','DOC_PLANEADO_NO_VERIFICABLE',{documento:result.documento});
      const linked=works.filter(function(w){
        return (w.materials||[]).some(function(m){
          return m.driveFile&&m.driveFile.driveFile&&String(m.driveFile.driveFile.id)===plannedDocId;
        });
      });
      result.documento.courseWorkIds=linked.map(function(w){return String(w.id);});
      markExpected(result.documento.courseWorkIds,p.sesion);
      if(!linked.length && status==='PASADA')
        addSession('DESVINCULADO','DOC_PLANEADO_SIN_ADJUNTO_CLASSROOM',{documentId:plannedDocId});
      if(linked.length){
        linked.forEach(function(w){
          const m=(w.materials||[]).find(function(x){
            return x.driveFile&&x.driveFile.driveFile&&String(x.driveFile.driveFile.id)===plannedDocId;
          });
          if(m&&String(m.driveFile.shareMode||'')!=='STUDENT_COPY')
            addSession('INCIDENCIA','DOC_SIN_COPIA_INDIVIDUAL',{workId:String(w.id),documentId:plannedDocId});
        });
      }
    }
    return result;
  });
  // Verificar TODOS los trabajos del curso, incluso los no declarados en la planeación.
  works.forEach(function(w){
    const id=String(w.id),title=String(w.title||''),rowMatches=tasksById[id]||[],
      quizMatches=quizById[id]||[];
    if(rowMatches.length>1||quizMatches.length>1)
      add('DUPLICADO','ID_CLASSROOM_REPETIDO_EN_REGISTROS',{workId:id,titulo:title});
    if(!rowMatches.length&&!quizMatches.length)
      add('DESVINCULADO','CLASSROOM_SIN_REGISTRO_OPERATIVO',
        {workId:id,titulo:title,estado:String(w.state||'')});
    rowMatches.forEach(function(r){
      if(auditoriaNormalizar_(r.data['Título'])!==auditoriaNormalizar_(title))
        add('INCIDENCIA','TITULO_CLASSROOM_DIFIERE_REGISTRO',
          {workId:id,titulo:title,tituloRegistrado:String(r.data['Título']||''),filaOperativa:r.fila});
    });
    (w.materials||[]).forEach(function(m){
      const idDoc=String(m.driveFile&&m.driveFile.driveFile&&m.driveFile.driveFile.id||'');
      const link=String(m.link&&m.link.url||'');
      const linkedDoc=auditoriaExtraerDocId_(link);
      if(linkedDoc)add('INCIDENCIA','DOC_COMPARTIDO_COMO_ENLACE_SIN_COPIA',
        {workId:id,documentId:linkedDoc});
      if(idDoc){
        const file=inspectDrive(idDoc);
        if(file.estado==='NO_VERIFICABLE')
          add('PENDIENTE_VERIFICACION','ADJUNTO_DRIVE_NO_VERIFICABLE',
            {workId:id,fileId:idDoc,error:file.error});
        if(file.estado==='EN_PAPELERA')
          add('INCIDENCIA','ADJUNTO_EN_PAPELERA',{workId:id,fileId:idDoc});
        if(file.estado==='CONFIRMADO'&&file.mimeType==='application/vnd.google-apps.document'&&
           String(m.driveFile.shareMode||'')!=='STUDENT_COPY')
          add('INCIDENCIA','GOOGLE_DOC_SIN_STUDENT_COPY',
            {workId:id,documentId:idDoc,shareMode:String(m.driveFile.shareMode||'')});
      }
    });
  });
  // Los registros operativos se cotejan por ID real; CREADA no acredita PUBLISHED.
  taskRecords.forEach(function(r){
    const d=r.data,id=String(d['ID Classroom']||'').trim(),title=String(d['Título']||'');
    if(!id){
      if(/CREADA|PROCESANDO/i.test(String(d['Estado solicitud']||'')))
        add('INCIDENCIA','REGISTRO_TAREA_SIN_ID',{filaOperativa:r.fila,titulo:title});
      return;
    }
    const w=workById[id];
    if(!w){
      add('INCIDENCIA','ID_TAREA_NO_ENCONTRADO_EN_CLASSROOM',
        {filaOperativa:r.fila,workId:id,titulo:title,estadoRegistrado:String(d['Estado solicitud']||'')});
      return;
    }
    const docId=auditoriaExtraerDocId_(d['Archivo adjunto (Google Doc)']);
    if(docId){
      const f=inspectDrive(docId);
      if(f.estado!=='CONFIRMADO'||f.mimeType!=='application/vnd.google-apps.document')
        add('INCIDENCIA','DOC_OPERATIVO_NO_VERIFICABLE',{filaOperativa:r.fila,workId:id,documentId:docId});
      const attached=(w.materials||[]).find(function(m){
        return m.driveFile&&m.driveFile.driveFile&&String(m.driveFile.driveFile.id)===docId;
      });
      if(!attached)add('DESVINCULADO','DOC_OPERATIVO_NO_ADJUNTO',{filaOperativa:r.fila,workId:id,documentId:docId});
      else if(String(attached.driveFile.shareMode||'')!=='STUDENT_COPY')
        add('INCIDENCIA','DOC_OPERATIVO_SIN_STUDENT_COPY',{filaOperativa:r.fila,workId:id,documentId:docId});
    }
    if(/^(CREADA|APROBADA)$/i.test(String(d['Estado solicitud']||''))&&
       !['DRAFT','PUBLISHED'].includes(String(w.state||'')))
      add('INCIDENCIA','ESTADO_CLASSROOM_INESPERADO',{filaOperativa:r.fila,workId:id,estado:String(w.state||'')});
  });
  quizRecords.forEach(function(r){
    const d=r.data,id=String(d['ID actividad Classroom']||'').trim(),
      fid=String(d['ID del Form']||'').trim(),title=String(d['Título']||'');
    if(String(d['Estado']||'').toUpperCase()==='ERROR')
      add('INCIDENCIA','EVALUACION_REGISTRADA_ERROR',
        {filaOperativa:r.fila,quizId:String(d['Quiz ID']||''),titulo:title,
         detalle:String(d['Resultado / error']||'').slice(0,300)});
    if(id&&!workById[id])
      add('INCIDENCIA','QUIZ_CLASSROOM_ID_NO_VERIFICADO',
        {filaOperativa:r.fila,quizId:String(d['Quiz ID']||''),workId:id});
    if(fid){
      const f=inspectDrive(fid);
      if(f.estado!=='CONFIRMADO'||f.mimeType!=='application/vnd.google-apps.form')
        add('INCIDENCIA','FORM_REGISTRADO_NO_VERIFICABLE',
          {filaOperativa:r.fila,quizId:String(d['Quiz ID']||''),formId:fid,estado:f.estado});
      const w=workById[id];
      const url=String(d['URL responder Form']||'').trim();
      if(w&&url&&!(w.materials||[]).some(function(m){
        return m.link&&String(m.link.url||'').trim()===url;
      }))add('DESVINCULADO','FORM_NO_ENLAZADO_EN_CLASSROOM',
        {filaOperativa:r.fila,quizId:String(d['Quiz ID']||''),formId:fid,workId:id});
    } else if(id)add('INCIDENCIA','EVALUACION_CON_CLASSROOM_SIN_FORM_ID',
      {filaOperativa:r.fila,quizId:String(d['Quiz ID']||''),workId:id});
  });
  const calendar=auditoriaLeerCalendario_(course,planning.rows);
  if(calendar.estado==='CONFIRMADO'){
    sessions.forEach(function(s){
      const key=auditoriaFechaCanonica_(s.fecha);
      if(!key){s.calendario={estado:'FECHA_NO_VERIFICABLE'};return;}
      const items=calendar.porFecha[key]||[];
      s.calendario={estado:items.length?'EVENTO_EN_FECHA':'SIN_EVENTO_EN_FECHA',
        eventos:items.map(function(e){return {id:e.id,titulo:e.summary||''};})};
      if(!items.length)add('INCIDENCIA','SIN_EVENTO_EN_CALENDARIO_CURSO',
        {sesion:s.sesion,fecha:s.fecha,calendarId:calendar.calendarId});
      else if(items.length===1){
        const d=String(items[0].description||'');
        const missing=ACADEMIC_POLICY.CALENDAR.DESCRIPTION_FIELDS.filter(function(f){
          return d.toLowerCase().indexOf(String(f).toLowerCase())<0;
        });
        if(missing.length)add('PENDIENTE_VERIFICACION','DESCRIPCION_CALENDARIO_INCOMPLETA',
          {sesion:s.sesion,eventId:items[0].id,camposFaltantes:missing});
      } else add('PENDIENTE_VERIFICACION','VARIOS_EVENTOS_MISMA_FECHA_SIN_ID_CANONICO',
        {sesion:s.sesion,fecha:s.fecha,ids:items.map(function(e){return e.id;})});
    });
  }else add('COBERTURA_INCOMPLETA','CALENDARIO_CURSO_NO_VERIFICADO',
    {calendarId:calendar.calendarId||'',detalle:calendar.error||calendar.estado});
  const counts={};
  issues.forEach(function(i){counts[i.categoria]=(counts[i.categoria]||0)+1;});
  return {ok:true,modo:'SOLO_LECTURA',writes:false,curso:{
      id:identity.courseId,nombre:course.name,estado:course.courseState||'',
      calendarId:course.calendarId||''},
    fuente:{planeacionId:source.spreadsheetId,hoja:source.preferredSheet,
      filaEncabezados:source.headerRow,operacionId:QUIZ_PIPELINE.SPREADSHEET_ID},
    cobertura:{sesiones:sessions.length,courseWorks:works.length,registrosTareas:taskRecords.length,
      registrosEvaluaciones:quizRecords.length,calendar:calendar.estado,
      gamma:'SOLO_ENLACE_Y_ESTADO_REGISTRADO; EXISTENCIA_REMOTA_NO_VERIFICADA',
      studentSubmissions:'NO_CONSULTADAS',calificaciones:'NO_CONSULTADAS'},
    sesiones:sessions,incidencias:issues,resumen:counts};
}
function auditoriaNormalizar_(x){
  return String(x==null?'':x).trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function auditoriaResolverIdentidad_(input){
  const id=String(input.courseId||input.id||'').trim();
  const name=String(input.materia||input.nombre||'').trim();
  if(!id&&!name)throw new Error('AUDITORIA_IDENTIDAD: indique courseId o materia.');
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh=ss.getSheetByName('Cursos');
  if(!sh)throw new Error('AUDITORIA_IDENTIDAD: falta hoja operativa Cursos.');
  const all=sh.getDataRange().getDisplayValues();
  const h=(all[0]||[]).map(auditoriaNormalizar_);
  const iId=h.indexOf('id curso'),iName=h.indexOf('nombre');
  if(iId<0||iName<0)throw new Error('AUDITORIA_IDENTIDAD: esquema Cursos incompleto.');
  const key=auditoriaNormalizar_(name);
  const normalized=function(s){
    return auditoriaNormalizar_(s).replace(/^(uaq|itq|umx)\s*-\s*/,'');
  };
  const matches=all.slice(1).filter(function(r){
    if(id)return String(r[iId]).trim()===id;
    return auditoriaNormalizar_(r[iName])===key||normalized(r[iName])===normalized(name);
  });
  if(matches.length!==1)throw new Error('AUDITORIA_IDENTIDAD: curso inexistente o ambiguo ('+matches.length+'). Use ID exacto.');
  const row=matches[0],courseId=String(row[iId]).trim(),courseName=String(row[iName]).trim();
  if(id&&name&&auditoriaNormalizar_(courseName)!==key&&normalized(courseName)!==normalized(name))
    throw new Error('AUDITORIA_IDENTIDAD: ID y nombre no corresponden.');
  const sourceNames=[courseName,normalized(courseName)];
  const materiaCanonica=sourceNames.find(function(s){
    return Boolean(MASTER_GUARDRAILS.PLANNING_SOURCES[auditoriaNormalizar_(s)]);
  });
  if(!materiaCanonica)throw new Error('AUDITORIA_SIN_PLANEACION_CANONICA_CONFIGURADA: '+courseName+
    '. Registrar explícitamente la fuente en MASTER_GUARDRAILS.PLANNING_SOURCES; no se infiere.');
  return {courseId:courseId,materiaCanonica:materiaCanonica,nombre:courseName};
}
function auditoriaLeerPlan_(source){
  const sh=SpreadsheetApp.openById(source.spreadsheetId).getSheetByName(source.preferredSheet);
  if(!sh)throw new Error('AUDITORIA_PLAN: falta hoja '+source.preferredSheet+'.');
  const rows=sh.getDataRange().getDisplayValues();
  const header=rows[Number(source.headerRow)-1];
  if(!header)throw new Error('AUDITORIA_PLAN: no existe fila de encabezados declarada.');
  const normalized=header.map(auditoriaNormalizar_);
  const find=function(names){
    for(let i=0;i<names.length;i++){
      const n=auditoriaNormalizar_(names[i]),idx=normalized.indexOf(n);
      if(idx>=0)return idx;
    }
    return -1;
  };
  const mandatory={
    sesion:find([source.columns.session]),unidad:find([source.columns.unit]),
    tema:find([source.columns.topic])
  };
  Object.keys(mandatory).forEach(function(k){
    if(mandatory[k]<0)throw new Error('AUDITORIA_PLAN: falta columna declarada '+k+'.');
  });
  // Columnas opcionales: ausencia = cobertura limitada, nunca "recurso omitido".
  const optional={
    fecha:find(['Fecha','Fecha de sesión']),actividad:find(['Actividad / práctica vinculada','Práctica del día','Practica del dia']),
    actividadDia:find(['Actividad / práctica del día','Actividad / práctica formal','Actividad en clase y/o práctica formal']),
    previa:find(['Tarea previa a esta clase','Tarea previa']),siguiente:find(['Tarea siguiente / preparación para la próxima clase','Tarea siguiente']),
    documento:find(['Documento Google Docs / recurso','Documento / recurso','Google Doc']),
    gammaTitle:find(['Presentación Gamma','Presentacion Gamma']),gammaUrl:find(['Enlace Gamma','URL Gamma']),
    gammaState:find(['Estado de enlace','Estado Gamma'])
  };
  const cols=Object.assign({},mandatory,optional);
  const out=rows.slice(source.headerRow).map(function(r,i){
    const row={fila:i+source.headerRow+1};
    Object.keys(cols).forEach(function(k){row[k]=cols[k]>=0?String(r[cols[k]]||'').trim():'';});
    return row;
  }).filter(function(r){return r.sesion&&r.tema;});
  if(!out.length)throw new Error('AUDITORIA_PLAN: sin sesiones válidas.');
  return {rows:out,columnasDisponibles:Object.keys(optional).filter(function(k){return optional[k]>=0;})};
}
function auditoriaListarCourseWork_(courseId){
  let token,works=[];
  do{
    const p=Classroom.Courses.CourseWork.list(courseId,{
      pageSize:100,pageToken:token,courseWorkStates:['DRAFT','PUBLISHED']});
    works=works.concat(p.courseWork||[]);token=p.nextPageToken;
  }while(token);
  return works;
}
function auditoriaLeerRegistros_(ss,sheetName,idHeader,courseId){
  const sh=ss.getSheetByName(sheetName);
  if(!sh)throw new Error('AUDITORIA_REGISTROS: falta hoja '+sheetName+'.');
  const data=sh.getDataRange().getDisplayValues();
  if(!data.length)return [];
  const h=data[0],col=h.indexOf(idHeader);
  if(col<0)throw new Error('AUDITORIA_REGISTROS: falta '+idHeader+' en '+sheetName+'.');
  return data.slice(1).map(function(row,i){
    const out={};h.forEach(function(key,j){out[key]=String(row[j]||'').trim();});
    return {fila:i+2,data:out};
  }).filter(function(r){return r.data[idHeader]===courseId;});
}
function auditoriaExtraerDocId_(value){
  const s=String(value||'').trim();
  const match=s.match(/(?:https?:\/\/docs\.google\.com\/document\/d\/)([-\w]{15,})/i);
  if(match)return match[1];
  return /^[-\w]{25,}$/.test(s)?s:'';
}
function auditoriaEsMarcador_(value){
  return !value||/^(pendiente|no aplica|n\/a|sin definir)(\b| \/)/i.test(String(value).trim());
}
function auditoriaTitulosExplicitos_(values){
  const found={};
  (values||[]).forEach(function(value){
    const s=String(value||'').trim();
    if(!s||auditoriaEsMarcador_(s))return;
    // Exige el prefijo completo. "actividad en clase" no es identidad de recurso.
    const candidates=s.split(/\s+\+\s+(?=(?:tarea|actividad|pr[aá]ctica|examen|quiz|proyecto)\b)/i);
    candidates.forEach(function(raw){
      const title=raw.trim();
      if(/^(?:tarea|actividad|pr[aá]ctica|examen|quiz|proyecto)(?:\s+\d+|\s+final|\s+de\b)/i.test(title))
        found[auditoriaNormalizar_(title)]=title;
    });
  });
  return Object.keys(found).map(function(k){return found[k];});
}
function auditoriaFechaCanonica_(s){
  const v=String(s||'').trim();
  let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m)return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
  return '';
}
function auditoriaEstadoSesion_(fecha,now){
  const day=auditoriaFechaCanonica_(fecha);
  if(!day)return 'FECHA_NO_VERIFICABLE';
  const current=Utilities.formatDate(now,'America/Mexico_City','yyyy-MM-dd');
  return day<current?'PASADA':day>current?'FUTURA':'HOY';
}
function auditoriaLeerCalendario_(course,rows){
  const id=String(course.calendarId||'').trim();
  if(!id)return {estado:'SIN_ID_CALENDARIO',calendarId:''};
  const days=rows.map(function(r){return auditoriaFechaCanonica_(r.fecha);}).filter(Boolean).sort();
  if(!days.length)return {estado:'SIN_FECHAS_CANONICAS',calendarId:id};
  const first=new Date(days[0]+'T00:00:00-06:00');
  const last=new Date(days[days.length-1]+'T00:00:00-06:00');
  const max=new Date(last.getTime()+86400000);
  try{
    const byDate={};let pageToken;
    do{
      const page=Calendar.Events.list(id,{
        timeMin:first.toISOString(),timeMax:max.toISOString(),
        singleEvents:true,maxResults:2500,pageToken:pageToken});
      (page.items||[]).forEach(function(e){
        const start=e.start&&(e.start.dateTime||e.start.date);
        if(!start)return;
        const day=e.start.date?
          String(e.start.date):Utilities.formatDate(new Date(start),'America/Mexico_City','yyyy-MM-dd');
        (byDate[day]||(byDate[day]=[])).push(e);
      });
      pageToken=page.nextPageToken;
    }while(pageToken);
    return {estado:'CONFIRMADO',calendarId:id,porFecha:byDate};
  }catch(err){
    return {estado:'LECTURA_FALLIDA',calendarId:id,error:String(err.message||err)};
  }
}