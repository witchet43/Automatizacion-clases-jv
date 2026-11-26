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

const officialEndpoint='https://classroommcp.googleapis.com/mcp/v1';
export async function teacherAccessToken(config,fetcher=fetch){
 const c=config.googleAgent;if(!c)throw Error('GOOGLE_AGENT_NOT_CONFIGURED');
 const meta=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(10000)});
 if(!meta.ok)throw Error('GOOGLE_AGENT_RUNTIME_IDENTITY_FAILED');
 const runtime=(await meta.json()).access_token;
 const secret=await fetcher('https://secretmanager.googleapis.com/v1/projects/148028894895/secrets/classroom-agent-oauth-refresh-token/versions/latest:access',{headers:{Authorization:'Bearer '+runtime},signal:AbortSignal.timeout(10000)});
 if(!secret.ok)throw Error('GOOGLE_AGENT_REFRESH_SECRET_ACCESS_FAILED');
 const refresh=Buffer.from((await secret.json()).payload.data,'base64').toString('utf8');
 const res=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('GOOGLE_AGENT_REFRESH_FAILED');
 const token=await res.json();
 if(typeof token.access_token!=='string'||!token.access_token)throw Error('GOOGLE_AGENT_ACCESS_TOKEN_MISSING');
 return token.access_token;
}
export async function officialClassroomCall(token,name,args,fetcher=fetch){
 if(!['get_course_work','update_course_work'].includes(name))throw Error('GOOGLE_AGENT_TOOL_NOT_ALLOWED');
 const res=await fetcher(officialEndpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error('GOOGLE_CLASSROOM_MCP_HTTP_'+res.status);
 const raw=await res.text();
 const data=raw.trim().startsWith('{')?JSON.parse(raw):JSON.parse(raw.split(/\r?\n/).find(x=>x.startsWith('data: ')&&x.includes('"id"'))?.slice(6)||'null');
 if(!data||data.error||data.result?.isError)throw Error('GOOGLE_CLASSROOM_MCP_TOOL_REJECTED');
 const result=data.result;
 if(result?.structuredContent)return result.structuredContent;
 const item=result?.content?.find(x=>x.type==='text');
 if(!item)throw Error('GOOGLE_CLASSROOM_MCP_RESPONSE_INVALID');
 return JSON.parse(item.text);
}
const formKey=url=>{
 try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='docs.google.com')return null;const m=u.pathname.match(/^\/forms\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]+)(?:\/|$)/);return m?(m[1]||'')+m[2]:null;}catch{return null;}
};
const materialKey=m=>formKey(m?.form?.formUrl||m?.link?.url);
export async function attachOriginalForm(config,{courseId,sourceWorkId,targetWorkId,formId,confirmar},fetcher=fetch){
 if(confirmar!==true||!config.courseIds.has(courseId)||!/^\d+$/.test(sourceWorkId)||!/^\d+$/.test(targetWorkId)||sourceWorkId===targetWorkId||!/^[A-Za-z0-9_-]+$/.test(formId))throw Error('GOOGLE_AGENT_TARGET_INVALID');
 const token=await teacherAccessToken(config,fetcher);
 const read=async()=>{const r=await officialClassroomCall(token,'get_course_work',{courseId,courseWorkIds:[sourceWorkId,targetWorkId],timeZone:'America/Mexico_City'},fetcher);const a=r.courseWork;if(!Array.isArray(a)||a.length!==2)throw Error('GOOGLE_AGENT_READBACK_INVALID');const source=a.find(x=>x.id===sourceWorkId),target=a.find(x=>x.id===targetWorkId);if(!source||!target||target.state!=='DRAFT'||target.scheduleDate)throw Error('GOOGLE_AGENT_DRAFT_REQUIRED');return {source,target};};
 const before=await read();
 const originals=(before.source.materials||[]).filter(x=>x.form&&materialKey(x)===formId);
 if(originals.length!==1)throw Error('GOOGLE_AGENT_ORIGINAL_FORM_NOT_UNIQUE');
 const prior=before.target.materials||[];
 if(prior.some(x=>!x.id))throw Error('GOOGLE_AGENT_MATERIAL_ID_MISSING');
 const hits=prior.filter(x=>materialKey(x)===formId);
 if(hits.length>1||hits.some(x=>!x.form))throw Error('GOOGLE_AGENT_FORM_CONFLICT');
 if(hits.length===0){
  if(prior.length>=20)throw Error('GOOGLE_AGENT_MATERIAL_LIMIT');
  await officialClassroomCall(token,'update_course_work',{courseId,courseWorkId:targetWorkId,timeZone:'America/Mexico_City',addMaterials:[{formUrl:originals[0].form.formUrl}]},fetcher);
 }
 const after=await read(), materials=after.target.materials||[];
 if(materials.filter(x=>materialKey(x)===formId&&x.form).length!==1||materials.filter(x=>materialKey(x)===formId).length!==1||!prior.every(x=>materials.some(y=>y.id===x.id))||materials.length!==prior.length+(hits.length?0:1))throw Error('GOOGLE_AGENT_MATERIAL_READBACK_MISMATCH');
 for(const k of ['title','topicId','maxPoints','instructions','scheduleDate','dueDate','state'])if(before.target[k]!==after.target[k])throw Error('GOOGLE_AGENT_COURSEWORK_CHANGED');
 if(!after.source.materials?.some(x=>x.id===originals[0].id&&materialKey(x)===formId))throw Error('GOOGLE_AGENT_SOURCE_CHANGED');
 return {ok:true,courseId,sourceWorkId,targetWorkId,formId,state:after.target.state,materialCount:materials.length,added:hits.length===0,verified:true};
}
