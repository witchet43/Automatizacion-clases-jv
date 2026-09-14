/**
 * API interna ligera para operaciones académicas rutinarias.
 *
 * Principio: la IA solo expresa intención y parámetros mínimos. Las reglas,
 * validaciones, resolución de IDs, idempotencia y controles de integridad viven
 * en código. Los procesadores de solicitudes de Sheets son adaptadores, no
 * motores de negocio.
 */
const ACADEMIC_OPERATIONS = Object.freeze({
  GRADE_POLICY_DEFAULT: Object.freeze({
    examWeight: 0.70,
    nonExamWeight: 0.30
  }),
  FINAL_GRADE_PREFIX: 'Calificación Unidad '
});

/**
 * Punto de entrada canónico para importar un examen concreto.
 * Parámetro mínimo: {quizId}. courseId es opcional y solo actúa como assertion.
 */
function importarCalificacionesExamen(params) {
  const p = normalizarParametrosOperacion_(params);
  if (!p.quizId) throw new Error('importarCalificacionesExamen requiere quizId.');
  return importarCalificacionesInstrumento_({
    quizId: p.quizId,
    courseId: p.courseId,
    tipoEsperado: 'EXAMEN'
  });
}

/**
 * Motor común para importación de un instrumento registrado en Quizzes.
 * No necesita Form ID ni Classroom ID como parámetros: los resuelve por Quiz ID.
 */
function importarCalificacionesInstrumento_(params) {
  const p = normalizarParametrosOperacion_(params);
  if (!p.quizId) throw new Error('La importación requiere quizId.');

  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const item = resolverInstrumentoPorQuizId_(ss, p.quizId);

  if (p.courseId && String(p.courseId) !== item.courseId) {
    throw new Error('El Quiz ID ' + p.quizId + ' pertenece al curso ' + item.courseId + ', no al curso solicitado ' + p.courseId + '.');
  }
  if (p.tipoEsperado && item.tipo !== String(p.tipoEsperado).toUpperCase()) {
    throw new Error('El instrumento ' + p.quizId + ' es de tipo ' + item.tipo + '; se esperaba ' + String(p.tipoEsperado).toUpperCase() + '.');
  }
  if (item.estado !== QUIZ_PIPELINE.CREATED) {
    throw new Error('El Quiz ID ' + p.quizId + ' no está en estado CREADA; estado actual: ' + item.estado + '.');
  }
  if (!item.courseId || !item.workId || !item.formId) {
    throw new Error('El instrumento ' + p.quizId + ' no tiene completos courseId, Classroom ID y Form ID.');
  }

  const result = procesarCalificacionesQuiz_(item.courseId, item.workId, item.formId, true, p.quizId);
  const resumen = resumenImportacionCalificaciones_(result);

  if (item.colUltimaActualizacion) item.sheet.getRange(item.row, item.colUltimaActualizacion).setValue(new Date());
  if (item.colResultado) item.sheet.getRange(item.row, item.colResultado).setValue(resumen);
  SpreadsheetApp.flush();

  return {
    operacion: 'IMPORTAR_CALIFICACIONES',
    quizId: p.quizId,
    courseId: item.courseId,
    workId: item.workId,
    tipo: item.tipo,
    resumen: resumen,
    detalle: result
  };
}

/**
 * Punto de entrada canónico para el cierre ordinario de una unidad.
 * Parámetros mínimos: {courseId, unidad}. La siguiente unidad es opcional; si
 * existe se usa únicamente como hint verificable para la clasificación.
 */
