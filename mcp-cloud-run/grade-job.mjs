import fs from 'node:fs';
import {signedClosureRequest,callWebApp} from './server.mjs';

/**
 * Runs INSIDE Cloud Run with the existing runtime SA, not on a GitHub runner.
 * The HMAC is injected from Secret Manager; no OAuth subject/token is needed
 * for this trusted server-to-WebApp integration.
 *
 * One request, retries=0. No personal data or individual grades in logs.
 */
const expectedCourse='871149624583';
const expectedUnit=2;
const courseId=String(process.env.ACADEMIC_COURSE_ID||'');
const unit=Number(process.env.ACADEMIC_UNIT||'');
const requestId=String(process.env.ACADEMIC_REQUEST_ID||'');
const hmac=String(process.env.ACADEMIC_WRITE_HMAC_KEY||'');
if(courseId!==expectedCourse || unit!==expectedUnit ||
  !/^close_871149624583_u2_[A-Za-z0-9_-]{8,40}$/.test(requestId))
  throw Error('UNIT2_TARGET_OR_REQUEST_ID_MISMATCH');
if(hmac.length<32)throw Error('HMAC_MISSING');
const source=JSON.parse(fs.readFileSync(new URL('./context.json',import.meta.url),'utf8'));
const courseIds=new Set(source.courseIds.map(String));
if(!courseIds.has(courseId) || !source.operationalContext ||
  source.operationalContext.contractVersion!=='1.1.0')
  throw Error('CANONICAL_CONTEXT_UNAVAILABLE');
const config={
  hmac,courseIds,operationalContext:source.operationalContext,
  upstreamUrl:source.operationalContext.endpoint
};
try {
  const response=await callWebApp(config,signedClosureRequest(config,courseId,unit,requestId));
  // WebApp returns the result directly for uaqExecutor in production.
  if(response.modo==='OMITIDO_POR_NOTAS_ASIGNADAS'){
    console.log('CLOSURE_SKIPPED_MANUAL_ASSIGNED_GRADES: no write attempted');
    process.exitCode=1;
  }else if(response.estadoCalificacion!=='DRAFT_ONLY'||
    response.cierre?.estado!=='PUBLISHED'||
    response.cierre?.estadoCalificacion!=='DRAFT_ONLY'||
    !/^\d+$/.test(String(response.cierre?.courseWorkId||''))){
    throw Error('CLOSURE_POSTFLIGHT_UNVERIFIED');
  }else {
    console.log('CLOSURE_VERIFIED: courseId='+courseId+
      ' unit='+unit+' title="Calificación Unidad 2"'+
      ' courseWorkId='+response.cierre.courseWorkId+
      ' courseWorkState=PUBLISHED individualGrades=DRAFT_ONLY'+
      ' students='+Number(response.cierre.alumnosReporte||0)+
      ' gradeDraftsChanged='+Number(response.cierre.actualizadas||0));
  }
}catch(e){
  const code=String(e?.message||'UNKNOWN_ERROR');
  console.error('UNIT2_CLOSURE_FAILED: '+(/^[A-Z][A-Z0-9_:-]{2,100}$/.test(code)?code:'UNEXPECTED_ERROR'));
  process.exitCode=1;
}
