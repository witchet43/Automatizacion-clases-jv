/**
 * Fuente ejecutable única para "siguiente clase".
 * La fecha actual, el reloj, Calendar, memoria, contadores y propiedades guardadas
 * están PROHIBIDOS para identificar o secuenciar una clase.
 * La planeación aporta exclusivamente el orden canónico. Classroom acredita recursos
 * reales preparados y Gamma verificada acredita el componente visual del paquete.
 * DRAFT + Gamma verificada significa PAQUETE PREPARADO (no clase impartida) y permite
 * continuar preparando el siguiente paquete canónico.
 */
function evidenciaSesionReal_(row, works) {
  const titulo=String(row.practice||'').trim();
  const normal=function(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');};
  const tituloNorm=normal(titulo);
  const ids=String(row.classroomIds||'').match(/\b\d{10,}\b/g)||[];
  const active=(works||[]).filter(function(w){
    return ['DRAFT','PUBLISHED'].indexOf(String(w.state||'').toUpperCase())>=0;
  });
  // Un ID anotado en Sheets nunca se considera evidencia sin cotejarlo en Classroom.
  // Si hay título de actividad/práctica, debe coincidir: una tarea de la sesión
  // siguiente no prueba que la actividad de ESTA sesión ya existe.
  const tituloEsPlaceholder=!tituloNorm||/^(historico|histórico|actividad definida|practica definida|práctica definida|práctica formal(?:\s+de)?|practica formal(?:\s+de)?|actividad de|no aplica)/i.test(String(titulo||'').trim());
  const matches=active.filter(function(w){
    const byId=ids.indexOf(String(w.id))>=0;
    const byTitle=tituloNorm&&normal(w.title)===tituloNorm;
    return byTitle||(tituloEsPlaceholder&&byId);
  });
  const gammaUrl=String(row.gammaUrl||'').trim();
  const gammaState=String(row.gammaState||'').trim();
  const gammaDescriptor=[String(row.gamma||''),gammaUrl,gammaState].join(' ');
  const gammaNoAplica=/\bno\s+aplica\b/i.test(gammaDescriptor);
  const gammaVerificada=/^https:\/\/gamma\.app\/docs\//i.test(gammaUrl)&&
    /\bverificad[ao]\b/i.test(gammaState);
  return {
    session:String(row.session||''),
    unit:String(row.unit||''),
    topic:String(row.topic||''),
    classroomIds:matches.map(function(w){return String(w.id);}),
    classroomStates:matches.map(function(w){return String(w.state).toUpperCase();}),
    gammaUrl:gammaUrl,
    gammaVerificada:gammaVerificada,
    gammaNoAplica:gammaNoAplica,
    recursoPreparado:matches.length>0,
    // DRAFT + (Gamma verificada o Gamma explícitamente no aplicable) acredita preparación integral.
    // Nunca equivale a sesión impartida.
    paquetePreparado:(gammaVerificada||gammaNoAplica)&&matches.length>0,
    materialPreparado:(gammaVerificada||gammaNoAplica)&&matches.length>0,
    publicado:matches.some(function(w){return String(w.state||'').toUpperCase()==='PUBLISHED';})
  };
}
function seleccionarSiguienteClasePorEstadoReal_(rows, works, requestedSession, options) {
  const plan=Array.isArray(rows)?rows:[], opts=options||{};
  if(!plan.length)throw new Error('BLOCKED_NO_CANONICAL_SESSIONS: la planeación está vacía.');
  const seen=plan.map(function(row){return evidenciaSesionReal_(row,works);});
  // Sesión explícita: validar su identidad en la planeación, sin inferir
  // progreso ni exigir reconciliación para trabajar el tema pedido.
  const requested=String(requestedSession||'').trim();
  if(requested&&opts.explicitTarget===true){
    const index=plan.findIndex(function(r){return String(r.session||'').trim()===requested;});
    if(index<0)throw new Error('BLOCKED_UNKNOWN_CANONICAL_SESSION: '+requested);
    const target=plan[index],evidence=seen[index];
    if(/^https?:/i.test(String(evidence.gammaUrl||''))&&!evidence.gammaVerificada)
      throw new Error('BLOCKED_GAMMA_UNVERIFIED: comprobar Gamma existente.');
    return {complete:false,target:target,evidence:evidence,
      source:'EXPLICIT_CANONICAL_SESSION',inferredSession:null,
      lastPrepared:null,lastPublished:null,reconciliation:false,observed:seen};
  }
  const lastPrepared=seen.reduce(function(last,e,i){return e.paquetePreparado?i:last;},-1);
  const lastPublished=seen.reduce(function(last,e,i){return e.publicado?i:last;},-1);
  // La operación resuelve la siguiente clase A PREPARAR, no pretende inferir qué fue impartido.
  // Un paquete DRAFT + Gamma verificada es evidencia real suficiente de preparación.
  // La fecha actual y Calendar no se consultan ni participan en esta decisión.
  let inferred=lastPrepared>=0?lastPrepared+1:0, reconciliation=false;
  if(inferred>=plan.length)return {complete:true, target:null,source:'PLANNING_REAL_PREPARATION_STATE',lastPrepared:lastPrepared,lastPublished:lastPublished,observed:seen};

  let index=inferred;
  if(requested){
    index=plan.findIndex(function(r){return String(r.session||'').trim()===requested;});
    if(index<0)throw new Error('BLOCKED_UNKNOWN_CANONICAL_SESSION: '+requested);
    if(index!==inferred){
      if(opts.reconciliationMode!==true||String(opts.reconciliationReason||'').trim().length<20)
        throw new Error('BLOCKED_SEQUENCE_REAL_STATE: la sesión solicitada '+requested+' difiere de la siguiente sesión observada '+plan[inferred].session+'; exige reconciliación explícita justificada.');
      reconciliation=true;
    }
  }
  const target=plan[index], evidence=seen[index];
  if(/^https?:\/\//i.test(evidence.gammaUrl)&&!evidence.gammaVerificada)
    throw new Error('BLOCKED_GAMMA_UNVERIFIED: existe URL Gamma sin estado de verificación; comprobar y reutilizar antes de generar.');
  return {complete:false,target:target,evidence:evidence,source:'PLANNING_REAL_PREPARATION_STATE',
    lastPrepared:lastPrepared,lastPublished:lastPublished,inferredSession:String(plan[inferred].session),
    reconciliation:reconciliation,observed:seen};
}
/** Pruebas puras, sin accesos a Classroom, Gamma, Drive ni modificaciones. */
function validarSecuenciaRealRegresion(){
  const mk=function(n,unit,activity,gamma){return {session:String(n),unit:unit,topic:'2.'+n+' Tema',practice:activity,gammaUrl:gamma?'https://gamma.app/docs/test-'+n:'',gammaState:gamma?'Gamma generado y verificado':''};};
  const rows=[mk(12,'Unidad 2','Actividad 5',true),mk(13,'Unidad 2','Actividad 6',true),mk(14,'Unidad 2','Actividad 7',false),mk(15,'Unidad 2','Actividad 8',false)];
  const prepared=[
    {id:'100000000001',title:'Actividad 5',state:'PUBLISHED'},
    {id:'100000000002',title:'Actividad 6',state:'DRAFT'}
  ];
  const next=function(r,x){return seleccionarSiguienteClasePorEstadoReal_(r,x).target.session;};
  if(next(rows,prepared)!=='14')throw new Error('REGRESSION_SEQUENCE: DRAFT + Gamma verificada debe permitir preparar la sesión siguiente.');
  const partial=prepared.concat([{id:'100000000003',title:'Actividad 7',state:'DRAFT'}]);
  if(next(rows,partial)!=='14')throw new Error('REGRESSION_SEQUENCE: recurso DRAFT sin Gamma conserva la misma sesión como paquete incompleto.');
  const withGamma=rows.map(function(r){return Object.assign({},r);});
  withGamma[2].gammaUrl='https://gamma.app/docs/test-14';withGamma[2].gammaState='Gamma generado y verificado';
  if(next(withGamma,partial)!=='15')throw new Error('REGRESSION_SEQUENCE: paquete DRAFT + Gamma verificada permite continuar a la sesión 15.');
  const none=rows.map(function(r){return Object.assign({},r,{gammaUrl:'',gammaState:''});});
  if(next(none,[])!=='12')throw new Error('REGRESSION_SEQUENCE: sin evidencia previa se inicia por la primera sesión canónica, nunca por fecha.');
  if(seleccionarSiguienteClasePorEstadoReal_(rows,prepared,'15',{explicitTarget:true}).target.session!=='15')
    throw new Error('REGRESSION_EXPLICIT_SESSION: la sesión explícita debe conservar su identidad sin usar fecha ni inferir progreso.');
  const unver=Object.assign({},rows[2],{gammaUrl:'https://gamma.app/docs/no-verificada',gammaState:''});
  let blocked=false;try{seleccionarSiguienteClasePorEstadoReal_([rows[0],rows[1],unver,rows[3]],prepared,'14',{explicitTarget:true});}
  catch(err){blocked=/BLOCKED_GAMMA_UNVERIFIED/.test(String(err));}
  if(!blocked)throw new Error('REGRESSION_SEQUENCE: una Gamma existente no verificada debe bloquear solo esa sesión explícita.');
  const noGamma=rows.map(function(r){return Object.assign({},r);});
  noGamma[2].gammaUrl='PENDIENTE / No aplica';
  noGamma[2].gammaState='NO APLICA — sesión integradora';
  const noGammaEvidence=evidenciaSesionReal_(noGamma[2],partial);
  if(!noGammaEvidence.gammaNoAplica||!noGammaEvidence.paquetePreparado)
    throw new Error('REGRESSION_SEQUENCE: una sesión con Gamma explícitamente NO APLICA debe quedar preparada con recurso real.');
  if(next(noGamma,partial)!=='15')
    throw new Error('REGRESSION_SEQUENCE: Gamma NO APLICA no debe bloquear el avance del paquete.');
  return {ok:true,source:'PLANNING_REAL_PREPARATION_STATE',regressions:8,readOnly:true,currentDateUsed:false,calendarUsed:false};
}
