import express from 'express';
import fs from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const SCOPES=Object.freeze({read:'academic.read',grade:'academic.close_unit'});
const UUIDISH=/^[a-zA-Z0-9_-]{12,96}$/;
const GRADE_MODE='PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY';

function required(name,env=process.env){
  const value=String(env[name]||'').trim();
  if(!value)throw Error('MCP_CONFIG_REQUIRED: '+name);
  return value;
}
function validHttps(value,name){
  let u;
  try{u=new URL(value);}catch{throw Error('MCP_INVALID_URL: '+name);}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)
    throw Error('MCP_INVALID_URL: '+name);
  return u;
}
export function loadConfig(env=process.env,contextPath=join(dirname(fileURLToPath(import.meta.url)),'context.json')){
  const publicUrl=required('MCP_PUBLIC_URL',env).replace(/\/$/,'');
  const authMode=String(env.MCP_AUTH_MODE||'oauth').trim().toLowerCase();
  if(!['oauth','anonymous'].includes(authMode))throw Error('MCP_AUTH_MODE_INVALID');
  const issuer=authMode==='oauth'?required('MCP_OAUTH_ISSUER',env):'';
  const jwksUrl=authMode==='oauth'?required('MCP_OAUTH_JWKS_URL',env):'';
  validHttps(publicUrl,'MCP_PUBLIC_URL');
  if(authMode==='oauth'){
    const issuerUrl=validHttps(issuer,'MCP_OAUTH_ISSUER');
    const jwks=validHttps(jwksUrl,'MCP_OAUTH_JWKS_URL');
    if(issuerUrl.origin!==jwks.origin)throw Error('MCP_JWKS_ISSUER_ORIGIN_MISMATCH');
  }
  if(new URL(publicUrl).pathname!=='/')throw Error('MCP_PUBLIC_URL_MUST_BE_ROOT');
  const allowed=authMode==='oauth'
    ?new Set(required('MCP_ALLOWED_SUBJECTS',env).split(',').map(x=>x.trim()).filter(Boolean))
    :new Set();
  if(authMode==='oauth'&&!allowed.size)throw Error('MCP_SUBJECT_ALLOWLIST_REQUIRED');
  const hmac=required('ACADEMIC_WRITE_HMAC_KEY',env);
  if(hmac.length<32)throw Error('MCP_HMAC_KEY_TOO_SHORT');
  const config=JSON.parse(fs.readFileSync(contextPath,'utf8'));
  const ctx=config.operationalContext;
  if(!ctx||Object.keys(ctx).sort().join(',')!==[
    'contractVersion','endpoint','manifestSha256','repository','source','workflow'
  ].sort().join(','))throw Error('MCP_CANONICAL_CONTEXT_INVALID');
  if(!/^[a-f0-9]{64}$/.test(ctx.manifestSha256)||ctx.contractVersion!=='1.1.0')
    throw Error('MCP_MANIFEST_INVALID');
  const upstream=validHttps(ctx.endpoint,'ACADEMIC_CANONICAL_WEBAPP');
  if(upstream.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(upstream.pathname))
    throw Error('MCP_UPSTREAM_MUST_BE_CANONICAL_APPS_SCRIPT');
  if(!Array.isArray(config.courseIds)||!config.courseIds.length||
    !config.courseIds.every(x=>/^\d+$/.test(x)))throw Error('MCP_COURSE_REGISTRY_INVALID');
  return {
    publicUrl,issuer,jwksUrl,allowedSubjects:allowed,hmac,authMode,
    operationalContext:ctx,upstreamUrl:ctx.endpoint,
    courseIds:new Set(config.courseIds),port:Number(env.PORT||8080)
  };
}

