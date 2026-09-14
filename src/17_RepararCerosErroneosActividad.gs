/**
 * Reparación puntual y segura de calificaciones 0 escritas por error en un CourseWork.
 * Solo limpia draftGrade/assignedGrade cuando alguno de esos campos vale exactamente 0.
 * Cualquier calificación distinta de 0 se preserva.
 */
function limpiarCerosErroneosActividad_(courseId, workId) {
  const cw = Classroom.Courses.CourseWork.get(String(courseId), String(workId));
  if (!cw) throw new Error('No existe el CourseWork objetivo.');
  if (!cw.associatedWithDeveloper) {
    throw new Error('El CourseWork objetivo no es administrable por este Apps Script.');
  }

  const subs = [];
  let token = null;
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
      String(courseId), String(workId), {pageToken: token, pageSize: 100}
    );
    (page.studentSubmissions || []).forEach(s => subs.push(s));
    token = page.nextPageToken;
  } while (token);

  let corregidas = 0;
  let preservadas = 0;
  const cambios = [];

  subs.forEach(sub => {
    const tieneDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;
    const tieneAssigned = sub.assignedGrade !== undefined && sub.assignedGrade !== null;
    const draft = tieneDraft ? Number(sub.draftGrade) : null;
    const assigned = tieneAssigned ? Number(sub.assignedGrade) : null;
    const tieneCero = (draft === 0) || (assigned === 0);

    if (!tieneCero) {
      preservadas++;
      return;
    }

    // Un campo incluido en updateMask y omitido del recurso se restablece/limpia.
    Classroom.Courses.CourseWork.StudentSubmissions.patch(
      {},
      String(courseId),
      String(workId),
      String(sub.id),
      {updateMask: 'draftGrade,assignedGrade'}
    );
    corregidas++;
    cambios.push({
      userId: String(sub.userId),
      draftAnterior: draft,
      assignedAnterior: assigned
    });
  });

  // Verificación: ningún StudentSubmission debe conservar un 0 en draftGrade/assignedGrade.
  const verify = [];
  token = null;
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
      String(courseId), String(workId), {pageToken: token, pageSize: 100}
    );
    (page.studentSubmissions || []).forEach(s => verify.push(s));
    token = page.nextPageToken;
  } while (token);

  const restantes = verify.filter(s =>
    (s.draftGrade !== undefined && s.draftGrade !== null && Number(s.draftGrade) === 0) ||
    (s.assignedGrade !== undefined && s.assignedGrade !== null && Number(s.assignedGrade) === 0)
  ).map(s => ({
    userId: String(s.userId),
    draftGrade: s.draftGrade,
    assignedGrade: s.assignedGrade
  }));

  if (restantes.length) {
    throw new Error('Persisten calificaciones 0 después de la reparación: ' + JSON.stringify(restantes).slice(0, 3000));
  }

  return {
    courseId: String(courseId),
    courseWorkId: String(workId),
    titulo: cw.title || '',
    corregidas: corregidas,
    preservadas: preservadas,
    verificadas: verify.length,
    cambios: cambios
  };
}

/**
 * Reparación puntual solicitada el 14/09/2026:
 * ITQ - Sistemas Operativos, Unidad 2,
 * Tarea 09 - Estados y transición de procesos.
 */
function repararCerosTareaUnidad2SOAhora() {
  return limpiarCerosErroneosActividad_('875776451793', '869479870859');
}
