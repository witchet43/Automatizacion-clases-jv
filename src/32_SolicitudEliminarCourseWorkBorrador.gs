/**
 * Mantenimiento seguro por ID exacto para retirar un CourseWork DRAFT residual.
 * Solo elimina cuando coinciden curso, ID, título esperado y, si se indica,
 * el Google Documento esperado. Nunca elimina PUBLISHED.
 *
 * Configuración Quizzes:
 * A = SOLICITUD_ELIMINAR_COURSEWORK_BORRADOR
 * B = SOLICITAR | PROCESANDO | PROCESADO | ERROR
 * C = JSON {courseId,workId,expectedTitle,expectedDocumentId?}
 * F = última actualización
 */
const DELETE_DRAFT_COURSEWORK_REQUEST = Object.freeze({
  KEY:'SOLICITUD_ELIMINAR_COURSEWORK_BORRADOR',
  REQUESTED:'SOLICITAR',
  PROCESSING:'PROCESANDO',
  DONE:'PROCESADO',
  ERROR:'ERROR'
});

function procesarSolicitudEliminarCourseWorkBorrador_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe la hoja Configuración Quizzes.');

  const row = buscarFilaSolicitud_(sh, DELETE_DRAFT_COURSEWORK_REQUEST.KEY, 8);
  if (row < 0) return {procesado:false,motivo:'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row,2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== DELETE_DRAFT_COURSEWORK_REQUEST.REQUESTED) {
    return {procesado:false,motivo:'SIN_SOLICITUD_PENDIENTE',estado:estado};
  }

  const raw = String(sh.getRange(row,3).getDisplayValue() || '').trim();
  let p;
  try { p = JSON.parse(raw); }
  catch (err) { throw new Error('JSON inválido en eliminación segura: ' + mensajeErrorOperacion_(err)); }

  const courseId = String(p.courseId || '').trim();
  const workId = String(p.workId || '').trim();
  const expectedTitle = String(p.expectedTitle || '').trim();
  const expectedDocumentId = String(p.expectedDocumentId || '').trim();
  if (!courseId || !workId || !expectedTitle) {
    throw new Error('La eliminación segura requiere courseId, workId y expectedTitle.');
  }

  sh.getRange(row,2).setValue(DELETE_DRAFT_COURSEWORK_REQUEST.PROCESSING);
  sh.getRange(row,6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    let work = null;
    try {
      work = Classroom.Courses.CourseWork.get(courseId, workId);
    } catch (getErr) {
      const msg = mensajeErrorOperacion_(getErr);
      if (/not found|404|requested entity was not found/i.test(msg)) {
        const absent = {courseId:courseId,workId:workId,estado:'AUSENTE',eliminado:false};
        sh.getRange(row,2).setValue(DELETE_DRAFT_COURSEWORK_REQUEST.DONE);
        sh.getRange(row,3).setValue(JSON.stringify(absent));
        sh.getRange(row,6).setValue(new Date());
        SpreadsheetApp.flush();
        return absent;
      }
      throw getErr;
    }

    const state = String(work.state || '').toUpperCase();
    const title = String(work.title || '').trim();
    if (state !== 'DRAFT') throw new Error('La eliminación segura solo permite CourseWork DRAFT; estado encontrado: ' + state + '.');
    if (title !== expectedTitle) throw new Error('El título no coincide; esperado "' + expectedTitle + '" y encontrado "' + title + '".');

    if (expectedDocumentId) {
      const materials = Array.isArray(work.materials) ? work.materials : [];
      const sameDoc = materials.some(function(m) {
        return m && m.driveFile && m.driveFile.driveFile && String(m.driveFile.driveFile.id || '') === expectedDocumentId;
      });
      if (!sameDoc) throw new Error('El CourseWork no contiene el Google Documento esperado; se bloquea la eliminación.');
    }

    Classroom.Courses.CourseWork.delete(courseId, workId);

    let sigueActivo = false;
    let token;
    do {
      const page = Classroom.Courses.CourseWork.list(courseId,{pageSize:100,pageToken:token});
      sigueActivo = (page.courseWork || []).some(function(w) {
        return String(w.id || '') === workId && String(w.state || '').toUpperCase() !== 'DELETED';
      });
      if (sigueActivo) break;
      token = page.nextPageToken;
    } while (token);
    if (sigueActivo) throw new Error('La verificación posterior encontró el CourseWork todavía activo.');

    const result = {courseId:courseId,workId:workId,title:title,estadoAnterior:state,eliminado:true};
    sh.getRange(row,2).setValue(DELETE_DRAFT_COURSEWORK_REQUEST.DONE);
    sh.getRange(row,3).setValue(JSON.stringify(result));
    sh.getRange(row,6).setValue(new Date());
    SpreadsheetApp.flush();
    return result;
  } catch (err) {
    sh.getRange(row,2).setValue(DELETE_DRAFT_COURSEWORK_REQUEST.ERROR);
    sh.getRange(row,3).setValue(mensajeErrorOperacion_(err));
    sh.getRange(row,6).setValue(new Date());
    SpreadsheetApp.flush();
    throw err;
  }
}
