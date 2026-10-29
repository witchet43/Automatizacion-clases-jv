/**
 * Fuente ejecutable única para "siguiente clase".
 *
 * La planeación aporta orden y referencias, pero NUNCA certifica el estado actual
 * de Gamma. Classroom se verifica contra Classroom real. Gamma solo se considera
 * vigente cuando la operación actual aporta evidencia LIVE obtenida del conector
 * de Gamma y esa evidencia acredita una presentación activa y canónica.
 *
 * Una anotación histórica como "GENERADA Y VERIFICADA" sirve únicamente como
 * referencia para localizar un candidato; jamás equivale a verificación viva.
 */
const GAMMA_LIVE_STATUSES = Object.freeze([
  'LIVE_ACTIVE_CANONICAL',
  'LIVE_ACTIVE_NON_CANONICAL',
  'LIVE_ARCHIVED',
  'LIVE_NOT_FOUND',
  'LIVE_INACCESSIBLE'
]);
const NOTION_LIVE_STATUSES = Object.freeze([
  'LIVE_CANONICAL',
  'LIVE_NON_CANONICAL',
  'LIVE_NOT_FOUND',
  'LIVE_INACCESSIBLE'
]);

function normalizarGammaLiveEvidence_(row, gammaLiveEvidence) {
  const session=String(row&&row.session||'').trim();
  const map=gammaLiveEvidence&&typeof gammaLiveEvidence==='object'&&!Array.isArray(gammaLiveEvidence)
    ? gammaLiveEvidence : {};
  const raw=map[session]&&typeof map[session]==='object'?map[session]:null;
  if(!raw){
    return {
      provided:false,
      status:'NOT_CHECKED',
      verified:false,
      reusable:false,
      createAllowed:false,
      decision:'VERIFY_LIVE',
      source:'',
      gammaId:'',
      gammaUrl:'',
      title:'',
      archived:null,
      contentVerified:false,
      canonicalTopicVerified:false,
      searchPerformed:false,
      activeEquivalentFound:false
    };
  }

  const source=String(raw.source||'').trim();
  if(source!=='GAMMA_LIVE_CONNECTOR')
    throw new Error('GAMMA_LIVE_EVIDENCE_SOURCE_INVALID: '+session);

  const status=String(raw.status||'').trim().toUpperCase();
  if(GAMMA_LIVE_STATUSES.indexOf(status)<0)
    throw new Error('GAMMA_LIVE_STATUS_INVALID: '+session+' '+status);

  const searchPerformed=raw.searchPerformed===true;
  const activeEquivalentFound=raw.activeEquivalentFound===true;
  const archived=raw.archived===true;
  const contentVerified=raw.contentVerified===true;
  const canonicalTopicVerified=raw.canonicalTopicVerified===true;
  const gammaId=String(raw.gammaId||'').trim();
  const gammaUrl=String(raw.gammaUrl||'').trim();
  const title=String(raw.title||'').trim();
  // Gamma puede devolver themeId:null aunque la llamada haya enviado
  // el identificador institucional. Eso es una advertencia del proveedor,
  // no una razón para revocar la evidencia de contenido/identidad.
  const themeIdSent=String(raw.themeIdSent||'').trim();
  const themeNullReported=Object.prototype.hasOwnProperty.call(raw,'themeIdReturned') &&
    raw.themeIdReturned===null;
  const themeWarning=themeNullReported&&themeIdSent&&raw.themeRequestVerified===true
    ? 'GAMMA_THEME_ID_NULL_RESPONSE_NON_BLOCKING' : '';

  if(status==='LIVE_ACTIVE_CANONICAL'){
    if(archived||!contentVerified||!canonicalTopicVerified||!searchPerformed||(!gammaId&&!gammaUrl))
      throw new Error('GAMMA_LIVE_ACTIVE_CANONICAL_INCOMPLETE: '+session);
  }
  if((status==='LIVE_ARCHIVED'||status==='LIVE_NOT_FOUND')&&!searchPerformed)
    throw new Error('GAMMA_LIVE_SEARCH_REQUIRED_BEFORE_CREATE: '+session);
  if(status==='LIVE_ARCHIVED'&&raw.archived!==true)
    throw new Error('GAMMA_LIVE_ARCHIVED_FLAG_REQUIRED: '+session);

  const verified=status==='LIVE_ACTIVE_CANONICAL'&&!archived&&contentVerified&&canonicalTopicVerified&&searchPerformed;
  const createAllowed=(status==='LIVE_ARCHIVED'||status==='LIVE_NOT_FOUND')&&
    searchPerformed&&!activeEquivalentFound;
  let decision='BLOCK';
  if(verified)decision='REUSE';
  else if(createAllowed)decision='CREATE';
  else if(status==='LIVE_ACTIVE_NON_CANONICAL')decision='REPAIR_OR_REVIEW';
  else if(status==='LIVE_INACCESSIBLE')decision='BLOCK';
  else if(status==='LIVE_ARCHIVED'||status==='LIVE_NOT_FOUND')decision='REUSE_ACTIVE_EQUIVALENT';

  return {
    provided:true,
    status:status,
    verified:verified,
    reusable:verified,
    createAllowed:createAllowed,
    decision:decision,
    source:source,
    gammaId:gammaId,
    gammaUrl:gammaUrl,
    title:title,
    themeIdSent:themeIdSent,themeWarning:themeWarning,
    archived:archived,
    contentVerified:contentVerified,
    canonicalTopicVerified:canonicalTopicVerified,
    searchPerformed:searchPerformed,
    activeEquivalentFound:activeEquivalentFound
  };
}

