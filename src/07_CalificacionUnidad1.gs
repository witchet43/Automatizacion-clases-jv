/**
 * Crea o reutiliza la actividad de cierre de Unidad 1 y carga su calificacion.
 *
 * Formula por alumno:
 *   promedio de examenes publicados del tema Unidad 1 * 70%
 * + promedio de las demas actividades publicadas del tema Unidad 1 * 30%
 *
 * Una actividad publicada sin calificacion cuenta como cero. La actividad de
 * cierre se excluye de sus propios insumos. Solo se escribe draftGrade.
 */
function calcularYPublicarCalificacionUnidad1() {
  const COURSE_ID = '871149624583';
  const TOPIC_NAME = 'Unidad 1';
  const RESULT_TITLE = 'Calificación final - Unidad 1';
  const EXAM_WEIGHT = 0.70;
  const ACTIVITIES_WEIGHT = 0.30;

  const topic = buscarTemaExacto_(COURSE_ID, TOPIC_NAME);
  const allWork = listarCourseWork_(COURSE_ID);
  const sources = allWork.filter(w =>
    String(w.topicId || '') === String(topic.topicId) &&
    String(w.state || '').toUpperCase() === 'PUBLISHED' &&
    String(w.title || '').trim() !== RESULT_TITLE
  );

  const exams = sources.filter(w => /^examen(?:es)?\b/i.test(String(w.title || '').trim()));
  const activities = sources.filter(w => !/^examen(?:es)?\b/i.test(String(w.title || '').trim()));

  if (!exams.length) throw new Error('No hay exámenes publicados en el tema Unidad 1.');
  if (!activities.length) throw new Error('No hay actividades publicadas en el tema Unidad 1.');

  let resultWork = allWork.find(w => String(w.title || '').trim() === RESULT_TITLE);
  if (resultWork && String(resultWork.topicId || '') !== String(topic.topicId)) {
    throw new Error('Ya existe una actividad con el título final fuera del tema Unidad 1.');
  }
  if (!resultWork) {
    resultWork = Classroom.Courses.CourseWork.create({
      title: RESULT_TITLE,
      description:
        'Cálculo automático: promedio de exámenes de Unidad 1 × 70% + ' +
        'promedio de las demás actividades publicadas de Unidad 1 × 30%.',
      workType: 'ASSIGNMENT',
      state: 'PUBLISHED',
      maxPoints: 100,
      topicId: topic.topicId
    }, COURSE_ID);
  }
  if (!resultWork.associatedWithDeveloper) {
    throw new Error('La actividad final no es administrable por este proyecto Apps Script.');
  }

  const sourceGrades = {};
  sources.forEach(w => sourceGrades[w.id] = calificacionesPorAlumno_(COURSE_ID, w.id));
  const resultSubs = entregasPorAlumno_(COURSE_ID, resultWork.id);
  const students = listarAlumnos_(COURSE_ID);
  const detail = [];
  let updated = 0;

  students.forEach(student => {
    const uid = String(student.userId);
    const examAverage = promedioConCeros_(exams.map(w => notaDe_(sourceGrades[w.id][uid])));
    const activitiesAverage = promedioConCeros_(activities.map(w => notaDe_(sourceGrades[w.id][uid])));
    const finalGrade = redondear2_(examAverage * EXAM_WEIGHT + activitiesAverage * ACTIVITIES_WEIGHT);
    const submission = resultSubs[uid];

    if (!submission) throw new Error('No existe entrega final para ' + student.profile.name.fullName + '.');

    Classroom.Courses.CourseWork.StudentSubmissions.patch(
      {draftGrade: finalGrade},
      COURSE_ID,
      resultWork.id,
      submission.id,
      {updateMask: 'draftGrade'}
    );
    updated++;
    detail.push({
      alumno: student.profile.name.fullName,
      promedioExamenes: examAverage,
      aporteExamenes: redondear2_(examAverage * EXAM_WEIGHT),
      promedioActividades: activitiesAverage,
      aporteActividades: redondear2_(activitiesAverage * ACTIVITIES_WEIGHT),
      calificacionFinal: finalGrade
    });
  });

  const result = {
    courseWorkId: resultWork.id,
    alternateLink: resultWork.alternateLink || '',
    tema: TOPIC_NAME,
    examenes: exams.map(w => w.title),
    actividades: activities.map(w => w.title),
    alumnosActualizados: updated,
    detalle: detail
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function buscarTemaExacto_(courseId, name) {
  let token;
  const matches = [];
  do {
    const page = Classroom.Courses.Topics.list(courseId, {pageToken: token});
    (page.topic || []).forEach(t => {
      if (String(t.name || '').trim() === name) matches.push(t);
    });
    token = page.nextPageToken;
  } while (token);
  if (matches.length !== 1) {
    throw new Error('Se esperaba exactamente un tema llamado "' + name + '"; encontrados: ' + matches.length + '.');
  }
  return matches[0];
}

function listarCourseWork_(courseId) {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.CourseWork.list(courseId, {pageToken: token, pageSize: 100});
    (page.courseWork || []).forEach(w => out.push(w));
    token = page.nextPageToken;
  } while (token);
  return out;
}

function listarAlumnos_(courseId) {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.Students.list(courseId, {pageToken: token, pageSize: 100});
    (page.students || []).forEach(s => out.push(s));
    token = page.nextPageToken;
  } while (token);
  return out;
}

function entregasPorAlumno_(courseId, workId) {
  let token;
  const out = {};
  do {
    const page = Classroom.Courses.CourseWork.StudentSubmissions.list(
      courseId, workId, {pageToken: token, pageSize: 100}
    );
    (page.studentSubmissions || []).forEach(s => out[String(s.userId)] = s);
    token = page.nextPageToken;
  } while (token);
  return out;
}

function calificacionesPorAlumno_(courseId, workId) {
  return entregasPorAlumno_(courseId, workId);
}

function notaDe_(submission) {
  if (!submission) return 0;
  if (submission.assignedGrade !== undefined && submission.assignedGrade !== null) {
    return Number(submission.assignedGrade);
  }
  if (submission.draftGrade !== undefined && submission.draftGrade !== null) {
    return Number(submission.draftGrade);
  }
  return 0;
}

function promedioConCeros_(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function redondear2_(value) {
  return Math.round(Number(value) * 100) / 100;
}
