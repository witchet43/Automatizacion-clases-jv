/**
 * UNIDAD ABIERTA CANÓNICA PARA QUIZ SENCILLO / DE ASISTENCIA
 *
 * Fuente de verdad académica:
 * 1) último CourseWork académico ordinario PUBLISHED del curso en Classroom;
 * 2) debe estar asignado a un Topic canónico Unidad N;
 * 3) Quiz N de asistencia, Calificación Unidad N y exámenes no sirven como
 *    evidencia para inferir la unidad, evitando razonamiento circular;
 * 4) si existe un examen activo de esa Unidad N, la unidad está cerrada.
 */
const QUIZ_SENCILLO_OPEN_UNIT_POLICY = Object.freeze({
  RESOURCE_STATE: 'PUBLISHED',
  UNIT_TOPIC_PATTERN: '^Unidad\\s+(\\d+)$',
  SIMPLE_QUIZ_PATTERN: '^Quiz\\s+\\d+$',
  FINAL_GRADE_PATTERN: '^Calificaci[oó]n\\s+Unidad\\s+\\d+$',
  EXAM_TITLE_PREFIX: 'Examen',
  CLOSED_BY_EXAM_STATES: Object.freeze(['DRAFT', 'PUBLISHED']),
  RESOURCE_ORDER_FIELD: 'creationTime',
  REQUIRE_TOPIC: true,
  REQUIRE_OPEN_UNIT: true,
  EXCLUDE_SIMPLE_QUIZ_FROM_UNIT_EVIDENCE: true,
  EXCLUDE_FINAL_GRADE_FROM_UNIT_EVIDENCE: true,
  EXCLUDE_EXAM_FROM_UNIT_EVIDENCE: true
});

function resolverUnidadAbiertaQuizSencillo_(courseId) {
  const id = String(courseId || '').trim();
  if (!id) throw new Error('QUIZ_UNIDAD_ABIERTA_REQUIERE_COURSE_ID.');
  validarPoliticaUnidadAbiertaQuizSencillo_(QUIZ_SENCILLO_OPEN_UNIT_POLICY);

  const topics = listarTopicsCursoQuizSencillo_(id);
  const topicById = {};
  topics.forEach(function(topic) {
    topicById[String(topic.topicId || '')] = topic;
  });

  const recursos = listarCourseWorkPublicadoQuizSencillo_(id)
    .map(function(work) {
      const topicId = String(work.topicId || '').trim();
      const topic = topicById[topicId] || null;
      const unit = topic ? extraerNumeroUnidadTopicQuizSencillo_(topic.name) : null;
      return { work: work, topic: topic, unit: unit };
    })
    .filter(function(x) {
      return x.topic && Number.isInteger(x.unit) && x.unit > 0 &&
        esCourseWorkEvidenciaUnidadQuizSencillo_(x.work);
    })
    .sort(function(a, b) {
      const ta = Date.parse(String(a.work.creationTime || a.work.updateTime || '')) || 0;
      const tb = Date.parse(String(b.work.creationTime || b.work.updateTime || '')) || 0;
      return tb - ta;
    });

  if (!recursos.length) {
    throw new Error('QUIZ_SIN_UNIDAD_ABIERTA: no existe CourseWork académico ordinario PUBLISHED asignado a un Topic Unidad N. No se genera el quiz.');
  }

  const latest = recursos[0];
  const unitNumber = latest.unit;
  const exam = buscarExamenCierreUnidadQuizSencillo_(id, unitNumber, String(latest.topic.topicId || ''));
  if (exam) {
    throw new Error('QUIZ_UNIDAD_CERRADA: el último recurso académico publicado pertenece a Unidad ' + unitNumber + ' y ya existe un examen activo de esa unidad (' + String(exam.title || '') + ', estado ' + String(exam.state || '') + '). No se genera el quiz.');
  }

  return {
    courseId: id,
    unidadNumero: unitNumber,
    unidadNombre: String(latest.topic.name || '').trim(),
    topicId: String(latest.topic.topicId || '').trim(),
    materialId: String(latest.work.id || '').trim(),
    materialTitle: String(latest.work.title || '').trim(),
    materialCreationTime: String(latest.work.creationTime || ''),
    materialState: String(latest.work.state || QUIZ_SENCILLO_OPEN_UNIT_POLICY.RESOURCE_STATE),
    examenCierreEsperado: 'Examen ' + unitNumber + ' / Examen Unidad ' + unitNumber,
    examenCierreEncontrado: false,
    source: 'LATEST_PUBLISHED_ACADEMIC_COURSEWORK_WITHOUT_UNIT_EXAM'
  };
}

