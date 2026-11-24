import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {createApp,RELEASE_PROBE_ACCOUNT} from '../server.mjs';
import {createHmac} from 'node:crypto';
test('release probe requires verified deployer OIDC and only sends a signed read-only HMAC diagnostic',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const publicUrl='https://mcp.example.com',hmac='test_hmac_secret_not_a_real_credential_123456789';
  const config={publicUrl,authMode:'oauth',issuer:'https://example.auth0.com/',hmac,
    academicTransport:'webapp',webAppAuthMode:'legacy',upstreamUrl:'https://script.google.com/macros/s/test/exec',
    operationalContext:{manifestSha256:'a'.repeat(64)},releaseCommit:'b'.repeat(40)};
  const calls=[];let rejectUpstream=false;
  const app=createApp(config,{releaseJwks:publicKey,fetcher:async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    return new Response(JSON.stringify({ok:true,signatureAccepted:!rejectUpstream,keyEquivalent:!rejectUpstream}));
  }});
  const listener=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url='http://127.0.0.1:'+listener.address().port+'/release/probe';
  const mint=async({email=RELEASE_PROBE_ACCOUNT,verified=true,audience=publicUrl+'/release/probe',
    issuer='https://accounts.google.com',iat=Math.floor(Date.now()/1000)}={})=>
    new SignJWT({email,email_verified:verified}).setProtectedHeader({alg:'RS256'})
      .setSubject('123456789012345678901').setIssuer(issuer).setAudience(audience)
      .setIssuedAt(iat).setExpirationTime(iat+3600).sign(privateKey);
  const request=async(token)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',
    ...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({action:'guardarEvaluacionDraft',grade:100})});
  try{
    assert.equal((await request()).status,401);
    for(const token of [await mint({email:'other@example.org'}),await mint({verified:false}),
      await mint({audience:publicUrl}),await mint({issuer:'https://other.example.org'}),
      await mint({iat:Math.floor(Date.now()/1000)-1200})]){
      assert.equal((await request(token)).status,401);
    }
    assert.equal(calls.length,0);
    const ok=await request(await mint());
    assert.equal(ok.status,200);
    assert.deepEqual(await ok.json(),{ok:true,commit:config.releaseCommit,upstreamHmacAccepted:true,noAcademicWrites:true});
    assert.equal(calls.length,1);
    const {auth,...unsigned}=calls[0];
    assert.equal(unsigned.action,'diagnosticarFirma');
    assert.equal('courseId' in unsigned,false);
    assert.equal('grade' in unsigned,false);
    assert.equal(auth.signature,createHmac('sha256',hmac).update(JSON.stringify(unsigned)).digest('hex'));
    rejectUpstream=true;
    assert.equal((await request(await mint())).status,503);
  }finally{await new Promise(resolve=>listener.close(resolve));}
});