function cerrarUnidad(params) {
  const p = normalizarParametrosOperacion_(params);
  if (!p.courseId) throw new Error('cerrarUnidad requiere courseId.');
  const unidad = normalizarUnidadOperacion_(p.unidad);
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);

  // 1) Normalización estructural encapsulada. No modifica calificaciones.
  const preclasificacion = preclasificarCourseWorkPorCortes_(p.courseId);
  const reubicacion = reubicarCourseWorkSinUnidad_(ss, p.courseId, unidad, p.unidadSiguiente || '');

  // 2) Gate barato de estructura antes de tocar calificaciones.
  const preflight = preflightCierreUnidad_(ss, p.courseId, unidad);

  // 3) Motores canónicos existentes. Cada uno mantiene su propia idempotencia.
  const revision = revisarTareasCurso_(p.courseId, true);
  const instrumentos = importarYConsolidarInstrumentosUnidad_(ss, p.courseId, unidad);
  const promedios = calcularPromediosUnidad_(p.courseId, unidad, true);
  const cierre = publicarCalificacionUnidadFinal_(
    ss,
    p.courseId,
    unidad,
    ACADEMIC_OPERATIONS.FINAL_GRADE_PREFIX + extraerNumeroUnidad_(unidad)
  );

  return {
    operacion: 'CERRAR_UNIDAD',
    courseId: String(p.courseId),
    unidad: unidad,
    preclasificacion: preclasificacion,
    reubicacion: reubicacion,
    preflight: preflight,
    revision: revision,
    instrumentos: instrumentos,
    promedios: promedios,
    cierre: cierre
  };
}

/**
 * Validación estructural previa al cierre. Solo lee.
 * Detecta temprano CourseWork no calificable, inventario inconsistente y
 * alumnos esperados sin StudentSubmission. No intenta resolverlos por heurística.
 */
function preflightCierreUnidad_(ss, courseId, unidad) {
  const course = Classroom.Courses.get(String(courseId));
  if (!course || String(course.courseState || '').toUpperCase() !== 'ACTIVE') {
    throw new Error('El curso ' + courseId + ' no está ACTIVE o no es accesible.');
  }

  const candidatos = inventarioUnidadDesdeFuentes_(ss, courseId, unidad);
  const vistos = new Set();
  const trabajos = [];

  candidatos.forEach(x => {
    const id = String(x.classroomId || '').trim();
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    const cw = Classroom.Courses.CourseWork.get(String(courseId), id);
    if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') return;
    if (!cw.maxPoints || Number(cw.maxPoints) <= 0) return;
    trabajos.push({
      id: id,
      titulo: String(cw.title || x.titulo || ''),
      esExamen: Boolean(x.esExamen),
      courseWork: cw
    });
  });

  const examenes = trabajos.filter(x => x.esExamen);
  const noExamen = trabajos.filter(x => !x.esExamen);
  if (examenes.length !== 1) {
    throw new Error('Preflight de ' + unidad + ': se esperaba exactamente 1 examen PUBLISHED; encontrados: ' + examenes.length + '.');
  }
  if (!noExamen.length) {
    throw new Error('Preflight de ' + unidad + ': no hay instrumentos no-examen PUBLISHED.');
  }

  const alumnos = listarAlumnosPromedio_(courseId);
  const alumnoPorId = {};
  alumnos.forEach(s => alumnoPorId[String(s.userId)] = s);
  const faltanSubmissions = [];

  trabajos.forEach(w => {
    const subs = entregasPorAlumnoPromedio_(courseId, w.id);
    const esperados = usuariosEsperadosParaCourseWork_(w.courseWork, alumnos);
    esperados.forEach(uid => {
      if (subs[uid]) return;
      const s = alumnoPorId[uid];
      faltanSubmissions.push({
        alumno: s && s.profile && s.profile.name ? s.profile.name.fullName : uid,
        userId: uid,
        trabajo: w.titulo,
        classroomId: w.id
      });
    });
  });

  if (faltanSubmissions.length) {
    throw new Error(
      'Preflight bloqueado: existen ' + faltanSubmissions.length +
      ' alumno(s)/trabajo sin StudentSubmission estructural. ' +
      JSON.stringify(faltanSubmissions).slice(0, 3000)
    );
  }

  return {
    ok: true,
    alumnos: alumnos.length,
    instrumentos: trabajos.length,
    examenes: examenes.length,
    noExamen: noExamen.length,
    faltanSubmissions: 0
  };
}

