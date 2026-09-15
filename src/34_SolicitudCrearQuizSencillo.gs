/**
 * Adaptador de transporte para QUIZ SENCILLO.
 * No contiene reglas académicas: delega en crearQuizSencillo().
 *
 * Configuración Quizzes:
 * A Clave = SOLICITUD_CREAR_QUIZ_SENCILLO
 * B Valor = SOLICITAR | PROCESANDO | PROCESADO | ERROR
 * C Descripción = JSON de entrada / resultado
 * F Última actualización
 */
const SIMPLE_QUIZ_CREATE_REQUEST = Object.freeze({
  KEY:'SOLICITUD_CREAR_QUIZ_SENCILLO',
  REQUESTED:'SOLICITAR',
  PROCESSING:'PROCESANDO',
  DONE:'PROCESADO',
  ERROR:'ERROR'
});

function procesarSolicitudCrearQuizSencillo_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe la hoja Configuración Quizzes.');
  const row = buscarFilaSolicitud_(sh, SIMPLE_QUIZ_CREATE_REQUEST.KEY, 8);
  if (row < 0) return {procesado:false,motivo:'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row,2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== SIMPLE_QUIZ_CREATE_REQUEST.REQUESTED) {
    return {procesado:false,motivo:'SIN_SOLICITUD_PENDIENTE',estado:estado};
  }

  const raw = String(sh.getRange(row,3).getDisplayValue() || '').trim();
  if (!raw) throw new Error('La solicitud de QUIZ SENCILLO no contiene JSON.');
  let params;
  try { params = JSON.parse(raw); }
  catch (err) { throw new Error('JSON inválido en solicitud de QUIZ SENCILLO: ' + mensajeErrorOperacion_(err)); }

  sh.getRange(row,2).setValue(SIMPLE_QUIZ_CREATE_REQUEST.PROCESSING);
  sh.getRange(row,6).setValue(new Date());
  SpreadsheetApp.flush();

  try {
    params = resolverCursoQuizSencilloSolicitud_(params);
    const result = crearQuizSencillo(params);
    const work = Classroom.Courses.CourseWork.get(String(params.courseId), String(result.workId));
    const resumen = {
      courseId:String(params.courseId),
      courseName:String(Classroom.Courses.get(String(params.courseId)).name || ''),
      workId:String(work.id || ''),
      title:String(work.title || ''),
      state:String(work.state || ''),
      dueDate:work.dueDate || null,
      dueTime:work.dueTime || null,
      fechaLimiteLocal:String(result.fechaLimiteLocal || ''),
      horaLimiteLocal:String(result.horaLimiteLocal || ''),
      numero:Number(result.numero || 0),
      reutilizado:result.reutilizado === true,
      solicitadoEnLocal:String(result.solicitadoEnLocal || ''),
      alternateLink:String(work.alternateLink || '')
    };
    if (resumen.state.toUpperCase() !== 'DRAFT') throw new Error('QUIZ SENCILLO no quedó DRAFT.');
    if (!/^Quiz\s+\d+$/i.test(resumen.title)) throw new Error('QUIZ SENCILLO no quedó con título consecutivo válido.');
    if (String(work.description || '').trim()) throw new Error('QUIZ SENCILLO no debe tener descripción.');
    if (Array.isArray(work.materials) && work.materials.length) throw new Error('QUIZ SENCILLO no debe tener materiales.');

    sh.getRange(row,2).setValue(SIMPLE_QUIZ_CREATE_REQUEST.DONE);
    sh.getRange(row,3).setValue(JSON.stringify(resumen));
    sh.getRange(row,4).setValue(String(params.courseId));
    sh.getRange(row,6).setValue(new Date());
    sh.getRange(row,8).setValue(resumen.title);
    SpreadsheetApp.flush();
    return resumen;
  } catch (err) {
    sh.getRange(row,2).setValue(SIMPLE_QUIZ_CREATE_REQUEST.ERROR);
    sh.getRange(row,3).setValue(mensajeErrorOperacion_(err));
    sh.getRange(row,6).setValue(new Date());
    SpreadsheetApp.flush();
    throw err;
  }
}

function resolverCursoQuizSencilloSolicitud_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  if (p.courseId) return p;
  const objetivo = String(p.courseName || '').trim();
  if (!objetivo) throw new Error('QUIZ SENCILLO requiere courseId o courseName exacto.');
  let token;
  const matches=[];
  do {
    const page=Classroom.Courses.list({pageSize:100,pageToken:token});
    (page.courses||[]).forEach(function(c){
      if (String(c.name||'').trim().toLowerCase()===objetivo.toLowerCase() && String(c.courseState||'').toUpperCase()!=='ARCHIVED') matches.push(c);
    });
    token=page.nextPageToken;
  } while (token);
  if (matches.length!==1) throw new Error('Se esperaba un curso activo exacto llamado "'+objetivo+'" y se encontraron '+matches.length+'.');
  p.courseId=String(matches[0].id);
  delete p.courseName;
  return p;
}
