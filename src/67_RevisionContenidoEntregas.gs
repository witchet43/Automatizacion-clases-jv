/**
 * Revisión académica asistida: operaciones internas para el gateway canónico.
 * NO se exponen por doGet. El servidor MCP/WebApp debe autenticar las escrituras.
 * Nunca retorna una entrega, modifica assignedGrade ni publica comentarios.
 */
function listarEntregasEvaluables_(courseId, courseWorkId) {
  const course = Classroom.Courses.CourseWork.get(String(courseId), String(courseWorkId));
  const subs = [];
  let token;
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
      String(courseId), String(courseWorkId), {pageSize:100, pageToken:token});
    (page.studentSubmissions||[]).forEach(function(s){subs.push(s);});
    token = page.nextPageToken;
  } while(token);
  return {
    courseId:String(courseId), courseWorkId:String(courseWorkId),
    title:String(course.title||''), description:String(course.description||''),
    maxPoints:course.maxPoints, rubricId:course.rubricId||null,
    submissions:subs.map(function(s){
      const a=s.assignmentSubmission||{};
      return {
        submissionId:String(s.id), userId:String(s.userId||''),
        state:String(s.state||''), draftGrade:s.draftGrade,
        assignedGrade:s.assignedGrade, updateTime:s.updateTime||null,
        attachments:(a.attachments||[]).map(function(x){
          const d=x.driveFile&&x.driveFile.id?x.driveFile:{};
          const l=x.link||{};
          return {driveFileId:d.id||null, title:d.title||null,
            linkUrl:l.url||null, type:x.driveFile?'DRIVE':(x.link?'LINK':'OTHER')};
        })
      };
    })
  };
}
/** Read only accessible text/Google Docs; never assert unreadable assets were reviewed. */
function leerEvidenciaEntrega_(driveFileId) {
  if(!/^[A-Za-z0-9_-]{10,}$/.test(String(driveFileId||'')))
    throw new Error('FILE_ID_INVALID');
  const file=Drive.Files.get(String(driveFileId),{fields:'id,name,mimeType,webViewLink'});
  const mime=String(file.mimeType||'');
  let content;
  if(mime==='application/vnd.google-apps.document') {
    const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+
      '/export?mimeType=text%2Fplain';
    const response=UrlFetchApp.fetch(url,{method:'get',
      headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      muteHttpExceptions:true});
    if(response.getResponseCode()!==200)throw new Error('EVIDENCE_EXPORT_FAILED');
    content=response.getContentText();
  } else if(mime==='text/plain') {
    content=DriveApp.getFileById(file.id).getBlob().getDataAsString('UTF-8');
  } else {
    return {id:file.id,name:file.name,mimeType:mime,
      readable:false,reason:'FORMAT_REQUIRES_SEPARATE_REVIEW'};
  }
  if(content.length>120000)
    return {id:file.id,name:file.name,mimeType:mime,
      readable:false,reason:'EVIDENCE_TOO_LARGE'};
  return {id:file.id,name:file.name,mimeType:mime,readable:true,text:content};
}
/**
 * Persist only a teacher-authorized draft grade for previously evaluated evidence.
 * Preserve existing teacher grading. No blind overwrites, no status-based scores.
 * IMPORTANT: caller must authenticate and authorize this mutation.
 */
function guardarEvaluacionContenidoDraft_(request) {
  const r=request||{};
  const courseId=String(r.courseId||'');
  const workId=String(r.courseWorkId||'');
  const submissionId=String(r.submissionId||'');
  const score=Number(r.score);
  const max=Number(r.maxPoints);
  if(!/^\d+$/.test(courseId)||!/^\d+$/.test(workId)||!submissionId)
    throw new Error('GRADE_TARGET_INVALID');
  if(!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)
    throw new Error('GRADE_OUT_OF_RANGE');
  if(r.confirmed!==true||r.evidenceReviewed!==true||
     !String(r.justification||'').trim()||
     !Array.isArray(r.criteria)||!r.criteria.length||
     !r.criteria.every(function(c){return c&&String(c.name||'').trim()&&String(c.evidence||'').trim()&&Number.isFinite(Number(c.points));}))
    throw new Error('EVALUATION_AUTHORIZATION_OR_EVIDENCE_MISSING');
  const work=Classroom.Courses.CourseWork.get(courseId,workId);
  if(!Number.isFinite(Number(work.maxPoints))||
     Math.abs(Number(work.maxPoints)-max)>0.001)
    throw new Error('GRADE_MAXPOINTS_CHANGED');
  const sub=Classroom.Courses.CourseWork.StudentSubmissions.get(
    courseId,workId,submissionId);
  if(String(sub.state)!=='TURNED_IN')
    throw new Error('SUBMISSION_NOT_TURNED_IN');
  if(sub.assignedGrade!==undefined&&sub.assignedGrade!==null)
    throw new Error('ASSIGNED_GRADE_EXISTS');
  if(sub.draftGrade!==undefined&&sub.draftGrade!==null)
    throw new Error('DRAFT_GRADE_EXISTS');
  const currentAttachments=(sub.assignmentSubmission&&sub.assignmentSubmission.attachments)||[];
  const declaredIds=Array.isArray(r.reviewedFileIds)?r.reviewedFileIds.map(String):[];
  if(!declaredIds.length)throw new Error('REVIEWED_FILES_REQUIRED');
  const realIds=currentAttachments.map(function(x){return String(x.driveFile&&x.driveFile.id||'');});
  if(!declaredIds.every(function(id){return realIds.indexOf(id)>=0;}))
    throw new Error('REVIEWED_FILES_NOT_IN_SUBMISSION');
  if(Math.abs(r.criteria.reduce(function(n,c){return n+Number(c.points);},0)-score)>0.001)
    throw new Error('CRITERIA_SUM_MISMATCH');
  const maxCriteria=r.criteria.reduce(function(n,c){return n+Number(c.maxPoints);},0);
  if(!r.criteria.every(function(c){return Number.isFinite(Number(c.maxPoints))&&Number(c.maxPoints)>=0&&Number(c.points)>=0&&Number(c.points)<=Number(c.maxPoints);})||
     Math.abs(maxCriteria-max)>0.001)throw new Error('CRITERIA_MAX_MISMATCH');
  escribirCalificacionDraft_(courseId,workId,submissionId,score);
  const verified=Classroom.Courses.CourseWork.StudentSubmissions.get(
    courseId,workId,submissionId);
  if(Math.abs(Number(verified.draftGrade)-score)>0.001)
    throw new Error('DRAFT_GRADE_POSTFLIGHT_FAILED');
  return {ok:true,courseId:courseId,courseWorkId:workId,
    submissionId:submissionId,draftGrade:Number(verified.draftGrade),
    assignedGrade:verified.assignedGrade||null,state:String(verified.state),
    returnedByAutomation:false};
}
