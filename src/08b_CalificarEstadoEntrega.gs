/**
 * Operación explícita para calificar por estado de entrega.
 * NO equivale a revisión académica del contenido.
 */
function calificarEstadoEntregaCurso(params){
  const p=params&&typeof params==='object'?params:{};
  const courseId=String(p.courseId||'').trim();
  if(!courseId)throw new Error('calificarEstadoEntregaCurso requiere courseId.');
  const result=revisarTareasCurso_(courseId,p.aplicar!==false);
  result.operacion='CALIFICAR_ESTADO_ENTREGA';
  result.criterio='TURNED_IN_OR_RETURNED_FULL_SCORE_OTHERWISE_ZERO';
  result.revisionAcademica=false;
  return result;
}
