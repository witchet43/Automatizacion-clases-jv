import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadConfig,createApp} from '../server.mjs';

test('anonymous MCP allows diagnostics but refuses all academic writes',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'academic-anonymous-'));
  const file=path.join(dir,'context.json');
  const context={operationalContext:{
    source:'config/academic-context.json',contractVersion:'1.1.0',
    manifestSha256:'a'.repeat(64),repository:'witchet43/Automatizacion-clases-jv',
    workflow:'Academic Web App',
    endpoint:'https://script.google.com/macros/s/TESTDEPLOYMENT/exec'
  },courseIds:['871149624583']};
  fs.writeFileSync(file,JSON.stringify(context));
  const env={
    MCP_AUTH_MODE:'anonymous',
    MCP_PUBLIC_URL:'https://mcp.example.com',
    ACADEMIC_WRITE_HMAC_KEY:'a_very_long_fake_test_key_over_32_characters'
  };
  const config=loadConfig(env,file);
  assert.equal(config.authMode,'anonymous');
  assert.equal(config.issuer,'');
  assert.equal(config.allowedSubjects.size,0);
  assert.throws(()=>loadConfig({...env,MCP_AUTH_MODE:'nonsense'},file),/MCP_AUTH_MODE_INVALID/);
  assert.throws(()=>loadConfig({...env,ACADEMIC_WRITE_HMAC_KEY:''},file),/MCP_CONFIG_REQUIRED/);

  const calls=[];
  const app=createApp(config,{fetcher:async(_url,init)=>{
    const request=JSON.parse(init.body);
    calls.push(request);
    return new Response(JSON.stringify({
      ok:true,modo:'UNIDAD_ESTRICTA_RECALCULABLE_DRAFT',
      estadoCalificacion:'DRAFT_ONLY',
      cierre:{estado:'PUBLISHED',estadoCalificacion:'DRAFT_ONLY',alumnosReporte:21,
        actualizadas:21,sinCambios:0,courseWorkId:'999'}
    }),{status:200});
  }});
  const server=await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const root='http://127.0.0.1:'+server.address().port;
  try{
    const health=await fetch(root+'/healthz');
    assert.equal((await health.json()).auth,'anonymous');
    assert.equal((await fetch(root+'/.well-known/oauth-protected-resource')).status,404);
    async function rpc(method,params,id=1){
      return fetch(root+'/mcp',{method:'POST',headers:{
        'content-type':'application/json',
        'accept':'application/json, text/event-stream'
      },body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
    }
    const initialized=await rpc('initialize',{
      protocolVersion:'2025-06-18',
      capabilities:{},clientInfo:{name:'anonymous-test',version:'1'}
    });
    assert.equal(initialized.status,200);
    for(const [name,args] of [
      ['cerrar_unidad',{courseId:'871149624583',unidad:2,confirmar:true}],
      ['crear_recurso',{courseId:'871149624583',operation:'actividad',
        title:'Actividad segura',requestId:'req_test_123456789012',params:{}}],
      ['calificar_entrega_draft',{courseId:'871149624583',courseWorkId:'893188672194',
        submissionId:'sub1',grade:80,requestId:'req_test_123456789012'}]
    ]){
      const response=await rpc('tools/call',{name,arguments:args},2);
      assert.equal(response.status,200);
      let raw=await response.text();
      if(raw.includes('data: '))raw=raw.match(/data: (.+)/)?.[1]||raw;
      const result=JSON.parse(raw).result;
      assert.equal(result.isError,true,name+' must fail closed');
      assert.match(result.content[0].text,/WRITE_AUTH_REQUIRED|STUDENT_GRADES_REQUIRE_AUTH/);
    }
    assert.equal(calls.length,0,'anonymous calls must never reach canonical WebApp');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
