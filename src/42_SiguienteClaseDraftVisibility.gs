/** Classroom CourseWork.list debe considerar explícitamente DRAFT y PUBLISHED. */
function listarCourseWorkPaginaConReintento_(courseId,options) {
  let lastErr=null;
  for(let attempt=0;attempt<3;attempt++){
    try{return Classroom.Courses.CourseWork.list(String(courseId),options||{});}
    catch(err){
      lastErr=err;
      const msg=String(err&&err.message?err.message:err);
      if(!/internal error|server error|service unavailable|backend error|rate limit|too many requests|temporar/i.test(msg))throw err;
      Utilities.sleep(300*(attempt+1));
    }
  }
  throw lastErr||new Error('CLASSROOM_READ_RETRY_EXHAUSTED');
}
function listarCourseWorkClase_(courseId) {
  let token, out = [];
  do {
    const p = listarCourseWorkPaginaConReintento_(String(courseId), {
      pageSize: 100,pageToken: token,courseWorkStates: ['DRAFT', 'PUBLISHED']
    });
    out = out.concat(p.courseWork || []);
    token = p.nextPageToken;
  } while (token);
  return out.filter(function(w) {return String(w.state || '').toUpperCase() !== 'DELETED';});
}
