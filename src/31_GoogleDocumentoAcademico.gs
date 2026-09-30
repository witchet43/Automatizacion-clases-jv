const ACADEMIC_DOCUMENT_FOLDERS=Object.freeze({
  '871158466533':Object.freeze({PRACTICA:'13ESdAyqAtS1rwCO3ZxdvA8a98FjplaVB',TAREA:'1Z6dsOWxcOmu8tDDPpyPBvzPs1ebg1rK3',ACTIVIDAD:'1Vj-CEynY9Eb14lYdS_G5q6KWb94p0rxc'}),
  '871158187513':Object.freeze({PRACTICA:'12ns_8cxWPG6UoYfqzQFlkdm-wz6CMIEI',TAREA:'1MlnnzQWniqpWwS_LheB_04Joq5RnZTIR',ACTIVIDAD:'1ltFrMabPt_rwjlheekHzXIX7NhYukHqi'}),
  '871156334717':Object.freeze({PRACTICA:'1U_UJ2NkLie0Bx9dBtDwpj5QHWam4jevN',TAREA:'1k54RVr3aM5nXrV4hhuqQg0lGLA0jkrOM',ACTIVIDAD:'1zL297SvCEJ5vPFzq_9JipLKfMY8oLXfH'}),
  '871158479566':Object.freeze({PRACTICA:'1zYb0JYuKBHT6B107uYNoIsdlXgluFRw7',TAREA:'1axx0Zq4cQAH2cVqwMPKRZilca4L7-qzj',ACTIVIDAD:'1y6y2_BS8Kxp_nubj4MSCcf1TfWCNse26'}),
  '871149624583':Object.freeze({PRACTICA:'1BXIdpS7lTbiuqkz80J7EqaLBZJHy7xby',TAREA:'1JcZxevkPf6nph8z_jGJlHXWgC5WxuREN',ACTIVIDAD:'12kpr5ZQczpXwfndWoKBM9Ksq4mZIY_9G'}),
  '871156721160':Object.freeze({PRACTICA:'1Vjy9rssix07gl7b8o1t8ihC6hp3C3Ohc',TAREA:'1PCCtAw-LrYzuAtZxvoga5U17la0Sl_du',ACTIVIDAD:'1IfBQCD3yzELvNGwods25hiq7UYCfd8TF'}),
  '875776451793':Object.freeze({PRACTICA:'1p0CgBGDbrWHB_QmxjqpfQGiTOVc0H0K-',TAREA:'11C8eYVkmMPeM8uKfAlG3dUbf3HGoWhsH',ACTIVIDAD:'1HHgngCIvhivm3eos3wP98wuHusFC0P4x'})
});

function resolverCarpetaDocumentoAcademico_(courseId,tipo){
  const t=String(tipo||'').trim().toUpperCase();
  if(['PRACTICA','TAREA','ACTIVIDAD'].indexOf(t)<0)return '';
  const folders=ACADEMIC_DOCUMENT_FOLDERS[String(courseId||'').trim()];
  if(!folders||!folders[t])throw new Error('BLOCKED_DRIVE_STRUCTURE: no existe carpeta canónica para '+t+' en courseId '+String(courseId||'')+'.');
  return String(folders[t]);
}

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
  const folderId=resolverCarpetaDocumentoAcademico_(p.courseId,p.tipo);

  let created=null, advancedError=null;
  try{
    const metadata={name:titulo,mimeType:targetMime};
    if(folderId)metadata.parents=[folderId];
    created=Drive.Files.create(metadata,media,{fields:'id,name,mimeType,parents'});
  }catch(err){advancedError=err;}
  if(!created||!created.id){
    try{created=crearGoogleDocumentoAcademicoViaRest_(titulo,html,targetMime,folderId);}
    catch(restErr){
      throw new Error('No fue posible crear Google Documento académico. Servicio avanzado: '+
        String(advancedError&&advancedError.message?advancedError.message:advancedError||'sin resultado')+
        '. REST: '+String(restErr&&restErr.message?restErr.message:restErr));
    }
  }
  if(!created||!created.id)throw new Error('Drive v3 no devolvió id para Google Documento académico.');
  const file=Drive.Files.get(String(created.id),{fields:'id,name,mimeType,trashed,parents'});
  if(file.trashed===true||String(file.mimeType||'')!==targetMime||(
      folderId&&(!Array.isArray(file.parents)||file.parents.indexOf(folderId)<0))){
    try{Drive.Files.update({trashed:true},String(created.id),{fields:'id,trashed'});}catch(ignore){}
    throw new Error('El archivo académico creado no quedó como Google Documento nativo dentro de su carpeta canónica.');
  }
  return {id:String(file.id||created.id),name:String(file.name||titulo),mimeType:String(file.mimeType||'')};
}

function crearGoogleDocumentoAcademicoViaRest_(titulo,html,targetMime,folderId){
  const boundary='academic_'+Utilities.getUuid().replace(/-/g,'');
  const payload=[
    '--'+boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(folderId?{name:titulo,mimeType:targetMime,parents:[folderId]}:{name:titulo,mimeType:targetMime}),
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