function listarTopicsCursoQuizSencillo_(courseId) {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.Topics.list(String(courseId), {
      pageSize: 100,
      pageToken: token
    });
    (page.topic || []).forEach(function(x) { out.push(x); });
    token = page.nextPageToken;
  } while (token);
  return out;
}

function listarCourseWorkPublicadoQuizSencillo_(courseId) {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.CourseWork.list(String(courseId), {
      pageSize: 100,
      pageToken: token,
      courseWorkStates: QUIZ_SENCILLO_OPEN_UNIT_POLICY.RESOURCE_STATE
    });
    (page.courseWork || []).forEach(function(work) {
      if (String(work.state || '').toUpperCase() === QUIZ_SENCILLO_OPEN_UNIT_POLICY.RESOURCE_STATE) out.push(work);
    });
    token = page.nextPageToken;
  } while (token);
  return out;
}

function esCourseWorkEvidenciaUnidadQuizSencillo_(work) {
  const title = String(work && work.title || '').trim();
  if (!title) return false;
  if (new RegExp(QUIZ_SENCILLO_OPEN_UNIT_POLICY.SIMPLE_QUIZ_PATTERN, 'i').test(title)) return false;
  if (new RegExp(QUIZ_SENCILLO_OPEN_UNIT_POLICY.FINAL_GRADE_PATTERN, 'i').test(title)) return false;
  if (/^Examen\b/i.test(title)) return false;
  return true;
}

