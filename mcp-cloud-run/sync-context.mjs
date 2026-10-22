import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const config=fs.readFileSync(path.resolve(dir,'../src/00_AcademicContextConfig.gs'),'utf8');
const marker='const ACADEMIC_CONTEXT_CONFIG = ';
const start=config.indexOf(marker);
const end=config.lastIndexOf('};');
if(start<0||end<=start)throw Error('CANONICAL_CONTEXT_NOT_FOUND');
const json=config.slice(start+marker.length,end+1);
const c=JSON.parse(json);
if(!/^[a-f0-9]{64}$/.test(c.manifestSha256)||c.contractVersion!=='1.1.0')
  throw Error('CANONICAL_CONTEXT_INVALID');
const fields={
 source:'config/academic-context.json',contractVersion:c.contractVersion,
 manifestSha256:c.manifestSha256,repository:c.repository,
 workflow:c.workflow.name,endpoint:c.webApp.url
};
const target=path.resolve(dir,'context.json');
const output=JSON.stringify(fields,null,2)+'\n';
if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)
    throw Error('MCP_CONTEXT_OUTDATED: run node mcp-cloud-run/sync-context.mjs');
  console.log('MCP context matches deployed Apps Script contract');
}else{
  fs.writeFileSync(target,output,{mode:0o644});
  console.log('MCP context synchronized from canonical Apps Script config');
}