export function signedClosureRequest(config,courseId,unidad){
  const id=String(courseId);
  if(!config.courseIds.has(id))throw Error('COURSE_NOT_REGISTERED');
  if(!Number.isSafeInteger(unidad)||unidad<1||unidad>50)
    throw Error('UNIT_NUMBER_INVALID');
  const title='Calificación Unidad '+unidad;
  const requestId='grade_'+id+'_'+unidad+'_'+randomBytes(12).toString('hex');
  if(!UUIDISH.test(requestId))throw Error('MCP_REQUEST_ID_INVALID');
  const unsigned={
    action:'uaqExecutor',operation:'cerrarUnidad',courseId:id,
    title,requestId,
    params:{titulo:title,title,unidad:'Unidad '+unidad,modo:GRADE_MODE},
    operationalContext:config.operationalContext
  };
  const timestamp=Date.now();
  const nonce=randomBytes(24).toString('base64url');
  const signature=createHmac('sha256',config.hmac).update(JSON.stringify(unsigned)).digest('hex');
  return {...unsigned,auth:{timestamp,nonce,signature}};
}

/**
 * The MCP only transports minimal requests. Academic rules, student evidence,
 * grading and idempotency are exclusively implemented by the canonical WebApp.
 */
export function signedAcademicRequest(config, operation, courseId, title, params, requestId) {
  const id=String(courseId);
  const allowed=new Set(['actividad','tarea','practica','quiz','examen','material','clase','quizAsistencia']);
  if(!allowed.has(operation))throw Error('OPERATION_NOT_ALLOWED');
  if(!config.courseIds.has(id))throw Error('COURSE_NOT_REGISTERED');
  if(typeof title!=='string'||!title.trim()||title.length>250)throw Error('TITLE_INVALID');
  if(!UUIDISH.test(String(requestId)))throw Error('REQUEST_ID_INVALID');
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('PARAMS_INVALID');
  if('assignedGrade' in params||'state' in params&&params.state!=='DRAFT')
    throw Error('DRAFT_ONLY_REQUIRED');
  const unsigned={
    action:'uaqExecutor',operation,courseId:id,title:title.trim(),requestId,
    params:{...params,title:title.trim(),state:'DRAFT'},
    operationalContext:config.operationalContext
  };
  const timestamp=Date.now(),nonce=randomBytes(24).toString('base64url');
  const signature=createHmac('sha256',config.hmac).update(JSON.stringify(unsigned)).digest('hex');
  return {...unsigned,auth:{timestamp,nonce,signature}};
}
export function signedSubmissionRequest(config, action, courseId, courseWorkId, params, requestId) {
  const actions=new Set(['listarEntregasEvaluables','leerEvidenciaEntrega','guardarEvaluacionDraft']);
  if(!actions.has(action))throw Error('SUBMISSION_ACTION_INVALID');
  if(!config.courseIds.has(String(courseId)))throw Error('COURSE_NOT_REGISTERED');
  if(!/^\\d+$/.test(String(courseWorkId)))throw Error('COURSEWORK_ID_INVALID');
  const payload={...(params||{}),courseWorkId:String(courseWorkId)};
  if(action==='guardarEvaluacionDraft'){
    if(!UUIDISH.test(String(requestId)))throw Error('REQUEST_ID_INVALID');
    if(!Number.isFinite(payload.grade)||payload.grade<0||payload.grade>100)
      throw Error('GRADE_INVALID');
    if('assignedGrade' in payload)throw Error('DRAFT_ONLY_REQUIRED');
  }
  const unsigned={
    action,courseId:String(courseId),
    ...(requestId?{requestId}:{}),params:payload,
    operationalContext:config.operationalContext
  };
  const timestamp=Date.now(),nonce=randomBytes(24).toString('base64url');
  const signature=createHmac('sha256',config.hmac).update(JSON.stringify(unsigned)).digest('hex');
  return {...unsigned,auth:{timestamp,nonce,signature}};
}

