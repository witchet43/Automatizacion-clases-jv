/** Resuelve la siguiente sesión desde la planeación canónica de la materia. */
function resolverSiguienteClase(materia) {
  const subject=String(materia||'').trim(); if(!subject)throw new Error('materia es obligatoria.');
  const source=resolvePlanningSource_(subject), ss=SpreadsheetApp.openById(source.spreadsheetId); let sheet=ss.getSheetByName(source.preferredSheet); if(!sheet&&ss.getSheets().length===1)sheet=ss.getSheets()[0]; if(!sheet)throw new Error('No existe hoja canónica.');
  const values=sheet.getDataRange().getDisplayValues(); let hi=-1; for(let i=0;i<Math.min(values.length,12);i++){const h=values[i].map(normalizeGuard_);if(findHeaderGuard_(h,['tema / subtema','tema/subtema','tema'])>=0){hi=i;break;}} if(hi<0)throw new Error('No se encontró encabezado canónico.');
  const headers=values[hi].map(normalizeGuard_), col=function(n){return findHeaderGuard_(headers,n);};
  const cs=col(['sesion','sesión','clase']),cu=col(['unidad']),ct=col(['tema / subtema','tema/subtema','tema']),ca=col(['aula']),cp=col(['tarea previa a esta clase']),cpr=col(['practica del dia','práctica del día']),cn=col(['tarea siguiente / preparacion para la proxima clase','tarea siguiente / preparación para la próxima clase']),cg=col(['presentacion gamma','presentación gamma']),cgu=col(['enlace gamma']),cst=col(['estado integral de la sesion','estado integral de la sesión']);
  const rows=values.slice(hi+1).map(function(r,i){return{row:hi+i+2,session:cs>=0?r[cs]:'',unit:cu>=0?r[cu]:'',topic:r[ct],room:ca>=0?r[ca]:'',previous:cp>=0?r[cp]:'',practice:cpr>=0?r[cpr]:'',next:cn>=0?r[cn]:'',gamma:cg>=0?r[cg]:'',gammaUrl:cgu>=0?r[cgu]:'',state:cst>=0?r[cst]:''};}).filter(function(x){return String(x.topic||'').trim();});
  const pending=rows.find(function(x){return normalizeGuard_(x.state).indexOf('completo')!==0;});
  return pending?{ok:true,complete:false,materia:subject,planningSpreadsheetId:source.spreadsheetId,planningSheet:sheet.getName(),target:pending,resourceState:'DRAFT'}:{ok:true,complete:true,materia:subject};
}
function generarSiguienteClase(params){const p=params&&typeof params==='object'?params:{};const x=resolverSiguienteClase(p.materia||'Sistemas Distribuidos');return Object.assign({mode:'CANONICAL_RESOLUTION'},x);}
function generarSiguienteClaseSistemasDistribuidos(){return generarSiguienteClase({materia:'Sistemas Distribuidos'});}
