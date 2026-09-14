/**
 * Preclasificación defensiva para el cierre oficial de una unidad.
 *
 * Sistemas Operativos conserva durante el curso temas categóricos como
 * Tareas, Prácticas y Actividades en Clase. Antes de calcular promedios,
 * los CourseWork PUBLISHED que sigan en esas categorías se asignan a una
 * Unidad N usando los cortes temporales definidos por los exámenes.
 * La misma unidad se sincroniza en la hoja Tareas por ID Classroom.
 *
 * No publica trabajos, no crea calificaciones y no modifica exámenes/quizzes.
 */
function preclasificarSolicitudPromediosPorCortes_() {
  const ss = SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuración Quizzes');
  if (!sh) throw new Error('No existe la hoja Configuración Quizzes.');

  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 8).getDisplayValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === 'SOLICITUD_PROMEDIOS_UNIDAD') {
      row = i + 1;
      break;
    }
  }
  if (row < 0) return {procesado: false, motivo: 'SIN_SOLICITUD_CONFIGURADA'};

  const estado = String(sh.getRange(row, 2).getDisplayValue() || '').trim().toUpperCase();
  if (estado !== 'SOLICITAR') {
    return {procesado: false, motivo: 'SIN_SOLICITUD_PENDIENTE', estado: estado};
  }

  const courseId = String(sh.getRange(row, 4).getDisplayValue() || '').trim();
  if (!courseId) throw new Error('Falta el ID del curso objetivo para la preclasificación.');

  try {
    const topics = listarTopics_(courseId);
    const topicById = {};
    const unitTopicByNumber = {};
    topics.forEach(t => {
      const id = String(t.topicId);
      const name = String(t.name || '').trim();
      topicById[id] = name;
      const n = extraerNumeroUnidad_(name);
      if (n) unitTopicByNumber[n] = id;
    });

    const all = listarCourseWork_(courseId, ['PUBLISHED', 'DRAFT']);
    const exams = all
      .map(cw => {
        const m = String(cw.title || '').trim().match(/^EXAMEN\s+UNIDAD\s+(\d+)\b/i);
        return m && cw.creationTime
          ? {unit: Number(m[1]), time: new Date(cw.creationTime).getTime(), id: String(cw.id)}
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    const candidates = all.filter(cw => {
      const title = String(cw.title || '').trim();
      if (String(cw.state || '').toUpperCase() !== 'PUBLISHED') return false;
      if (String(cw.workType || '').toUpperCase() !== 'ASSIGNMENT') return false;
      if (/^(QUIZ|EXAMEN|PROYECTO)\b/i.test(title)) return false;
      if (/^CALIFICACI[ÓO]N\s+UNIDAD\b/i.test(title)) return false;
      return /^(TAREA|PR[ÁA]CTICA|ACTIVIDAD)\b/i.test(title);
    });

    const tareas = ss.getSheetByName('Tareas');
    let taskData = null;
    let taskHeaders = null;
    const rowsByClassroomId = {};
    if (tareas && tareas.getLastRow() > 1) {
      taskData = tareas.getDataRange().getValues();
      taskHeaders = {};
      taskData[0].forEach((v, i) => taskHeaders[String(v)] = i);
      if (taskHeaders['ID Classroom'] !== undefined && taskHeaders['Tema'] !== undefined) {
        for (let i = 1; i < taskData.length; i++) {
          const id = String(taskData[i][taskHeaders['ID Classroom']] || '').trim();
          if (!id) continue;
          if (!rowsByClassroomId[id]) rowsByClassroomId[id] = [];
          rowsByClassroomId[id].push(i + 1);
        }
      }
    }

    let movidos = 0;
    let sincronizados = 0;
    const detalle = [];

    candidates.forEach(cw => {
      const workId = String(cw.id);
      const title = String(cw.title || '').trim();
      let topicName = topicById[String(cw.topicId || '')] || '';
      let unitNo = extraerNumeroUnidad_(topicName);
      let moved = false;

      if (esTemaCategoria_(topicName)) {
        unitNo = unidadPorCortes_(cw.creationTime, exams);
        const targetTopicId = unitTopicByNumber[unitNo];
        if (!targetTopicId) {
          throw new Error('No existe el tema verificable Unidad ' + unitNo + ' para clasificar ' + title + ' (' + workId + ').');
        }
        if (!cw.associatedWithDeveloper) {
          throw new Error('No se puede reclasificar el trabajo no asociado al proyecto: ' + title + ' (' + workId + ').');
        }
        if (String(cw.topicId || '') !== String(targetTopicId)) {
          Classroom.Courses.CourseWork.patch(
            {topicId: String(targetTopicId)},
            String(courseId), workId,
            {updateMask: 'topicId'}
          );
          movidos++;
          moved = true;
        }
        topicName = 'Unidad ' + unitNo;
      }

      if (!unitNo) return;

      const rows = rowsByClassroomId[workId] || [];
      rows.forEach(sheetRow => {
        const current = String(tareas.getRange(sheetRow, taskHeaders['Tema'] + 1).getDisplayValue() || '').trim();
        const target = 'Unidad ' + unitNo;
        if (current !== target) {
          tareas.getRange(sheetRow, taskHeaders['Tema'] + 1).setValue(target);
          sincronizados++;
        }
      });

      detalle.push({
        classroomId: workId,
        titulo: title,
        unidad: 'Unidad ' + unitNo,
        movidoEnClassroom: moved,
        filasSincronizadas: rows.length
      });
    });

    SpreadsheetApp.flush();
    return {
      procesado: true,
      courseId: String(courseId),
      candidatos: candidates.length,
      movidos: movidos,
      filasSincronizadas: sincronizados,
      detalle: detalle
    };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    sh.getRange(row, 2).setValue('ERROR');
    sh.getRange(row, 3).setValue('Preclasificación por cortes: ' + msg);
    sh.getRange(row, 6).setValue(new Date());
    throw err;
  }
}
