import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

// Explicitly audit additions, modifications AND deletions. Historical
// academic request files may only be removed as part of an approved cleanup,
// never added/modified by a platform change.
const rows=execFileSync('git',['diff-tree','--no-commit-id','--name-status','-r','HEAD'],{encoding:'utf8'})
  .trim().split('\n').filter(Boolean);
const entries=rows.map(line=>{
  const fields=line.split('\t');
  if(fields.length<2)throw Error('PLATFORM_CHANGE_DIFF_INVALID');
  return {status:fields[0].charAt(0),path:fields.at(-1)};
}).filter(x=>['A','M','D'].includes(x.status));
const addedOrModified=entries.filter(x=>x.status!=='D');
if(addedOrModified.some(x=>x.path.startsWith('.academic-requests/')))
  throw Error('PLATFORM_CHANGE_CANNOT_CREATE_OR_EDIT_ACADEMIC_REQUEST');
const changed=entries.map(x=>x.path);
const evidence=addedOrModified.filter(x=>/^\.platform-changes\/[^/]+\.json$/.test(x.path));
if(evidence.length!==1)throw Error('PLATFORM_CHANGE_REQUIRES_EXACTLY_ONE_AUTHORIZATION_EVIDENCE');
const source=evidence[0].path;
const e=JSON.parse(fs.readFileSync(source,'utf8'));
if(e.mode!=='PLATFORM_CHANGE'||e.authorized!==true||e.requestedByUser!==true)
  throw Error('PLATFORM_CHANGE_NOT_EXPLICITLY_AUTHORIZED');
if(typeof e.authorizationText!=='string'||e.authorizationText.trim().length<8)
  throw Error('PLATFORM_CHANGE_AUTHORIZATION_TEXT_REQUIRED');
if(typeof e.reason!=='string'||!e.reason.trim())
  throw Error('PLATFORM_CHANGE_REASON_REQUIRED');
if(!Array.isArray(e.allowedChangedPaths)||!e.allowedChangedPaths.length)
  throw Error('PLATFORM_CHANGE_ALLOWED_PATHS_REQUIRED');
if(addedOrModified.some(x=>x.path.startsWith('.academic-requests/')))
  throw Error('ACADEMIC_REQUEST_ROUTE_RETIRED');
const deletedRequests=entries.filter(x=>x.status==='D'&&x.path.startsWith('.academic-requests/'));
if(deletedRequests.length && e.archiveCleanupApproved!==true)
  throw Error('HISTORICAL_REQUEST_DELETE_REQUIRES_ARCHIVE_CLEANUP_APPROVAL');
const actual=changed.filter(x=>x!==source).sort();
const allowed=[...e.allowedChangedPaths].sort();
if(JSON.stringify(actual)!==JSON.stringify(allowed))
  throw Error('PLATFORM_CHANGE_SCOPE_MISMATCH\nactual='+actual.join(',')+'\nallowed='+allowed.join(','));
console.log('Platform change authorized and exact-scoped: '+source+
  '; audited changes='+actual.length+'; historical request deletions='+deletedRequests.length);
