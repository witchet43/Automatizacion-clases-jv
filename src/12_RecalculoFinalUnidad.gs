/**
 * Compatibilidad: todos los recálculos delegan al único motor estricto.
 * No revisan tareas, no modifican instrumentos fuente y sobrescriben Calificación Unidad N.
 */
const DIRECT_UNIT_RECALC = Object.freeze({
  SHEET:'Configuración Quizzes',
  KEY:'SOLICITUD_RECALCULAR_PUBLICAR_UNIDAD',
  REQUESTED:'SOLICITAR', PROCESSING:'PROCESANDO', DONE:'PROCESADO', ERROR:'ERROR'
});

function procesarSolicitudRecalculoFinalUnidad_() {
  return procesarSolicitudRecalculoFinalUnidadCero_();
}

/** Ejecución manual compatible usando la fila de cierre oficial. */
function recalcularYPublicarUnidadSolicitadaAhora() {
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const cfg=ss.getSheetByName('Configuración Quizzes');
  if(!cfg) throw new Error('No existe Configuración Quizzes.');
  const vals=cfg.getRange(1,1,Math.max(cfg.getLastRow(),1),8).getDisplayValues();
  let row=-1;
  for(let i=1;i<vals.length;i++) if(String(vals[i][0]||'').trim()==='SOLICITUD_PROMEDIOS_UNIDAD'){row=i+1;break;}
  if(row<0) throw new Error('No existe SOLICITUD_PROMEDIOS_UNIDAD.');
  const courseId=String(cfg.getRange(row,4).getDisplayValue()||'').trim();
  const unidad=String(cfg.getRange(row,7).getDisplayValue()||'').trim()||'Unidad 1';
  if(!courseId) throw new Error('Falta ID curso.');

  cfg.getRange(row,2).setValue('PROCESANDO');
  cfg.getRange(row,3).setValue('Recalculando solo '+unidad+'; ausencias/no asignaciones cuentan como 0; se sobrescribe la calificación final.');
  cfg.getRange(row,6).setValue(new Date()); SpreadsheetApp.flush();
  try {
    const result=calcularPromediosDirectoClassroomConCeros_(ss,courseId,unidad);
    const final=publicarCalificacionUnidadFinal_(ss,courseId,unidad,'Calificación '+unidad);
    cfg.getRange(row,2).setValue('PROCESADO');
    cfg.getRange(row,3).setValue('Promedios recalculados y sobrescritos para '+unidad+'. '+result.alumnos+' alumnos; '+result.faltantesComoCero+' ausencias/no asignaciones contabilizadas como 0; '+final.actualizadas+' calificaciones finales actualizadas.');
    cfg.getRange(row,5).setValue('ACTIVA'); cfg.getRange(row,6).setValue(new Date());
    return {promedios:result,cierre:final};
  } catch(err) {
    cfg.getRange(row,2).setValue('ERROR'); cfg.getRange(row,3).setValue(String(err&&err.message?err.message:err)); cfg.getRange(row,6).setValue(new Date()); throw err;
  }
}

function calcularPromediosDirectoClassroom_(ss,courseId,unidad) {
  return calcularPromediosDirectoClassroomConCeros_(ss,courseId,unidad);
}
