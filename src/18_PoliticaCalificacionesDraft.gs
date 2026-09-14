/**
 * Invariante global de calificaciones automáticas.
 * Toda calificación importada, calculada o corregida por automatización queda
 * exclusivamente en draftGrade. assignedGrade solo puede enviarse como null
 * para retirar una publicación automática previa; nunca recibe un valor.
 */
function escribirCalificacionDraft_(courseId, workId, submissionId, grade) {
  const value = Number(grade);
  if (!Number.isFinite(value)) throw new Error('La calificación automática debe ser numérica.');

  Classroom.Courses.CourseWork.StudentSubmissions.patch(
    {draftGrade: value, assignedGrade: null},
    String(courseId), String(workId), String(submissionId),
    {updateMask: 'draftGrade,assignedGrade'}
  );
  return value;
}

function verificarCalificacionDraft_(submission, expected) {
  const draft = submission && submission.draftGrade !== undefined && submission.draftGrade !== null
    ? Number(submission.draftGrade) : null;
  const assigned = submission && submission.assignedGrade !== undefined && submission.assignedGrade !== null
    ? Number(submission.assignedGrade) : null;
  const value = Number(expected);
  return {
    ok: draft !== null && Math.abs(draft - value) <= 0.001 && assigned === null,
    draftGrade: draft,
    assignedGrade: assigned,
    esperado: value
  };
}

function politicaCalificacionAutomaticaDraft_() {
  return Object.freeze({
    campoEscritura: 'draftGrade',
    assignedGradeAutomatico: false,
    assignedGradeSoloParaLimpiar: true,
    returnAutomatico: false
  });
}
