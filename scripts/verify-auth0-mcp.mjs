#!/usr/bin/env node
/**
 * Auth0-only OAuth readiness preflight for Classroom's protected MCP.
 * NEVER requests access tokens or secret versions, never mutates tenant/GCP.
 * Usage: MCP_OAUTH_ISSUER=https://tenant.region.auth0.com/ node scripts/verify-auth0-mcp.mjs
 */
import assert from 'node:assert/strict';

function urlOf(value,label){
  let u;
  try { u=new URL(value); } catch { throw Error('AUTH0_'+label+'_INVALID'); }
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)
    throw Error('AUTH0_'+label+'_INVALID');
  return u;
}
export function canonicalAuth0Issuer(raw){
  const u=urlOf(raw,'ISSUER');
  // This integration creates a normal hosted Auth0 tenant, not a custom domain.
  if(!u.hostname.endsWith('.auth0.com')||u.hostname==='auth0.com'||u.pathname!=='/')
    throw Error('AUTH0_ISSUER_HOST_OR_PATH_INVALID');
  if(u.port)throw Error('AUTH0_ISSUER_PORT_INVALID');
  return u.href;
}
function sameOrigin(origin,url,label){
  const u=urlOf(url,label);
  if(u.origin!==origin)throw Error('AUTH0_'+label+'_ORIGIN_MISMATCH');
  return u;
}
export function verifyAuth0Metadata(issuer,discovery,jwks){
  const i=canonicalAuth0Issuer(issuer);
  const origin=new URL(i).origin;
  if(!discovery||discovery.issuer!==i)throw Error('AUTH0_DISCOVERY_ISSUER_MISMATCH');
  if(!Array.isArray(discovery.code_challenge_methods_supported)||
    !discovery.code_challenge_methods_supported.includes('S256'))
    throw Error('AUTH0_DISCOVERY_PKCE_S256_REQUIRED');
  if(!discovery.authorization_endpoint||!discovery.token_endpoint)
    throw Error('AUTH0_DISCOVERY_OAUTH_ENDPOINT_MISSING');
  sameOrigin(origin,discovery.authorization_endpoint,'AUTHORIZATION');
  sameOrigin(origin,discovery.token_endpoint,'TOKEN');
  if(!discovery.registration_endpoint)throw Error('AUTH0_DCR_REGISTRATION_ENDPOINT_MISSING');
  sameOrigin(origin,discovery.registration_endpoint,'REGISTRATION');
  // ChatGPT creates a PUBLIC DCR client with PKCE. An alternative auth method
  // must not silently replace "none" when a provider publishes this field.
  if(Array.isArray(discovery.token_endpoint_auth_methods_supported)&&
    !discovery.token_endpoint_auth_methods_supported.includes('none'))
    throw Error('AUTH0_PUBLIC_CLIENT_METHOD_MISSING');
  const jwksUrl=discovery.jwks_uri;
  if(!jwksUrl)throw Error('AUTH0_DISCOVERY_JWKS_MISSING');
  const jwksLocation=sameOrigin(origin,jwksUrl,'JWKS');
  if(jwksLocation.pathname!=='/.well-known/jwks.json')
    throw Error('AUTH0_DISCOVERY_JWKS_PATH_UNEXPECTED');
  if(!jwks||!Array.isArray(jwks.keys)||
    !jwks.keys.some(k=>k&&k.kty==='RSA'&&typeof k.kid==='string'&&k.kid.length>0))
    throw Error('AUTH0_JWKS_NO_RSA_KEY');
  return {
    issuer:i,
    jwksUrl:jwksLocation.href,
    registrationUrl:discovery.registration_endpoint,
    pkceS256:true,
    scopeNames:['academic.read','academic.close_unit']
  };
}
export async function probeAuth0(issuer,fetcher=fetch){
  const canonical=canonicalAuth0Issuer(issuer);
  const base=canonical.slice(0,-1);
  // OAuth server metadata first, OIDC discovery only if OAuth metadata is missing.
  let r=await fetcher(base+'/.well-known/oauth-authorization-server',{redirect:'error'});
  if(r.status===404)r=await fetcher(base+'/.well-known/openid-configuration',{redirect:'error'});
  if(!r.ok)throw Error('AUTH0_OAUTH_DISCOVERY_HTTP_'+r.status);
  const discovery=await r.json();
  if(!discovery.jwks_uri)throw Error('AUTH0_DISCOVERY_JWKS_MISSING');
  sameOrigin(new URL(canonical).origin,discovery.jwks_uri,'JWKS');
  r=await fetcher(discovery.jwks_uri,{redirect:'error'});
  if(!r.ok)throw Error('AUTH0_JWKS_HTTP_'+r.status);
  return verifyAuth0Metadata(canonical,discovery,await r.json());
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const issuer=process.env.MCP_OAUTH_ISSUER||'';
  if(!issuer)throw Error('AUTH0_ISSUER_NOT_SET');
  try {
    const result=await probeAuth0(issuer);
    console.log('AUTH0_DISCOVERY_VERIFIED: issuer, PKCE S256, DCR, RS256 JWKS metadata');
    console.log('MCP_OAUTH_ISSUER='+result.issuer);
    console.log('MCP_OAUTH_JWKS_URL='+result.jwksUrl);
    console.log('AUTH0_RESOURCE_COMPATIBILITY_TOGGLE_NOT_VERIFIABLE_REMOTELY');
    console.log('AUTH0_API_AUDIENCE_AND_SUBJECT_STILL_REQUIRE_LIVE_VERIFICATION');
  }catch(e){
    console.error('AUTH0_PREFLIGHT_FAILED: '+String(e?.message||e));
    process.exitCode=1;
  }
}
