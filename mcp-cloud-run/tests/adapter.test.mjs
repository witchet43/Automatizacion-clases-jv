import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { loadConfig, signedClosureRequest, verifyBearer, createApp } from '../server.mjs';

function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-jv-'));
  const fname=path.join(dir,'context.json');
  const context={operationalContext:{
    source:'config/academic-context.json',contractVersion:'1.1.0',
    manifestSha256:'a'.repeat(64),repository:'witchet43/Automatizacion-clases-jv',
    workflow:'Academic Web App',
    endpoint:'https://script.google.com/macros/s/TESTDEPLOYMENT/exec'
  },courseIds:['871149624583']};
  fs.writeFileSync(fname,JSON.stringify(context));
  const env={
    MCP_PUBLIC_URL:'https://mcp.example.com',
    MCP_OAUTH_ISSUER:'https://issuer.example.com/',
    MCP_OAUTH_JWKS_URL:'https://issuer.example.com/.well-known/jwks.json',
    MCP_ALLOWED_SUBJECTS:'academic-user-123',
    ACADEMIC_WRITE_HMAC_KEY:'a_very_long_fake_test_key_over_32_characters'
  };
  return {fname,env,config:loadConfig(env,fname),delete:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('startup denies missing secrets, public HTTP URLs and malformed upstream',()=>{
 const f=fixture();
 try{
   assert.throws(()=>loadConfig({...f.env,ACADEMIC_WRITE_HMAC_KEY:''},f.fname),/MCP_CONFIG_REQUIRED/);
   assert.throws(()=>loadConfig({...f.env,MCP_ALLOWED_SUBJECTS:''},f.fname),/MCP_CONFIG_REQUIRED/);
   assert.throws(()=>loadConfig({...f.env,MCP_PUBLIC_URL:'http:\/\/mcp.example.com'},f.fname),/MCP_INVALID_URL/);
   assert.throws(()=>loadConfig({...f.env,MCP_OAUTH_JWKS_URL:'https://attack.example/.well-known/jwks.json'},f.fname),/MCP_JWKS_ISSUER_ORIGIN_MISMATCH/);
   assert.equal(f.config.courseIds.has('871149624583'),true);
 }finally{f.delete();}
});
test('only allowed registered course and exact canonical published-work/draft-grade signature',()=>{
 const f=fixture();
 try{
   const request=signedClosureRequest(f.config,'871149624583',2);
   const {auth,...unsigned}=request;
   assert.equal(request.action,'uaqExecutor');
   assert.equal(request.operation,'cerrarUnidad');
   assert.equal(request.title,'Calificación Unidad 2');
   assert.equal(request.params.modo,'PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY');
   assert.equal(request.params.unidad,'Unidad 2');
   assert.ok(!('state' in request.params));
   assert.ok(!('assignedGrade' in request.params));
   assert.equal(auth.signature,createHmac('sha256',f.config.hmac).update(JSON.stringify(unsigned)).digest('hex'));
   assert.match(auth.nonce,/^[a-zA-Z0-9_-]{16,128}$/);
   assert.throws(()=>signedClosureRequest(f.config,'871149624599',2),/COURSE_NOT_REGISTERED/);
   assert.throws(()=>signedClosureRequest(f.config,'871149624583',0),/UNIT_NUMBER_INVALID/);
 }finally{f.delete();}
});
test('OAuth issuer, subject, audience and scope; MCP rejects anonymous and executes signed unit closure',async()=>{
 const f=fixture();
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';jwk.use='sig';
 const jwks=createLocalJWKSet({keys:[jwk]});
 const token=async(sub,scope,aud='https://mcp.example.com')=>new SignJWT({scope})
   .setProtectedHeader({alg:'RS256',kid:'test-key'})
   .setIssuer(f.env.MCP_OAUTH_ISSUER).setAudience(aud).setSubject(sub)
   .setIssuedAt().setExpirationTime('10m').sign(privateKey);
 const grade=await token('academic-user-123','academic.close_unit');
 const read=await token('academic-user-123','academic.read');
 const denied=await token('other-user','academic.close_unit');
 assert.ok((await verifyBearer(f.config,'Bearer '+grade,'academic.close_unit',jwks)).subject);
 await assert.rejects(()=>verifyBearer(f.config,'Bearer '+denied,'academic.close_unit',jwks),/SUBJECT_NOT_ALLOWED/);
 await assert.rejects(()=>verifyBearer(f.config,'Bearer '+grade,'academic.read',jwks),/INSUFFICIENT_SCOPE/);
 const wrongAudience=await token('academic-user-123','academic.close_unit','other-audience');
 await assert.rejects(()=>verifyBearer(f.config,'Bearer '+wrongAudience,'academic.close_unit',jwks));
 const calls=[];
 const app=createApp(f.config,{jwks,fetcher:async(_url,init)=>{
   const body=JSON.parse(init.body);
   calls.push(body);
   const data=body.operation==='cerrarUnidad'?{
     ok:true,modo:'UNIDAD_ESTRICTA_RECALCULABLE_DRAFT',estadoCalificacion:'DRAFT_ONLY',
     cierre:{estado:'PUBLISHED',estadoCalificacion:'DRAFT_ONLY',alumnosReporte:21,
       actualizadas:21,sinCambios:0,courseWorkId:'999'}
   }:{ok:true,courseWork:[{id:'101',state:'PUBLISHED'}]};
   return new Response(JSON.stringify(data),{status:200});
 }});
 const listener=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const root='http://127.0.0.1:'+listener.address().port;
 async function rpc(auth,method,params,id=1){
   return fetch(root+'/mcp',{method:'POST',headers:{
     'content-type':'application/json','accept':'application/json, text/event-stream',
     ...(auth?{authorization:'Bearer '+auth}:{})
   },body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 }
 try{
   const metadata=await fetch(root+'/.well-known/oauth-protected-resource');
   assert.equal(metadata.status,200);
   assert.deepEqual((await metadata.json()).scopes_supported,['academic.read','academic.close_unit']);
   let response=await rpc('', 'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
   assert.equal(response.status,401);
   assert.match(response.headers.get('www-authenticate'),/resource_metadata=/);
   response=await rpc(denied,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
   assert.equal(response.status,401);
   response=await rpc(read,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
   assert.equal(response.status,200);
   response=await rpc(grade,'tools/call',{name:'cerrar_unidad',arguments:{courseId:'871149624583',unidad:2,confirmar:true}},2);
   assert.equal(response.status,200);
   let raw=await response.text();
   if(raw.includes('data: '))raw=raw.match(/data: (.+)/)?.[1]||raw;
   const result=JSON.parse(raw).result;
   const output=JSON.parse(result.content[0].text);
   assert.equal(output.courseWorkState,'PUBLISHED');
   assert.equal(output.studentGradeState,'DRAFT_ONLY');
   assert.equal(output.students,21);
   assert.equal(calls.length,1);
   assert.equal(calls[0].params.modo,'PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY');
   assert.equal(calls[0].auth.signature.length,64);
   assert.equal(calls[0].requestId.startsWith('grade_'),true);
   assert.equal(JSON.stringify(calls[0]).includes('assignedGrade'),false);
 }finally{listener.close();f.delete();}
});
