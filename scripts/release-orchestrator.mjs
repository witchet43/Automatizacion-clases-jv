import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

export const WORKFLOWS = Object.freeze({
  ci:'validate-minimal-academic-operations.yml',
  apps:'deploy-apps-script.yml',
  cloud:'deploy-cloud-run-mcp.yml'
});
export const MAX_ATTEMPTS=2;
export const MUTATION_STEPS=Object.freeze({
  apps:['Enable and list manifest advanced services','Check Apps Script version capacity before mutation',
    'Deploy to Google Apps Script','Update canonical Web App deployment'],
  cloud:['Deploy only new independent MCP adapter']
});
export function selectRun(runs,sha){
  return runs.filter(r=>r.head_sha===sha&&r.head_branch==='main'&&r.event==='push')
    .sort((a,b)=>Number(b.id)-Number(a.id))[0]||null;
}
export function safeRetry(kind,run,jobs){
  if(!run||run.status!=='completed'||run.conclusion==='success'||
      Number(run.run_attempt||1)>=MAX_ATTEMPTS)return false;
  if(!['failure','timed_out','startup_failure','cancelled'].includes(run.conclusion))return false;
  if(kind==='ci')return true; // no external mutation in CI
  if(!MUTATION_STEPS[kind]||!Array.isArray(jobs)||!jobs.length)return false;
  // Rerunning a failed job can repeat all its steps. Fail closed after any
  // deployment mutation started (including uncertainty about a canceled step).
  for(const job of jobs){
    if(!Array.isArray(job.steps)||!job.steps.length)return false;
    for(const step of job.steps){
      if(MUTATION_STEPS[kind].includes(step.name)&&
        (step.started_at||step.completed_at)&&step.conclusion!=='skipped')return false;
      if(MUTATION_STEPS[kind].includes(step.name)&&
        (step.status==='in_progress'||['success','failure','cancelled','timed_out'].includes(step.conclusion)))return false;
    }
  }
  return true;
}
export function planRelease(paths){
  const scoped=paths.some(p=>/^\.platform-changes\/[^/]+\.json$/.test(p));
  if(!scoped)throw Error('RELEASE_AUTHORIZATION_EVIDENCE_MISSING');
  return {ci:true,apps:true,cloud:paths.some(p=>
    p==='config/academic-context.json'||p==='.github/workflows/deploy-cloud-run-mcp.yml'||
    (p.startsWith('mcp-cloud-run/')&&!p.endsWith('.md')))};
}
const git=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=process.env.GITHUB_SHA||'';
const repo=process.env.GITHUB_REPOSITORY||'';
const token=process.env.GH_TOKEN||'';
const api=process.env.GITHUB_API_URL||'https://api.github.com';
async function request(path,method='GET',body){
  for(let i=0;i<3;i++){
    let res;
    try{
      res=await fetch(api+'/repos/'+repo+path,{method,headers:{
        authorization:'Bearer '+token,accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28','content-type':'application/json'
      },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    }catch{
      // Never blindly replay a write with uncertain outcome.
      if(method!=='GET'||i===2)throw Error('RELEASE_API_TRANSPORT');
      await sleep(1500*(i+1));continue;
    }
    if(res.ok)return res.status===204||res.status===201?null:await res.json();
    if(method==='GET'&&[429,500,502,503,504].includes(res.status)&&i<2){
      await sleep(1500*(i+1));continue;
    }
    throw Error('RELEASE_API_HTTP_'+res.status);
  }
}
async function assertMain(){
  const ref=await request('/git/ref/heads/main');
  if(ref?.object?.sha!==sha)throw Error('RELEASE_SUPERSEDED');
}
async function runFor(kind){
  const r=await request('/actions/workflows/'+WORKFLOWS[kind]+'/runs?event=push&branch=main&head_sha='+sha+'&per_page=30');
  return selectRun(r?.workflow_runs||[],sha);
}
async function waitFor(kind,{retry=false,deadline=Date.now()+25*60000,onState=()=>{}}={}){
  let last='', retriedAttempt=null;
  while(Date.now()<deadline){
    await assertMain();
    const r=await runFor(kind);
    const record={workflow:WORKFLOWS[kind],id:r?.id||null,attempt:r?.run_attempt||null,
      status:r?.status||'not_created',conclusion:r?.conclusion||null,url:r?.html_url||null};
    const key=JSON.stringify(record);
    if(key!==last){onState(record);last=key;}
    if(r?.status==='completed'){
      if(r.conclusion==='success')return record;
      // Deployment gates wait for the orchestrator's bounded CI retry.
      if(!retry&&Number(r.run_attempt||1)<MAX_ATTEMPTS){
        await sleep(15000);continue;
      }
      if(!retry)throw Error('RELEASE_DEPENDENCY_FAILED_'+kind.toUpperCase());
      if(retriedAttempt===Number(r.run_attempt||1)){
        await sleep(15000);continue;
      }
      const jobs=kind==='ci'?[]:(await request('/actions/runs/'+r.id+'/jobs?filter=latest&per_page=100')).jobs;
      if(!safeRetry(kind,r,jobs))throw Error('RELEASE_WORKFLOW_BLOCKED_'+kind.toUpperCase());
      await assertMain();
      retriedAttempt=Number(r.run_attempt||1);
      await request('/actions/runs/'+r.id+'/rerun-failed-jobs','POST');
      console.log('RETRY_REQUESTED '+kind+' run='+r.id+' previousAttempt='+retriedAttempt);
    }
    await sleep(15000);
  }
  throw Error('RELEASE_DEADLINE_'+kind.toUpperCase());
}
async function status(state,description){
  await request('/statuses/'+sha,'POST',{state,context:'release/orchestrator',
    description,target_url:process.env.GITHUB_SERVER_URL+'/'+repo+'/actions/runs/'+process.env.GITHUB_RUN_ID});
}
const reportPath='release-evidence.json';
function save(report){fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
async function orchestrate(){
  const report={sha,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
    status:'RUNNING',startedAt:new Date().toISOString(),workflows:{},
    noAcademicWrites:true,checks:{}};
  save(report);
  try{
    await status('pending','Release validation and deployment in progress');
    await assertMain();
    execFileSync(process.execPath,['scripts/assert-platform-change-authorized.mjs'],{stdio:'inherit'});
    const paths=git(['diff','--name-only','HEAD^','HEAD']).split('\n');
    report.plan=planRelease(paths);save(report);
    const deadline=Date.now()+30*60000;
    for(const kind of ['ci','apps','cloud']){
      if(!report.plan[kind]){
        report.workflows[kind]={status:'not_required'};save(report);continue;
      }
      report.workflows[kind]=await waitFor(kind,{retry:true,deadline,onState:r=>{
        report.workflows[kind]=r;save(report);console.log(JSON.stringify(r));
      }});save(report);
    }
    // A final job must verify the live release, not just green deployment jobs.
    await assertMain();
    report.status='DEPLOYMENTS_VERIFIED';save(report);
  }catch(e){
    report.status='BLOCKED';report.error=/^RELEASE_[A-Z0-9_]+$/.test(e.message)?e.message:'RELEASE_ORCHESTRATION_FAILED';
    report.finishedAt=new Date().toISOString();save(report);
    await status('failure',report.error).catch(()=>{});
    throw Error(report.error);
  }
}
async function finalize(){
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  try{
    await assertMain();
    if(report.sha!==sha||report.status!=='DEPLOYMENTS_VERIFIED')throw Error('RELEASE_EVIDENCE_INCOMPLETE');
    const live=JSON.parse(fs.readFileSync('release-live-evidence.json','utf8'));
    if(live.ok!==true||live.targetSha!==sha||live.oauthGuard!==true||
      live.signedWebAppProbe!==true||live.traffic!==100||live.appsScriptVerified!==true)
      throw Error('RELEASE_LIVE_EVIDENCE_INVALID');
    report.checks=live;report.status='COMPLETED';report.finishedAt=new Date().toISOString();save(report);
    await status('success','CI, deployments and read-only production E2E verified');
  }catch(e){
    report.status='BLOCKED';report.error=e.message;report.finishedAt=new Date().toISOString();save(report);
    await status('failure','Production E2E not verified').catch(()=>{});throw e;
  }
}
async function fail(){
  let report={sha,workflows:{},noAcademicWrites:true};
  try{report=JSON.parse(fs.readFileSync(reportPath,'utf8'));}catch{}
  if(report.status!=='COMPLETED'){
    report.status='BLOCKED';report.error=report.error||'RELEASE_POSTFLIGHT_FAILED';
    report.finishedAt=new Date().toISOString();save(report);
    await status('failure','Release blocked; inspect workflow evidence').catch(()=>{});
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(!/^[a-f0-9]{40}$/.test(sha)||repo!=='witchet43/Automatizacion-clases-jv'||!token)
    throw Error('RELEASE_ENV_INVALID');
  const mode=process.argv[2];
  if(mode==='orchestrate')await orchestrate();
  else if(mode==='gate-ci')await waitFor('ci',{deadline:Date.now()+25*60000});
  else if(mode==='gate-apps')await waitFor('apps',{deadline:Date.now()+25*60000});
  else if(mode==='assert-main')await assertMain();
  else if(mode==='finalize')await finalize();
  else if(mode==='fail')await fail();
  else throw Error('RELEASE_MODE_INVALID');
}