function safeError(err){
  const message=String(err?.message||err||'UNKNOWN');
  // Never include HTTP request bodies, personal grades or credentials in an
  // MCP error. Upstream may include private details; emit its errorCode only.
  return /^[A-Z][A-Z0-9_:-]{2,100}$/.test(message)?message:'CANONICAL_UPSTREAM_FAILURE';
}
export async function callWebApp(config,body,fetcher=fetch){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),180000);
  try{
    const response=await fetcher(config.upstreamUrl,{
      method:'POST',redirect:'follow',
      headers:{'content-type':'text/plain;charset=utf-8'},
      body:JSON.stringify(body),signal:controller.signal
    });
    if(!response.ok)throw Error('UPSTREAM_HTTP_'+response.status);
    const raw=await response.text();
    if(raw.length>1024*1024)throw Error('UPSTREAM_RESPONSE_TOO_LARGE');
    let result;
    try{result=JSON.parse(raw);}catch{throw Error('UPSTREAM_NON_JSON');}
    if(!result||result.ok!==true)
      throw Error(String(result?.errorCode||'UPSTREAM_REJECTED'));
    return result;
  }finally{clearTimeout(timeout);}
}
function toolOk(payload){return {content:[{type:'text',text:JSON.stringify(payload)}]};}
function toolFail(error){return {isError:true,content:[{type:'text',text:safeError(error)}]};}

