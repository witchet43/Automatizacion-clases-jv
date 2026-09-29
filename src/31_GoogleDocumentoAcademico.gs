/**
 * CREADOR GENÉRICO DE GOOGLE DOCUMENTOS ACADÉMICOS
 *
 * Infraestructura compartida para material, práctica, actividad o tarea.
 * Las plantillas específicas se construyen fuera de este módulo.
 */
function crearGoogleDocumentoAcademico_(params){
  const p=params&&typeof params==='object'?params:{};
  const titulo=String(p.titulo||p.title||'Documento académico').trim()||'Documento académico';
  const targetMime='application/vnd.google-apps.document';
  const html=String(p.html||construirHtmlDocumentoAcademico_(
    titulo,
    String(p.descripcion||p.description||'').trim(),
    p.contenidoDocumento!==undefined?p.contenidoDocumento:p.googleDocContent
  ));
  const media=Utilities.newBlob(html,'text/html',titulo+'.html');

  let created=null, advancedError=null;
  try{
    created=Drive.Files.create({name:titulo,mimeType:targetMime},media,{fields:'id,name,mimeType'});
  }catch(err){advancedError=err;}
  if(!created||!created.id){
    try{created=crearGoogleDocumentoAcademicoViaRest_(titulo,html,targetMime);}
    catch(restErr){
      throw new Error('No fue posible crear Google Documento académico. Servicio avanzado: '+
        String(advancedError&&advancedError.message?advancedError.message:advancedError||'sin resultado')+
        '. REST: '+String(restErr&&restErr.message?restErr.message:restErr));
    }
  }
  if(!created||!created.id)throw new Error('Drive v3 no devolvió id para Google Documento académico.');
  const file=Drive.Files.get(String(created.id),{fields:'id,name,mimeType,trashed'});
  if(file.trashed===true||String(file.mimeType||'')!==targetMime){
    try{Drive.Files.update({trashed:true},String(created.id),{fields:'id,trashed'});}catch(ignore){}
    throw new Error('El archivo académico creado no quedó como Google Documento nativo.');
  }
  return {id:String(file.id||created.id),name:String(file.name||titulo),mimeType:String(file.mimeType||'')};
}

function crearGoogleDocumentoAcademicoViaRest_(titulo,html,targetMime){
  const boundary='academic_'+Utilities.getUuid().replace(/-/g,'');
  const payload=[
    '--'+boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({name:titulo,mimeType:targetMime}),
    '--'+boundary,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '--'+boundary+'--',
    ''
  ].join('\r\n');
  const response=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType',{
    method:'post',
    contentType:'multipart/related; boundary='+boundary,
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:payload,
    muteHttpExceptions:true
  });
  const code=Number(response.getResponseCode());
  const raw=String(response.getContentText()||'');
  if(code<200||code>=300)throw new Error('HTTP '+code+': '+raw.slice(0,500));
  try{return JSON.parse(raw);}catch(err){throw new Error('respuesta JSON inválida de Drive API');}
}

function construirHtmlDocumentoAcademico_(titulo,descripcion,contenido){
  const lines=normalizarContenidoDocumentoAcademico_(contenido);
  const parts=['<!doctype html><html><head><meta charset="utf-8"><title>'+
    escaparHtmlDocumentoAcademico_(titulo)+'</title></head><body>',
    '<h1>'+escaparHtmlDocumentoAcademico_(titulo)+'</h1>'];
  if(descripcion)parts.push('<p>'+escaparHtmlDocumentoAcademico_(descripcion)+'</p>');
  lines.forEach(function(line){parts.push('<p>'+escaparHtmlDocumentoAcademico_(line)+'</p>');});
  parts.push('</body></html>');
  return parts.join('');
}

function normalizarContenidoDocumentoAcademico_(value){
  if(Array.isArray(value))return value.map(function(x){return String(x==null?'':x);});
  const raw=String(value==null?'':value).trim();
  return raw?raw.split(/\r?\n/).map(function(x){return String(x);}):[];
}

function escaparHtmlDocumentoAcademico_(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
