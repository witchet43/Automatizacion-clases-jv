/**
 * Adaptador de transporte para crear o reparar una TAREA mediante la política
 * canónica. No contiene reglas académicas propias.
 *
 * Configuración Quizzes:
 * A Clave = SOLICITUD_CREAR_TAREA
 * B Valor = SOLICITAR | PROCESANDO | PROCESADO | ERROR
 * C Descripción = JSON de entrada mientras está SOLICITAR; resultado al terminar
 * F Última actualización
 * G Unidad (solo trazabilidad)
 * H Título (solo trazabilidad)
 */
const TASK_CREATE_REQUEST = Object.freeze({
  KEY: 'SOLICITUD_CREAR_TAREA',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR'
});

function procesarSolicitudCrearTarea_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe la hoja Configuración Quizzes.');

  const row = buscarFilaSolicitud_(sh, TASK_CREATE_REQUEST.KEY, 8);
  if (row < 0) return {procesado:false, motivo:'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== TASK_CREATE_REQUEST.REQUESTED) {
    return {procesado:false, motivo:'SIN_SOLICITUD_PENDIENTE', estado:estado};
  }

  const raw = String(sh.getRange(row, 3).getDisplayValue() || '').trim();
  if (!raw) throw new Error('La solicitud de TAREA no contiene JSON de parámetros.');

  let params;
  try { params = JSON.parse(raw); }
  catch (err) { throw new Error('JSON inválido en solicitud de TAREA: ' + mensajeErrorOperacion_(err)); }

  sh.getRange(row, 2).setValue(TASK_CREATE_REQUEST.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    params = resolverCursoTareaSolicitud_(params);
    const result = params.workIdObjetivo
      ? repararTareaSolicitudPorId_(params)
      : crearTarea(params);
    const work = Classroom.Courses.CourseWork.get(String(params.courseId), String(result.workId));
    const resumen = {
      courseId:String(params.courseId),
      courseName:String(Classroom.Courses.get(String(params.courseId)).name || ''),
      workId:String(work.id || ''),
      title:String(work.title || ''),
      state:String(work.state || ''),
      dueDate:work.dueDate || null,
      dueTime:work.dueTime || null,
      topicId:String(work.topicId || ''),
      alternateLink:String(work.alternateLink || ''),
      vencimientoReparado:result.vencimientoReparado === true,
      duplicadoEliminado:String(result.duplicadoEliminado || '')
    };
    if (resumen.state.toUpperCase() !== 'DRAFT') throw new Error('La TAREA no quedó DRAFT.');
    if (!resumen.workId) throw new Error('La TAREA no devolvió workId.');
    if (!resumen.dueDate || !resumen.dueTime) throw new Error('La TAREA no contiene vencimiento obligatorio.');

    sh.getRange(row, 2).setValue(TASK_CREATE_REQUEST.DONE);
    sh.getRange(row, 3).setValue(JSON.stringify(resumen));
    sh.getRange(row, 4).setValue(String(params.courseId));
    sh.getRange(row, 6).setValue(new Date());
    sh.getRange(row, 7).setValue(String(params.unidad || ''));
    sh.getRange(row, 8).setValue(String(params.titulo || ''));
    SpreadsheetApp.flush();
    return resumen;
  } catch (err) {
    sh.getRange(row, 2).setValue(TASK_CREATE_REQUEST.ERROR);
    sh.getRange(row, 3).setValue(mensajeErrorOperacion_(err));
    sh.getRange(row, 6).setValue(new Date());
    SpreadsheetApp.flush();
    throw err;
  }
}

function repararTareaSolicitudPorId_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const workId = String(p.workIdObjetivo || '').trim();
  if (!workId) throw new Error('La reparación por ID requiere workIdObjetivo.');

  const tarea = aplicarReglaVencimientoTarea_(p);
  const actual = Classroom.Courses.CourseWork.get(String(tarea.courseId), workId);
  if (String(actual.state || '').toUpperCase() !== 'DRAFT') throw new Error('La TAREA objetivo no está DRAFT: ' + workId + '.');
  if (p.titulo && String(actual.title || '').trim() !== String(p.titulo).trim()) {
    throw new Error('El workIdObjetivo no coincide con el título esperado.');
  }

  const asegurado = asegurarVencimientoTareaCreada_(tarea.courseId, workId, tarea);
  verificarVencimientoTareaCreada_(tarea.courseId, workId, tarea);

  let duplicadoEliminado = '';
  const duplicateId = String(p.workIdDuplicadoEliminar || '').trim();
  if (duplicateId && duplicateId !== workId) {
    const duplicate = Classroom.Courses.CourseWork.get(String(tarea.courseId), duplicateId);
    if (String(duplicate.state || '').toUpperCase() !== 'DRAFT') throw new Error('El duplicado no está DRAFT y no se eliminará automáticamente: ' + duplicateId + '.');
    if (p.titulo && String(duplicate.title || '').trim() !== String(p.titulo).trim()) {
      throw new Error('El recurso indicado como duplicado no coincide con el título esperado.');
    }
    Classroom.Courses.CourseWork.remove(String(tarea.courseId), duplicateId);
    duplicadoEliminado = duplicateId;
  }

  return {
    workId:workId,
    vencimientoReparado:asegurado.reparado === true,
    duplicadoEliminado:duplicadoEliminado
  };
}

function resolverCursoTareaSolicitud_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  if (p.courseId) return p;
  const objetivo = String(p.courseName || '').trim();
  if (!objetivo) throw new Error('La solicitud requiere courseId o courseName exacto.');

  let token;
  let matches = [];
  do {
    const page = Classroom.Courses.list({pageSize:100, pageToken:token});
    (page.courses || []).forEach(function(c) {
      if (String(c.name || '').trim().toLowerCase() === objetivo.toLowerCase() && String(c.courseState || '').toUpperCase() !== 'ARCHIVED') matches.push(c);
    });
    token = page.nextPageToken;
  } while (token);

  if (matches.length !== 1) throw new Error('Se esperó un curso activo exacto llamado "' + objetivo + '" y se encontraron ' + matches.length + '.');
  p.courseId = String(matches[0].id);
  delete p.courseName;
  return p;
}