export async function verifyBearer(config,header,scope,jwks=undefined){
  if(typeof header!=='string'||!/^Bearer [^\s]+$/.test(header))
    throw Error('AUTH_REQUIRED');
  const token=header.slice(7);
  const keys=jwks||createRemoteJWKSet(new URL(config.jwksUrl));
  const {payload}=await jwtVerify(token,keys,{
    issuer:config.issuer,audience:config.publicUrl,algorithms:['RS256'],
    clockTolerance:30
  });
  if(!payload.sub||!config.allowedSubjects.has(String(payload.sub)))
    throw Error('SUBJECT_NOT_ALLOWED');
  const scopes=new Set(String(payload.scope||'').split(/\s+/).filter(Boolean));
  if(!scopes.has(scope))throw Error('INSUFFICIENT_SCOPE');
  return {subject:String(payload.sub),scopes};
}
function challenge(config,scope,error='invalid_token'){
  const metadata=config.publicUrl+'/.well-known/oauth-protected-resource';
  return 'Bearer resource_metadata="'+metadata+'", scope="'+scope+
    '", error="'+error+'", error_description="Authorize academic access"';
}
function buildServer(config,identity,fetcher){
  const readSecurity=config.authMode==='anonymous'?{}:{securitySchemes:[{type:'oauth2',scopes:[SCOPES.read]}]};
  const gradeSecurity=config.authMode==='anonymous'?{}:{securitySchemes:[{type:'oauth2',scopes:[SCOPES.grade]}]};
  const server=new McpServer({name:'academic-jv-classroom',version:'1.0.0'});
  server.registerTool('gateway_status',{
    title:'Estado del Gateway académico',
    description:'Comprobar únicamente el estado local del adaptador MCP independiente, sin acceso a calificaciones ni secretos.',
    inputSchema:{},...readSecurity,
    annotations:{readOnlyHint:true}
  },async()=>toolOk({configured:true,transport:config.authMode==='anonymous'?'STREAMABLE_HTTP_ANONYMOUS':'STREAMABLE_HTTP_OAUTH',
    service:'ACADEMIC_CLASSROOM_CANONICAL_MCP',writesThrough:'SIGNED_WEBAPP_ONLY',
    siteEdited:false,secretExposed:false}));
  server.registerTool('diagnosticar_clase',{
    title:'Diagnóstico académico de Classroom',
    description:'Consultar trabajos DRAFT y PUBLISHED en el curso registrado mediante la WebApp canónica, sin cambios.',
    inputSchema:{courseId:z.string().regex(/^\d+$/),soloClassroom:z.boolean().optional()},
    ...readSecurity,
    annotations:{readOnlyHint:true}
  },async({courseId,soloClassroom=true})=>{
    try{
      if(!identity.scopes.has(SCOPES.read))throw Error('INSUFFICIENT_SCOPE');
      if(!config.courseIds.has(courseId))throw Error('COURSE_NOT_REGISTERED');
      const data=await callWebApp(config,{
        action:'diagnosticarClase',courseId,soloClassroom,soloDrafts:false,
        operationalContext:config.operationalContext
      },fetcher);
      return toolOk(data);
    }catch(e){return toolFail(e);}
  });
  server.registerTool('crear_recurso',{
    title:'Crear recurso académico en borrador',
    description:'Crea o reutiliza una actividad, tarea, práctica, material, quiz, examen o paquete de clase mediante la WebApp canónica. Jamás publica recursos automáticamente.',
    inputSchema:{
      courseId:z.string().regex(/^\\d+$/),
      operation:z.enum(['actividad','tarea','practica','quiz','examen','material','clase','quizAsistencia']),
      title:z.string().min(1).max(250),
      requestId:z.string().regex(UUIDISH),
      params:z.record(z.string(),z.unknown()).default({})
    },
    ...gradeSecurity,annotations:{readOnlyHint:false,destructiveHint:false}
  },async({courseId,operation,title,requestId,params})=>{
    try{
      if(!identity.scopes.has(SCOPES.grade))throw Error('INSUFFICIENT_SCOPE');
      const request=signedAcademicRequest(config,operation,courseId,title,params,requestId);
      const data=await callWebApp(config,request,fetcher);
      return toolOk({ok:true,operation,courseId,requestId,result:data});
    }catch(e){return toolFail(e);}
  });
  server.registerTool('listar_entregas',{
    title:'Consultar entregas evaluables',
    description:'Consulta entregas de un trabajo mediante la WebApp canónica. Requiere OAuth por contener datos personales.',
    inputSchema:{courseId:z.string().regex(/^\\d+$/),courseWorkId:z.string().regex(/^\\d+$/)},
    ...readSecurity,annotations:{readOnlyHint:true}
  },async({courseId,courseWorkId})=>{
    try{
      if(config.authMode!=='oauth')throw Error('STUDENT_DATA_REQUIRES_AUTH');
      if(!identity.scopes.has(SCOPES.read))throw Error('INSUFFICIENT_SCOPE');
      const data=await callWebApp(config,signedSubmissionRequest(config,'listarEntregasEvaluables',courseId,courseWorkId,{}),fetcher);
      return toolOk(data);
    }catch(e){return toolFail(e);}
  });
  server.registerTool('calificar_entrega_draft',{
    title:'Calificar entrega en borrador',
    description:'Guarda la evaluación de una entrega solo en draftGrade mediante Apps Script. Requiere OAuth; nunca assignedGrade.',
    inputSchema:{
      courseId:z.string().regex(/^\\d+$/),courseWorkId:z.string().regex(/^\\d+$/),
      submissionId:z.string().min(1),grade:z.number().min(0).max(100),
      feedback:z.string().max(5000).optional(),requestId:z.string().regex(UUIDISH)
    },
    ...gradeSecurity,annotations:{readOnlyHint:false,destructiveHint:false}
  },async({courseId,courseWorkId,submissionId,grade,feedback,requestId})=>{
    try{
      if(config.authMode!=='oauth')throw Error('STUDENT_GRADES_REQUIRE_AUTH');
      if(!identity.scopes.has(SCOPES.grade))throw Error('INSUFFICIENT_SCOPE');
      const body=signedSubmissionRequest(config,'guardarEvaluacionDraft',courseId,courseWorkId,
        {submissionId,grade,...(feedback?{feedback}:{})},requestId);
      return toolOk(await callWebApp(config,body,fetcher));
    }catch(e){return toolFail(e);}
  });
  server.registerTool('cerrar_unidad',{
    title:'Calificación Unidad N (actividad publicada, notas en borrador)',
    description:'Recalcula la unidad exacta con 70% examen y 30% trabajos publicados. Crea o reutiliza una actividad Classroom PUBLISHED llamada Calificación Unidad N, guardando únicamente draftGrade. No publica assignedGrade ni devuelve entregas. La ruta anónima no autentica al solicitante.',
    inputSchema:{
      courseId:z.string().regex(/^\d+$/),
      unidad:z.number().int().min(1).max(50),
      confirmar:z.boolean().optional()
    },
    ...gradeSecurity,
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}
  },async({courseId,unidad,confirmar})=>{
    if(!identity.scopes.has(SCOPES.grade)||(config.authMode==='oauth'&&confirmar!==true))
      return toolFail(Error('INSUFFICIENT_SCOPE_OR_CONFIRMATION'));
    try{
      const result=await callWebApp(config,signedClosureRequest(config,courseId,unidad),fetcher);
      const closure=result.cierre||{};
      if(result.modo==='OMITIDO_POR_NOTAS_ASIGNADAS')
        return toolOk({ok:true,operation:'cerrarUnidad',mode:'SKIPPED_MANUAL_ASSIGNED_GRADES',
          courseId,unidad,courseWorkId:result.finalCourseWorkId||'',noWrites:true});
      if(result.estadoCalificacion!=='DRAFT_ONLY'||closure.estado!=='PUBLISHED'||
        closure.estadoCalificacion!=='DRAFT_ONLY')
        throw Error('CLOSURE_POSTFLIGHT_STATE_MISMATCH');
      return toolOk({ok:true,operation:'cerrarUnidad',courseId,unidad,
        title:'Calificación Unidad '+unidad,courseWorkId:closure.courseWorkId||'',
        url:closure.alternateLink||'',courseWorkState:'PUBLISHED',
        studentGradeState:'DRAFT_ONLY',students:closure.alumnosReporte,
        gradesChanged:closure.actualizadas,unchanged:closure.sinCambios,
        noAssignedGradesPublished:true});
    }catch(e){return toolFail(e);}
  });
  return server;
}

