/**
 * REGLA CANÓNICA PARA PRÁCTICA
 *
 * Una PRÁCTICA:
 * - no tiene fecha ni hora de vencimiento;
 * - requiere un Google Documento nativo;
 * - el documento se adjunta con STUDENT_COPY;
 * - si no se proporciona documentId, el propio script crea el Google Documento
 *   mediante Drive v3 con el scope drive.file.
 */
function prepararPracticaConGoogleDoc_(params) {
  const p = params && typeof params === 'object' ? Object.assign({}, params) : {};
  const policy = ACADEMIC_POLICY.CLASSROOM.PRACTICE;
  validarPoliticaPractica_(policy);
  rechazarVencimientoPractica_(p);

  const shareModeSolicitado = String(p.shareMode || '').trim().toUpperCase();
  if (shareModeSolicitado && shareModeSolicitado !== policy.SHARE_MODE) {
    throw new Error('PRÁCTICA requiere shareMode STUDENT_COPY; no se permite ' + shareModeSolicitado + '.');
  }
  if (p.studentCopy === false) {
    throw new Error('PRÁCTICA requiere copia individual para cada alumno (STUDENT_COPY).');
  }

  let documentId = String(p.documentId || p.googleDocId || '').trim();
  let creadoPorScript = false;
  if (!documentId) {
    if (policy.CREATE_GOOGLE_DOCUMENT_IF_MISSING !== true) {
      throw new Error('PRÁCTICA requiere documentId de un Google Documento.');
    }
    const creado = crearGoogleDocumentoPractica_(p);
    documentId = creado.id;
    creadoPorScript = true;
    p.documentoNombre = creado.name;
  }

  const file = obtenerArchivoPracticaConReintento_(documentId);
  const mime = String(file.mimeType || '');
  const name = String(file.name || '');
  if (file.trashed === true) {
    throw new Error('PRÁCTICA recibió un Google Documento enviado a la papelera: ' + documentId + '.');
  }
  if (mime !== policy.GOOGLE_DOCUMENT_MIME) {
    throw new Error('PRÁCTICA requiere un Google Documento nativo. Archivo recibido: ' + name + ' (' + mime + ').');
  }

  p.documentId = documentId;
  p.shareMode = policy.SHARE_MODE;
  p.studentCopy = true;
  p.documentoCreadoPorScript = creadoPorScript;
  p.documentoNombre = p.documentoNombre || name;
  return p;
}

