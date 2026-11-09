/**
 * Reconciliación incremental Classroom -> Planeación -> Google Docs.
 * Conserva CourseWork IDs, estados, entregas, notas y URL de documentos.
 * Las numeraciones publicadas en Classroom son anclas; solo se renombran
 * documentos planeados que entran en conflicto. La clase curricular no se mueve.
 */
const ACTIVITY_LEDGER_HEADERS_=[
 'Número','Origen','Clase','Unidad','Título canónico','CourseWork ID',
 'Estado Classroom','Documento ID','Enlace Google Doc','Fila planeación',
 'Numeración original','Estado reconciliación','Clave estable','Observaciones'
];
function actividadNumeroYTextoReconcile_(title){
  const m=String(title||'').trim().match(/^Actividad\\s+(\\d{1,3})\\s*[-–—]\\s*(.+)$/i);
  return m?{number:Number(m[1]),text:String(m[2]).trim()}:null;
}
function ledgerActividadNumero_(n,text){
  return 'Actividad '+String(n).padStart(2,'0')+' - '+String(text||'').trim();
}
function planPuroReconciliacionActividades_(works,rows){
  const courseWorks=(works||[]).filter(function(w){
    return ['DRAFT','PUBLISHED'].indexOf(String(w.state||'').toUpperCase())>=0 &&
      actividadNumeroYTextoReconcile_(w.title);
  }).map(function(w){
    const x=actividadNumeroYTextoReconcile_(w.title);
    return {id:String(w.id),title:String(w.title),state:String(w.state),
      number:x.number,text:x.text,materials:w.materials||[],
      description:String(w.description||''),topicId:String(w.topicId||'')};
  });
  const ledger=(rows||[]).filter(function(row){return row&&row.key;});
  const byWork=Object.create(null),numbers=Object.create(null);
  courseWorks.forEach(function(w){
    byWork[w.id]=w;
    if(!numbers[w.number])numbers[w.number]=[];
    numbers[w.number].push(w.id);
  });
  const recorded=new Set(ledger.map(function(x){return String(x.workId||'');}).filter(Boolean));
  const newClassroom=courseWorks.filter(function(w){return !recorded.has(w.id);})
    .sort(function(a,b){return a.number-b.number||a.id.localeCompare(b.id);});
  const collisions=Object.keys(numbers).filter(function(n){return numbers[n].length>1;})
    .map(function(n){return {number:Number(n),workIds:numbers[n]};});
  const occupied=new Set(Object.keys(numbers).map(Number));
  let last=0;
  const changes=[];
  ledger.filter(function(x){return String(x.origin||'').toUpperCase()==='PLANEACIÓN';})
    .sort(function(a,b){return Number(a.originalNumber)-Number(b.originalNumber)||
       Number(a.sheetRow)-Number(b.sheetRow);}).forEach(function(entry){
      const match=byWork[String(entry.workId||'')];
      const current=Number(entry.number)||0;
      const original=Number(entry.originalNumber)||current;
      let assigned;
      if(match){
        assigned=match.number;
      }else{
        assigned=Math.max(original,last+1);
        while(occupied.has(assigned))assigned++;
      }
      if(!match)occupied.add(assigned);
      if(!match&&assigned!==current)
        changes.push({key:entry.key,sheetRow:entry.sheetRow,
          documentId:entry.documentId,previousNumber:current,
          nextNumber:assigned,title:ledgerActividadNumero_(assigned,
            (actividadNumeroYTextoReconcile_(entry.title)||{}).text||
            String(entry.title||'').replace(/^Actividad\\s+\\d+\\s*[-–—]\\s*/i,'')});
      last=Math.max(last,assigned);
    });
  return {newClassroom:newClassroom,renumberDocuments:changes,
    duplicatedClassroomNumbers:collisions,
    totalClassroom:courseWorks.length,totalPlanned:ledger.filter(function(x){
      return x.origin==='PLANEACIÓN';}).length};
}
function leerLedgerActividadesCanonico_(course,createIfMissing){
  const source=resolvePlanningSource_(course.materia);
  const ss=SpreadsheetApp.openById(source.spreadsheetId);
  let sh=ss.getSheetByName('Inventario de actividades');
  if(!sh&&createIfMissing===true){
    sh=ss.insertSheet('Inventario de actividades');
    sh.getRange(1,1,1,ACTIVITY_LEDGER_HEADERS_.length)
      .setValues([ACTIVITY_LEDGER_HEADERS_]);
    sh.setFrozenRows(1);
  }
  if(!sh)return {spreadsheetId:source.spreadsheetId,sheet:null,rows:[]};
  const all=sh.getDataRange().getDisplayValues();
  const header=all.length?all[0]:[];
  const required=['Número','Origen','Título canónico','CourseWork ID','Documento ID',
    'Numeración original','Clave estable'];
  if(required.some(function(x){return header.indexOf(x)<0;}))
    throw new Error('ACTIVITY_LEDGER_SCHEMA_INVALID');
  const pick=function(row,name){return String(row[header.indexOf(name)]||'').trim();};
  const rows=all.slice(1).map(function(row,i){return {
    number:Number(pick(row,'Número')),origin:pick(row,'Origen'),
    session:pick(row,'Clase'),unit:pick(row,'Unidad'),title:pick(row,'Título canónico'),
    workId:pick(row,'CourseWork ID'),state:pick(row,'Estado Classroom'),
    documentId:pick(row,'Documento ID'),url:pick(row,'Enlace Google Doc'),
    planningRow:pick(row,'Fila planeación'),originalNumber:Number(pick(row,'Numeración original')),
    key:pick(row,'Clave estable'),sheetRow:i+2
  };}).filter(function(x){return x.key;});
  return {spreadsheetId:source.spreadsheetId,sheet:sh,rows:rows};
}
/** Inicializa un curso nuevo desde enlaces ya existentes en su planeación. */
function sembrarActividadesPlaneadasReconciliacion_(course,sheet,works){
  if(!sheet||sheet.getLastRow()>1)return 0;
  const planning=leerPlaneacionSiguienteClase_(course.materia).rows;
  const names=Object.create(null),byDocument=Object.create(null);
  (works||[]).filter(function(w){return actividadNumeroYTextoReconcile_(w.title);})
    .forEach(function(w){
      const key=String(w.title||'').trim().toLowerCase();
      if(!names[key])names[key]=[];
      names[key].push(w);
      (w.materials||[]).forEach(function(m){
        const ref=m&&m.driveFile&&(m.driveFile.driveFile||m.driveFile);
        if(ref&&ref.id)byDocument[String(ref.id)]=w;
      });
    });
  const seen=new Set(),values=[];
  planning.forEach(function(row){
    const url=String(row.activityDocumentUrl||'').trim();
    const match=url.match(/^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/i);
    if(!match||seen.has(match[1]))return;
    const id=match[1];
    seen.add(id);
    const file=DriveApp.getFileById(id);
    if(file.getMimeType()!=='application/vnd.google-apps.document')
      throw new Error('ACTIVITY_SEED_NON_DOCUMENT');
    const title=String(file.getName()||'').trim(),parsed=actividadNumeroYTextoReconcile_(title);
    if(!parsed)throw new Error('ACTIVITY_SEED_TITLE_NOT_NUMBERED');
    const same=names[title.toLowerCase()]||[];
    const work=byDocument[id]||(same.length===1?same[0]:null);
    values.push([parsed.number,'PLANEACIÓN',String(row.session||''),String(row.unit||''),
      title,work?String(work.id):'',work?String(work.state):'',id,url,
      String(row.row||''),parsed.number,'ALINEADA','DOC:'+id,
      work?'Classroom existente por identidad verificada':'Documento planeado; no crear otro trabajo']);
  });
  if(values.length)sheet.getRange(2,1,values.length,ACTIVITY_LEDGER_HEADERS_.length)
    .setValues(values);
  return values.length;
}
function documentoClassroomActividad_(work){
  const docs=(work.materials||[]).map(function(m){
    const ref=m&&m.driveFile&&(m.driveFile.driveFile||m.driveFile);
    return String(ref&&ref.id||'').trim();
  }).filter(Boolean);
  const unique=Array.from(new Set(docs));
  for(let i=0;i<unique.length;i++){
    try{
      if(DriveApp.getFileById(unique[i]).getMimeType()===
          'application/vnd.google-apps.document')return unique[i];
    }catch(ignore){}
  }
  return '';
}
function buscarDocumentoActividadSinDuplicar_(work){
  const attached=documentoClassroomActividad_(work);
  if(attached)return {documentId:attached,origin:'CLASSROOM_ATTACHMENT'};
  const files=DriveApp.getFilesByName(String(work.title||'').trim());
  const matches=[];
  while(files.hasNext()){
    const f=files.next();
    if(f.getMimeType()==='application/vnd.google-apps.document')matches.push(f.getId());
    if(matches.length>3)break;
  }
  if(matches.length===1)return {documentId:matches[0],origin:'EXACT_DRIVE_NAME'};
  if(matches.length>1)return {documentId:'',origin:'AMBIGUOUS_DOCUMENT'};
  return {documentId:'',origin:'NOT_FOUND'};
}
function crearDocumentoDeActividadManual_(work,course){
  const doc=DocumentApp.create(String(work.title||'Actividad Classroom'));
  const body=doc.getBody();
  body.appendParagraph('ACTIVIDAD EXISTENTE EN GOOGLE CLASSROOM');
  body.appendParagraph('Materia: '+String(course.materia));
  body.appendParagraph('CourseWork ID: '+String(work.id));
  body.appendParagraph('Título: '+String(work.title));
  body.appendParagraph('Consigna original de Classroom');
  body.appendParagraph(String(work.description||'Consultar las instrucciones de la actividad en Classroom; no se inventan indicaciones.'));
  doc.saveAndClose();
  return String(doc.getId());
}
function actualizarDocumentoPlaneadoReconciliacion_(action){
  const id=String(action.documentId||'').trim();
  if(!id)throw new Error('ACTIVITY_RENUMBER_DOC_ID_REQUIRED');
  const docFile=DriveApp.getFileById(id);
  if(docFile.getMimeType()!=='application/vnd.google-apps.document')
    throw new Error('ACTIVITY_RENUMBER_NOT_GOOGLE_DOC');
  const original=String(docFile.getName()||'');
  const parsed=actividadNumeroYTextoReconcile_(original);
  if(!parsed||parsed.number!==Number(action.previousNumber))
    throw new Error('ACTIVITY_RENUMBER_CURRENT_TITLE_CONFLICT');
  const nextTitle=ledgerActividadNumero_(action.nextNumber,parsed.text);
  const document=DocumentApp.openById(id);
  const body=document.getBody();
  const old=String(action.previousNumber),next=String(action.nextNumber);
  body.replaceText('Actividad en clase '+old,'Actividad en clase '+next);
  body.replaceText('Actividad '+old+' -','Actividad '+next+' -');
  document.saveAndClose();
  docFile.setName(nextTitle);
  if(String(docFile.getName())!==nextTitle)
    throw new Error('ACTIVITY_RENUMBER_POSTFLIGHT_FAILED');
  return nextTitle;
}
function reconciliarActividadesClaseWeb_(course,p,works){
  const mode=String(p.mode||'').toUpperCase();
  const apply=mode==='RECONCILE_APPLY';
  let ledger=leerLedgerActividadesCanonico_(course,apply);
  let seededCount=0;
  if(apply&&ledger.sheet&&ledger.rows.length===0){
    seededCount=sembrarActividadesPlaneadasReconciliacion_(course,ledger.sheet,works);
    ledger=leerLedgerActividadesCanonico_(course,false);
  }
  const plan=planPuroReconciliacionActividades_(works,ledger.rows);
  const maxMutations=Math.min(8,Math.max(1,Number(p.maxMutations)||4));
  const details=[],errors=[];
  if(apply){
    const sheet=ledger.sheet;
    const mapped=p&&typeof p.sessionMap==='object'&&p.sessionMap?p.sessionMap:{};
    const documentMap=p&&typeof p.documentMap==='object'&&p.documentMap?p.documentMap:{};
    // Validar la sesión contra la planeación canónica antes de asignarla.
    const planRows=Object.keys(mapped).length?leerPlaneacionSiguienteClase_(course.materia).rows:[];
    const pendingWork=plan.newClassroom.slice(0,maxMutations);
    pendingWork.forEach(function(w){
      try{
        let found;
        const suppliedDocument=String(documentMap[w.id]||'').trim();
        if(suppliedDocument){
          const file=DriveApp.getFileById(suppliedDocument);
          if(file.getMimeType()!=='application/vnd.google-apps.document'||
              String(file.getName()||'').trim()!==String(w.title||'').trim())
            throw new Error('ACTIVITY_DOCUMENT_MAP_IDENTITY_MISMATCH');
          found={documentId:suppliedDocument,origin:'VERIFIED_DOCUMENT_MAP'};
        }else found=buscarDocumentoActividadSinDuplicar_(w);
        if(found.origin==='AMBIGUOUS_DOCUMENT'){
          errors.push({workId:w.id,code:'DOCUMENT_MATCH_AMBIGUOUS'});return;
        }
        const documentId=found.documentId||crearDocumentoDeActividadManual_(w,course);
        const suppliedSession=String(mapped[w.id]||'').trim();
        const matchSession=suppliedSession?planRows.find(function(row){
          return String(row.session||'').trim()===suppliedSession;
        }):null;
        if(suppliedSession&&!matchSession)throw new Error('ACTIVITY_SESSION_NOT_CANONICAL');
        const session=matchSession?suppliedSession:'';
        const unit=matchSession?String(matchSession.unit||''):'';
        const entry=[w.number,'CLASSROOM MANUAL',session,unit,ledgerActividadNumero_(w.number,w.text),
          w.id,w.state,documentId,'https://docs.google.com/document/d/'+documentId+'/edit',
          '',w.number,session?'ALINEADA':'SESION_POR_ASIGNAR',
          'CW:'+w.id,'Origen '+found.origin+'; no altera trabajo publicado ni entregas'];
        sheet.appendRow(entry);
        details.push({workId:w.id,documentId:documentId,action:'REGISTER_EXISTING_CLASSROOM'});
      }catch(err){errors.push({workId:w.id,code:String(err&&err.message||err).slice(0,150)});}
    });
    const remaining=maxMutations-details.length;
    if(remaining>0){
      const fresh=leerLedgerActividadesCanonico_(course,false);
      const changes=planPuroReconciliacionActividades_(works,fresh.rows).renumberDocuments
        .slice(0,remaining);
      changes.forEach(function(action){
        try{
          const title=actualizarDocumentoPlaneadoReconciliacion_(action);
          fresh.sheet.getRange(action.sheetRow,1).setValue(action.nextNumber);
          fresh.sheet.getRange(action.sheetRow,5).setValue(title);
          fresh.sheet.getRange(action.sheetRow,12).setValue('ALINEADA');
          details.push({documentId:action.documentId,action:'RENUMBER_PLANNED_DOC',
            from:action.previousNumber,to:action.nextNumber});
        }catch(err){errors.push({documentId:action.documentId,
          code:String(err&&err.message||err).slice(0,150)});}
      });
    }
  }
  const finalLedger=apply?leerLedgerActividadesCanonico_(course,false):ledger;
  const remaining=planPuroReconciliacionActividades_(works,finalLedger.rows);
  return {reconciliation:true,mode:mode,readOnly:!apply,
    spreadsheetId:ledger.spreadsheetId,
    catalogSheet:'Inventario de actividades',
    courseId:String(course.id),materia:String(course.materia),
    classroomActivities:remaining.totalClassroom,plannedDocuments:remaining.totalPlanned,
    missingClassroomActivities:remaining.newClassroom.map(function(w){
      return {workId:w.id,title:w.title,state:w.state,number:w.number,
        attachedDocumentId:documentoClassroomActividad_(w)};
    }),
    numberingChanges:remaining.renumberDocuments,
    duplicateNumbers:remaining.duplicatedClassroomNumbers,
    applied:details,errors:errors,appliedCount:details.length,
    baselineSeeded:seededCount,catalogExists:!!finalLedger.sheet,
    complete:!!finalLedger.sheet&&remaining.newClassroom.length===0&&
      remaining.renumberDocuments.length===0&&errors.length===0,
    nextPhase:!finalLedger.sheet?'RECONCILE_CREATE_LEDGER':
      remaining.newClassroom.length||remaining.renumberDocuments.length
      ?'RECONCILE_CONTINUE':'NONE',
    note:'No modifica IDs, estados, entregas o calificaciones de Classroom. Números curriculares (2.12) no se alteran.'};
}
