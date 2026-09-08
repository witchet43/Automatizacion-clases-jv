// Compatibilidad temporal: permite que el cierre reciba en H de Configuración Quizzes
// la siguiente unidad ya verificada contra la planeación. Evita inventar unidades.
function reubicarCourseWorkSinUnidad_(ss, courseId, unidadActual) {
  const currentNo = extraerNumeroUnidad_(unidadActual);
  if (!currentNo) throw new Error('No se pudo identificar el número de ' + unidadActual + '.');

  const cfg = ss.getSheetByName('Configuración Quizzes');
  let unidadVerificada = '';
  if (cfg) {
    const vals = cfg.getRange(1, 1, Math.max(cfg.getLastRow(), 1), 8).getDisplayValues();
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === 'SOLICITUD_PROMEDIOS_UNIDAD') {
        unidadVerificada = String(vals[i][7] || '').trim();
        break;
      }
    }
  }

  let topics = listarTopics_(courseId);
  const allWork = listarCourseWorkPublicacion_(courseId);
  const topicById = {};
  topics.forEach(t => topicById[String(t.topicId)] = t);

  const unitNumbersRaw = [];
  const hintedNo = extraerNumeroUnidad_(unidadVerificada);
  if (hintedNo && hintedNo > currentNo) unitNumbersRaw.push(hintedNo);
  topics.forEach(t => {
    const n = extraerNumeroUnidad_(t.name);
    if (n && n > currentNo) unitNumbersRaw.push(n);
  });

  const tareas = ss.getSheetByName('Tareas');
  if (tareas && tareas.getLastRow() > 1) {
    const data = tareas.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID curso']] || '').trim() !== String(courseId)) continue;
      const n = extraerNumeroUnidad_(r[h['Tema']]);
      if (n && n > currentNo) unitNumbersRaw.push(n);
    }
  }

  const quizzes = ss.getSheetByName('Quizzes');
  if (quizzes && quizzes.getLastRow() > 1) {
    const data = quizzes.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID del curso']] || '').trim() !== String(courseId)) continue;
      const n = extraerNumeroUnidad_(r[h['Unidad / tema']]);
      if (n && n > currentNo) unitNumbersRaw.push(n);
    }
  }

  const unitNumbers = Array.from(new Set(unitNumbersRaw)).sort((a, b) => a - b);
  let targetNo = null;
  for (const n of unitNumbers) {
    const closed = allWork.some(w => String(w.title || '').trim() === 'Calificación Unidad ' + n && String(w.state || '').toUpperCase() === 'PUBLISHED');
    if (!closed) { targetNo = n; break; }
  }
  if (!targetNo) throw new Error('No existe una siguiente unidad verificable y no cerrada después de ' + unidadActual + '.');

  const targetName = 'Unidad ' + targetNo;
  let targetTopicId = null;
  try { targetTopicId = buscarTopicIdUnidad_(courseId, targetName); } catch (e) { targetTopicId = null; }
  if (!targetTopicId) {
    const created = Classroom.Courses.Topics.create({name: targetName}, String(courseId));
    targetTopicId = String(created.topicId);
    topics = listarTopics_(courseId);
    Object.keys(topicById).forEach(k => delete topicById[k]);
    topics.forEach(t => topicById[String(t.topicId)] = t);
  }

  const candidates = [];
  if (tareas && tareas.getLastRow() > 1) {
    const data = tareas.getDataRange().getValues();
    const h = {};
    data[0].forEach((v, i) => h[String(v)] = i);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[h['ID curso']] || '').trim() !== String(courseId)) continue;
      if (String(r[h['Estado solicitud']] || '').trim().toUpperCase() !== 'CREADA') continue;
      const id = String(r[h['ID Classroom']] || '').trim(); if (!id) continue;
      const title = String(r[h['Título']] || '').trim();
      const type = String(r[h['Tipo de actividad']] || '').trim().toUpperCase();
      const esExamen = type === 'EXAMEN' || /^EXAMEN\b/i.test(title);
      const esProyecto = type === 'PROYECTO' || /^PROYECTO\b/i.test(title);
      const esElegible = type === 'TAREA' || type === 'PRACTICA' || type === 'PRÁCTICA' || type === 'ACTIVIDAD' || type === 'ACTIVIDAD EN CLASE' || /^TAREA\s*\d+/i.test(title) || /^PR[ÁA]CTICA\s*\d+/i.test(title) || /^ACTIVIDAD\s*\d+/i.test(title);
      if (!esExamen && !esProyecto && esElegible) candidates.push({source:'Tareas',sheet:tareas,row:i+1,topicCol:h['Tema']+1,id:id,title:title});
    }
  }
  if (quizzes && quizzes.getLastRow() > 1) {
    const data = quizzes.getDataRange().getValues(); const h = {};
    data[0].forEach((v,i)=>h[String(v)]=i);
    for (let i=1;i<data.length;i++) {
      const r=data[i]; if (String(r[h['ID del curso']]||'').trim()!==String(courseId)) continue;
      if (String(r[h['Estado']]||'').trim().toUpperCase()!=='CREADA') continue;
      const id=String(r[h['ID actividad Classroom']]||'').trim(); if(!id) continue;
      const title=String(r[h['Título']]||'').trim(); const type=String(r[h['Tipo instrumento']]||'').trim().toUpperCase();
      if ((type==='QUIZ'||/^QUIZ\b/i.test(title)) && !(type==='EXAMEN'||/^EXAMEN\b/i.test(title))) candidates.push({source:'Quizzes',sheet:quizzes,row:i+1,topicCol:h['Unidad / tema']+1,id:id,title:title});
    }
  }

  const seen=new Set(), moved=[];
  candidates.forEach(x=>{
    if(seen.has(x.id)) return; seen.add(x.id);
    const cw=Classroom.Courses.CourseWork.get(String(courseId),String(x.id));
    if(String(cw.state||'').toUpperCase()!=='PUBLISHED') return;
    const topic=cw.topicId?topicById[String(cw.topicId)]:null;
    if(topic && extraerNumeroUnidad_(topic.name)) return;
    if(!cw.associatedWithDeveloper) throw new Error('No se puede mover el trabajo no asociado al proyecto: '+x.title+' ('+x.id+').');
    Classroom.Courses.CourseWork.patch({topicId:String(targetTopicId)},String(courseId),String(x.id),{updateMask:'topicId'});
    x.sheet.getRange(x.row,x.topicCol).setValue(targetName);
    moved.push({id:x.id,titulo:x.title,fuente:x.source,unidadDestino:targetName});
  });
  return {unidadActual:unidadActual,unidadDestino:targetName,topicIdDestino:String(targetTopicId),movidos:moved.length,detalle:moved};
}