function normalizarNotionLiveEvidence_(row, notionLiveEvidence) {
  const session=String(row&&row.session||'').trim();
  const map=notionLiveEvidence&&typeof notionLiveEvidence==='object'&&!Array.isArray(notionLiveEvidence)
    ? notionLiveEvidence : {};
  const raw=map[session]&&typeof map[session]==='object'?map[session]:null;
  if(!raw){
    return {provided:false,status:'NOT_CHECKED',verified:false,reusable:false,createAllowed:false,
      decision:'VERIFY_LIVE',source:'',pageId:'',pageUrl:'',parentPageId:'',title:'',
      contentVerified:false,canonicalTopicVerified:false,gammaReferenceVerified:false,
      searchPerformed:false,duplicateCount:0};
  }
  const source=String(raw.source||'').trim();
  if(source!=='NOTION_LIVE_CONNECTOR')throw new Error('NOTION_LIVE_EVIDENCE_SOURCE_INVALID: '+session);
  const status=String(raw.status||'').trim().toUpperCase();
  if(NOTION_LIVE_STATUSES.indexOf(status)<0)throw new Error('NOTION_LIVE_STATUS_INVALID: '+session+' '+status);
  const searchPerformed=raw.searchPerformed===true;
  const duplicateCount=Math.max(0,Number(raw.duplicateCount||0));
  const contentVerified=raw.contentVerified===true;
  const canonicalTopicVerified=raw.canonicalTopicVerified===true;
  const gammaReferenceVerified=raw.gammaReferenceVerified===true;
  const pageId=String(raw.pageId||'').trim();
  const pageUrl=String(raw.pageUrl||'').trim();
  const parentPageId=String(raw.parentPageId||'').trim();
  const title=String(raw.title||'').trim();

  if(duplicateCount>1)throw new Error('NOTION_DUPLICATE_CLASS_NOTES_BLOCKED: '+session);
  if(status==='LIVE_CANONICAL'&&(!searchPerformed||duplicateCount!==1||!contentVerified||!canonicalTopicVerified||(!pageId&&!pageUrl)))
    throw new Error('NOTION_LIVE_CANONICAL_INCOMPLETE: '+session);
  if(status==='LIVE_NOT_FOUND'&&!searchPerformed)
    throw new Error('NOTION_LIVE_SEARCH_REQUIRED_BEFORE_CREATE: '+session);

  const verified=status==='LIVE_CANONICAL'&&searchPerformed&&duplicateCount===1&&contentVerified&&canonicalTopicVerified;
  const createAllowed=status==='LIVE_NOT_FOUND'&&searchPerformed&&duplicateCount===0;
  let decision='BLOCK';
  if(verified)decision='REUSE';
  else if(createAllowed)decision='CREATE';
  else if(status==='LIVE_NON_CANONICAL')decision='REPAIR_OR_REVIEW';

  return {provided:true,status:status,verified:verified,reusable:verified,createAllowed:createAllowed,
    decision:decision,source:source,pageId:pageId,pageUrl:pageUrl,parentPageId:parentPageId,title:title,
    contentVerified:contentVerified,canonicalTopicVerified:canonicalTopicVerified,
    gammaReferenceVerified:gammaReferenceVerified,searchPerformed:searchPerformed,duplicateCount:duplicateCount};
}

