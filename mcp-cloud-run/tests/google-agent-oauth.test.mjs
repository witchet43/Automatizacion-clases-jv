import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleAgentFlow} from '../google-agent-oauth.mjs';
const cfg={hmac:'test-key'.repeat(8),googleAgent:{clientId:'test',clientSecret:'secret',redirectUri:'https://example.test/oauth/google/callback',teacherEmail:'teacher@example.test'}};
function response(){return {set(){return this},cookie(k,v,o){this.cookieValue=k+'='+v;this.options=o;return this},clearCookie(){return this},redirect(code,url){this.url=url;return this},status(code){this.code=code;return this},type(){return this},send(s){this.body=s;return this}}}
test('PKCE state cookie and safe callback storage',async()=>{
 let calls=[],nonce;
 const flow=createGoogleAgentFlow(cfg,{verifyIdToken:async()=>({email:'teacher@example.test',email_verified:true,nonce}),fetcher:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url.includes('/token')&&url.startsWith('https')?{id_token:'id',refresh_token:'refresh',scope:'https://www.googleapis.com/auth/classroom.coursework.students'}:{access_token:'runtime'}}}});
 const start=response();flow.start({},start);
 const url=new URL(start.url);nonce=url.searchParams.get('nonce');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(start.options.httpOnly,true);
 const bad=response();await flow.callback({headers:{cookie:start.cookieValue},query:{state:'wrong',code:'code'}},bad);assert.equal(bad.code,400);assert.equal(calls.length,0);
 const good=response();await flow.callback({headers:{cookie:start.cookieValue},query:{state:url.searchParams.get('state'),code:'code'}},good);
 assert.equal(good.code,200);assert.equal(calls.length,3);assert.match(calls[2].url,/:addVersion$/);assert.equal(good.body.includes('refresh'),false);
});
test('disabled without separate agent configuration',()=>assert.equal(createGoogleAgentFlow({}),null));

test('official material update uses refresh token and adds only native original form, verifies and is idempotent',async()=>{
 const {attachOriginalForm}=await import('../google-agent-oauth.mjs');
 const url='https://docs.google.com/forms/d/abc123/edit';
 const source={id:'1',state:'PUBLISHED',materials:[{id:'a',form:{formUrl:url}}]};
 const target={id:'2',state:'DRAFT',materials:[{id:'b',link:{url:'https://example.test'}}]};
 let writes=0;
 const fetcher=async(u,o)=>{
 if(u.startsWith('http://metadata'))return new Response(JSON.stringify({access_token:'runtime'}));
 if(u.includes(':access'))return new Response(JSON.stringify({payload:{data:Buffer.from('refresh').toString('base64')}}));
 if(u.includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'teacher'}));
 const req=JSON.parse(o.body);assert.equal(o.headers.Authorization,'Bearer teacher');
 if(req.params.name==='update_course_work'){writes++;assert.deepEqual(req.params.arguments,{courseId:'3',courseWorkId:'2',timeZone:'America/Mexico_City',addMaterials:[{formUrl:url}]});target.materials.push({id:'c',form:{formUrl:url}});}
 return new Response(JSON.stringify({result:{structuredContent:{courseWork:[source,target]}}}));
 };
 const config={...cfg,courseIds:new Set(['3'])},args={courseId:'3',sourceWorkId:'1',targetWorkId:'2',formId:'abc123',confirmar:true};
 assert.equal((await attachOriginalForm(config,args,fetcher)).added,true);
 assert.equal((await attachOriginalForm(config,args,fetcher)).added,false);assert.equal(writes,1);
 target.state='PUBLISHED';await assert.rejects(()=>attachOriginalForm(config,args,fetcher),/DRAFT_REQUIRED/);assert.equal(writes,1);
});
