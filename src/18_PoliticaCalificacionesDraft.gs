/**
 * Invariante global de calificaciones automáticas.
 * Los valores autorizados viven en ACADEMIC_POLICY.CLASSROOM.
 */
function escribirCalificacionDraft_(courseId, workId, submissionId, grade) {
  const value = Number(grade);
  if (!Number.isFinite(value)) throw new Error('La calificación automática debe ser numérica.');
  if (ACADEMIC_POLICY.CLASSROOM.AUTOMATIC_GRADE_FIELD !== 'draftGrade' || ACADEMIC_POLICY.CLASSROOM.AUTOMATIC_ASSIGNED_GRADE !== false) {
    throw new Error('La política canónica no autoriza publicar calificaciones automáticas.');
  }

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
    campoEscritura: ACADEMIC_POLICY.CLASSROOM.AUTOMATIC_GRADE_FIELD,
    assignedGradeAutomatico: ACADEMIC_POLICY.CLASSROOM.AUTOMATIC_ASSIGNED_GRADE,
    assignedGradeSoloParaLimpiar: true,
    returnAutomatico: ACADEMIC_POLICY.CLASSROOM.AUTOMATIC_RETURN
  });
}
