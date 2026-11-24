import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {readContext} from './academic-context.mjs';

const sortJson=v=>Array.isArray(v)?v.map(sortJson):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortJson(v[k])])):v;
const normalize=(type,source)=>type==='JSON'
  ?JSON.stringify(sortJson(JSON.parse(source)))
  :String(source).replace(/\r\n?/g,'\n').replace(/\n+$/,'');
export function fingerprint(files){
  const map=new Map();
  for(const f of files){
    if(!f.name||!['SERVER_JS','HTML','JSON'].includes(f.type)||typeof f.source!=='string')
      throw Error('APPS_SCRIPT_FILE_INVALID');
    const key=f.type+':'+f.name;
    if(map.has(key))throw Error('APPS_SCRIPT_DUPLICATE_FILE');
    map.set(key,createHash('sha256').update(normalize(f.type,f.source)).digest('hex'));
  }
  return map;
}
export function compareFiles(local,remote){
  const a=fingerprint(local),b=fingerprint(remote);
  const differing=[...new Set([...a.keys(),...b.keys()])].filter(k=>a.get(k)!==b.get(k)).sort();
  return {matches:differing.length===0,differing,localCount:a.size,remoteCount:b.size,
    localDigest:createHash('sha256').update(JSON.stringify([...a].sort())).digest('hex'),
    remoteDigest:createHash('sha256').update(JSON.stringify([...b].sort())).digest('hex')};
}
function localFiles(root,relative=''){
  return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(entry=>{
    const rel=path.posix.join(relative,entry.name);
    if(entry.isDirectory())return localFiles(root,rel);
    const ext=path.extname(entry.name);
    const type=['.gs','.js'].includes(ext)?'SERVER_JS':ext==='.html'?'HTML':rel==='appsscript.json'?'JSON':null;
    if(!type)return [];
    return [{name:rel.slice(0,-ext.length),type,source:fs.readFileSync(path.join(root,rel),'utf8')}];
  });
}
async function fetchJson(url,options={}){
  for(let attempt=0;attempt<3;attempt++){
    let r;
    try{r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});}
    catch{
      if(attempt===2)throw Error('APPS_SCRIPT_RELEASE_TRANSPORT');
      await sleep(2000*(attempt+1));continue;
    }
    if(r.ok)return await r.json();
    if([429,500,502,503,504].includes(r.status)&&attempt<2){
      await sleep(2000*(attempt+1));continue;
    }
    throw Error('APPS_SCRIPT_RELEASE_HTTP_'+r.status);
  }
}
async function inspect(){
  const {manifest}=readContext();
  const clasp=JSON.parse(fs.readFileSync('.clasp.json','utf8'));
  const c=JSON.parse(process.env.CLASPRC_JSON||'{}');
  const t=c.tokens?.default||c.token||c;
  const client=t.client_id||c.oauth2ClientSettings?.clientId;
  const secret=t.client_secret||c.oauth2ClientSettings?.clientSecret;
  if(!t.refresh_token||!client||!secret)throw Error('APPS_SCRIPT_OWNER_OAUTH_UNAVAILABLE');
  const auth=await fetchJson('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:client,client_secret:secret,refresh_token:t.refresh_token,grant_type:'refresh_token'})
  });
  if(typeof auth.access_token!=='string')throw Error('APPS_SCRIPT_OWNER_TOKEN_INVALID');
  const headers={authorization:'Bearer '+auth.access_token};
  const base='https://script.googleapis.com/v1/projects/'+encodeURIComponent(clasp.scriptId);
  const id=new URL(manifest.webApp.url).pathname.split('/').at(-2);
  const d=await fetchJson(base+'/deployments/'+encodeURIComponent(id),{headers});
  const version=Number(d.deploymentConfig?.versionNumber);
  if(d.deploymentId!==id||!Number.isSafeInteger(version)||version<1)throw Error('APPS_SCRIPT_CANONICAL_VERSION_INVALID');
  if(!d.entryPoints?.some(e=>e.entryPointType==='WEB_APP'))throw Error('APPS_SCRIPT_CANONICAL_WEBAPP_MISSING');
  const deployed=await fetchJson(base+'/content?versionNumber='+version,{headers});
  if(!Array.isArray(deployed.files)||!deployed.files.length)throw Error('APPS_SCRIPT_DEPLOYED_CONTENT_MISSING');
  const result=compareFiles(localFiles(clasp.rootDir||'src'),deployed.files);
  return {...result,version,deploymentId:id,checkedAt:new Date().toISOString(),noAcademicWrites:true};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{
    const plan=process.argv.includes('--plan'),result=await inspect();
    console.log(JSON.stringify(result));
    if(process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nApps Script deployed version: '+result.version+
        '; exact source match: '+result.matches+'; repository digest: '+result.localDigest+'\n');
    if(plan){
      if(!process.env.GITHUB_OUTPUT)throw Error('APPS_SCRIPT_RELEASE_OUTPUT_MISSING');
      fs.appendFileSync(process.env.GITHUB_OUTPUT,'needs_deploy='+(!result.matches)+'\n');
    }else if(!result.matches)throw Error('APPS_SCRIPT_DEPLOYED_SOURCE_MISMATCH');
  }catch(e){
    const code=/^APPS_SCRIPT_[A-Z0-9_]+$/.test(e.message)?e.message:'APPS_SCRIPT_RELEASE_VERIFICATION_FAILED';
    console.error(code);process.exitCode=1;
  }
}
