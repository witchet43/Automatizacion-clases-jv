import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {prepareRequest} from './academic-context.mjs';

const files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','--diff-filter=AM','-r','HEAD','--','.academic-requests/*.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(files.length!==1)throw Error('Exactly one academic request is required per commit; no silent omission or batch replay.');
const {endpoint,request}=prepareRequest(JSON.parse(fs.readFileSync(files[0],'utf8')));

let response=null;
for(let attempt=0;attempt<3;attempt++){
  response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
  if(response.ok)break;
  if(![404,429].includes(response.status)||attempt===2)break;
  await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));
}
if(!response.ok)throw Error('Web App HTTP '+response.status);
const contentType=String(response.headers.get('content-type')||'');
const raw=await response.text();
if(!/application\/json|text\/plain/i.test(contentType)||/^\s*</.test(raw))
  throw Error('WEB_APP_NON_JSON_RESPONSE: authorization/deployment response received instead of canonical JSON');
let result;
try{result=JSON.parse(raw);}catch{throw Error('WEB_APP_INVALID_JSON_RESPONSE');}
console.log(JSON.stringify(result));
if(result.ok!==true)throw Error('Canonical Web App rejected the request: '+String(result.error||'UNKNOWN_ERROR'));
if(request.operationalContext&&JSON.stringify(result.operationalContext)!==JSON.stringify(request.operationalContext))throw Error('Deployed context was not verified');
