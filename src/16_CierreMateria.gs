/**
 * Cierre final por unidades. La WebApp es el único motor de cálculo.
 * Pesos uniformes por defecto; pesos explícitos deben sumar 100.
 * No toca assignedGrade y no vuelve a promediar evaluaciones individuales.
 */
function cerrarMateria(params) {
  const p=params||{};
  const courseId=String(p.courseId||'');
  if(!/^\d+$/.test(courseId))throw new Error('COURSE_ID_INVALID');
  const units=Array.isArray(p.unidades)?p.unidades.map(Number):[];
  if(!units.length||units.some(function(n){return !Number.isSafeInteger(n)||n<1||n>50;})||
      new Set(units).size!==units.length)throw new Error('COURSE_UNITS_REQUIRED_UNIQUE');
  const weights=Array.isArray(p.ponderaciones)?p.ponderaciones.map(Number):units.map(function(){return 100/units.length;});
  if(weights.length!==units.length||weights.some(function(n){return !Number.isFinite(n)||n<0;})||
      Math.abs(weights.reduce(function(a,b){return a+b;},0)-100)>0.000001)
    throw new Error('COURSE_WEIGHTS_MUST_TOTAL_100');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw new Error('COURSE_CLOSE_BUSY');
  try {
    const workList=[];
    let pageToken;
    do{
      const res=Classroom.Courses.CourseWork.list(courseId,{pageSize:100,pageToken:pageToken||undefined});
      (res.courseWork||[]).forEach(function(w){if(w.state!=='DELETED')workList.push(w);});
      pageToken=res.nextPageToken;
    }while(pageToken);
    const source=units.map(function(n){
      const title='Calificación Unidad '+n;
      const matches=workList.filter(function(w){return w.title===title;});
      if(matches.length!==1||matches[0].state!=='PUBLISHED')
        throw new Error('COURSE_UNIT_MISSING_OR_DUPLICATED: '+n);
      return matches[0];
    });
    const finalTitle='Calificación Final del Curso';
    const existing=workList.filter(function(w){return w.title===finalTitle;});
    if(existing.length>1)throw new Error('COURSE_FINAL_DUPLICATED');
    const finalWork=existing[0]||null;
    if(finalWork&&finalWork.state!=='PUBLISHED')throw new Error('COURSE_FINAL_NOT_PUBLISHED');
    function submissions(workId){
      const arr=[];let token;
      do{
        const res=Classroom.Courses.CourseWork.StudentSubmissions.list(courseId,workId,{pageSize:100,pageToken:token||undefined});
        (res.studentSubmissions||[]).forEach(function(x){arr.push(x);});
        token=res.nextPageToken;
      }while(token);
      return arr;
    }
    const byUnit=source.map(function(w){
      const map={};
      submissions(String(w.id)).forEach(function(x){
        const value=x.draftGrade!==undefined&&x.draftGrade!==null?x.draftGrade:x.assignedGrade;
        if(value!==undefined&&value!==null)map[String(x.userId)]=Number(value);
      });
      return map;
    });
    const ids=Object.keys(byUnit[0]);
    if(!ids.length)throw new Error('COURSE_NO_UNIT_GRADES');
    for(let j=1;j<byUnit.length;j++){
      const other=Object.keys(byUnit[j]);
      if(other.length!==ids.length||ids.some(function(id){return !Object.prototype.hasOwnProperty.call(byUnit[j],id);}))
        throw new Error('COURSE_INCOMPLETE_UNIT_GRADES');
    }
    const gradeMap={};
    ids.forEach(function(id){
      const sum=weights.reduce(function(total,weight,i){
        const value=byUnit[i][id];
        if(!Number.isFinite(value)||value<0||value>100)throw new Error('COURSE_GRADE_OUT_OF_RANGE');
        return total+value*weight/100;
      },0);
      gradeMap[id]=Math.round(sum);
    });
    if(finalWork){
      const previous=submissions(String(finalWork.id));
      if(previous.some(function(x){return x.assignedGrade!==undefined&&x.assignedGrade!==null;}))
        return {ok:true,modo:'OMITIDO_POR_NOTAS_ASIGNADAS',finalCourseWorkId:String(finalWork.id),noWrites:true};
    }
    // Only mutate AFTER validating all units, grades and preexisting assigned notes.
    const target=finalWork||Classroom.Courses.CourseWork.create({
      title:finalTitle,description:'Promedio final calculado de las calificaciones de unidad.',
      workType:'ASSIGNMENT',state:'PUBLISHED',maxPoints:100,
      submissionModificationMode:'MODIFIABLE'
    },courseId);
    const current=submissions(String(target.id));
    if(current.length!==ids.length||current.some(function(x){return !Object.prototype.hasOwnProperty.call(gradeMap,String(x.userId));}))
      throw new Error('COURSE_FINAL_STUDENT_SET_MISMATCH');
    let updated=0;
    current.forEach(function(x){
      const expected=gradeMap[String(x.userId)];
      if(x.draftGrade===expected)return;
      Classroom.Courses.CourseWork.StudentSubmissions.patch(
        {draftGrade:expected},courseId,String(target.id),String(x.id),{updateMask:'draftGrade'});
      updated++;
    });
    return {ok:true,operacion:'CERRAR_MATERIA',courseId:courseId,courseWorkId:String(target.id),
      estado:'PUBLISHED',estadoCalificacion:'DRAFT_ONLY',alumnos:ids.length,actualizadas:updated,
      unidades:units,ponderaciones:weights};
  }finally{lock.releaseLock();}
}
