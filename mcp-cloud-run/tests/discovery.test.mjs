import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {loadConfig,createApp,signedSubmissionRequest,signedHmacProbe} from '../server.mjs';

function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'academic-mcp-discovery-'));
  const filepath=path.join(dir,'context.json');
  fs.writeFileSync(filepath,JSON.stringify({operationalContext:{
    source:'config/academic-context.json',contractVersion:'1.1.0',
    manifestSha256:'a'.repeat(64),repository:'witchet43/Automatizacion-clases-jv',
    workflow:'Academic Web App',endpoint:'https://script.google.com/macros/s/TESTDEPLOYMENT/exec'
  },courseIds:['871149624583']}));
  const config=loadConfig({
    MCP_PUBLIC_URL:'https://mcp.example.com',MCP_OAUTH_ISSUER:'https://issuer.example.com/',
    MCP_OAUTH_JWKS_URL:'https://issuer.example.com/.well-known/jwks.json',
    MCP_ALLOWED_SUBJECTS:'academic-user-123',
    ACADEMIC_WRITE_HMAC_KEY:'a_very_long_fake_test_key_over_32_characters'
  },filepath);
  return {dir,config};
}
async function rpc(base,method,params,id=1){
  const res=await fetch(base+'/mcp',{method:'POST',headers:{
    'content-type':'application/json','accept':'application/json, text/event-stream'
  },body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  let raw=await res.text();
  if(raw.includes('data: '))raw=raw.match(/data: (.+)/)?.[1]||raw;
  return {status:res.status,headers:res.headers,json:JSON.parse(raw)};
}

test('MCP initializes, exposes all tools and runs gateway_status without OAuth',async()=>{
  const f=fixture(), app=createApp(f.config);
  const listener=await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const base='http://127.0.0.1:'+listener.address().port;
  try{
    let r=await rpc(base,'initialize',{protocolVersion:'2025-06-18',capabilities:{},
      clientInfo:{name:'discovery-test',version:'1'}});
    assert.equal(r.status,200,JSON.stringify(r.json));
    r=await rpc(base,'tools/list',{},2);
    assert.equal(r.status,200,JSON.stringify(r.json));
    const names=(r.json.result?.tools||[]).map(x=>x.name);
    const expected=['gateway_status','consultar_despliegues_mcp','consultar_ejecucion_mcp',
      'iniciar_despliegue_mcp','verificar_despliegue','diagnosticar_clase',
      'auditar_recursos','crear_recurso','listar_entregas','calificar_entrega_draft',
      'cerrar_materia','cerrar_unidad'];
    assert.deepEqual(names.slice().sort(),expected.slice().sort());
    r=await rpc(base,'tools/call',{name:'gateway_status',arguments:{}},3);
    assert.equal(r.status,200,JSON.stringify(r.json));
    assert.notEqual(r.json.result.isError,true);
    assert.equal(JSON.parse(r.json.result.content[0].text).configured,true);
    r=await rpc(base,'tools/call',{name:'listar_entregas',arguments:{
      courseId:'871149624583',courseWorkId:'893188672194'}},4);
    assert.equal(r.status,401,'Student submissions must require an authenticated identity');
    assert.match(r.headers.get('www-authenticate'),/scope="academic.read"/);
  }finally{
    await new Promise(resolve=>listener.close(resolve));
    fs.rmSync(f.dir,{recursive:true,force:true});
  }
});

test('signed student submission reads include correlation id and valid HMAC',()=>{
  const f=fixture();
  try{
    const req=signedSubmissionRequest(f.config,'listarEntregasEvaluables',
      '871149624583','893188672194',{});
    assert.match(req.requestId,/^[A-Za-z0-9_-]{12,96}$/);
    const {auth,...unsigned}=req;
    const expected=createHmac('sha256',f.config.hmac)
      .update(JSON.stringify(unsigned)).digest('hex');
    assert.equal(auth.signature,expected);
    assert.match(auth.signature,/^[a-f0-9]{64}$/);
    assert.equal(req.params.courseWorkId,'893188672194');
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('HMAC read-only probe matches signing contract and never sends academic writes',async()=>{
  const f=fixture();
  try{
    const request=signedHmacProbe(f.config);
    const {auth,...unsigned}=request;
    assert.equal(request.action,'diagnosticarFirma');
    assert.equal('courseId' in request,false);
    assert.equal('operation' in request,false);
    assert.equal('params' in request,false);
    assert.match(request.diagnostic.challenge,/^[a-f0-9]{32}$/);
    assert.equal(request.diagnostic.proof,createHmac('sha256',f.config.hmac)
      .update('academic-hmac-key-equivalence:'+request.diagnostic.challenge).digest('hex'));
    assert.equal(auth.signature,createHmac('sha256',f.config.hmac)
      .update(JSON.stringify(unsigned)).digest('hex'));
    const sent=[];
    const app=createApp(f.config,{fetcher:async(_url,options)=>{
      sent.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ok:true,signatureAccepted:true,keyEquivalent:true}),{status:200});
    }});
    const listener=await new Promise(resolve=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
    });
    const base='http://127.0.0.1:'+listener.address().port;
    try{
      const r=await rpc(base,'tools/call',{name:'gateway_status',
        arguments:{verificarFirma:true}});
      assert.equal(r.status,200,JSON.stringify(r.json));
      assert.notEqual(r.json.result?.isError,true);
      assert.equal(JSON.parse(r.json.result.content[0].text).upstreamHmacAccepted,true);
      assert.equal(sent.length,1);
      assert.equal(sent[0].action,'diagnosticarFirma');
    }finally{await new Promise(resolve=>listener.close(resolve));}
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