function rechazarVencimientoPractica_(params) {
  const p = params || {};
  const fields = [p.fechaLimite,p.horaLimite,p.dueDate,p.dueTime,p.fechaLimiteLocal,p.horaLimiteLocal];
  const tieneVencimiento = fields.some(function(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
  if (tieneVencimiento) {
    throw new Error('PRÁCTICA no admite fecha ni hora de vencimiento. Debe quedar sin fecha de entrega en Classroom.');
  }
  return true;
}

function validarPoliticaPractica_(policy) {
  if (!policy || policy.DUE_MODE !== 'NONE' || policy.DUE_ALLOWED !== false ||
      policy.GOOGLE_DOCUMENT_REQUIRED !== true ||
      policy.GOOGLE_DOCUMENT_MIME !== 'application/vnd.google-apps.document' ||
      policy.STUDENT_COPY_REQUIRED !== true || policy.SHARE_MODE !== 'STUDENT_COPY' ||
      policy.CREATE_GOOGLE_DOCUMENT_IF_MISSING !== true) {
    throw new Error('La política canónica de PRÁCTICA no exige correctamente Google Documento, STUDENT_COPY y ausencia de vencimiento.');
  }
  return true;
}

function crearGoogleDocumentoPractica_(params) {
  const p = params || {};
  const policy = ACADEMIC_POLICY.CLASSROOM.PRACTICE;
  validarPoliticaPractica_(policy);
  const titulo = String(p.titulo || p.title || 'Práctica').trim() || 'Práctica';
  const descripcion = String(p.descripcion || p.description || '').trim();
  const contenido = normalizarContenidoPractica_(p.contenidoDocumento || p.googleDocContent || '');
  const html = construirHtmlPractica_(titulo, descripcion, contenido);
  const media = Utilities.newBlob(html, 'text/html', titulo + '.html');

  let created = null;
  let advancedError = null;
  try {
    created = Drive.Files.create({
      name:titulo,
      mimeType:policy.GOOGLE_DOCUMENT_MIME
    }, media, {fields:'id,name,mimeType'});
  } catch (err) {
    advancedError = err;
  }
  if (!created || !created.id) {
    try {
      created = crearGoogleDocumentoPracticaViaRest_(titulo, html, policy.GOOGLE_DOCUMENT_MIME);
    } catch (restErr) {
      throw new Error('No fue posible crear el Google Documento de la PRÁCTICA mediante Drive v3. Servicio avanzado: ' + String(advancedError && advancedError.message ? advancedError.message : advancedError || 'sin resultado') + '. REST: ' + String(restErr && restErr.message ? restErr.message : restErr));
    }
  }
  if (!created || !created.id) throw new Error('Drive v3 no devolvió id para el Google Documento de la PRÁCTICA.');

  const file = obtenerArchivoPracticaConReintento_(String(created.id));
  const mime = String(file.mimeType || '');
  if (mime !== policy.GOOGLE_DOCUMENT_MIME) {
    try { enviarArchivoPracticaPapelera_(String(created.id)); } catch (ignore) {}
    throw new Error('El archivo creado para la PRÁCTICA no quedó como Google Documento nativo: ' + mime + '.');
  }
  return {id:String(file.id || created.id), name:String(file.name || titulo), mimeType:mime};
}

function crearGoogleDocumentoPracticaViaRest_(titulo, html, targetMime) {
  const boundary = 'practice_' + Utilities.getUuid().replace(/-/g, '');
  const metadata = JSON.stringify({name:titulo, mimeType:targetMime});
  const payload = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '--' + boundary + '--',
    ''
  ].join('\r\n');
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {
    method:'post',
    contentType:'multipart/related; boundary=' + boundary,
    headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},
    payload:payload,
    muteHttpExceptions:true
  });
  const code = Number(response.getResponseCode());
  const raw = String(response.getContentText() || '');
  if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ': ' + raw.slice(0,500));
  let created;
  try { created = JSON.parse(raw); }
  catch (err) { throw new Error('respuesta JSON inválida de Drive API'); }
  return created;
}

function obtenerArchivoPracticaConReintento_(documentId) {
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      return Drive.Files.get(String(documentId), {fields:'id,name,mimeType,trashed'});
    } catch (err) {
      lastErr = err;
      Utilities.sleep(250 * (i + 1));
    }
  }
  throw lastErr || new Error('No fue posible resolver el Google Documento de la PRÁCTICA con Drive v3.');
}

function enviarArchivoPracticaPapelera_(documentId) {
  return Drive.Files.update({trashed:true}, String(documentId), {fields:'id,trashed'});
}

function normalizarContenidoPractica_(value) {
  if (Array.isArray(value)) return value.map(function(x) { return String(x == null ? '' : x); });
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map(function(x) { return String(x); });
}

