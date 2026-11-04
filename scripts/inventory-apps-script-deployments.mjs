import fs from 'node:fs';
const script=JSON.parse(fs.readFileSync('.clasp.json','utf8'));
const conf=JSON.parse(process.env.CLASPRC_JSON||'{}');
const entry=conf.tokens?.default||conf.token||conf;
const refresh=entry.refresh_token;
const client=entry.client_id||conf.oauth2ClientSettings?.clientId;
const secret=entry.client_secret||conf.oauth2ClientSettings?.clientSecret;
const fail=(reason)=>{throw Error(reason);};
async function token(){
  if(!refresh||!client||!secret)fail('EXISTING_OWNER_OAUTH_REFRESH_UNAVAILABLE');
  const result=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:client,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'}),
    signal:AbortSignal.timeout(20000)
  });
  if(!result.ok)fail('EXISTING_OWNER_OAUTH_REFRESH_HTTP_'+result.status);
  const doc=await result.json();
  if(typeof doc.access_token!=='string')fail('EXISTING_OWNER_OAUTH_TOKEN_INVALID');
  return doc.access_token;
}
try{
  const access=await token();
  const url='https://script.googleapis.com/v1/projects/'+encodeURIComponent(script.scriptId)+'/deployments?pageSize=100';
  const response=await fetch(url,{headers:{authorization:'Bearer '+access},
    signal:AbortSignal.timeout(25000)});
  if(!response.ok){
    console.log(JSON.stringify({check:'APPS_SCRIPT_DEPLOYMENT_INVENTORY',
      httpStatus:response.status,success:false,oauthGrantReused:true,
      noAcademicActions:true,noCredentialsExposed:true}));
    process.exitCode=1;
  }else{
    const data=await response.json();
    const rows=Array.isArray(data.deployments)?data.deployments:[];
    const executions=rows.filter(x=>x.entryPoints?.some(e=>e.entryPointType==='EXECUTION_API'));
    const types=[...new Set(rows.flatMap(x=>(x.entryPoints||[]).map(e=>String(e.entryPointType||'UNKNOWN'))))].sort();
    const deployments=executions.map(x=>String(x.deploymentId||'')).filter(x=>/^[A-Za-z0-9_-]{20,200}$/.test(x)).slice(0,10);
    // Only deployment metadata: never record OAuth tokens, source or request payloads.
    const apiCandidates=executions.map(x=>({
      deploymentId:String(x.deploymentId||'').slice(0,200),
      version:Number(x.deploymentConfig?.versionNumber||0),
      description:String(x.deploymentConfig?.description||'').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,90),
      access:(x.entryPoints||[]).filter(e=>e.entryPointType==='EXECUTION_API')
        .map(e=>String(e.executionApi?.entryPointConfig?.access||'UNKNOWN').slice(0,35)),
      updateTime:String(x.updateTime||'').slice(0,35)
    })).sort((a,b)=>b.version-a.version);
    if(process.env.REQUIRE_CANONICAL_EXECUTION_API==='true'){
      const canonical='AKfycbz2rCuB9jUsbnt0tj0RgHmr3lguOZjVL34a_2F_yhggiwLNTOEn8QdsdbFv4SK6aGxr';
      const selected=apiCandidates.find(x=>x.deploymentId===canonical);
      if(!selected || !selected.access.includes('MYSELF') || selected.version<277)
        throw Error('CANONICAL_OWNER_ONLY_EXECUTION_API_NOT_READY');
    }
    console.log(JSON.stringify({check:'APPS_SCRIPT_DEPLOYMENT_INVENTORY',success:true,
      cloudProjectNumber:String(script.projectId||''),deploymentCount:rows.length,
      observedEntryPointTypes:types,apiExecutableCount:executions.length,
      existingApiDeploymentIds:deployments,apiCandidates,paginationPresent:Boolean(data.nextPageToken),
      noAcademicActions:true,noCredentialsExposed:true}));
  }
}catch(e){
  const raw=String(e?.message||'UNKNOWN');
  console.log(JSON.stringify({check:'APPS_SCRIPT_DEPLOYMENT_INVENTORY',
    failure:/^[A-Z][A-Z0-9_]{3,90}$/.test(raw)?raw:'SAFE_INVOCATION_FAILED',
    noAcademicActions:true,noCredentialsExposed:true}));
  process.exitCode=1;
}