function extraerNumeroUnidadTopicQuizSencillo_(topicName) {
  const normalized = String(topicName || '').trim();
  const re = new RegExp(QUIZ_SENCILLO_OPEN_UNIT_POLICY.UNIT_TOPIC_PATTERN, 'i');
  const m = normalized.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function buscarExamenCierreUnidadQuizSencillo_(courseId, unitNumber, topicId) {
  const n = Number(unitNumber);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Número de unidad inválido para comprobar examen de cierre.');
  const wantedTopic = String(topicId || '').trim();
  const exact = new RegExp('^Examen\\s+' + n + '$', 'i');
  const explicitUnit = new RegExp('^Examen\\s+(?:de\\s+(?:la\\s+)?)?Unidad\\s+' + n + '(?:\\b|\\s*[-–—:])', 'i');
  const states = QUIZ_SENCILLO_OPEN_UNIT_POLICY.CLOSED_BY_EXAM_STATES;

  for (let s = 0; s < states.length; s++) {
    let token;
    do {
      const page = Classroom.Courses.CourseWork.list(String(courseId), {
        pageSize: 100,
        pageToken: token,
        courseWorkStates: states[s]
      });
      const hit = (page.courseWork || []).find(function(work) {
        if (String(work.state || '').toUpperCase() === 'DELETED') return false;
        const title = String(work.title || '').trim();
        const sameTopicExam = wantedTopic && String(work.topicId || '') === wantedTopic && /^Examen\b/i.test(title);
        return exact.test(title) || explicitUnit.test(title) || sameTopicExam;
      });
      if (hit) return hit;
      token = page.nextPageToken;
    } while (token);
  }
  return null;
}

function diagnosticarCourseWorkPublicadoUnidadQuizSencillo(courseId) {
  const id = String(courseId || '').trim();
  if (!id) throw new Error('courseId es obligatorio.');
  const topics = listarTopicsCursoQuizSencillo_(id);
  const topicById = {};
  topics.forEach(function(topic) { topicById[String(topic.topicId || '')] = String(topic.name || ''); });
  const works = listarCourseWorkPublicadoQuizSencillo_(id)
    .map(function(work) {
      const topicId = String(work.topicId || '').trim();
      return {
        id: String(work.id || ''),
        title: String(work.title || ''),
        state: String(work.state || ''),
        workType: String(work.workType || ''),
        topicId: topicId,
        topicName: topicById[topicId] || '',
        unitEvidence: esCourseWorkEvidenciaUnidadQuizSencillo_(work),
        creationTime: String(work.creationTime || ''),
        updateTime: String(work.updateTime || ''),
        dueDate: work.dueDate || null,
        dueTime: work.dueTime || null
      };
    })
    .sort(function(a,b){
      return (Date.parse(b.creationTime || b.updateTime || '') || 0) - (Date.parse(a.creationTime || a.updateTime || '') || 0);
    });
  return {
    ok:true,
    courseId:id,
    topicCount:topics.length,
    topics:topics.map(function(topic){ return {topicId:String(topic.topicId || ''),name:String(topic.name || '')}; }),
    publishedCourseWorkCount:works.length,
    publishedCourseWork:works.slice(0,100)
  };
}

function diagnosticarEstructuraMaterialesQuizSencillo_(courseId) {
  return diagnosticarCourseWorkPublicadoUnidadQuizSencillo(courseId);
}

function validarPoliticaUnidadAbiertaQuizSencillo_(policy) {
  if (!policy || policy.RESOURCE_STATE !== 'PUBLISHED' ||
      policy.UNIT_TOPIC_PATTERN !== '^Unidad\\s+(\\d+)$' ||
      policy.SIMPLE_QUIZ_PATTERN !== '^Quiz\\s+\\d+$' ||
      policy.EXAM_TITLE_PREFIX !== 'Examen' ||
      policy.RESOURCE_ORDER_FIELD !== 'creationTime' ||
      policy.REQUIRE_TOPIC !== true || policy.REQUIRE_OPEN_UNIT !== true ||
      policy.EXCLUDE_SIMPLE_QUIZ_FROM_UNIT_EVIDENCE !== true ||
      policy.EXCLUDE_FINAL_GRADE_FROM_UNIT_EVIDENCE !== true ||
      policy.EXCLUDE_EXAM_FROM_UNIT_EVIDENCE !== true ||
      JSON.stringify(policy.CLOSED_BY_EXAM_STATES) !== JSON.stringify(['DRAFT','PUBLISHED'])) {
    throw new Error('La política canónica de unidad abierta para Quiz Sencillo fue debilitada.');
  }
  return true;
}

function diagnosticarUnidadAbiertaQuizSencillo(courseId) {
  return {ok:true, unidad:resolverUnidadAbiertaQuizSencillo_(courseId)};
}

function asignarUnidadAQuizSencilloExistente(courseId, workId) {
  const id = String(courseId || '').trim();
  const wid = String(workId || '').trim();
  if (!id || !wid) throw new Error('courseId y workId son obligatorios para reparar la unidad del quiz.');
  const unidad = resolverUnidadAbiertaQuizSencillo_(id);
  const work = Classroom.Courses.CourseWork.get(id, wid);
  if (String(work.state || '').toUpperCase() === 'DELETED') throw new Error('No se puede reparar un CourseWork DELETED.');
  if (!/^Quiz\s+\d+$/i.test(String(work.title || '').trim())) throw new Error('El recurso no tiene título canónico Quiz N.');
  Classroom.Courses.CourseWork.patch({topicId:unidad.topicId}, id, wid, {updateMask:'topicId'});
  const verified = Classroom.Courses.CourseWork.get(id, wid);
  if (String(verified.topicId || '') !== unidad.topicId) throw new Error('No se pudo verificar la asignación del quiz a ' + unidad.unidadNombre + '.');
  return {
    ok:true,
    courseId:id,
    workId:wid,
    title:String(verified.title || ''),
    state:String(verified.state || ''),
    topicId:String(verified.topicId || ''),
    unidad:unidad
  };
}

function validarUnidadAbiertaQuizSencilloCanonica() {
  validarPoliticaUnidadAbiertaQuizSencillo_(QUIZ_SENCILLO_OPEN_UNIT_POLICY);
  if (extraerNumeroUnidadTopicQuizSencillo_('Unidad 2') !== 2) throw new Error('Regresión: Unidad 2 debe resolverse como unidad 2.');
  if (extraerNumeroUnidadTopicQuizSencillo_('Prácticas') !== null) throw new Error('Regresión: un Topic no unitario no puede convertirse en unidad.');
  if (esCourseWorkEvidenciaUnidadQuizSencillo_({title:'Quiz 2'})) throw new Error('Regresión: Quiz N no puede inferir su propia unidad.');
  if (esCourseWorkEvidenciaUnidadQuizSencillo_({title:'Calificación Unidad 1'})) throw new Error('Regresión: Calificación Unidad N no puede inferir unidad activa.');
  if (esCourseWorkEvidenciaUnidadQuizSencillo_({title:'Examen Unidad 1 - Sistemas Distribuidos'})) throw new Error('Regresión: un examen no puede usarse como material de apertura de unidad.');
  if (!esCourseWorkEvidenciaUnidadQuizSencillo_({title:'Práctica 06 - Ejecutar un cliente de red sencillo'})) throw new Error('Regresión: una práctica publicada sí debe aportar evidencia de unidad.');
  return {
    ok:true,
    resourceState:'PUBLISHED',
    source:'LATEST_PUBLISHED_ACADEMIC_COURSEWORK',
    closedByExamStates:['DRAFT','PUBLISHED'],
    assignment:'REQUIRED'
  };
}
