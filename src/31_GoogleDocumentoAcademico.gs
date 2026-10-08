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
  validarFormatoHtmlDocumentoAcademico_(html,titulo);
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
  if(descripcion&&!lines.length)parts.push('<p>'+escaparHtmlDocumentoAcademico_(descripcion)+'</p>');
  if(lines.length)parts.push(renderizarLineasDocumentoAcademico_(titulo,lines));
  parts.push('</body></html>');
  return parts.join('');
}

function normalizarClaveFormatoDocumento_(value){
  return String(value==null?'':value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function esEncabezadoNivel2Documento_(line){
  const k=normalizarClaveFormatoDocumento_(line);
  return /^(proposito|objetivo|material previo principal|materiales|herramientas|reglas de seguridad|indicaciones|referencia rapida|ejemplos previos|fase de aplicacion en clase|resultados esperados|errores frecuentes|evidencia obligatoria|evidencia de entrega|producto de entrega|entregable|criterios de evaluacion|criterios de revision|pregunta de cierre|checklist de entrega|rubrica.*|guia de los comandos|criterios de clasificacion|casos|reglas)$/.test(k);
}

function esEncabezadoNivel3Documento_(line){
  const s=String(line||'').trim();
  return /^\d+\.\s+[A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9 /+().,:;_-]{3,}$/.test(s)||
    /^(Ejercicio|Ejemplo|Parte)\s+[A-Z0-9]+\b/i.test(s);
}

function esFilaTablaPipeDocumento_(line){
  const s=String(line==null?'':line).trim();
  if(!/^\|.*\|$/.test(s))return false;
  const cells=s.slice(1,-1).split('|').map(function(x){return String(x).trim();});
  return cells.length>=2&&cells.some(function(x){return x!=='';});
}

function parsearFilaTablaPipeDocumento_(line){
  return String(line==null?'':line).trim().slice(1,-1).split('|').map(function(x){return String(x).trim();});
}

function esSeparadorMarkdownTablaDocumento_(cells){
  return Array.isArray(cells)&&cells.length>0&&cells.every(function(x){
    return /^:?-{3,}:?$/.test(String(x||'').trim());
  });
}

function renderizarTablaPipeDocumento_(rows){
  const parsed=(rows||[]).map(parsearFilaTablaPipeDocumento_).filter(function(c){return !esSeparadorMarkdownTablaDocumento_(c);});
  if(parsed.length<2)return '';
  const cols=parsed[0].length;
  if(cols<2||parsed.some(function(r){return r.length!==cols;}))return '';
  const out=['<table border="1"><thead><tr>'];
  parsed[0].forEach(function(cell){out.push('<th>'+escaparHtmlDocumentoAcademico_(cell)+'</th>');});
  out.push('</tr></thead><tbody>');
  parsed.slice(1).forEach(function(row){
    out.push('<tr>');
    row.forEach(function(cell){out.push('<td>'+escaparHtmlDocumentoAcademico_(cell)+'</td>');});
    out.push('</tr>');
  });
  out.push('</tbody></table>');
  return out.join('');
}

function renderizarLineasDocumentoAcademico_(titulo,lines){
  const titleKey=normalizarClaveFormatoDocumento_(titulo);
  const out=[];
  let listType='';
  function closeList(){if(listType){out.push(listType==='ul'?'</ul>':'</ol>');listType='';}}
  let i=0;
  while(i<(lines||[]).length){
    const raw=lines[i];
    const line=String(raw==null?'':raw).trim();
    if(!line){closeList();i++;continue;}
    if(esFilaTablaPipeDocumento_(line)){
      const tableLines=[];
      let j=i;
      while(j<lines.length&&esFilaTablaPipeDocumento_(String(lines[j]==null?'':lines[j]).trim())){
        tableLines.push(String(lines[j]).trim());
        j++;
      }
      const tableHtml=renderizarTablaPipeDocumento_(tableLines);
      if(tableHtml){
        closeList();
        out.push(tableHtml);
        i=j;
        continue;
      }
    }
    const key=normalizarClaveFormatoDocumento_(line);
    if(!key||key===titleKey||key==='indicaciones para el alumno'||key==='desarrollo'){i++;continue;}
    if(esEncabezadoNivel2Documento_(line)){
      closeList();out.push('<h2>'+escaparHtmlDocumentoAcademico_(line)+'</h2>');i++;continue;
    }
    if(esEncabezadoNivel3Documento_(line)){
      closeList();out.push('<h3>'+escaparHtmlDocumentoAcademico_(line)+'</h3>');i++;continue;
    }
    const bullet=line.match(/^[-•]\s+(.+)$/);
    if(bullet){
      if(listType!=='ul'){closeList();out.push('<ul>');listType='ul';}
      out.push('<li>'+escaparHtmlDocumentoAcademico_(bullet[1])+'</li>');i++;continue;
    }
    const numbered=line.match(/^(\d+)\.\s+(.+)$/);
    if(numbered){
      const explicitNumber=Math.max(1,Number(numbered[1])||1);
      if(listType!=='ol'){
        closeList();
        out.push('<ol'+(explicitNumber!==1?' start="'+explicitNumber+'"':'')+'>');
        listType='ol';
      }
      out.push('<li>'+escaparHtmlDocumentoAcademico_(numbered[2])+'</li>');i++;continue;
    }
    closeList();out.push('<p>'+escaparHtmlDocumentoAcademico_(line)+'</p>');
    i++;
  }
  closeList();
  return out.join('');
}

function validarFormatoHtmlDocumentoAcademico_(html,titulo){
  const body=String(html||'');
  if(!/<h1>[^<]+<\/h1>/i.test(body))throw new Error('BLOCKED_DOCUMENT_FORMAT: falta título H1 en '+String(titulo||'documento')+'.');
  const flat=(body.match(/<p>([^<]{450,})<\/p>/gi)||[]).filter(function(p){
    return /(DESARROLLO|EVIDENCIA DE ENTREGA|GUIA DE LOS COMANDOS|GUÍA DE LOS COMANDOS)/i.test(p);
  });
  if(flat.length)throw new Error('BLOCKED_DOCUMENT_FORMAT_FLAT_BLOCK: se detectó contenido académico estructurado dentro de un párrafo gigante.');
  if(/<p>\s*(DESARROLLO|INDICACIONES PARA EL ALUMNO)\s*<\/p>/i.test(body)){
    throw new Error('BLOCKED_DOCUMENT_FORMAT_REDUNDANT_HEADER: encabezado estructural quedó como párrafo plano.');
  }
  if(/<p>\s*\|[^<\n]+\|\s*<\/p>/i.test(body)){
    throw new Error('BLOCKED_DOCUMENT_FORMAT_PIPE_TABLE: una estructura tabular quedó como texto con pipes en lugar de tabla nativa.');
  }
  return true;
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
