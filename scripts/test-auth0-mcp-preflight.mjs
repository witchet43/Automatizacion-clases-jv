import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalAuth0Issuer,verifyAuth0Metadata,probeAuth0} from './verify-auth0-mcp.mjs';

const issuer='https://academic-jv.us.auth0.com/';
const jwksUrl='https://academic-jv.us.auth0.com/.well-known/jwks.json';
const metadata={
  issuer, authorization_endpoint:issuer+'authorize',
  token_endpoint:issuer+'oauth/token',
  registration_endpoint:issuer+'oidc/register',
  jwks_uri:jwksUrl,
  code_challenge_methods_supported:['S256'],
  token_endpoint_auth_methods_supported:['none','client_secret_post']
};
const jwks={keys:[{kty:'RSA',kid:'auth0-rotation-key-1'}]};
test('Auth0 DCR, PKCE, issuer and JWKS can be validated without calling Cloud Run',()=>{
 const result=verifyAuth0Metadata(issuer,metadata,jwks);
 assert.equal(result.jwksUrl,jwksUrl);
 assert.equal(result.registrationUrl,issuer+'oidc/register');
 assert.deepEqual(result.scopeNames,['academic.read','academic.close_unit']);
 assert.throws(()=>canonicalAuth0Issuer('http://academic-jv.us.auth0.com/'),/INVALID/);
 assert.throws(()=>canonicalAuth0Issuer('https://evil.example.net/'),/HOST_OR_PATH/);
 assert.throws(()=>verifyAuth0Metadata(issuer,{...metadata,issuer:'https://other.us.auth0.com/'},jwks),/ISSUER_MISMATCH/);
 assert.throws(()=>verifyAuth0Metadata(issuer,{...metadata,code_challenge_methods_supported:[]},jwks),/PKCE_S256_REQUIRED/);
 assert.throws(()=>verifyAuth0Metadata(issuer,{...metadata,registration_endpoint:null},jwks),/DCR_REGISTRATION_ENDPOINT_MISSING/);
 assert.throws(()=>verifyAuth0Metadata(issuer,{...metadata,jwks_uri:'https://evil.example.net/jwks'},jwks),/ORIGIN_MISMATCH/);
 assert.throws(()=>verifyAuth0Metadata(issuer,{...metadata,token_endpoint_auth_methods_supported:['client_secret_post']},jwks),/PUBLIC_CLIENT_METHOD_MISSING/);
 assert.throws(()=>verifyAuth0Metadata(issuer,metadata,{keys:[]}),/NO_RSA_KEY/);
});
test('Auth0 provider readiness is read-only, HTTP discovery and JWKS only',async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
   calls.push({url,opts});
   return new Response(JSON.stringify(url.endsWith('jwks.json')?jwks:metadata),{status:200});
 };
 const result=await probeAuth0(issuer,fetcher);
 assert.equal(result.issuer,issuer);
 assert.deepEqual(calls.map(c=>c.url),[
  issuer.slice(0,-1)+'/.well-known/oauth-authorization-server',jwksUrl
 ]);
 assert.ok(calls.every(c=>c.opts.redirect==='error'));
});
test('authenticated deployment requires OAuth and never leaks secrets',()=>{
 const deploy=fs.readFileSync('.github/workflows/deploy-cloud-run-mcp.yml','utf8');
 assert.match(deploy,/MCP_AUTH_MODE=oauth/);
 assert.match(deploy,/MCP_OAUTH_ISSUER/);
 assert.match(deploy,/MCP_OAUTH_JWKS_URL/);
 assert.match(deploy,/academic-mcp-allowed-subjects/);
 assert.doesNotMatch(deploy,/AUTH0_CLIENT_SECRET|AUTH0_MGMT_TOKEN|gcloud secrets versions access/);
});
