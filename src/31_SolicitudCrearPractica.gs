/**
 * Adaptador de transporte para crear una PRÁCTICA mediante el entrypoint
 * canónico crearPractica(). No contiene reglas académicas.
 *
 * Configuración Quizzes:
 * A Clave = SOLICITUD_CREAR_PRACTICA
 * B Valor = SOLICITAR | PROCESANDO | PROCESADO | ERROR
 * C Descripción = JSON de entrada mientras está SOLICITAR; resultado al terminar
 * F Última actualización
 * G Unidad (solo trazabilidad)
 * H Título (solo trazabilidad)
 */
const PRACTICE_CREATE_REQUEST = Object.freeze({
  KEY: 'SOLICITUD_CREAR_PRACTICA',
  REQUESTED: 'SOLICITAR',
  PROCESSING: 'PROCESANDO',
  DONE: 'PROCESADO',
  ERROR: 'ERROR'
});

function procesarSolicitudCrearPractica_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe la hoja Configuración Quizzes.');

  const row = buscarFilaSolicitud_(sh, PRACTICE_CREATE_REQUEST.KEY, 8);
  if (row < 0) return {procesado:false, motivo:'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== PRACTICE_CREATE_REQUEST.REQUESTED) {
    return {procesado:false, motivo:'SIN_SOLICITUD_PENDIENTE', estado:estado};
  }

  const raw = String(sh.getRange(row, 3).getDisplayValue() || '').trim();
  if (!raw) throw new Error('La solicitud de PRÁCTICA no contiene JSON de parámetros.');

  let params;
  try { params = JSON.parse(raw); }
  catch (err) { throw new Error('JSON inválido en solicitud de PRÁCTICA: ' + mensajeErrorOperacion_(err)); }

  sh.getRange(row, 2).setValue(PRACTICE_CREATE_REQUEST.PROCESSING);
  sh.getRange(row, 6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    params = resolverCursoPracticaSolicitud_(params);
    const result = crearPractica(params);
    const work = Classroom.Courses.CourseWork.get(String(params.courseId), String(result.workId));
    const doc = DriveApp.getFileById(String(result.documentId));
    const materials = Array.isArray(work.materials) ? work.materials : [];
    const driveMaterial = materials.find(function(m) {
      return m && m.driveFile && m.driveFile.driveFile && String(m.driveFile.driveFile.id || '') === String(result.documentId);
    });
    const resumen = {
      courseId:String(params.courseId),
      courseName:String(Classroom.Courses.get(String(params.courseId)).name || ''),
      workId:String(work.id || ''),
      title:String(work.title || ''),
      state:String(work.state || ''),
      dueDate:work.dueDate || null,
      dueTime:work.dueTime || null,
      topicId:String(work.topicId || ''),
      documentId:String(doc.getId()),
      documentName:String(doc.getName()),
      documentMime:String(doc.getMimeType()),
      shareMode:String(driveMaterial && driveMaterial.driveFile ? driveMaterial.driveFile.shareMode || '' : ''),
      alternateLink:String(work.alternateLink || '')
    };

    if (resumen.state.toUpperCase() !== 'DRAFT') throw new Error('La PRÁCTICA no quedó DRAFT.');
    if (!resumen.workId) throw new Error('La PRÁCTICA no devolvió workId.');
    if (resumen.dueDate || resumen.dueTime) throw new Error('La PRÁCTICA quedó con vencimiento y debe quedar sin fecha de entrega.');
    if (resumen.shareMode.toUpperCase() !== 'STUDENT_COPY') throw new Error('La PRÁCTICA no quedó con copia individual STUDENT_COPY.');
    if (resumen.documentMime !== ACADEMIC_POLICY.CLASSROOM.PRACTICE.WORD_MIME) throw new Error('El adjunto de la PRÁCTICA no es DOCX.');

    sh.getRange(row, 2).setValue(PRACTICE_CREATE_REQUEST.DONE);
    sh.getRange(row, 3).setValue(JSON.stringify(resumen));
    sh.getRange(row, 4).setValue(String(params.courseId));
    sh.getRange(row, 6).setValue(new Date());
    sh.getRange(row, 7).setValue(String(params.unidad || ''));
    sh.getRange(row, 8).setValue(String(params.titulo || ''));
    SpreadsheetApp.flush();
    return resumen;
  } catch (err) {
    sh.getRange(row, 2).setValue(PRACTICE_CREATE_REQUEST.ERROR);
    sh.getRange(row, 3).setValue(mensajeErrorOperacion_(err));
    sh.getRange(row, 6).setValue(new Date());
    SpreadsheetApp.flush();
    throw err;
  }
}

function resolverCursoPracticaSolicitud_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  if (p.courseId) return p;
  const objetivo = String(p.courseName || '').trim();
  if (!objetivo) throw new Error('La solicitud de PRÁCTICA requiere courseId o courseName exacto.');

  let token;
  const matches = [];
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
