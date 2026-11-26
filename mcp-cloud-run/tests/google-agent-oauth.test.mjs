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
