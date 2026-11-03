import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadConfig} from '../server.mjs';

test('anonymous mode cannot start the academic MCP',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'academic-oauth-only-'));
  const filepath=path.join(dir,'context.json');
  fs.writeFileSync(filepath,JSON.stringify({operationalContext:{
    source:'config/academic-context.json',contractVersion:'1.1.0',
    manifestSha256:'a'.repeat(64),repository:'witchet43/Automatizacion-clases-jv',
    workflow:'Academic Web App',endpoint:'https://script.google.com/macros/s/TESTDEPLOYMENT/exec'
  },courseIds:['871149624583']}));
  const env={
    MCP_AUTH_MODE:'anonymous',
    MCP_PUBLIC_URL:'https://mcp.example.com',
    ACADEMIC_WRITE_HMAC_KEY:'a_very_long_fake_test_key_over_32_characters'
  };
  try{
    assert.throws(()=>loadConfig(env,filepath),/MCP_OAUTH_REQUIRED/);
    assert.throws(()=>loadConfig({...env,MCP_AUTH_MODE:'nonsense'},filepath),/MCP_OAUTH_REQUIRED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