function usuariosEsperadosParaCourseWork_(cw, alumnos) {
  const mode = String(cw.assigneeMode || 'ALL_STUDENTS').toUpperCase();
  if (mode === 'INDIVIDUAL_STUDENTS') {
    const opts = cw.individualStudentsOptions || {};
    return (opts.studentIds || []).map(String);
  }
  return alumnos.map(s => String(s.userId));
}

function politicaCalificacionUnidad_(courseId) {
  // Punto único de extensión para políticas por curso. Mientras no exista una
  // excepción explícita, todos usan la política transversal 70/30.
  return ACADEMIC_OPERATIONS.GRADE_POLICY_DEFAULT;
}

function resolverInstrumentoPorQuizId_(ss, quizId) {
  const sh = ss.getSheetByName(QUIZ_PIPELINE.QUIZZES_SHEET);
  if (!sh) throw new Error('No existe la hoja ' + QUIZ_PIPELINE.QUIZZES_SHEET + '.');
  const data = sh.getDataRange().getValues();
  if (!data.length) throw new Error('La hoja ' + QUIZ_PIPELINE.QUIZZES_SHEET + ' está vacía.');
  const h = {};
  data[0].forEach((v, i) => h[String(v)] = i);

  const requeridos = ['Quiz ID','Estado','ID del curso','ID actividad Classroom','ID del Form','Tipo instrumento'];
  requeridos.forEach(name => {
    if (h[name] === undefined) throw new Error('Falta la columna requerida en Quizzes: ' + name + '.');
  });

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][h['Quiz ID']] || '').trim() !== String(quizId).trim()) continue;
    return {
      sheet: sh,
      row: i + 1,
      courseId: String(data[i][h['ID del curso']] || '').trim(),
      workId: String(data[i][h['ID actividad Classroom']] || '').trim(),
      formId: String(data[i][h['ID del Form']] || '').trim(),
      tipo: String(data[i][h['Tipo instrumento']] || '').trim().toUpperCase(),
      estado: String(data[i][h['Estado']] || '').trim().toUpperCase(),
      colUltimaActualizacion: h['Última actualización'] === undefined ? 0 : h['Última actualización'] + 1,
      colResultado: h['Resultado / error'] === undefined ? 0 : h['Resultado / error'] + 1
    };
  }
  throw new Error('No se encontró el Quiz ID objetivo: ' + quizId + '.');
}

function resumenImportacionCalificaciones_(result) {
  return 'Importación manual: ' + result.actualizadas + ' actualizadas; ' +
    result.yaCalificadas + ' ya calificadas; ' +
    result.sinCorrespondencia.length + ' sin correspondencia; ' +
    result.noTurnedIn + ' no TURNED_IN.' +
    (result.ajuste ? ' Ajuste aplicado: +' + result.ajuste + ' puntos.' : '');
}

function normalizarParametrosOperacion_(params) {
  if (params === null || params === undefined) return {};
  if (typeof params === 'string' || typeof params === 'number') return {courseId: String(params)};
  return params;
}

function normalizarUnidadOperacion_(unidad) {
  const raw = String(unidad === undefined || unidad === null ? '' : unidad).trim();
  if (!raw) throw new Error('La operación requiere unidad.');
  const n = extraerNumeroUnidad_(raw);
  if (!n) throw new Error('No se pudo identificar el número de unidad en: ' + raw + '.');
  return 'Unidad ' + n;
}

/** Read-only smoke test del contrato ligero. No modifica Classroom ni Sheets. */
function validarContratoOperacionesAcademicas() {
  const p = politicaCalificacionUnidad_('');
  if (Math.abs((p.examWeight + p.nonExamWeight) - 1) > 0.000001) {
    throw new Error('La política de calificación no suma 100%.');
  }
  if (normalizarUnidadOperacion_('1') !== 'Unidad 1') throw new Error('Falló normalización de unidad numérica.');
  if (normalizarUnidadOperacion_('Unidad 2') !== 'Unidad 2') throw new Error('Falló normalización de unidad textual.');
  return {
    ok: true,
    operaciones: ['importarCalificacionesExamen', 'cerrarUnidad'],
    politica: p
  };
}
