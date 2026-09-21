/** Auditoría de solo lectura contra Classroom real: ITQ Sistemas Operativos, sesiones 9–16. No crea ni publica recursos. */
function auditarClassroomSistemasOperativosITQ() {
  const course = resolverCursoClassroomPorMateria_('Sistemas Operativos');
  const courseId = String(course.id);
  const works = [];
  let pageToken;
  do {
    const page = Classroom.Courses.CourseWork.list(courseId, {pageSize:100,pageToken:pageToken,courseWorkStates:['DRAFT','PUBLISHED']});
    (page.courseWork||[]).forEach(function(w) {
      works.push({id:String(w.id),title:String(w.title||''),state:String(w.state||''),topicId:String(w.topicId||''),description:String(w.description||''),materials:(w.materials||[]).map(function(m){return {driveFileId:m.driveFile&&m.driveFile.driveFile?String(m.driveFile.driveFile.id||''):'',shareMode:m.driveFile?String(m.driveFile.shareMode||''):'',link:m.link?String(m.link.url||''):''};}),alternateLink:String(w.alternateLink||''),creationTime:String(w.creationTime||'')});
    });
    pageToken=page.nextPageToken;
  } while(pageToken);
  const topics=[];pageToken=undefined;
  do {const page=Classroom.Courses.Topics.list(courseId,{pageSize:100,pageToken:pageToken});(page.topic||[]).forEach(function(t){topics.push({id:String(t.topicId),name:String(t.name||'')});});pageToken=page.nextPageToken;}while(pageToken);
  const plan=SpreadsheetApp.openById('1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI');
  const sheets=plan.getSheets();
  const planning=sheets.map(function(sh){return {sheet:sh.getName(),rows:sh.getDataRange().getDisplayValues().filter(function(row){return row.some(function(cell){return /^(?:9|10|11|12|13|14|15|16)$/.test(String(cell).trim());});})};});
  return {ok:true,readOnly:true,course:{id:String(course.id),name:String(course.name||'')},courseWork:works,topics:topics,planning:planning};
}