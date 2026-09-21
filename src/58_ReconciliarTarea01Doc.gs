/**
 * Migración segura de un DRAFT histórico sin adjunto a un DRAFT nuevo con
 * Google Doc nativo en STUDENT_COPY. Classroom no admite adjuntar materiales
 * por PATCH ordinario; NO se intenta modificar materials del trabajo antiguo.
 * No afecta recursos publicados ni toca otras tareas.
 * Los IDs intermedios quedan en ScriptProperties para reintentos idempotentes.
 */
function reconciliarTarea01PerifericosConDoc(){
  const courseId='871156721160';
  const previousId='886405170097';
  const title='Tarea 01 - Inventario previo de periféricos';
  const propertyPrefix='RECONCILIAR_DOC_TAREA01_'+previousId+'_';
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('TAREA01_LOCK: otra reconciliación sigue ejecutándose.');
  try{
    assertAcademicAutomationWriteEnabled_();
    const props=PropertiesService.getScriptProperties();
    const old=Classroom.Courses.CourseWork.get(courseId,previousId);
    if(String(old.id||'')!==previousId||String(old.title||'').trim()!==title||
       ['DRAFT','DELETED'].indexOf(String(old.state||'').toUpperCase())<0){
      throw new Error('TAREA01_IDENTITY: el recurso no es el borrador histórico esperado.');
    }
    const original=normalizarInstruccionesDidacticas_(old.description||'','TAREA');
    if(original.indexOf('8 periféricos')<0||original.indexOf('2.1.4')<0)
      throw new Error('TAREA01_CONTENT: no corresponde a la preparación de periféricos.');
    let docId=String(props.getProperty(propertyPrefix+'DOC')||'');
    if(!docId){
      const partes=original.split(/\n\s*\n/).map(function(s){return s.trim();}).filter(Boolean);
      const contenido=[];
      partes.forEach(function(parte){
        if(parte==='INDICACIONES PARA EL ALUMNO'||parte==='DESARROLLO'||parte==='EVIDENCIA DE ENTREGA')return;
        contenido.push(parte);
        if(/^\d+\.\s/.test(parte))contenido.push('RESPUESTA / EVIDENCIA: ______________________________________________________________');
      });
      contenido.push('TABLA DE INVENTARIO: completa aquí ocho filas con nombre, función, clasificación y conexión.',
        'CAPTURA DEL ADMINISTRADOR DE DISPOSITIVOS: inserta aquí la captura sin identificadores sensibles.',
        'PREGUNTAS PARA LA CLASE: 1) ____________________ 2) ____________________');
      const doc=crearGoogleDocumentoPractica_({titulo:title,
        descripcion:'Completa los espacios de trabajo de esta copia individual. Utiliza tu computadora personal con Windows. No desinstales, deshabilites ni actualices controladores.',
        contenidoDocumento:contenido});
      docId=String(doc.id);
      props.setProperty(propertyPrefix+'DOC',docId);
    }
    const file=Drive.Files.get(docId,{fields:'id,name,mimeType,trashed'});
    if(file.trashed||String(file.mimeType)!=='application/vnd.google-apps.document')
      throw new Error('TAREA01_DOC: falta Google Documento nativo vigente.');
    let newId=String(props.getProperty(propertyPrefix+'WORK')||'');
    let replacement=null;
    if(newId)replacement=Classroom.Courses.CourseWork.get(courseId,newId);
    // Recuperación tras corte entre CourseWork.create y guardado del workId.
    if(!replacement){
      let token;
      do{
        const page=Classroom.Courses.CourseWork.list(courseId,{pageSize:100,pageToken:token});
        replacement=(page.courseWork||[]).find(function(w){
          return String(w.id||'')!==previousId&&String(w.title||'').trim()===title&&
            String(w.state||'').toUpperCase()==='DRAFT'&&
            (w.materials||[]).some(function(m){
              return m&&m.driveFile&&m.driveFile.driveFile&&
                String(m.driveFile.driveFile.id||'')===docId&&
                String(m.driveFile.shareMode||'').toUpperCase()==='STUDENT_COPY';
            });
        })||null;
        token=page.nextPageToken;
      }while(!replacement&&token);
      if(replacement){newId=String(replacement.id);props.setProperty(propertyPrefix+'WORK',newId);}
    }
    if(!replacement){
      if(String(old.state||'').toUpperCase()!=='DRAFT')
        throw new Error('TAREA01_RETRY: no se recrea una tarea que dejó de ser DRAFT.');
      const brief='INDICACIONES PARA EL ALUMNO\n\nAbre la copia personal del Google Documento adjunto, completa allí tu inventario, inserta la captura del Administrador de dispositivos y escribe las dos preguntas para la clase. Entrega la copia mediante Classroom.';
      validarFormatoDescripcionClassroom_(brief,'TAREA');
      const body={title:title,description:brief,workType:'ASSIGNMENT',state:'DRAFT',
        maxPoints:Number(old.maxPoints),topicId:old.topicId,
        materials:[{driveFile:{driveFile:{id:docId},shareMode:'STUDENT_COPY'}}]};
      if(old.dueDate)body.dueDate=old.dueDate;
      if(old.dueTime)body.dueTime=old.dueTime;
      replacement=Classroom.Courses.CourseWork.create(body,courseId);
      newId=String(replacement.id||'');
      if(!newId)throw new Error('TAREA01_NEW_ID: Classroom no devolvió ID.');
      props.setProperty(propertyPrefix+'WORK',newId);
    }
    replacement=Classroom.Courses.CourseWork.get(courseId,newId);
    if(String(replacement.title||'')!==title||String(replacement.state||'').toUpperCase()!=='DRAFT'||
      String(replacement.topicId||'')!==String(old.topicId||'')||
      Number(replacement.maxPoints)!==Number(old.maxPoints)||
      JSON.stringify(replacement.dueDate||null)!==JSON.stringify(old.dueDate||null)||
      JSON.stringify(replacement.dueTime||null)!==JSON.stringify(old.dueTime||null))
      throw new Error('TAREA01_POSTFLIGHT: faltan título, tema, puntos, vencimiento o DRAFT.');
    verificarAdjuntoDocumentoEditable_(replacement,docId);
    // Solo después de verificar el reemplazo se retira el borrador sin adjunto.
    if(String(old.state||'').toUpperCase()==='DRAFT'){
      Classroom.Courses.CourseWork.remove(courseId,previousId);
    }
    const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
    const sh=requireSheet_(ss,'Tareas');
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(String);
    const data=sh.getDataRange().getDisplayValues();
    const idCol=headers.indexOf('ID Classroom'),stateCol=headers.indexOf('Estado solicitud'),resultCol=headers.indexOf('Resultado');
    for(let i=1;i<data.length;i++){
      if(String(data[i][idCol]||'')===previousId){
        sh.getRange(i+1,stateCol+1).setValue('REEMPLAZADA');
        sh.getRange(i+1,resultCol+1).setValue('Reemplazada por DRAFT '+newId+' con Google Doc STUDENT_COPY '+docId);
        break;
      }
    }
    registrarAuditoriaCourseWorkDirecto_({courseId:courseId,titulo:title,tipo:'TAREA',
      unidad:'Unidad 2',topicName:'Unidad 2',descripcion:replacement.description,
      documentId:docId,shareMode:'STUDENT_COPY',puntos:Number(replacement.maxPoints),
      fechaLimite:old.dueDate?'CONSERVADA':'',horaLimite:old.dueTime?'CONSERVADA':''},
      replacement,'Unidad 2','RECONCILIADO');
    return {ok:true,courseId:courseId,previousId:previousId,previousState:'DELETED',
      workId:newId,documentId:docId,documentUrl:'https://docs.google.com/document/d/'+docId+'/edit',
      state:'DRAFT',shareMode:'STUDENT_COPY',nativeDocVerified:true,duplicateActive:false};
  }finally{lock.releaseLock();}
}
