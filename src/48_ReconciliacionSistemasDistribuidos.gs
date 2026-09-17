/** Reconciliación 2026-09-17: corrige el cursor que fue adelantado indebidamente a la sesión 15. */
function reconciliarSecuenciaSistemasDistribuidos(){
  var courseId='871158466533';
  var key=claveProgresoClase_(courseId);
  var props=PropertiesService.getScriptProperties();
  var antes=props.getProperty(key);
  props.setProperty(key,'7');
  var despues=props.getProperty(key);
  if(despues!=='7') throw new Error('No se pudo restablecer la secuencia de Sistemas Distribuidos a la sesión 7.');
  return {ok:true,verified:true,courseId:courseId,progressBefore:antes,progressAfter:despues,nextCanonicalSession:8,nextCanonicalTopic:'2.1.1 Cliente-servidor + 2.1.2 Peer-to-peer'};
}
