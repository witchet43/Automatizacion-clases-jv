/**
 * Mantenimiento manual de Script Properties cuando la interfaz Apps Script
 * deja de editarlas al superar 50 entradas. No manipular claves HMAC ni recibos
 * de escritura. No cambia recursos ni calificaciones de Google Classroom.
 *
 * Ejecutar SOLO desde el editor de Apps Script como propietario:
 *   diagnosticarPropiedadesAcademicas
 * o, tras revisar lo anterior:
 *   depurarSolicitudesQuizSinReferencia
 *
 * No mostrar nunca valores de propiedades ni secretos en logs.
 */
function diagnosticarPropiedadesAcademicas(){
  const all=PropertiesService.getScriptProperties().getProperties();
  const keys=Object.keys(all);
  const simple=keys.filter(function(k){return /^SIMPLE_QUIZ_REQUEST_[a-f0-9]{64}$/i.test(k);});
  const receipts=keys.filter(function(k){return /^ACADEMIC_WRITE_RECEIPT_/i.test(k);});
  const receiptPending=receipts.filter(function(k){
    try {return JSON.parse(all[k]).status==='PENDING';}catch(ignore){return true;}
  });
  const configured=typeof all.ACADEMIC_WRITE_HMAC_KEY==='string' && all.ACADEMIC_WRITE_HMAC_KEY.length>=32;
  const pendingByOperation={};
  receiptPending.forEach(function(k){
    let operation='UNKNOWN';
    try{
      const value=JSON.parse(String(all[k]||''));
      const raw=String(value.operation||'').trim();
      if(/^[A-Za-z]{3,32}$/.test(raw))operation=raw;
    }catch(ignore){}
    pendingByOperation[operation]=(pendingByOperation[operation]||0)+1;
  });
  let lastFailure={};
  try{
    const parsed=JSON.parse(String(all.ACADEMIC_LAST_WEBAPP_WRITE_FAILURE||''));
    if(parsed&&typeof parsed==='object'){
      lastFailure={
        code:String(parsed.code||'UNKNOWN').slice(0,80),
        operation:String(parsed.operation||'').slice(0,30),
        at:String(parsed.at||'').slice(0,30)
      };
    }
  }catch(ignore){}
  const summary={
    totalPropiedades:keys.length,
    clavesQuizSencillo:simple.length,
    recibosEscritura:receipts.length,
    recibosPendientes:receiptPending.length,
    recibosPendientesPorOperacion:pendingByOperation,
    ultimoErrorWebApp:lastFailure,
    claveHmacConfigurada:configured
  };
  console.log('DIAGNOSTICO_PROPIEDADES_ACADEMICAS: '+JSON.stringify(summary));
  return summary;
}

/**
 * Sólo elimina claves SIMPLE_QUIZ_REQUEST_ cuyos valores JSON están vacíos,
 * inválidos o no incluyen workId numérico. Conserva toda referencia válida,
 * sin importar su antigüedad, para NO permitir un segundo quiz por requestId.
 * Recibos ACADEMIC_WRITE_RECEIPT_ (incluido PENDING) NUNCA se eliminan.
 */
function depurarSolicitudesQuizSinReferencia(){
  const props=PropertiesService.getScriptProperties();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw new Error('MANTENIMIENTO_PROPIEDADES_BUSY');
  try{
    const all=props.getProperties();
    const keys=Object.keys(all).filter(function(k){
      return /^SIMPLE_QUIZ_REQUEST_[a-f0-9]{64}$/i.test(k);
    });
    const removed=[];
    const preserved=[];
    keys.forEach(function(k){
      let value;
      try{value=JSON.parse(String(all[k]||''));}catch(ignore){value=null;}
      if(!value || typeof value!=='object' || !/^\d+$/.test(String(value.workId||''))){
        props.deleteProperty(k);
        removed.push(k);
      } else {
        preserved.push(k);
      }
    });
    const summary={
      revisadas:keys.length,
      eliminadasSinReferencia:removed.length,
      preservadasPorIdempotencia:preserved.length,
      claveHmacIntacta:true,
      recibosEscrituraIntactos:true
    };
    // Do not print hashes or property values; only counts.
    console.log('DEPURACION_PROPIEDADES_QUIZ: '+JSON.stringify(summary));
    return summary;
  }finally{
    lock.releaseLock();
  }
}
