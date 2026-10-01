import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {prepareRequest} from './academic-context.mjs';
const files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','--diff-filter=AM','-r','HEAD','--','.academic-requests/*.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(files.length!==1)throw Error('Exactly one academic request is required per commit; no silent omission or batch replay.');
const {endpoint,request}=prepareRequest(JSON.parse(fs.readFileSync(files[0],'utf8')));
if(request.action==='quizAsistencia'){
  const transportRequestId=String(process.env.GITHUB_SHA||'').trim();
  if(!transportRequestId)throw Error('FAST_PATH_TRANSPORT_REQUEST_ID_MISSING');
  request.requestId='GITHUB_REQUEST|'+transportRequestId;
}
const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
if(!response.ok)throw Error('Web App HTTP '+response.status);
const result=await response.json();
console.log(JSON.stringify(result));
if(result.ok!==true)throw Error('Canonical Web App rejected the request');
if(request.operationalContext&&JSON.stringify(result.operationalContext)!==JSON.stringify(request.operationalContext))throw Error('Deployed context was not verified');
