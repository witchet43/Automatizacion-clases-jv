/**
 * PRUEBA CONTROLADA DE LA REGLA DE ACTIVIDAD EN CLASE.
 * Curso espejo: ITQ - MI prueba de SO.
 * La prueba usa la sesión real de SO del 14/09/2026, 07:00-08:00 local.
 */
function probarActividadClaseHoyMiPruebaSO() {
  const nombreObjetivo = 'ITQ - MI prueba de SO';
  const normalizado = nombreObjetivo.toLowerCase();
  let token;
  let curso = null;
  do {
    const page = Classroom.Courses.list({pageSize: 100, pageToken: token});
    curso = (page.courses || []).find(function(c) {
      return String(c.name || '').trim().toLowerCase() === normalizado && String(c.courseState || '').toUpperCase() !== 'ARCHIVED';
    }) || null;
    if (curso) break;
    token = page.nextPageToken;
  } while (token);

  if (!curso) throw new Error('No se encontró el curso Classroom exacto: ' + nombreObjetivo + '.');

  const resultado = crearActividad({
    courseId: String(curso.id),
    courseKey: 'ITQ_SISTEMAS_OPERATIVOS',
    unidad: 'Unidad 2',
    titulo: 'Actividad de prueba - Vencimiento al final de clase',
    descripcion: 'Actividad en clase de prueba para validar que la fecha máxima de entrega coincide con el final de la sesión.',
    puntos: 100,
    fechaSesion: '2026-09-14',
    horaFinSesion: '08:00'
  });

  const work = Classroom.Courses.CourseWork.get(String(curso.id), String(resultado.workId));
  const verificacion = {
    ok: true,
    courseId: String(curso.id),
    courseName: String(curso.name || ''),
    workId: String(work.id),
    title: String(work.title || ''),
    state: String(work.state || ''),
    dueDate: work.dueDate || null,
    dueTime: work.dueTime || null,
    topicId: String(work.topicId || ''),
    alternateLink: String(work.alternateLink || ''),
    expectedLocalDeadline: '2026-09-14 08:00 America/Mexico_City',
    expectedApiUtcDeadline: '2026-09-14 14:00 UTC'
  };
  console.log(JSON.stringify(verificacion));
  return verificacion;
}
