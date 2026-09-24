/**
 * QUIZ DE ASISTENCIA RÁPIDO — Classroom, sin Forms ni dependencias académicas.
 * Entrada única: courseId explícito. Un Quiz N por curso y día local;
 * se consulta Classroom (no Sheet) para hallar último N y evitar duplicados.
 */
function crearQuizAsistenciaRapido(params) {
  const courseId=String(params&&params.courseId||'').trim();
  if (!/^\d+$/.test(courseId)) throw new Error('Se requiere courseId numérico explícito.');
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoy=Utilities.formatDate(new Date(),'America/Mexico_City','yyyy-MM-dd');
    let max=0, existente=null;
    ['DRAFT','PUBLISHED'].forEach(function(state) {
      let token;
      do {
        const page=Classroom.Courses.CourseWork.list(courseId,{
          courseWorkStates:state,pageSize:100,pageToken:token
        });
        (page.courseWork||[]).forEach(function(work) {
          const m=String(work.title||'').trim().match(/^Quiz\s+(\d+)$/i);
          if (!m) return;
          max=Math.max(max,Number(m[1]));
          const fecha=work.creationTime?
            Utilities.formatDate(new Date(work.creationTime),'America/Mexico_City','yyyy-MM-dd'):'';
          if (fecha===hoy && !existente) existente=work;
        });
        token=page.nextPageToken;
      } while(token);
    });
    if (existente) {
      return {ok:true,courseId:courseId,workId:String(existente.id),
        title:String(existente.title),state:String(existente.state),reutilizado:true};
    }
    const titulo='Quiz '+(max+1);
    const nuevo=Classroom.Courses.CourseWork.create({
      title:titulo,workType:'ASSIGNMENT',state:'DRAFT'
    },courseId);
    const verificado=Classroom.Courses.CourseWork.get(courseId,String(nuevo.id));
    if (verificado.title!==titulo || verificado.state!=='DRAFT' ||
        String(verificado.description||'').trim() ||
        (verificado.materials||[]).length)
      throw new Error('El quiz creado no coincide con título, borrador o contenido vacío.');
    registrarAuditoriaCourseWorkDirecto_({
      courseId:courseId,titulo:titulo,descripcion:'',tipo:'QUIZ_SENCILLO'
    },verificado,'','CREADO');
    return {ok:true,courseId:courseId,workId:String(verificado.id),
      title:titulo,state:'DRAFT',reutilizado:false};
  } finally { lock.releaseLock(); }
}
