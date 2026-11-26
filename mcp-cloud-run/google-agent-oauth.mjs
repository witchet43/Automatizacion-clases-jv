import {randomBytes,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {jwtVerify,createRemoteJWKSet} from 'jose';
const scope='https://www.googleapis.com/auth/classroom.coursework.students';
const cookie='__Host-classroom-agent-oauth';
const hash=x=>createHash('sha256').update(x).digest('base64url');
const sign=(key,value)=>createHmac('sha256',key).update('google-agent-oauth:'+value).digest('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const options={httpOnly:true,secure:true,sameSite:'lax',path:'/'};
export function createGoogleAgentFlow(config,{fetcher=fetch,verifyIdToken,now=Date.now}={}){
 const c=config.googleAgent;
 if(!c)return null;
 const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 const verify=verifyIdToken|| (async token=>(await jwtVerify(token,jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:c.clientId,algorithms:['RS256']})).payload);
 function unpack(raw){
  const [data,mac,...rest]=String(raw||'').split('.');
  if(rest.length||!equal(mac,sign(config.hmac,data)))throw Error('INVALID_STATE');
  const x=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
  if(!Number.isFinite(x.exp)||now()>x.exp)throw Error('EXPIRED_STATE');
  return x;
 }
 function start(req,res){
  res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer');
  const x={state:randomBytes(32).toString('base64url'),verifier:randomBytes(48).toString('base64url'),nonce:randomBytes(32).toString('base64url'),exp:now()+600000};
  const data=Buffer.from(JSON.stringify(x)).toString('base64url');
  res.cookie(cookie,data+'.'+sign(config.hmac,data),{...options,maxAge:600000});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:'openid email '+scope,access_type:'offline',prompt:'consent select_account',login_hint:c.teacherEmail,state:x.state,nonce:x.nonce,code_challenge:hash(x.verifier),code_challenge_method:'S256'}).toString();
  return res.redirect(303,url.toString());
 }
 async function callback(req,res){
  res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer');
  res.clearCookie(cookie,options);
  try{
   const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='));
   const x=unpack(raw?.slice(cookie.length+1));
   if(!equal(req.query.state,x.state)||typeof req.query.code!=='string'||!req.query.code||req.query.error)throw Error('INVALID_CALLBACK');
   const tokenResponse=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,code:req.query.code,code_verifier:x.verifier,redirect_uri:c.redirectUri,grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000)});
   if(!tokenResponse.ok)throw Error('TOKEN_EXCHANGE_FAILED');
   const token=await tokenResponse.json();
   const user=await verify(token.id_token);
   if(user.email_verified!==true||String(user.email).toLowerCase()!==c.teacherEmail.toLowerCase()||!equal(user.nonce,x.nonce))throw Error('TEACHER_NOT_ALLOWED');
   if(typeof token.refresh_token!=='string'||!token.refresh_token||!String(token.scope||'').split(/\s+/).includes(scope))throw Error('OFFLINE_SCOPE_REQUIRED');
   const meta=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(10000)});
   if(!meta.ok)throw Error('RUNTIME_IDENTITY_FAILED');
   const {access_token}=await meta.json();
   const stored=await fetcher('https://secretmanager.googleapis.com/v1/projects/148028894895/secrets/classroom-agent-oauth-refresh-token:addVersion',{method:'POST',headers:{Authorization:'Bearer '+access_token,'Content-Type':'application/json'},body:JSON.stringify({payload:{data:Buffer.from(token.refresh_token).toString('base64')}}),signal:AbortSignal.timeout(15000)});
   if(!stored.ok)throw Error('TOKEN_STORAGE_FAILED');
   return res.status(200).type('text/plain').send('Autorización docente guardada. Puedes cerrar esta ventana.');
  }catch{
   return res.status(400).type('text/plain').send('No se completó la autorización docente. Verifica la cuenta, permisos y configuración; vuelve a iniciar el flujo.');
  }
 }
 return {start,callback};
}
