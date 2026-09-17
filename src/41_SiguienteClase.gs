/** Resolución canónica de la siguiente clase sin depender de fecha ni memoria del modelo. */
function resolverSiguienteClase(materia) {
  const subject = String(materia || '').trim();
  if (!subject) throw new Error('materia es obligatoria.');
  const source = planningSourceFor_(subject);
  const ss = SpreadsheetApp.openById(source.spreadsheetId);
  const sheet = ss.getSheetByName(source.sheet);
  if (!sheet) throw new Error('No existe la hoja canónica ' + source.sheet + '.');
  const values = sheet.getDataRange().getDisplayValues();
  const hi = Math.max(0, (source.headerRow || 1) - 1);
  const headers = values[hi].map(normalizeGuard_);
  const col = function(names){ return findHeaderGuard_(headers, names); };
  const cSession=col(['sesion','sesión','clase']), cUnit=col(['unidad']), cTopic=col(['tema / subtema','tema/subtema','tema']), cRoom=col(['aula']);
  const cPrev=col(['tarea previa a esta clase']), cPractice=col(['practica del dia','práctica del día']), cNext=col(['tarea siguiente / preparacion para la proxima clase','tarea siguiente / preparación para la próxima clase']);
  const cGamma=col(['presentacion gamma','presentación gamma']), cGammaUrl=col(['enlace gamma']), cState=col(['estado integral de la sesion','estado integral de la sesión']);
  if (cTopic < 0) throw new Error('Planeación sin Tema / subtema.');
  const rows = values.slice(hi+1).map(function(row,i){return {row:i+hi+2,session:cSession>=0?row[cSession]:'',unit:cUnit>=0?row[cUnit]:'',topic:row[cTopic],room:cRoom>=0?row[cRoom]:'',previous:cPrev>=0?row[cPrev]:'',practice:cPractice>=0?row[cPractice]:'',next:cNext>=0?row[cNext]:'',gamma:cGamma>=0?row[cGamma]:'',gammaUrl:cGammaUrl>=0?row[cGammaUrl]:'',state:cState>=0?row[cState]:''};}).filter(function(x){return String(x.topic||'').trim();});
  // La secuencia se obtiene exclusivamente de la planeación: primera sesión cuyo estado integral no sea COMPLETO.
  const pending = rows.find(function(x){return normalizeGuard_(x.state).indexOf('completo') !== 0;});
  if (!pending) return {ok:true,materia:subject,complete:true,message:'No hay sesiones canónicas pendientes.'};
  return {ok:true,materia:subject,complete:false,planningSpreadsheetId:source.spreadsheetId,planningSheet:source.sheet,target:pending,resourceState:'DRAFT'};
}

function generarSiguienteClase(params) {
  const p = params && typeof params === 'object' ? params : {};
  const resolved = resolverSiguienteClase(p.materia || 'Sistemas Distribuidos');
  if (resolved.complete) return resolved;
  // Este entrypoint no inventa contenido: devuelve el paquete canónico exacto para que los creadores existentes lo ejecuten.
  // La creación automática se bloquea si la planeación aún marca la sesión como parcial y faltan IDs operativos,
  // evitando duplicados y falsas confirmaciones.
  return {ok:true,mode:'CANONICAL_RESOLUTION',materia:resolved.materia,target:resolved.target,planningSpreadsheetId:resolved.planningSpreadsheetId,planningSheet:resolved.planningSheet,resourceState:'DRAFT',requiresCreation:true};
}
