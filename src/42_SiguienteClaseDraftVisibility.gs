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

function limpiarDuplicadosSesion15SistemasDistribuidos() {
  const courseId = '871158466533';
  const keep = {
    'Tarea previa - 2.2.4 Mensajes de requerimiento HTTP': '885742352955',
    'Práctica 14 - Construir peticiones HTTP controlando método, headers y cuerpo': '885742708239',
    'Tarea previa - 2.2.5 Mensajes de respuesta HTTP': '885742324311'
  };
  const works = listarCourseWorkClase_(courseId), deleted = [], verified = {};
  Object.keys(keep).forEach(function(title) {
    const matches = works.filter(function(w) { return String(w.title || '').trim() === title; });
    const survivor = matches.find(function(w) { return String(w.id) === keep[title]; }) || matches[0];
    if (!survivor) throw new Error('No existe recurso canónico para conservar: ' + title);
    matches.forEach(function(w) {
      if (String(w.id) !== String(survivor.id) && String(w.state || '').toUpperCase() === 'DRAFT') {
        Classroom.Courses.CourseWork.remove(courseId, String(w.id));
        deleted.push(String(w.id));
      }
    });
    const real = Classroom.Courses.CourseWork.get(courseId, String(survivor.id));
    if (String(real.state || '').toUpperCase() !== 'DRAFT') throw new Error('Superviviente fuera de DRAFT: ' + survivor.id);
    verified[title] = String(survivor.id);
  });
  return {ok:true, courseId:courseId, deleted:deleted, verified:verified, resourceState:'DRAFT'};
}
