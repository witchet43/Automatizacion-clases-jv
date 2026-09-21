/** Reparación única e idempotente de la Tarea 01 histórica; solo descripción. */
function formatearTarea01PerifericosExistente(){
  const courseId='871156721160',workId='886405170097',title='Tarea 01 - Inventario previo de periféricos';
  assertAcademicAutomationWriteEnabled_();
  const old=Classroom.Courses.CourseWork.get(courseId,workId);
  if(String(old.id||'')!==workId||String(old.title||'')!==title||String(old.state||'').toUpperCase()!=='DRAFT'){
    throw new Error('TAREA01_IDENTIDAD: no se modifica recurso distinto o publicado.');
  }
  const source=String(old.description||'');
  if(source.indexOf('8 periféricos')<0||source.indexOf('2.1.4')<0)throw new Error('TAREA01_CONTENIDO: no coincide con tarea solicitada.');
  const formatted=normalizarInstruccionesDidacticas_(source,'TAREA');
  validarFormatoDescripcionClassroom_(formatted,'TAREA');
  if(!formatted.includes('DESARROLLO')||!formatted.includes('EVIDENCIA DE ENTREGA')||
    !formatted.includes('1. Observa')||!formatted.includes('6. Cierra')||
    /Trabajo individual|equipo del laboratorio/i.test(formatted)){
    throw new Error('TAREA01_FORMATO: falta estructura, pasos o quedan referencias inválidas.');
  }
  if(formatted!==source){
    Classroom.Courses.CourseWork.patch({description:formatted},courseId,workId,{updateMask:'description'});
  }
  const now=Classroom.Courses.CourseWork.get(courseId,workId);
  if(now.description!==formatted||String(now.state||'').toUpperCase()!=='DRAFT'||
    String(now.title||'')!==title||String(now.topicId||'')!==String(old.topicId||'')||
    Number(now.maxPoints)!==Number(old.maxPoints)||JSON.stringify(now.materials||[])!==JSON.stringify(old.materials||[])||
    JSON.stringify(now.dueDate||null)!==JSON.stringify(old.dueDate||null)||
    JSON.stringify(now.dueTime||null)!==JSON.stringify(old.dueTime||null)){
    throw new Error('TAREA01_POSTFLIGHT: no se confirmó integridad del borrador.');
  }
  return {ok:true,courseId,workId,state:now.state,changed:formatted!==source,
    formatted:true,sections:['INDICACIONES PARA EL ALUMNO','DESARROLLO','EVIDENCIA DE ENTREGA'],
    noDuplicateCreated:true,noPublication:true};
}