/**
 * Deterministic, single-source exemption. Unknown, blank or alternative
 * names are treated as ordinary teaching sessions (Gamma required).
 */
function resolverObligatoriedadGammaClase_(row){
  const r=row&&typeof row==='object'?row:{};
  const normalize=function(x){return String(x||'').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();};
  const kind=normalize(r.kind||r.sessionType||r.tipoSesion||'');
  const descriptor=normalize([r.gamma,r.gammaState].join(' '));
  const integrative=/^(?:actividad|sesion|clase) integradora(?: sin (?:gamma|presentacion))?$/.test(kind);
  const explicitException=integrative&&/(?:^|\s)no aplica(?:\s|$)/.test(descriptor);
  const exam=esSesionExamenPlaneacion_(r);
  return {required:!(exam||explicitException),
    exemption:exam?'EXAM_NOT_A_CLASS':explicitException?'EXPLICIT_INTEGRATIVE_NO_GAMMA':'',
    type:kind||'unspecified'};
}

function evidenciaSesionReal_(row, works, gammaLiveEvidence, notionLiveEvidence) {
  const titulo=String(row.practice||'').trim();
  const normal=function(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');};
  const tituloNorm=normal(titulo);
  const ids=String(row.classroomIds||'').match(/\b\d{10,}\b/g)||[];
  const active=(works||[]).filter(function(w){
    return ['DRAFT','PUBLISHED'].indexOf(String(w.state||'').toUpperCase())>=0;
  });
  const tituloEsPlaceholder=!tituloNorm||/^(historico|histórico|actividad definida|practica definida|práctica definida|práctica formal(?:\s+de)?|practica formal(?:\s+de)?|actividad de|no aplica)/i.test(String(titulo||'').trim());
  const matches=active.filter(function(w){
    const byId=ids.indexOf(String(w.id))>=0;
    const byTitle=tituloNorm&&normal(w.title)===tituloNorm;
    return byTitle||(tituloEsPlaceholder&&byId);
  });

  const gammaUrl=String(row.gammaUrl||'').trim();
  const gammaState=String(row.gammaState||'').trim();
  // Contrato tipificado y fail-closed: "NO APLICA" escrito en una celda
  // libre NO autoriza omitir Gamma. Solo una sesión integradora identificada
  // inequívocamente + una exención explícita puede prescindir de ella.
  // Las sesiones de examen no forman parte del selector de clases.
  const gammaPolicy=resolverObligatoriedadGammaClase_(row);
  const gammaNoAplica=!gammaPolicy.required;
  const planningGammaClaimedVerified=/^https:\/\/gamma\.app\/docs\//i.test(gammaUrl)&&
    /\bverificad[ao]\b/i.test(gammaState);
  const live=gammaNoAplica?{
    provided:true,status:'NOT_APPLICABLE',verified:false,reusable:false,createAllowed:false,
    decision:'NOT_APPLICABLE',source:'PLANNING_EXPLICIT_NOT_APPLICABLE',gammaId:'',gammaUrl:'',
    title:'',archived:null,contentVerified:false,canonicalTopicVerified:false,
    searchPerformed:false,activeEquivalentFound:false
  }:normalizarGammaLiveEvidence_(row,gammaLiveEvidence);

  const livePrepared=gammaNoAplica||live.verified;
  const planningPrepared=gammaNoAplica||planningGammaClaimedVerified;
  const notion=normalizarNotionLiveEvidence_(row,notionLiveEvidence);
  return {
    session:String(row.session||''),
    unit:String(row.unit||''),
    topic:String(row.topic||''),
    classroomIds:matches.map(function(w){return String(w.id);}),
    classroomStates:matches.map(function(w){return String(w.state).toUpperCase();}),
    gammaUrl:gammaUrl,
    gammaPlanningState:gammaState,
    planningGammaClaimedVerified:planningGammaClaimedVerified,
    gammaVerificada:live.verified,
    gammaNoAplica:gammaNoAplica,
    gammaRequired:gammaPolicy.required,
    gammaExemption:gammaPolicy.exemption,
    gammaLiveEvidenceProvided:live.provided,
    gammaLiveStatus:live.status,
    gammaLiveSource:live.source,
    gammaLiveId:live.gammaId,
    gammaLiveUrl:live.gammaUrl,
    gammaLiveTitle:live.title,
    gammaThemeWarning:live.themeWarning||'',
    gammaLiveArchived:live.archived,
    gammaLiveSearchPerformed:live.searchPerformed,
    gammaLiveContentVerified:live.contentVerified,
    gammaLiveCanonicalTopicVerified:live.canonicalTopicVerified,
    gammaActiveEquivalentFound:live.activeEquivalentFound,
    gammaDecision:live.decision,
    gammaCanReuse:live.reusable,
    gammaCanCreate:live.createAllowed,
    gammaLiveVerificationRequired:!gammaNoAplica&&!live.provided,
    notionLiveEvidenceProvided:notion.provided,
    notionLiveStatus:notion.status,
    notionLiveSource:notion.source,
    notionPageId:notion.pageId,
    notionPageUrl:notion.pageUrl,
    notionParentPageId:notion.parentPageId,
    notionTitle:notion.title,
    notionContentVerified:notion.contentVerified,
    notionCanonicalTopicVerified:notion.canonicalTopicVerified,
    notionGammaReferenceVerified:notion.gammaReferenceVerified,
    notionLiveSearchPerformed:notion.searchPerformed,
    notionDuplicateCount:notion.duplicateCount,
    notionDecision:notion.decision,
    notionVerificada:notion.verified,
    notionCanReuse:notion.reusable,
    notionCanCreate:notion.createAllowed,
    notionLiveVerificationRequired:!notion.provided,
    recursoPreparado:matches.length>0,
    planningPaquetePreparado:planningPrepared&&matches.length>0,
    paquetePreparado:livePrepared&&notion.verified&&
      (gammaNoAplica||notion.gammaReferenceVerified)&&matches.length>0,
    materialPreparado:livePrepared&&notion.verified&&
      (gammaNoAplica||notion.gammaReferenceVerified)&&matches.length>0,
    publicado:matches.some(function(w){return String(w.state||'').toUpperCase()==='PUBLISHED';})
  };
}

/**
 * Un examen es una evaluación independiente: nunca se materializa como
 * clase nueva. Se clasifica por la columna canónica Tipo de sesión y,
 * como respaldo, por un tema cuyo título sea explícitamente de examen.
 */
function esSesionExamenPlaneacion_(row) {
  const r=row&&typeof row==='object'?row:{};
  const kind=String(r.kind||r.sessionType||r.tipoSesion||r.type||'').trim();
  const topic=String(r.topic||'').trim();
  const practice=String(r.practice||'').trim();
  const isExamType=/(?:^|\s)(?:examen|evaluaci[oó]n\s+(?:de\s+)?(?:unidad|parcial|final))(?:\b|$)/i.test(kind);
  const isExamTopic=/^(?:examen\b|evaluaci[oó]n\s+(?:de\s+)?(?:unidad|parcial|final)\b)/i.test(topic);
  const isExamResource=/^examen\b/i.test(practice);
  return isExamType||isExamTopic||isExamResource;
}

function seleccionarSiguienteClasePorEstadoReal_(rows, works, requestedSession, options) {
  const plan=(Array.isArray(rows)?rows:[]).filter(function(row){return !esSesionExamenPlaneacion_(row);}), opts=options||{};
  if(!plan.length)throw new Error('BLOCKED_NO_CANONICAL_SESSIONS: la planeación está vacía.');
  const liveMap=opts.gammaLiveEvidence&&typeof opts.gammaLiveEvidence==='object'
    ? opts.gammaLiveEvidence : {};
  const notionMap=opts.notionLiveEvidence&&typeof opts.notionLiveEvidence==='object'
    ? opts.notionLiveEvidence : {};
  const seen=plan.map(function(row){return evidenciaSesionReal_(row,works,liveMap,notionMap);});

  const requested=String(requestedSession||'').trim();
  if(requested&&opts.explicitTarget===true){
    const index=plan.findIndex(function(r){return String(r.session||'').trim()===requested;});
    if(index<0)throw new Error('BLOCKED_UNKNOWN_CANONICAL_SESSION: '+requested);
    return {
      complete:false,target:plan[index],evidence:seen[index],
      source:'EXPLICIT_CANONICAL_SESSION',inferredSession:null,
      lastPrepared:null,lastPublished:null,reconciliation:false,observed:seen,
      gammaVerificationOnly:false,notionVerificationOnly:false,provisionalNextSession:null
    };
  }

  const lastPlanningPrepared=seen.reduce(function(last,e,i){return (e.planningPaquetePreparado||e.paquetePreparado)?i:last;},-1);
  const lastPublished=seen.reduce(function(last,e,i){return e.publicado?i:last;},-1);

  // El progreso pedagógico confirmado por Classroom tiene prioridad sobre el
  // estado histórico de Gamma/Notion. Una nota antigua no verificada se registra
  // como deuda de reconciliación, pero nunca regresa el selector a una clase ya
  // sobrepasada por recursos PUBLISHED de sesiones posteriores.
  if(lastPublished>=0 && lastPublished>=lastPlanningPrepared){
    let nextIndex=lastPublished+1;
    while(nextIndex<plan.length && seen[nextIndex].paquetePreparado)nextIndex++;
    const historicalBacklog=seen.slice(0,lastPublished+1).filter(function(e){
      return !e.paquetePreparado;
    }).map(function(e){return {
      session:e.session,
      classroomReady:e.recursoPreparado,
      gammaReady:e.gammaNoAplica||e.gammaVerificada,
      notionReady:e.notionVerificada
    };});
    if(nextIndex>=plan.length)return {
      complete:true,target:null,source:'CLASSROOM_PUBLISHED_PROGRESS',
      lastPrepared:lastPlanningPrepared,lastPublished:lastPublished,
      historicalBacklog:historicalBacklog,observed:seen,
      gammaVerificationOnly:false,notionVerificationOnly:false,
      provisionalNextSession:null
    };
    const next=plan[nextIndex];
    if(requested){
      const requestedIndex=plan.findIndex(function(r){
        return String(r.session||'').trim()===requested;
      });
      if(requestedIndex<0)throw new Error('BLOCKED_UNKNOWN_CANONICAL_SESSION: '+requested);
      if(requestedIndex!==nextIndex && opts.reconciliationMode!==true)
        throw new Error('BLOCKED_SEQUENCE_REAL_STATE: la sesión solicitada '+requested+
          ' difiere de la siguiente sesión observada '+next.session+'.');
    }
    return {
      complete:false,target:next,evidence:seen[nextIndex],
      source:'CLASSROOM_PUBLISHED_PROGRESS',
      lastPrepared:lastPlanningPrepared,lastPublished:lastPublished,
      inferredSession:String(next.session),reconciliation:requested!=='',
      historicalBacklog:historicalBacklog,observed:seen,
      gammaVerificationOnly:false,notionVerificationOnly:false,
      provisionalNextSession:null
    };
  }

  // Para conservar velocidad no se vuelve a auditar todo el semestre. La frontera
  // de avance que la planeación considera preparada se valida LIVE antes de avanzar.
  // Si esa Gamma fue archivada/eliminada, la propia frontera vuelve a ser el objetivo.
  if(lastPlanningPrepared>=0){
    const boundary=seen[lastPlanningPrepared];
    if(!boundary.gammaNoAplica&&!boundary.gammaLiveEvidenceProvided){
      return {
        complete:false,target:plan[lastPlanningPrepared],evidence:boundary,
        source:'GAMMA_LIVE_BOUNDARY_REQUIRED',
        lastPrepared:lastPlanningPrepared-1,lastPublished:lastPublished,
        inferredSession:String(plan[lastPlanningPrepared].session),
        reconciliation:false,observed:seen,gammaVerificationOnly:true,notionVerificationOnly:false,
        provisionalNextSession:lastPlanningPrepared+1<plan.length?String(plan[lastPlanningPrepared+1].session):null
      };
    }
    if((boundary.gammaNoAplica||boundary.gammaVerificada)&&!boundary.notionLiveEvidenceProvided){
      return {
        complete:false,target:plan[lastPlanningPrepared],evidence:boundary,
        source:'NOTION_LIVE_BOUNDARY_REQUIRED',
        lastPrepared:lastPlanningPrepared-1,lastPublished:lastPublished,
        inferredSession:String(plan[lastPlanningPrepared].session),
        reconciliation:false,observed:seen,gammaVerificationOnly:false,notionVerificationOnly:true,
        provisionalNextSession:lastPlanningPrepared+1<plan.length?String(plan[lastPlanningPrepared+1].session):null
      };
    }
  }

  let inferred=0;
  if(lastPlanningPrepared>=0){
    inferred=seen[lastPlanningPrepared].paquetePreparado?lastPlanningPrepared+1:lastPlanningPrepared;
  }
  if(inferred>=plan.length)return {
    complete:true,target:null,source:'PLANNING_REAL_PREPARATION_STATE',
    lastPrepared:lastPlanningPrepared,lastPublished:lastPublished,observed:seen,
    gammaVerificationOnly:false,notionVerificationOnly:false,provisionalNextSession:null
  };

  let index=inferred,reconciliation=false;
  if(requested){
    index=plan.findIndex(function(r){return String(r.session||'').trim()===requested;});
    if(index<0)throw new Error('BLOCKED_UNKNOWN_CANONICAL_SESSION: '+requested);
    if(index!==inferred){
      if(opts.reconciliationMode!==true||String(opts.reconciliationReason||'').trim().length<20)
        throw new Error('BLOCKED_SEQUENCE_REAL_STATE: la sesión solicitada '+requested+' difiere de la siguiente sesión observada '+plan[inferred].session+'; exige reconciliación explícita justificada.');
      reconciliation=true;
    }
  }
  return {
    complete:false,target:plan[index],evidence:seen[index],
    source:'PLANNING_REAL_PREPARATION_STATE',
    lastPrepared:lastPlanningPrepared,lastPublished:lastPublished,
    inferredSession:String(plan[inferred].session),reconciliation:reconciliation,
    observed:seen,gammaVerificationOnly:false,notionVerificationOnly:false,provisionalNextSession:null
  };
}

/** Pruebas puras: planeación no certifica servicios externos vivos. */
function validarSecuenciaRealRegresion(){
  const mk=function(n,unit,activity,gamma){return {session:String(n),unit:unit,topic:'2.'+n+' Tema',practice:activity,
    gammaUrl:gamma?'https://gamma.app/docs/test-'+n:'',gammaState:gamma?'Gamma generado y verificado':''};};
  const gammaLive=function(status,id){return {source:'GAMMA_LIVE_CONNECTOR',status:status,gammaId:id||'g_test',
    gammaUrl:'https://gamma.app/docs/live-'+(id||'g_test'),title:'Tema',
    archived:status==='LIVE_ARCHIVED',contentVerified:status==='LIVE_ACTIVE_CANONICAL',
    canonicalTopicVerified:status==='LIVE_ACTIVE_CANONICAL',searchPerformed:true,activeEquivalentFound:false};};
  const notionLive=function(status,id){return {source:'NOTION_LIVE_CONNECTOR',status:status,pageId:id||'n_test',
    pageUrl:'https://app.notion.com/p/'+(id||'n_test'),parentPageId:'parent',title:'Tema',
    contentVerified:status==='LIVE_CANONICAL',canonicalTopicVerified:status==='LIVE_CANONICAL',
    gammaReferenceVerified:status==='LIVE_CANONICAL',searchPerformed:true,
    duplicateCount:status==='LIVE_NOT_FOUND'?0:1};};
  const rows=[mk(12,'Unidad 2','Actividad 5',true),mk(13,'Unidad 2','Actividad 6',true),mk(14,'Unidad 2','Actividad 7',false),mk(15,'Unidad 2','Actividad 8',false)];
  const prepared=[{id:'100000000001',title:'Actividad 5',state:'PUBLISHED'},{id:'100000000002',title:'Actividad 6',state:'DRAFT'}];

  const planningOnly=evidenciaSesionReal_(rows[1],prepared,{},{});
  if(planningOnly.gammaVerificada||planningOnly.notionVerificada||planningOnly.paquetePreparado||!planningOnly.planningGammaClaimedVerified)
    throw new Error('REGRESSION_LIVE: planeación no puede certificar servicios vivos.');

  let state=seleccionarSiguienteClasePorEstadoReal_(rows,prepared);
  if(state.target.session!=='13'||state.source!=='GAMMA_LIVE_BOUNDARY_REQUIRED'||!state.gammaVerificationOnly)
    throw new Error('REGRESSION_GAMMA: frontera debe requerir Gamma LIVE.');

  state=seleccionarSiguienteClasePorEstadoReal_(rows,prepared,null,{gammaLiveEvidence:{'13':gammaLive('LIVE_ACTIVE_CANONICAL','g13')}});
  if(state.target.session!=='13'||state.source!=='NOTION_LIVE_BOUNDARY_REQUIRED'||!state.notionVerificationOnly)
    throw new Error('REGRESSION_NOTION: Gamma válida no permite avanzar sin Notion LIVE.');

  state=seleccionarSiguienteClasePorEstadoReal_(rows,prepared,null,{
    gammaLiveEvidence:{'13':gammaLive('LIVE_ACTIVE_CANONICAL','g13')},
    notionLiveEvidence:{'13':notionLive('LIVE_CANONICAL','n13')}
  });
  if(state.target.session!=='14')throw new Error('REGRESSION_NOTION: Gamma + Notion LIVE permiten avanzar.');

  const partial=prepared.concat([{id:'100000000003',title:'Actividad 7',state:'DRAFT'}]);
  const withGamma=rows.map(function(r){return Object.assign({},r);});
  withGamma[2].gammaUrl='https://gamma.app/docs/test-14';withGamma[2].gammaState='Gamma generado y verificado';

  state=seleccionarSiguienteClasePorEstadoReal_(withGamma,partial,null,{
    gammaLiveEvidence:{'14':gammaLive('LIVE_ACTIVE_CANONICAL','g14')},
    notionLiveEvidence:{'14':notionLive('LIVE_NOT_FOUND','')}
  });
  if(state.target.session!=='14'||state.evidence.notionDecision!=='CREATE'||state.evidence.paquetePreparado)
    throw new Error('REGRESSION_NOTION: notas ausentes deben forzar CREATE y mantener paquete incompleto.');

  state=seleccionarSiguienteClasePorEstadoReal_(withGamma,partial,null,{
    gammaLiveEvidence:{'14':gammaLive('LIVE_ACTIVE_CANONICAL','g14')},
    notionLiveEvidence:{'14':notionLive('LIVE_CANONICAL','n14')}
  });
  if(state.target.session!=='15')throw new Error('REGRESSION_NOTION: notas LIVE canónicas permiten continuar.');

  const explicit=seleccionarSiguienteClasePorEstadoReal_(rows,prepared,'15',{explicitTarget:true});
  if(explicit.target.session!=='15'||explicit.evidence.gammaDecision!=='VERIFY_LIVE'||explicit.evidence.notionDecision!=='VERIFY_LIVE')
    throw new Error('REGRESSION_EXPLICIT: sesión explícita exige verificación LIVE de Gamma y Notion.');

  let duplicateBlocked=false;
  try{
    evidenciaSesionReal_(rows[1],prepared,{'13':gammaLive('LIVE_ACTIVE_CANONICAL','g13')},{
      '13':Object.assign({},notionLive('LIVE_CANONICAL','n13'),{duplicateCount:2})
    });
  }catch(err){duplicateBlocked=/NOTION_DUPLICATE_CLASS_NOTES_BLOCKED/.test(String(err));}
  if(!duplicateBlocked)throw new Error('REGRESSION_NOTION: duplicados deben bloquearse.');

  return {ok:true,source:'PLANNING_REAL_PREPARATION_STATE',regressions:7,readOnly:true,
    currentDateUsed:false,calendarUsed:false,gammaPlanningIsAuthority:false,
    gammaLiveRequired:true,notionLiveRequired:true};
}
