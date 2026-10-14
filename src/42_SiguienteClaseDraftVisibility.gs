/** Classroom CourseWork.list debe considerar explícitamente DRAFT y PUBLISHED. */
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
  return out.filter(function(w) {
    return String(w.state || '').toUpperCase() !== 'DELETED';
  });
}
