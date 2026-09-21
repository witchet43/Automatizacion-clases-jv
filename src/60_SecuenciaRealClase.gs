/**
 * Fuente ejecutable única para "siguiente clase". Ninguna fecha, reloj, memoria,
 * propiedad NEXT_CLASS_LAST_COMPLETED o índice de calendario decide el tema.
 * La planeación solo aporta el orden; Classroom aporta existencia/estado reales.
 * Gamma cuenta únicamente con URL canónica y estado de verificación registrado:
 * si su existencia remota no está corroborada, se bloquea en vez de regenerar.
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
  const matches=active.filter(function(w){
    if(tituloNorm)return normal(w.title)===tituloNorm;
    return ids.indexOf(String(w.id))>=0;
  });
  const gammaUrl=String(row.gammaUrl||'').trim();
  const gammaVerificada=/^https:\/\/gamma\.app\/docs\//i.test(gammaUrl)&&
    /\bverificad[ao]\b/i.test(String(row.gammaState||''));
  return {
    session:String(row.session||''),
    unit:String(row.unit||''),
    topic:String(row.topic||''),
    classroomIds:matches.map(function(w){return String(w.id);}),
    classroomStates:matches.map(function(w){return String(w.state).toUpperCase();}),
    gammaUrl:gammaUrl,
    gammaVerificada:gammaVerificada,
    // DRAFT existe como material preparado, pero jamás se informa como PUBLICADO.
    materialPreparado:gammaVerificada&&matches.length>0,
    publicado:matches.some(function(w){return String(w.state||'').toUpperCase()==='PUBLISHED';})
  };
}
function seleccionarSiguienteClasePorEstadoReal_(rows, works, requestedSession, options) {
  const plan=Array.isArray(rows)?rows:[], opts=options||{};
  if(!plan.length)throw new Error('BLOCKED_NO_CANONICAL_SESSIONS: la planeación está vacía.');
  const seen=plan.map(function(row){return evidenciaSesionReal_(row,works);});
  const lastPrepared=seen.reduce(function(last,e,i){return e.materialPreparado?i:last;},-1);
  const lastPublished=seen.reduce(function(last,e,i){return e.publicado?i:last;},-1);
  let inferred=-1, reconciliation=false;
  if(lastPrepared>=0){
    // Se inspecciona la secuencia completa dentro de la unidad activa; nunca
    // se salta un hueco intermedio aunque ya exista material de clases posteriores.
    const unit=String(plan[lastPrepared].unit||'');
    const firstInUnit=seen.findIndex(function(e){return e.materialPreparado&&String(e.unit)===unit;});
    for(let i=firstInUnit+1;i<=lastPrepared;i++){
      if(String(plan[i].unit)===unit&&!seen[i].materialPreparado&&!seen[i].publicado){
        inferred=i;break;
      }
    }
    if(inferred<0)inferred=lastPrepared+1;
  } else if(lastPublished>=0)inferred=lastPublished+1;
  else if(String(requestedSession||'')===String(plan[0].session||''))inferred=0;
  else throw new Error('BLOCKED_NO_REAL_PROGRESS_EVIDENCE: no se encontró avance corroborado en Classroom y Gamma; no se infiere a partir de la fecha ni de una propiedad guardada.');
  if(inferred>=plan.length)return {complete:true, target:null,source:'CLASSROOM_GAMMA_REAL_STATE',lastPrepared:lastPrepared,lastPublished:lastPublished,observed:seen};
  const requested=String(requestedSession||'').trim();
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
  return {complete:false,target:target,evidence:evidence,source:'CLASSROOM_GAMMA_REAL_STATE',
    lastPrepared:lastPrepared,lastPublished:lastPublished,inferredSession:String(plan[inferred].session),
    reconciliation:reconciliation,observed:seen};
}
/** Pruebas puras, sin accesos a Classroom, Gamma, Drive ni modificaciones. */
function validarSecuenciaRealRegresion(){
  const mk=function(n,unit,activity,gamma){return {session:String(n),unit:unit,topic:'2.'+n+' Tema',practice:activity,gammaUrl:gamma?'https://gamma.app/docs/test-'+n:'',gammaState:gamma?'Gamma generado y verificado':''};};
  const rows=[mk(12,'Unidad 2','Actividad 5',true),mk(13,'Unidad 2','Actividad 6',true),mk(14,'Unidad 2','Actividad 7',false),mk(15,'Unidad 2','Actividad 8',false)];
  const w=[{id:'100000000001',title:'Actividad 5',state:'PUBLISHED'},{id:'100000000002',title:'Actividad 6',state:'DRAFT'}];
  const next=function(r,x){return seleccionarSiguienteClasePorEstadoReal_(r,x).target.session;};
  if(next(rows,w)!=='14')throw new Error('REGRESSION_SEQUENCE: debe elegir el hueco 14 sin consultar el día actual.');
  const after=rows.map(function(r){return Object.assign({},r);});
  after[2].gammaUrl='https://gamma.app/docs/test-14';after[2].gammaState='Gamma generado y verificado';
  const extended=w.concat([{id:'100000000003',title:'Actividad 7',state:'DRAFT'}]);
  if(next(after,extended)!=='15')throw new Error('REGRESSION_SEQUENCE: debe reconocer la sesión 14 preparada en DRAFT sin confundirla con publicada.');
  const gap=after.map(function(r){return Object.assign({},r);});gap[3].gammaUrl='https://gamma.app/docs/test-15';gap[3].gammaState='Gamma generado y verificado';
  const outOfOrder=w.concat([{id:'100000000004',title:'Actividad 8',state:'DRAFT'}]);
  if(next(gap,outOfOrder)!=='14')throw new Error('REGRESSION_SEQUENCE: una sesión posterior no puede ocultar el hueco anterior.');
  if(evidenciaSesionReal_(after[2],extended).publicado)throw new Error('REGRESSION_SEQUENCE: DRAFT no equivale a PUBLISHED.');
  const falseAudit=Object.assign({},after[2],{practice:'Actividad inexistente',classroomIds:'100000000003'});
  if(evidenciaSesionReal_(falseAudit,extended).materialPreparado)throw new Error('REGRESSION_SEQUENCE: un ID sin actividad coincidente no acredita una clase.');
  const unver=Object.assign({},rows[2],{gammaUrl:'https://gamma.app/docs/no-verificada'});
  let blocked=false;try{seleccionarSiguienteClasePorEstadoReal_([rows[0],rows[1],unver,rows[3]],w);}
  catch(err){blocked=/BLOCKED_GAMMA_UNVERIFIED/.test(String(err));}
  if(!blocked)throw new Error('REGRESSION_SEQUENCE: una URL Gamma no verificada debe bloquear la generación.');
  blocked=false;try{seleccionarSiguienteClasePorEstadoReal_(rows,w,'15');}
  catch(err){blocked=/BLOCKED_SEQUENCE_REAL_STATE/.test(String(err));}
  if(!blocked)throw new Error('REGRESSION_SEQUENCE: la sesión manual no puede saltar evidencia sin reconciliación.');
  if(seleccionarSiguienteClasePorEstadoReal_(rows,w,'15',{reconciliationMode:true,reconciliationReason:'Reconciliación histórica solicitada expresamente por el docente.'}).target.session!=='15')
    throw new Error('REGRESSION_SEQUENCE: la reconciliación explícita no funciona.');
  return {ok:true,source:'CLASSROOM_GAMMA_REAL_STATE',regressions:7,readOnly:true};
}
