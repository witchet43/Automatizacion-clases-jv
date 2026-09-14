/**
 * REGLA CANÓNICA PARA PRÁCTICA
 *
 * Una PRÁCTICA:
 * - no tiene fecha ni hora de vencimiento;
 * - requiere un archivo Microsoft Word .docx;
 * - el archivo se adjunta con STUDENT_COPY;
 * - si no se proporciona documentId, el propio script genera el .docx.
 */
function prepararPracticaConWord_(params) {
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
    if (policy.CREATE_WORD_IF_MISSING !== true) {
      throw new Error('PRÁCTICA requiere documentId de un archivo Word .docx.');
    }
    const creado = crearDocumentoWordPractica_(p);
    documentId = creado.id;
    creadoPorScript = true;
    p.documentoWordNombre = creado.name;
  }

  const file = DriveApp.getFileById(documentId);
  const mime = String(file.getMimeType() || '');
  const name = String(file.getName() || '');
  if (mime !== policy.WORD_MIME || !name.toLowerCase().endsWith(policy.WORD_EXTENSION)) {
    throw new Error('PRÁCTICA requiere un archivo Microsoft Word .docx real. Archivo recibido: ' + name + ' (' + mime + ').');
  }

  p.documentId = documentId;
  p.shareMode = policy.SHARE_MODE;
  p.studentCopy = true;
  p.documentoWordCreadoPorScript = creadoPorScript;
  p.documentoWordNombre = p.documentoWordNombre || name;
  return p;
}

function rechazarVencimientoPractica_(params) {
  const p = params || {};
  const fields = [
    p.fechaLimite, p.horaLimite, p.dueDate, p.dueTime,
    p.fechaLimiteLocal, p.horaLimiteLocal
  ];
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
      policy.WORD_DOCUMENT_REQUIRED !== true ||
      policy.WORD_MIME !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      policy.WORD_EXTENSION !== '.docx' || policy.STUDENT_COPY_REQUIRED !== true ||
      policy.SHARE_MODE !== 'STUDENT_COPY' || policy.CREATE_WORD_IF_MISSING !== true) {
    throw new Error('La política canónica de PRÁCTICA no exige correctamente DOCX, STUDENT_COPY y ausencia de vencimiento.');
  }
  return true;
}

function crearDocumentoWordPractica_(params) {
  const p = params || {};
  const policy = ACADEMIC_POLICY.CLASSROOM.PRACTICE;
  validarPoliticaPractica_(policy);

  const titulo = String(p.titulo || p.title || 'Práctica').trim() || 'Práctica';
  const nombreBase = sanitizarNombreWordPractica_(String(p.documentoWordNombre || titulo).replace(/\.docx$/i, ''));
  const fileName = nombreBase + policy.WORD_EXTENSION;
  const descripcion = String(p.descripcion || p.description || '').trim();
  const contenido = normalizarContenidoWordPractica_(p.contenidoDocumento || p.wordContent || '');

  const lineas = [
    titulo,
    '',
    'Nombre del alumno: ________________________________________________',
    'Grupo: ____________________    Fecha: ____________________',
    ''
  ];
  if (descripcion) {
    lineas.push('Instrucciones');
    lineas.push(descripcion);
    lineas.push('');
  }
  if (contenido.length) {
    lineas.push('Desarrollo');
    contenido.forEach(function(x) { lineas.push(x); });
  } else {
    lineas.push('Desarrollo');
    lineas.push('Realiza aquí la evidencia solicitada para esta práctica.');
    lineas.push('');
    lineas.push('Reflexión 1: ¿Qué aprendiste durante la práctica?');
    lineas.push('Reflexión 2: ¿Qué dificultad encontraste y cómo la resolviste?');
    lineas.push('Reflexión 3: ¿Cómo aplicarías lo realizado en otro contexto?');
  }

  const nowIso = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  const documentXml = construirDocumentoXmlPractica_(lineas);
  const parts = [
    Utilities.newBlob(contenidoTiposDocxPractica_(), 'application/xml', '[Content_Types].xml'),
    Utilities.newBlob(relacionesRaizDocxPractica_(), 'application/xml', '_rels/.rels'),
    Utilities.newBlob(documentXml, 'application/xml', 'word/document.xml'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>', 'application/xml', 'word/_rels/document.xml.rels'),
    Utilities.newBlob(propiedadesCoreDocxPractica_(titulo, nowIso), 'application/xml', 'docProps/core.xml'),
    Utilities.newBlob(propiedadesAppDocxPractica_(), 'application/xml', 'docProps/app.xml')
  ];

  const blob = Utilities.zip(parts, fileName)
    .setName(fileName)
    .setContentType(policy.WORD_MIME);
  const file = DriveApp.createFile(blob);
  if (String(file.getMimeType() || '') !== policy.WORD_MIME) {
    try { file.setTrashed(true); } catch (ignore) {}
    throw new Error('No fue posible crear el .docx con el MIME esperado para PRÁCTICA.');
  }
  return {id:String(file.getId()), name:String(file.getName()), mimeType:String(file.getMimeType())};
}

function normalizarContenidoWordPractica_(value) {
  if (Array.isArray(value)) {
    return value.map(function(x) { return String(x == null ? '' : x); });
  }
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map(function(x) { return String(x); });
}

function sanitizarNombreWordPractica_(value) {
  const clean = String(value || 'Practica')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Practica';
}

function construirDocumentoXmlPractica_(lineas) {
  const body = lineas.map(function(text, index) {
    const bold = index === 0 || text === 'Instrucciones' || text === 'Desarrollo';
    const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
    const safe = escaparXmlPractica_(text);
    return '<w:p><w:r>' + rPr + '<w:t xml:space="preserve">' + safe + '</w:t></w:r></w:p>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + body + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
}

function escaparXmlPractica_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function contenidoTiposDocxPractica_() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
}

function relacionesRaizDocxPractica_() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
}

function propiedadesCoreDocxPractica_(titulo, nowIso) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + escaparXmlPractica_(titulo) + '</dc:title><dc:creator>Automatización académica</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + nowIso + '</dcterms:created>' +
    '<dcterms:modified xsi:type="dcterms:W3CDTF">' + nowIso + '</dcterms:modified>' +
    '</cp:coreProperties>';
}

