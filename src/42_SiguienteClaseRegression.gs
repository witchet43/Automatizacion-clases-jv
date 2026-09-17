function validarResolucionSiguienteClaseSistemasDistribuidos(){
  const x=resolverSiguienteClase('Sistemas Distribuidos');
  if(!x||x.ok!==true)throw new Error('resolverSiguienteClase no devolvió ok=true.');
  if(String(x.planningSpreadsheetId||'')!=='11QQnAbMCCoebc2o6Tm2_lROZvyfjFnVM89ZAcgBbr6I')throw new Error('No usa la planeación canónica de Sistemas Distribuidos.');
  if(!x.complete&&(!x.target||!String(x.target.topic||'').trim()))throw new Error('No resolvió tema canónico.');
  if(String(x.resourceState||'DRAFT').toUpperCase()!=='DRAFT')throw new Error('Estado distinto de DRAFT.');
  return {ok:true,planningSpreadsheetId:x.planningSpreadsheetId,target:x.target||null,complete:x.complete===true};
}
