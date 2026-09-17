/** Classroom CourseWork.list no debe depender de su filtro implícito: la automatización trabaja en DRAFT. */
function listarCourseWorkClase_(courseId) {
  let token, out = [];
  do {
    const p = Classroom.Courses.CourseWork.list(String(courseId), {
      pageSize: 100,
      pageToken: token,
      courseWorkStates: ['DRAFT', 'PUBLISHED']
    });
    out = out.concat(p.courseWork || []);
    token = p.nextPageToken;
  } while (token);
  return out.filter(function(w) { return String(w.state || '').toUpperCase() !== 'DELETED'; });
}
