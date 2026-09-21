/**
 * Corrección idempotente IN SITU del borrador existente de la Actividad 15.
 * No crea otro CourseWork, no cambia materiales, puntos, tema ni publicación.
 */
function corregirActividad15Perifericos() {
  const courseId='871156721160';
  const workId='878586592889';
  const expected='Actividad 15 - Mapa vivo de periféricos y drivers';
  assertAcademicAutomationWriteEnabled_();
  const original=Classroom.Courses.CourseWork.get(courseId,workId);
  if(String(original.id||'')!==workId||String(original.title||'').trim()!==expected ||
      String(original.state||'').toUpperCase()!=='DRAFT'){
    throw new Error('BLOCKED_ACTIVITY15_IDENTITY: el recurso no coincide con el borrador autorizado.');
  }
  const before=String(original.description||'');
  if(before.indexOf('Get-PnpDevice')<0){
    throw new Error('BLOCKED_ACTIVITY15_CONTENT: el borrador no contiene el comando esperado; no se modifica.');
  }
  const after=normalizarInstruccionesDidacticas_(before,'ACTIVIDAD');
  if(/Trabajo individual\s*\.\s*Duraci[oó]n estimada/i.test(after)||
      after.indexOf('Guía didáctica — Get-PnpDevice:')<0||
      after.indexOf('computadora personal con Windows')<0){
    throw new Error('BLOCKED_ACTIVITY15_DIDACTICA: la corrección no cumple las reglas.');
  }
  if(after!==before){
    Classroom.Courses.CourseWork.patch({description:after},courseId,workId,{updateMask:'description'});
  }
  const actual=Classroom.Courses.CourseWork.get(courseId,workId);
  if(actual.description!==after||String(actual.title||'')!==expected||
      String(actual.state||'').toUpperCase()!=='DRAFT'||
      Number(actual.maxPoints)!==Number(original.maxPoints)||
      String(actual.topicId||'')!==String(original.topicId||'')){
    throw new Error('ACTIVITY15_POSTFLIGHT_FAILED: la corrección no fue verificada en Classroom.');
  }
  return {ok:true,courseId:courseId,workId:workId,title:expected,state:'DRAFT',
    changed:after!==before,descriptionVerified:true,
    noDuplicatesCreated:true,commandGuideVerified:true,personalWindowsVerified:true};
}
