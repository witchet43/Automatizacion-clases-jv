import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));
const port = Number(process.env.PORT || 8080);
const endpoint = process.env.ACADEMIC_WEBAPP_URL || '';
const token = process.env.MCP_BEARER_TOKEN || '';
const writesEnabled = process.env.ENABLE_ACADEMIC_WRITES === 'true';
const ALLOWED_WRITE_ACTIONS = new Set(['actividad','tarea','practica','quiz','examen','material','clase','quizAsistencia']);

function authenticate(req) {
  if (!token) return false;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  const a=Buffer.from(supplied), b=Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a,b);
}
async function callWebApp(payload) {
  if (!endpoint.startsWith('https://script.google.com/macros/s/') || !endpoint.endsWith('/exec')) {
    throw new Error('ACADEMIC_WEBAPP_URL must be the verified canonical Apps Script URL');
  }
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 55000);
  try {
    const response = await fetch(endpoint,{
      method:'POST',redirect:'follow',
      headers:{'content-type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),signal:controller.signal
    });
    if (!response.ok) throw new Error('WebApp HTTP '+response.status);
    const raw=await response.text();
    let result;
    try {result=JSON.parse(raw);} catch {throw new Error('WebApp returned non-JSON response');}
    if (!result || result.ok !== true) throw new Error('WebApp error: '+String(result?.error || 'UNKNOWN'));
    return result;
  } finally {clearTimeout(timeout);}
}
function resultText(value){return {content:[{type:'text',text:JSON.stringify(value)}]};}
function toolError(err){return {isError:true,content:[{type:'text',text:String(err?.message||err)}]};}
function buildServer(){
  const server=new McpServer({name:'academic-classroom-gateway',version:'0.1.0'});
  server.registerTool('gateway_status',{
    description:'Describe configuration without accessing Classroom or disclosing secrets.',
    inputSchema:{}
  },async()=>resultText({configured:Boolean(endpoint),writesEnabled,authConfigured:Boolean(token),transport:'STREAMABLE_HTTP',upstream:'CANONICAL_APPS_SCRIPT'}));
  server.registerTool('diagnosticar_clase',{
    description:'Read-only diagnostic of real Classroom course work via the canonical Apps Script WebApp. Requires the canonical operationalContext for non-fast-path actions.',
    inputSchema:{
      courseId:z.string().regex(/^\d+$/),
      operationalContext:z.record(z.string(),z.unknown()),
      soloClassroom:z.boolean().optional(),
      soloDrafts:z.boolean().optional()
    }
  },async(args)=>{try{return resultText(await callWebApp({
    action:'diagnosticarClase',courseId:args.courseId,operationalContext:args.operationalContext,
    soloClassroom:args.soloClassroom ?? true,soloDrafts:args.soloDrafts ?? false
  }));}catch(e){return toolError(e);}});
  server.registerTool('ejecutar_operacion_academica',{
    description:'Invoke an approved routine academic operation via canonical uaqExecutor. Disabled by default; enable only after upstream authorization and end-to-end tests. Ordinary Classroom work must remain DRAFT.',
    inputSchema:{
      operation:z.enum([...ALLOWED_WRITE_ACTIONS]),
      courseId:z.string().regex(/^\d+$/),
      params:z.record(z.string(),z.unknown()),
      operationalContext:z.record(z.string(),z.unknown()),
      requestId:z.string().min(1)
    }
  },async(args)=>{
    if (!writesEnabled) return toolError(new Error('WRITE_DISABLED'));
    if (!ALLOWED_WRITE_ACTIONS.has(args.operation)) return toolError(new Error('OPERATION_NOT_ALLOWED'));
    try {
      const output=await callWebApp({
        action:'uaqExecutor',operation:args.operation,courseId:args.courseId,
        params:args.params,requestId:args.requestId,operationalContext:args.operationalContext
      });
      if(output.state && output.state !== 'DRAFT') throw new Error('UNEXPECTED_NON_DRAFT_STATE');
      return resultText(output);
    } catch(e){return toolError(e);}
  });
  return server;
}
app.get('/healthz',(_req,res)=>res.json({status:'ok',service:'academic-classroom-mcp'}));
app.all('/mcp',async(req,res)=>{
  if (!authenticate(req)) return res.status(401).json({error:'unauthorized'});
  if(req.method !== 'POST') return res.status(405).set('Allow','POST').end();
  const server=buildServer();
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  try {
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
  } catch(err) {
    if(!res.headersSent) res.status(500).json({error:'mcp_transport_error'});
  } finally {
    await transport.close().catch(()=>{});
    await server.close().catch(()=>{});
  }
});
app.listen(port,'0.0.0.0',()=>console.log('Academic MCP listening on',port));