export function createApp(config,{fetcher=fetch,jwks}={}){
  const app=express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'64kb'}));
  app.get(['/health','/healthz'],(_req,res)=>res.json({status:'ok',service:'academic-jv-classroom-mcp',auth:config.authMode}));
  const metadata={
    resource:config.publicUrl,
    authorization_servers:[config.issuer],
    scopes_supported:[SCOPES.read,SCOPES.grade]
  };
  if(config.authMode==='oauth')
    app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],
      (_req,res)=>res.json(metadata));
  app.all('/mcp',async(req,res)=>{
    if(req.headers.origin&&!['https://chatgpt.com','https://chat.openai.com'].includes(req.headers.origin))
      return res.status(403).json({error:'origin_forbidden'});
    if(req.method!=='POST')return res.status(405).set('Allow','POST').end();
    let identity;
    try{
      if(config.authMode==='anonymous'){
        identity={subject:'anonymous',scopes:new Set([SCOPES.read,SCOPES.grade])};
      }else{
        identity=await verifyBearer(config,req.headers.authorization,SCOPES.read,jwks)
          .catch(async first=>{
            if(req.body?.method==='tools/call'&&['cerrar_unidad','crear_recurso','calificar_entrega_draft'].includes(req.body?.params?.name))
              return await verifyBearer(config,req.headers.authorization,SCOPES.grade,jwks);
            throw first;
          });
      }
    }catch(e){
      const scope=['cerrar_unidad','crear_recurso','calificar_entrega_draft'].includes(req.body?.params?.name)?SCOPES.grade:SCOPES.read;
      return res.status(401).set('WWW-Authenticate',challenge(config,scope,
        e.message==='INSUFFICIENT_SCOPE'?'insufficient_scope':'invalid_token'))
        .json({error:'unauthorized'});
    }
    const server=buildServer(config,identity,fetcher);
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    try{
      await server.connect(transport);
      await transport.handleRequest(req,res,req.body);
    }catch(e){
      if(!res.headersSent)res.status(500).json({error:'mcp_transport_failed'});
    }finally{
      await transport.close().catch(()=>{});
      await server.close().catch(()=>{});
    }
  });
  return app;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const config=loadConfig();
  createApp(config).listen(config.port,'0.0.0.0',()=>{
    console.log('Academic JV MCP ready on port '+config.port+' (auth='+config.authMode+')');
  });
}
