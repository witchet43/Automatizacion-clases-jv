import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const base='https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app';
const expectedIssuer='https://dev-67cfevmusm7px130.us.auth0.com/';
const sha=process.env.GITHUB_SHA||'';
const token=process.env.RELEASE_PROBE_ID_TOKEN||'';
const report=JSON.parse(fs.readFileSync('release-evidence.json','utf8'));
if(!/^[a-f0-9]{40}$/.test(sha)||report.sha!==sha||report.status!=='DEPLOYMENTS_VERIFIED'||
  report.workflows.apps.sourceVerified!==true||!token)throw Error('RELEASE_LIVE_PREREQUISITES_MISSING');
async function http(path,{method='GET',body,auth=false,expected=200}={}){
  for(let i=0;i<3;i++){
    let response;
    try{
      response=await fetch(base+path,{method,headers:{
        accept:'application/json, text/event-stream',
        ...(body?{'content-type':'application/json'}:{}),
        ...(auth?{authorization:'Bearer '+token}:{})
      },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    }catch{
      if(i===2)throw Error('RELEASE_LIVE_TRANSPORT');
      await sleep(2000*(i+1));continue;
    }
    if([429,500,502,503,504].includes(response.status)&&response.status!==expected&&i<2){
      await sleep(2000*(i+1));continue;
    }
    if(response.status!==expected)throw Error('RELEASE_LIVE_HTTP_'+response.status);
    const raw=await response.text();
    const data=raw.split('\n').find(s=>s.startsWith('data: '));
    return {body:JSON.parse(data?data.slice(6):raw),headers:response.headers};
  }
}
const rpc=(method,params,id,expected=200)=>http('/mcp',{method:'POST',body:{jsonrpc:'2.0',id,method,params},expected});
const service=JSON.parse(execFileSync('gcloud',['run','services','describe','academic-classroom-mcp-oauth',
  '--project=classroom-mcp-512122','--region=us-central1',
  '--format=json(metadata.labels,status.latestReadyRevisionName,status.traffic)'],{encoding:'utf8'}));
const active=service.metadata?.labels?.['github-commit'];
const revision=service.status?.latestReadyRevisionName;
assert.match(active||'',/^[a-f0-9]{40}$/);
assert.ok(revision);
assert.equal(service.status?.traffic?.length,1);
assert.equal(service.status.traffic[0].percent,100);
assert.equal(service.status.traffic[0].revisionName,revision);
// Unchanged component may retain its prior commit, but runtime source must be equivalent.
execFileSync('git',['merge-base','--is-ancestor',active,sha],{stdio:'ignore'});
execFileSync('git',['diff','--quiet',active,sha,'--','mcp-cloud-run/','config/academic-context.json',
  '.github/workflows/deploy-cloud-run-mcp.yml',':(exclude,glob)mcp-cloud-run/**/*.md'],{stdio:'ignore'});
const health=(await http('/health')).body;
assert.equal(health.status,'ok');
assert.equal(health.auth,'oauth');
const metadata=(await http('/.well-known/oauth-protected-resource')).body;
assert.equal(metadata.resource,base);
assert.deepEqual(metadata.authorization_servers,[expectedIssuer]);
assert.ok(metadata.scopes_supported.includes('academic.read'));
assert.ok(metadata.scopes_supported.includes('academic.close_unit'));
const init=(await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},
  clientInfo:{name:'release-orchestrator',version:'1'}},1)).body;
assert.equal(init.result?.serverInfo?.name,'classroom-academic-gateway');
const listed=(await rpc('tools/list',{},2)).body.result?.tools;
assert.ok(Array.isArray(listed));
const discovered=new Map(listed.map(t=>[t.name,t]));
for(const name of ['gateway_status','listar_entregas','importar_calificaciones_forms','cerrar_unidad','calificar_entrega_draft'])
  assert.ok(discovered.has(name),'RELEASE_REQUIRED_TOOL_MISSING');
const gradeTool=discovered.get('importar_calificaciones_forms');
assert.deepEqual(gradeTool.securitySchemes,[{type:'oauth2',scopes:['academic.close_unit']}]);
const denied=await rpc('tools/call',{name:'importar_calificaciones_forms',arguments:{
  courseId:'871158187513',courseWorkId:'893176002338',confirmar:true,requestId:'release_negative_probe'
}},3,401);
assert.match(denied.headers.get('www-authenticate')||'',/academic.close_unit/);
const noMachine=await http('/release/probe',{method:'POST',expected:401});
assert.equal(noMachine.body.ok,false);
const signed=(await http('/release/probe',{method:'POST',auth:true})).body;
assert.equal(signed.ok,true);
assert.equal(signed.commit,active);
assert.equal(signed.upstreamHmacAccepted,true);
assert.equal(signed.noAcademicWrites,true);
const evidence={ok:true,targetSha:sha,activeCloudCommit:active,revision,traffic:100,
  appsScriptVerified:true,signedWebAppProbe:true,oauthGuard:true,discovery:true,
  toolCount:listed.length,importToolDiscovered:true,noAcademicWrites:true,checkedAt:new Date().toISOString()};
fs.writeFileSync('release-live-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
