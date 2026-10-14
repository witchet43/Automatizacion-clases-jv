import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','--diff-filter=AM','-r','HEAD'],{encoding:'utf8'})
  .trim().split('\n').filter(Boolean);
const requests=files.filter(f=>/^\.academic-requests\/[^/]+\.json$/.test(f));
if(requests.length!==1)throw Error('ACADEMIC_REQUEST_REQUIRES_EXACTLY_ONE_JSON');
const extra=files.filter(f=>!/^\.academic-requests\/[^/]+\.json$/.test(f));
if(extra.length)throw Error('ACADEMIC_REQUEST_MUST_BE_DATA_ONLY: '+extra.join(', '));
const payload=JSON.parse(fs.readFileSync(requests[0],'utf8'));
if(!payload.action)throw Error('ACADEMIC_REQUEST_ACTION_REQUIRED');
console.log('Academic request is data-only: '+requests[0]);
