/** Lista CourseWork paginado. Helper compartido por diagnósticos/cierre; no crea ni modifica recursos. */
function listarCourseWork_(courseId) {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.CourseWork.list(String(courseId), {
      pageToken: token,
      pageSize: 100
    });
    (page.courseWork || []).forEach(function(work) { out.push(work); });
    token = page.nextPageToken;
  } while (token);
  return out;
}
