import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const changed=execFileSync('git',['diff-tree','--no-commit-id','--name-only','--diff-filter=AM','-r','HEAD'],{encoding:'utf8'})
  .trim().split('\n').filter(Boolean);
if(changed.some(f=>f.startsWith('.academic-requests/')))
  throw Error('PLATFORM_CHANGE_CANNOT_SHARE_COMMIT_WITH_ACADEMIC_REQUEST');
const evidence=changed.filter(f=>/^\.platform-changes\/[^/]+\.json$/.test(f));
if(evidence.length!==1)throw Error('PLATFORM_CHANGE_REQUIRES_EXACTLY_ONE_AUTHORIZATION_EVIDENCE');
const e=JSON.parse(fs.readFileSync(evidence[0],'utf8'));
if(e.mode!=='PLATFORM_CHANGE'||e.authorized!==true||e.requestedByUser!==true)
  throw Error('PLATFORM_CHANGE_NOT_EXPLICITLY_AUTHORIZED');
if(typeof e.authorizationText!=='string'||e.authorizationText.trim().length<8)
  throw Error('PLATFORM_CHANGE_AUTHORIZATION_TEXT_REQUIRED');
if(typeof e.reason!=='string'||!e.reason.trim())throw Error('PLATFORM_CHANGE_REASON_REQUIRED');
if(!Array.isArray(e.allowedChangedPaths)||!e.allowedChangedPaths.length)
  throw Error('PLATFORM_CHANGE_ALLOWED_PATHS_REQUIRED');
const actual=changed.filter(f=>f!==evidence[0]).sort();
const allowed=[...e.allowedChangedPaths].sort();
if(JSON.stringify(actual)!==JSON.stringify(allowed))
  throw Error('PLATFORM_CHANGE_SCOPE_MISMATCH\nactual='+actual.join(',')+'\nallowed='+allowed.join(','));
console.log('Platform change explicitly authorized and scoped: '+evidence[0]);
