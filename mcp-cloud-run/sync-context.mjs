import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const raw=fs.readFileSync(path.resolve(dir,'../config/academic-context.json'),'utf8');
const manifest=JSON.parse(raw);
const c={...manifest,manifestSha256:(await import('node:crypto')).createHash('sha256').update(raw).digest('hex')};
// A generated Apps Script bundle may lag behind config in Git; the Apps Script
// deployment builds that bundle before deploying. Cloud Run must independently
// derive the same hash from the authoritative manifest, not from the stale bundle.
if(!/^[a-f0-9]{64}$/.test(c.manifestSha256)||c.contractVersion!=='1.1.0')
  throw Error('CANONICAL_CONTEXT_INVALID');
const fields={
 source:'config/academic-context.json',contractVersion:c.contractVersion,
 manifestSha256:c.manifestSha256,repository:c.repository,
 workflow:c.workflow.name,endpoint:c.webApp.url
};
const target=path.resolve(dir,'context.json');
const output=JSON.stringify({operationalContext:fields,courseIds:[...new Set(Object.values(c.courses).map(v=>String(v.id)))].sort()},null,2)+'\n';
if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)
    throw Error('MCP_CONTEXT_OUTDATED: run node mcp-cloud-run/sync-context.mjs');
  console.log('MCP context matches deployed Apps Script contract');
}else{
  fs.writeFileSync(target,output,{mode:0o644});
  console.log('MCP context synchronized from canonical Apps Script config');
}
