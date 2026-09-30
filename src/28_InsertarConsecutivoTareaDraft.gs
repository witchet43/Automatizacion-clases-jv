/**
 * Inserta una Tarea en medio del consecutivo sin tocar PUBLISHED.
 * Solo renombra DRAFT con formato "Tarea NN - ...", de mayor a menor.
 * La operación es idempotente: si el título nuevo ya existe, no vuelve a desplazar.
 */
function prepararInsercionConsecutivaTareaDraft_(params){
  const p=params&&typeof params==='object'?params:{};
  const start=Number(p.insertTaskNumber||0);
  if(!start)return [];
  if(!Number.isInteger(start)||start<1||start>999)throw new Error('insertTaskNumber inválido.');
  const courseId=String(p.courseId||'').trim(), nuevo=String(p.titulo||'').trim();
  if(!courseId||!nuevo)throw new Error('Inserción consecutiva requiere courseId y titulo.');
  const pad=function(n){return n<10?'0'+n:String(n);};
  const expectedPrefix='Tarea '+pad(start)+' - ';
  if(nuevo.indexOf(expectedPrefix)!==0)throw new Error('El título nuevo no coincide con insertTaskNumber: '+expectedPrefix);

  const works=listarCourseWorkClase_(courseId);
  const exact=works.find(function(w){return String(w.title||'').trim()===nuevo&&String(w.state||'').toUpperCase()!=='DELETED';});
  if(exact)return [];

  const parse=function(w){
    const m=String(w.title||'').trim().match(/^Tarea\s+(\d+)\s+-\s+(.+)$/i);
    return m?{work:w,num:Number(m[1]),rest:m[2].trim()}:null;
  };
  const parsed=works.map(parse).filter(Boolean);
  const publishedConflict=parsed.find(function(x){return x.num>=start&&String(x.work.state||'').toUpperCase()==='PUBLISHED';});
  if(publishedConflict)throw new Error('BLOCKED_TASK_NUMBER_INSERT: existe Tarea PUBLISHED en o después del consecutivo '+start+': '+publishedConflict.work.title);

  const drafts=parsed.filter(function(x){return x.num>=start&&String(x.work.state||'').toUpperCase()==='DRAFT';});
  const seen={};
  drafts.forEach(function(x){
    if(seen[x.num])throw new Error('BLOCKED_TASK_NUMBER_INSERT: existen DRAFT duplicados para Tarea '+x.num+'.');
    seen[x.num]=true;
  });
  drafts.sort(function(a,b){return b.num-a.num;});
  const changes=[];
  drafts.forEach(function(x){
    const newTitle='Tarea '+pad(x.num+1)+' - '+x.rest;
    Classroom.Courses.CourseWork.patch({title:newTitle},courseId,String(x.work.id),{updateMask:'title'});
    const verify=Classroom.Courses.CourseWork.get(courseId,String(x.work.id));
    if(String(verify.state||'').toUpperCase()!=='DRAFT'||String(verify.title||'').trim()!==newTitle)
      throw new Error('POSTFLIGHT_TASK_RENUMBER: no se verificó '+x.work.id+' → '+newTitle);
    changes.push({workId:String(x.work.id),antes:String(x.work.title||''),despues:newTitle});
  });
  return changes;
}
function revertirInsercionConsecutivaTareaDraft_(courseId,changes){
  const list=Array.isArray(changes)?changes.slice().reverse():[];
  list.forEach(function(x){
    try{
      const w=Classroom.Courses.CourseWork.get(String(courseId),String(x.workId));
      if(String(w.state||'').toUpperCase()==='DRAFT'&&String(w.title||'').trim()===String(x.despues||''))
        Classroom.Courses.CourseWork.patch({title:String(x.antes||'')},String(courseId),String(x.workId),{updateMask:'title'});
    }catch(ignore){}
  });
}
