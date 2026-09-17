/**
 * UNIDAD ABIERTA CANÓNICA PARA QUIZ SENCILLO / DE ASISTENCIA
 *
 * Fuente de verdad:
 * 1) último material didáctico PUBLISHED del curso en Google Classroom;
 * 2) el Topic de ese material debe ser exactamente Unidad N;
 * 3) si existe CourseWork activo titulado exactamente Examen N, esa unidad se
 *    considera cerrada y no se permite crear/asignar un Quiz Sencillo.
 */
const QUIZ_SENCILLO_OPEN_UNIT_POLICY = Object.freeze({
  MATERIAL_STATE: 'PUBLISHED',
  UNIT_TOPIC_PATTERN: '^Unidad\\s+(\\d+)$',
  EXAM_TITLE_PREFIX: 'Examen ',
  CLOSED_BY_EXAM_STATES: Object.freeze(['DRAFT', 'PUBLISHED']),
  MATERIAL_ORDER_FIELD: 'creationTime',
  REQUIRE_TOPIC: true,
  REQUIRE_OPEN_UNIT: true
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

  const materiales = listarMaterialesPublicadosQuizSencillo_(id)
    .map(function(material) {
      const topicId = String(material.topicId || '').trim();
      const topic = topicById[topicId] || null;
      const unit = topic ? extraerNumeroUnidadTopicQuizSencillo_(topic.name) : null;
      return { material: material, topic: topic, unit: unit };
    })
    .filter(function(x) { return x.topic && Number.isInteger(x.unit) && x.unit > 0; })
    .sort(function(a, b) {
      const ta = Date.parse(String(a.material.creationTime || a.material.updateTime || '')) || 0;
      const tb = Date.parse(String(b.material.creationTime || b.material.updateTime || '')) || 0;
      return tb - ta;
    });

  if (!materiales.length) {
    throw new Error('QUIZ_SIN_UNIDAD_ABIERTA: no existe material didáctico PUBLISHED asignado a un Topic canónico Unidad N. No se genera el quiz.');
  }

  const latest = materiales[0];
  const unitNumber = latest.unit;
  const expectedExamTitle = QUIZ_SENCILLO_OPEN_UNIT_POLICY.EXAM_TITLE_PREFIX + unitNumber;
  const exam = buscarExamenCierreUnidadQuizSencillo_(id, expectedExamTitle);
  if (exam) {
    throw new Error('QUIZ_UNIDAD_CERRADA: el último material publicado pertenece a Unidad ' + unitNumber + ' y ya existe ' + expectedExamTitle + ' activo (estado ' + String(exam.state || '') + '). No se genera el quiz.');
  }

  return {
    courseId: id,
    unidadNumero: unitNumber,
    unidadNombre: String(latest.topic.name || '').trim(),
    topicId: String(latest.topic.topicId || '').trim(),
    materialId: String(latest.material.id || '').trim(),
    materialTitle: String(latest.material.title || '').trim(),
    materialCreationTime: String(latest.material.creationTime || ''),
    materialState: String(latest.material.state || QUIZ_SENCILLO_OPEN_UNIT_POLICY.MATERIAL_STATE),
    examenCierreEsperado: expectedExamTitle,
    examenCierreEncontrado: false,
    source: 'LATEST_PUBLISHED_COURSEWORK_MATERIAL_WITHOUT_EXAM'
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

function listarMaterialesPublicadosQuizSencillo_(courseId) {
  let token;
  const out = [];
  do {
    const page = Classroom.Courses.CourseWorkMaterials.list(String(courseId), {
      pageSize: 100,
      pageToken: token,
      courseWorkMaterialStates: [QUIZ_SENCILLO_OPEN_UNIT_POLICY.MATERIAL_STATE]
    });
    (page.courseWorkMaterial || []).forEach(function(material) {
      if (String(material.state || '').toUpperCase() === QUIZ_SENCILLO_OPEN_UNIT_POLICY.MATERIAL_STATE) out.push(material);
    });
    token = page.nextPageToken;
  } while (token);
  return out;
}

function extraerNumeroUnidadTopicQuizSencillo_(topicName) {
  const normalized = String(topicName || '').trim();
  const re = new RegExp(QUIZ_SENCILLO_OPEN_UNIT_POLICY.UNIT_TOPIC_PATTERN, 'i');
  const m = normalized.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function buscarExamenCierreUnidadQuizSencillo_(courseId, expectedTitle) {
  const wanted = String(expectedTitle || '').trim().toLowerCase();
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
        return String(work.title || '').trim().toLowerCase() === wanted &&
          String(work.state || '').toUpperCase() !== 'DELETED';
      });
      if (hit) return hit;
      token = page.nextPageToken;
    } while (token);
  }
  return null;
}

function validarPoliticaUnidadAbiertaQuizSencillo_(policy) {
  if (!policy || policy.MATERIAL_STATE !== 'PUBLISHED' ||
      policy.UNIT_TOPIC_PATTERN !== '^Unidad\\s+(\\d+)$' ||
      policy.EXAM_TITLE_PREFIX !== 'Examen ' ||
      policy.MATERIAL_ORDER_FIELD !== 'creationTime' ||
      policy.REQUIRE_TOPIC !== true || policy.REQUIRE_OPEN_UNIT !== true ||
      JSON.stringify(policy.CLOSED_BY_EXAM_STATES) !== JSON.stringify(['DRAFT','PUBLISHED'])) {
    throw new Error('La política canónica de unidad abierta para Quiz Sencillo fue debilitada.');
  }
  return true;
}

function diagnosticarUnidadAbiertaQuizSencillo(courseId) {
  return {ok:true, unidad:resolverUnidadAbiertaQuizSencillo_(courseId)};
}

function diagnosticarAutorizacionMaterialesClassroom() {
  const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  const status = info.getAuthorizationStatus();
  return {
    ok:true,
    authorizationStatus:String(status),
    authorizationRequired:String(status) === 'REQUIRED',
    authorizationUrl:String(info.getAuthorizationUrl() || ''),
    scope:'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly'
  };
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
  return {
    ok:true,
    materialState:'PUBLISHED',
    source:'LATEST_PUBLISHED_COURSEWORK_MATERIAL',
    closedByExamStates:['DRAFT','PUBLISHED'],
    assignment:'REQUIRED'
  };
}
