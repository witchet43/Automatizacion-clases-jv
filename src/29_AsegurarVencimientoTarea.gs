/**
 * ASEGURA EL VENCIMIENTO CANÓNICO DE UNA TAREA YA CREADA O REUTILIZADA.
 *
 * Si el CourseWork ya existe y su vencimiento falta o no coincide con el límite
 * calculado por aplicarReglaVencimientoTarea_(), se corrige in-place siempre que
 * permanezca DRAFT. Así la idempotencia no conserva una tarea histórica inválida.
 */
function asegurarVencimientoTareaCreada_(courseId, workId, tarea) {
  const idCurso = String(courseId || '').trim();
  const idTrabajo = String(workId || '').trim();
  if (!idCurso || !idTrabajo) throw new Error('No se puede asegurar el vencimiento de TAREA sin courseId y workId.');

  const dueEsperado = construirVencimientoDirecto_(tarea && tarea.fechaLimite, tarea && tarea.horaLimite);
  if (!dueEsperado.dueDate || !dueEsperado.dueTime) {
    throw new Error('No existe vencimiento UTC esperado para asegurar la TAREA.');
  }

  let work = Classroom.Courses.CourseWork.get(idCurso, idTrabajo);
  if (String(work.state || '').toUpperCase() !== 'DRAFT') {
    throw new Error('La TAREA existente no está DRAFT y no se modificará automáticamente: ' + idTrabajo + '.');
  }

  let reparado = false;
  if (!coincideVencimientoTarea_(work, dueEsperado)) {
    Classroom.Courses.CourseWork.patch({
      dueDate: dueEsperado.dueDate,
      dueTime: dueEsperado.dueTime
    }, idCurso, idTrabajo, {updateMask:'dueDate,dueTime'});
    reparado = true;
    work = Classroom.Courses.CourseWork.get(idCurso, idTrabajo);
  }

  if (!coincideVencimientoTarea_(work, dueEsperado)) {
    throw new Error('La TAREA no quedó con el vencimiento canónico esperado después de la reparación: ' + idTrabajo + '.');
  }
  if (String(work.state || '').toUpperCase() !== 'DRAFT') {
    throw new Error('La TAREA dejó de estar DRAFT durante la verificación: ' + idTrabajo + '.');
  }

  return {work:work, reparado:reparado};
}

function coincideVencimientoTarea_(work, dueEsperado) {
  const dueDate = work && work.dueDate ? work.dueDate : null;
  const dueTime = work && work.dueTime ? work.dueTime : null;
  if (!dueDate || !dueTime || !dueEsperado || !dueEsperado.dueDate || !dueEsperado.dueTime) return false;

  return Number(dueDate.year) === Number(dueEsperado.dueDate.year) &&
    Number(dueDate.month) === Number(dueEsperado.dueDate.month) &&
    Number(dueDate.day) === Number(dueEsperado.dueDate.day) &&
    Number(dueTime.hours || 0) === Number(dueEsperado.dueTime.hours || 0) &&
    Number(dueTime.minutes || 0) === Number(dueEsperado.dueTime.minutes || 0);
}
