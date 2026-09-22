/**
 * Reconciliación transversal controlada: auditoría -> reparación verificable ->
 * nueva auditoría. Nunca publica recursos ni fechas de entrega retrospectivas.
 *
 * Uso: auditarYCompletarMateriaAcademica('871149624583')
 *      auditarYCompletarMateriaAcademica('UAQ - Ética y Legislación Informática')
 *
 * Regla fail-closed: la planeación debe aportar título REAL, instrucciones
 * suficientemente específicas, evidencia y, para un material documental,
 * el Google Doc canónico existente. Si no hay evidencia, no se inventa
 * contenido ni se crean preguntas/exámenes/Gamma de forma indiscriminada.
 * Las Gamma requieren reconciliación de inventario en Gamma: una URL faltante
 * en Sheets NO prueba ausencia remota ni autoriza consumir créditos.
 */
function auditarYCompletarMateriaAcademica(identificador) {
  const inicio=new Date();
  const identity=auditoriaResolverIdentidad_(
    identificador&&typeof identificador==='object'?identificador:
    /^\d{10,}$/.test(String(identificador||'').trim())?
      {courseId:String(identificador)}:{materia:String(identificador||'')});
  const before=auditarMateriaAcademica({courseId:identity.courseId});
  const canonico=leerPlaneacionSiguienteClase_(identity.materiaCanonica);
  const detalle=auditoriaLeerPlan_(resolvePlanningSource_(identity.materiaCanonica));
  const detalleBySession={};
  detalle.rows.forEach(function(x){
    const id=String(x.sesion||'').trim();
    if(detalleBySession[id])throw new Error('AUDITORIA_COMPLETAR: sesión repetida en detalle de planeación: '+id);
    detalleBySession[id]=x;
  });
  const planBySession={};
  canonico.rows.forEach(function(x){
    const key=String(x.session||'').trim();
    if(planBySession[key])throw new Error('AUDITORIA_COMPLETAR: sesión duplicada en la planeación: '+key);
    planBySession[key]=x;
  });
  const accionables=[],bloqueos=[],reutilizados=[];
  const trabajos=auditoriaListarCourseWork_(identity.courseId);
  const registros=auditoriaLeerRegistros_(SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID),
    'Tareas','ID curso',identity.courseId);
  before.sesiones.forEach(function(s){
    const row=planBySession[String(s.sesion)];
    if(!row){bloqueos.push({sesion:s.sesion,codigo:'SIN_SESION_EN_PLANEACION_CANONICA'});return;}
    const corte=completacionSesionConcluida_(row,inicio);
    if(!corte.ok)return;
    const gamma=String(row.gammaUrl||'').trim(),gammaTitle=String(row.gamma||'').trim();
    if(!gamma && gammaTitle && !auditoriaEsMarcador_(gammaTitle))
      bloqueos.push({sesion:s.sesion,codigo:'GAMMA_SIN_URL_REQUIERE_INVENTARIO_REMOTO',
        titulo:gammaTitle,nota:'La falta de URL en Sheets no demuestra que la Gamma no exista.'});
    const title=completacionTituloActividad_(row,detalleBySession[String(s.sesion)]);
    if(!title)return;
    const clave=auditoriaClaveRecurso_(title);
    const records=registros.filter(function(r){
      return auditoriaClaveRecurso_(r.data['Título'])===clave;
    });
    const matches=trabajos.filter(function(w){
      return auditoriaClaveRecurso_(w.title)===clave;
    });
    const idsRegistrados=records.map(function(r){return String(r.data['ID Classroom']||'').trim();}).filter(Boolean);
    const unicos=function(values){return values.filter(function(x,i){return values.indexOf(x)===i;});};
    if(matches.length>1||unicos(idsRegistrados).length>1){
      bloqueos.push({sesion:s.sesion,codigo:'RECURSO_DUPLICADO_O_AMBIGUO',titulo:title,
        ids:unicos(matches.map(function(w){return String(w.id);}).concat(idsRegistrados))});
      return;
    }
    if(idsRegistrados.length&&
       (!matches.length||String(matches[0].id)!==idsRegistrados[0])){
      bloqueos.push({sesion:s.sesion,codigo:'REGISTRO_ID_NO_COINCIDE_CLASSROOM',
        titulo:title,ids:unicos(idsRegistrados)});return;
    }
    const work=matches[0]||null;
    const planned=auditoriaExtraerDocId_(row.documento||
      s.documento&&s.documento.url||'');
    const sourceIds=[];
    if(planned)sourceIds.push(planned);
    records.forEach(function(r){
      const id=auditoriaExtraerDocId_(r.data['Archivo adjunto (Google Doc)']);
      if(id)sourceIds.push(id);
    });
    const onWork=(work&&work.materials||[]).map(function(m){
      const id=m&&m.driveFile&&m.driveFile.driveFile?
        String(m.driveFile.driveFile.id||''):m&&m.link?
        auditoriaExtraerDocId_(m.link.url):'';
      return id;
    }).filter(Boolean);
    const docs=unicos(sourceIds.concat(onWork));
    if(docs.length>1){
      bloqueos.push({sesion:s.sesion,codigo:'DOCUMENTOS_DISTINTOS_PARA_RECURSO',
        titulo:title,ids:docs});return;
    }
    const docId=docs[0]||'';
    if(work){
      reutilizados.push({sesion:s.sesion,titulo:title,workId:String(work.id),
        estado:String(work.state),documentId:docId,origen:'CLASSROOM_VERIFICADO'});
      if(docId){
        const present=(work.materials||[]).some(function(m){
          return m&&m.driveFile&&m.driveFile.driveFile&&
            String(m.driveFile.driveFile.id)===docId&&
            String(m.driveFile.shareMode||'').toUpperCase()==='STUDENT_COPY';
        });
        if(!present){
          if(String(work.state)!=='DRAFT'){
            bloqueos.push({sesion:s.sesion,codigo:'DOC_FALTANTE_EN_PUBLICADA_NO_MUTAR',
              titulo:title,workId:String(work.id),documentId:docId});return;
          }
          accionables.push({sesion:s.sesion,tipo:'REPARAR_DOC_BORRADOR',titulo:title,
            workId:String(work.id),documentId:docId,row:row});
        }
      }else if(/^pr[aá]ctica\s+\d+/i.test(title)){
        bloqueos.push({sesion:s.sesion,codigo:'PRACTICA_EXISTENTE_SIN_DOC_VERIFICADO',
          titulo:title,workId:String(work.id)});
      }
      return;
    }
    // Un título con número parecido NO acredita identidad. No generar si existe
    // la misma numeración canónica con otro título: requiere aclarar duplicados.
    const number=completacionNumeroPractica_(title);
    const sameNumber=number===null?[]:trabajos.filter(function(w){
      return completacionNumeroPractica_(w.title)===number &&
        auditoriaClaveRecurso_(w.title)!==clave;
    });
    if(sameNumber.length){
      bloqueos.push({sesion:s.sesion,codigo:'NUMERO_PRACTICA_OCUPADO_POR_OTRO_TITULO',
        titulo:title,ids:sameNumber.map(function(w){return String(w.id);}),
        titulos:sameNumber.map(function(w){return String(w.title);})});return;
    }
    if(!String(row.practiceDescription||'').trim()||!String(row.evidence||'').trim()){
      bloqueos.push({sesion:s.sesion,codigo:'CONTENIDO_DIDACTICO_INCOMPLETO',
        titulo:title});return;
    }
    // Para una práctica auténticamente omitida, el motor canónico crea el Doc
    // original con contenido tomado de la planeación y adjunta STUDENT_COPY.
    // Para una ACTIVIDAD no se fabrica un documento si falta el canónico.
    if(!docId&&!/^pr[aá]ctica\s+\d+/i.test(title)){
      bloqueos.push({sesion:s.sesion,codigo:'ACTIVIDAD_SIN_DOC_CANONICO_NO_INVENTAR',
        titulo:title});return;
    }
    accionables.push({sesion:s.sesion,
      tipo:docId?'CREAR_RECURSO_HISTORICO':'CREAR_PRACTICA_CON_DOC_PLANIFICADO',
      titulo:title,documentId:docId,row:row});

  });
  const actions=[],maxAcciones=8,lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw new Error('AUDITORIA_COMPLETAR: otra operación académica está en curso.');
  try {
    // Revalidar fuente e identidad bajo lock antes de cualquier escritura.
    if(String(Classroom.Courses.get(identity.courseId).id)!==identity.courseId)
      throw new Error('AUDITORIA_COMPLETAR: cambió la identidad del curso.');
    assertAcademicAutomationWriteEnabled_();
    accionables.forEach(function(action,i){
      if(i>=maxAcciones){
        bloqueos.push({sesion:action.sesion,codigo:'PENDIENTE_SIGUIENTE_EJECUCION',
          titulo:action.titulo});return;
      }
      try{
        const r=completacionEjecutarAccion_(identity,action);
        actions.push({sesion:action.sesion,tipo:action.tipo,titulo:action.titulo,
          workId:String(r.workId),documentId:action.documentId,estado:String(r.estado),
          reutilizado:r.reutilizado===true});
      }catch(err){
        bloqueos.push({sesion:action.sesion,codigo:'FALLO_REPARACION',
          titulo:action.titulo,error:String(err&&err.message||err).slice(0,500)});
      }
    });
  }finally{lock.releaseLock();}
  const after=auditarMateriaAcademica({courseId:identity.courseId});
  return {ok:true,completa:false,modo:'RECONCILIACION_CONSERVADORA',courseId:identity.courseId,
    materia:identity.nombre,fechaCorte:inicio.toISOString(),creadosOReparados:actions,reutilizados:reutilizados,
    bloqueados:bloqueos,antes:before.resumen,despues:after.resumen,
    cobertura:after.cobertura,nota:'No se afirma completitud: Gamma remota, casos ambiguos, exámenes y recursos sin contenido canónico requieren verificación.'};
}
function completacionSesionConcluida_(row,now){
  const date=auditoriaFechaCanonica_(row.date);
  if(!date)return {ok:false,reason:'FECHA_NO_VERIFICABLE'};
  const today=Utilities.formatDate(now,'America/Mexico_City','yyyy-MM-dd');
  if(date<today)return {ok:true};
  if(date>today)return {ok:false,reason:'FUTURA'};
  const time=String(row.time||'');
  const match=time.match(/(?:^|[^0-9])(\d{1,2}):(\d{2})\s*$/);
  if(!match)return {ok:false,reason:'HOY_SIN_HORA_FIN'};
  const end=Number(match[1])*60+Number(match[2]);
  const local=Utilities.formatDate(now,'America/Mexico_City','HH:mm');
  const hm=local.split(':');
  return {ok:Number(hm[0])*60+Number(hm[1])>=end,reason:'HOY'};
}
function completacionNumeroPractica_(title){
  const m=auditoriaNormalizar_(title).match(/^practica\s+0*([1-9]\d*)\s*[-–—]/);
  return m?Number(m[1]):null;
}
function completacionTituloActividad_(row,session){
  // Solo una actividad académica identificada en la planeación. Una tarea o un
  // texto genérico de descripción NO son autorización para crear CourseWork.
  const day=String(row.practice||'').trim();
  const title=String(session&&session.actividadDia||'').trim();
  const candidate=/^(actividad|pr[aá]ctica)\s+\d+\b/i.test(day)?day:
    /^(actividad|pr[aá]ctica)\s+\d+\b/i.test(title)?title:
    /^Matriz de [^-]{8,}\s+-\s+Aplicaci[oó]n\s+\d/i.test(title)?title:'';
  if(!candidate||auditoriaEsMarcador_(candidate))return '';
  return candidate;
}
function completacionEjecutarAccion_(identity,a){
  const id=String(identity.courseId);
  const doc=a.documentId?Drive.Files.get(a.documentId,{fields:'id,name,mimeType,trashed'}):null;
  if(doc&&(doc.trashed||String(doc.mimeType)!=='application/vnd.google-apps.document'))
    throw new Error('El documento canónico no existe o no es un Google Doc vigente.');
  const found=auditoriaListarCourseWork_(id).filter(function(w){
    return auditoriaNormalizar_(w.title)===auditoriaNormalizar_(a.titulo);
  });
  if(found.length>1)throw new Error('Título ambiguo: varios trabajos con el mismo nombre.');
  if(a.tipo==='REPARAR_DOC_BORRADOR'){
    if(found.length!==1||String(found[0].id)!==String(a.workId)||String(found[0].state)!=='DRAFT')
      throw new Error('Cambió el borrador objetivo: detener antes de modificar.');
    const w=asegurarCopiasDocumentosBorrador_(id,found[0],[a.documentId]);
    verificarTodosLosGoogleDocsEnClassroom_(w,[a.documentId]);
    return {workId:String(w.id),estado:w.state,reutilizado:true};
  }
  if(found.length)throw new Error('La actividad fue creada por otra ejecución; reauditar sin duplicar.');
  const p=a.row;
  const description=['INDICACIONES PARA EL ALUMNO',
    'Trabaja de forma individual en tu copia del documento canónico. ',
    'DESARROLLO',String(p.practiceDescription||'').trim(),
    'EVIDENCIA DE ENTREGA',String(p.evidence||'').trim(),
    'Documento de trabajo: '+String(doc.name||a.titulo)].join('\n\n');
  const request={reconciliationMode:true,explicitSequenceOverride:true,
    reconciliationReason:'Auditoría transversal de conciliación de recurso histórico previsto en la planeación y Doc canónico existente.',
    sesionCanonica:Number(a.sesion),courseId:id,materia:identity.materiaCanonica,
    temaSubtema:String(p.topic),unidad:String(p.unit),topicName:String(p.unit),
    titulo:a.titulo,descripcion:description,documentId:a.documentId,
    studentCopy:true};
  const result=/^Pr[aá]ctica\b/i.test(a.titulo)
    ?crearPractica(request):crearActividadReconciliacionHistorica(request);
  const verified=Classroom.Courses.CourseWork.get(id,String(result.workId));
  if(String(verified.state)!=='DRAFT'||verified.dueDate||verified.dueTime)
    throw new Error('POSTFLIGHT: la actividad no quedó DRAFT sin vencimiento.');
  verificarTodosLosGoogleDocsEnClassroom_(verified,[a.documentId]);
  return {workId:String(verified.id),estado:verified.state,reutilizado:result.reutilizado===true};
}