function propiedadesAppDocxPractica_() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Automatización académica</Application></Properties>';
}

function verificarPracticaCreada_(courseId, workId, practica) {
  const policy = ACADEMIC_POLICY.CLASSROOM.PRACTICE;
  validarPoliticaPractica_(policy);
  const work = Classroom.Courses.CourseWork.get(String(courseId), String(workId));
  if (String(work.state || '').toUpperCase() !== 'DRAFT') {
    throw new Error('La PRÁCTICA no quedó DRAFT: ' + workId + '.');
  }
  if (work.dueDate || work.dueTime) {
    throw new Error('La PRÁCTICA quedó con fecha/hora de vencimiento y la política exige NONE: ' + workId + '.');
  }

  const documentId = String(practica.documentId || '').trim();
  const materials = Array.isArray(work.materials) ? work.materials : [];
  const material = materials.find(function(m) {
    return m && m.driveFile && m.driveFile.driveFile && String(m.driveFile.driveFile.id || '') === documentId;
  });
  if (!material) {
    throw new Error('La PRÁCTICA no contiene el archivo Word esperado: ' + documentId + '.');
  }
  const shareMode = String(material.driveFile.shareMode || '').toUpperCase();
  if (shareMode !== policy.SHARE_MODE) {
    throw new Error('La PRÁCTICA no quedó con STUDENT_COPY; modo encontrado: ' + shareMode + '.');
  }

  const file = DriveApp.getFileById(documentId);
  if (String(file.getMimeType() || '') !== policy.WORD_MIME || !String(file.getName() || '').toLowerCase().endsWith(policy.WORD_EXTENSION)) {
    throw new Error('El adjunto verificado de la PRÁCTICA no es un .docx válido.');
  }
  return {
    work:work,
    documentId:documentId,
    documentName:String(file.getName()),
    documentMime:String(file.getMimeType()),
    shareMode:shareMode,
    due:null
  };
}

function limpiarPracticaFallida_(courseId, result, practica) {
  if (result && result.workId && result.reutilizado !== true) {
    try { Classroom.Courses.CourseWork.delete(String(courseId), String(result.workId)); } catch (ignoreWork) {}
  }
  if (practica && practica.documentoWordCreadoPorScript === true && practica.documentId) {
    try { DriveApp.getFileById(String(practica.documentId)).setTrashed(true); } catch (ignoreFile) {}
  }
}

function validarPracticaCanonica() {
  validarPoliticasCanonicas_();
  validarPoliticaPractica_(ACADEMIC_POLICY.CLASSROOM.PRACTICE);
  let bloqueoVencimiento = false;
  try { rechazarVencimientoPractica_({fechaLimite:'2026-09-15'}); }
  catch (err) { bloqueoVencimiento = /no admite fecha ni hora de vencimiento/i.test(String(err && err.message || err)); }
  if (!bloqueoVencimiento) throw new Error('Regresión: una PRÁCTICA con vencimiento debe bloquearse.');
  if (resolverShareModeDirecto_({tipo:'PRACTICA'}) !== 'STUDENT_COPY') {
    throw new Error('Regresión: PRÁCTICA debe resolver STUDENT_COPY por defecto.');
  }
  return {ok:true, tipo:'PRACTICA', due:'NONE', document:'DOCX', shareMode:'STUDENT_COPY'};
}