function construirHtmlPractica_(titulo, descripcion, contenido) {
  const parts = [
    '<!doctype html><html><head><meta charset="utf-8"><title>' + escaparHtmlPractica_(titulo) + '</title></head><body>',
    '<h1>' + escaparHtmlPractica_(titulo) + '</h1>',
    '<p>Nombre del alumno: ________________________________________________</p>',
    '<p>Grupo: ____________________ &nbsp;&nbsp;&nbsp; Fecha: ____________________</p>'
  ];
  if (descripcion) {
    parts.push('<h2>Instrucciones</h2><p>' + escaparHtmlPractica_(descripcion) + '</p>');
  }
  parts.push('<h2>Desarrollo</h2>');
  if (contenido.length) {
    contenido.forEach(function(linea) { parts.push('<p>' + escaparHtmlPractica_(linea) + '</p>'); });
  } else {
    parts.push('<p>Realiza aquí la evidencia solicitada para esta práctica.</p>');
    parts.push('<p>Reflexión 1: ¿Qué aprendiste durante la práctica?</p>');
    parts.push('<p>Reflexión 2: ¿Qué dificultad encontraste y cómo la resolviste?</p>');
    parts.push('<p>Reflexión 3: ¿Cómo aplicarías lo realizado en otro contexto?</p>');
  }
  parts.push('</body></html>');
  return parts.join('');
}

function escaparHtmlPractica_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verificarPracticaCreada_(courseId, workId, practica) {
  const policy = ACADEMIC_POLICY.CLASSROOM.PRACTICE;
  validarPoliticaPractica_(policy);
  const work = Classroom.Courses.CourseWork.get(String(courseId), String(workId));
  if (String(work.state || '').toUpperCase() !== 'DRAFT') throw new Error('La PRÁCTICA no quedó DRAFT: ' + workId + '.');
  if (work.dueDate || work.dueTime) throw new Error('La PRÁCTICA quedó con fecha/hora de vencimiento y la política exige NONE: ' + workId + '.');

  const documentId = String(practica.documentId || '').trim();
  const materials = Array.isArray(work.materials) ? work.materials : [];
  const material = materials.find(function(m) {
    return m && m.driveFile && m.driveFile.driveFile && String(m.driveFile.driveFile.id || '') === documentId;
  });
  if (!material) throw new Error('La PRÁCTICA no contiene el Google Documento esperado: ' + documentId + '.');
  const shareMode = String(material.driveFile.shareMode || '').toUpperCase();
  if (shareMode !== policy.SHARE_MODE) throw new Error('La PRÁCTICA no quedó con STUDENT_COPY; modo encontrado: ' + shareMode + '.');

  const file = obtenerArchivoPracticaConReintento_(documentId);
  if (file.trashed === true) throw new Error('El Google Documento de la PRÁCTICA quedó en la papelera.');
  if (String(file.mimeType || '') !== policy.GOOGLE_DOCUMENT_MIME) throw new Error('El adjunto verificado de la PRÁCTICA no es un Google Documento nativo.');
  return {work:work,documentId:documentId,documentName:String(file.name || ''),documentMime:String(file.mimeType || ''),shareMode:shareMode,due:null};
}

function limpiarPracticaFallida_(courseId, result, practica) {
  if (result && result.workId && result.reutilizado !== true) {
    try { Classroom.Courses.CourseWork.delete(String(courseId), String(result.workId)); } catch (ignoreWork) {}
  }
  if (practica && practica.documentoCreadoPorScript === true && practica.documentId) {
    try { enviarArchivoPracticaPapelera_(String(practica.documentId)); } catch (ignoreFile) {}
  }
}

function validarPracticaCanonica() {
  validarPoliticasCanonicas_();
  validarPoliticaPractica_(ACADEMIC_POLICY.CLASSROOM.PRACTICE);
  let bloqueoVencimiento = false;
  try { rechazarVencimientoPractica_({fechaLimite:'2026-09-15'}); }
  catch (err) { bloqueoVencimiento = /no admite fecha ni hora de vencimiento/i.test(String(err && err.message || err)); }
  if (!bloqueoVencimiento) throw new Error('Regresión: una PRÁCTICA con vencimiento debe bloquearse.');
  if (resolverShareModeDirecto_({tipo:'PRACTICA'}) !== 'STUDENT_COPY') throw new Error('Regresión: PRÁCTICA debe resolver STUDENT_COPY por defecto.');
  return {ok:true,tipo:'PRACTICA',due:'NONE',document:'GOOGLE_DOC',shareMode:'STUDENT_COPY',driveVerification:'DRIVE_V3'};
}
