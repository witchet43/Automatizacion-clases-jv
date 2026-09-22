/**
 * Corrección puntual de formato para la Tarea 02 de Ética y Legislación Informática.
 * Nunca crea trabajo nuevo ni toca estado, vencimiento, tema, nota o materiales.
 */
function corregirFormatoTarea02Etica(){
  const courseId='871149624583';
  const workId='869495257435';
  const title='Tarea 02 - Reconocimiento inicial de riesgos informáticos';
  const old=Classroom.Courses.CourseWork.get(courseId,workId);
  if(String(old.id)!==workId||String(old.title||'').trim()!==title||
      ['DRAFT','PUBLISHED'].indexOf(String(old.state||'').toUpperCase())<0||Number(old.maxPoints)!==100)
    throw new Error('TAREA02_ETICA_IDENTITY: solo se permite reformatear la Tarea 02 exacta de 100 puntos, sin cambiar su estado actual.');

  const source=String(old.description||'').trim();
  const expected=[
    'Prepárate para la siguiente sesión, tema 2.3 Riesgos informáticos.',
    'NIST SP 1299',
    'https://www.nist.gov/publications/nist-cybersecurity-framework-20-resource-overview-guide-spanish-translation',
    'un servicio digital real que utilices',
    'un activo digital que deba protegerse',
    'una amenaza plausible',
    'una vulnerabilidad o condición de exposición',
    'un impacto posible si el evento ocurre',
    'una explicación de 4 a 6 líneas',
    'No clasifiques ni priorices todavía el riesgo',
    'Conserva la ficha para la comprobación de entrada'
  ];
  expected.forEach(function(phrase){
    if(source.toLowerCase().indexOf(phrase.toLowerCase())<0)throw new Error('TAREA02_ETICA_CONTENT: falta elemento original "'+phrase+'"; no se reescribe la tarea.');
  });
  const formatted=[
    'INDICACIONES PARA EL ALUMNO',
    '',
    'Utiliza tu computadora personal con Windows.',
    '',
    'Prepárate para la siguiente sesión, tema 2.3 Riesgos informáticos.',
    '',
    'MATERIAL DE CONSULTA',
    '',
    'Revisa la traducción oficial al español de NIST SP 1299, “NIST Cybersecurity Framework 2.0: Resource & Overview Guide”:',
    'https://www.nist.gov/publications/nist-cybersecurity-framework-20-resource-overview-guide-spanish-translation',
    '',
    'No necesitas memorizar el marco completo. Concéntrate en cómo se presenta la gestión del riesgo de ciberseguridad y en reconocer los elementos básicos de una situación de riesgo.',
    '',
    'DESARROLLO',
    '',
    'Selecciona un servicio digital real que utilices y redacta, con tus propias palabras, una ficha breve que incluya:',
    '',
    '1. Un activo digital que deba protegerse.',
    '',
    '2. Una amenaza plausible.',
    '',
    '3. Una vulnerabilidad o condición de exposición.',
    '',
    '4. Un impacto posible si el evento ocurre.',
    '',
    '5. Una explicación de 4 a 6 líneas sobre cómo se relacionan esos cuatro elementos.',
    '',
    'No clasifiques ni priorices todavía el riesgo; esa parte se trabajará posteriormente en clase.',
    '',
    'EVIDENCIA DE ENTREGA',
    '',
    'Conserva la ficha para la comprobación de entrada. La ficha breve con los cinco elementos anteriores es la evidencia previa de esta tarea.'
  ].join('\n');
  const canonical=normalizarInstruccionesDidacticas_(formatted,'TAREA');
  if(canonical!==formatted)throw new Error('TAREA02_ETICA_FORMAT: no cumple el formato canónico idempotente.');
  validarFormatoDescripcionClassroom_(formatted,'TAREA');
  if(source!==formatted){
    if(source.startsWith('INDICACIONES PARA EL ALUMNO\n'))
      throw new Error('TAREA02_ETICA_FORMAT: el borrador fue reformateado de otra manera; no sobrescribir ediciones ajenas.');
    Classroom.Courses.CourseWork.patch({description:formatted},courseId,workId,{updateMask:'description'});
  }
  const now=Classroom.Courses.CourseWork.get(courseId,workId);
  const same=function(key){
    return JSON.stringify(now[key]===undefined?null:now[key])===
      JSON.stringify(old[key]===undefined?null:old[key]);
  };
  if(String(now.description||'')!==formatted||String(now.state||'')!==String(old.state||'')||
      ['id','title','workType','topicId','maxPoints','dueDate','dueTime','materials'].some(function(k){return !same(k);}))
    throw new Error('TAREA02_ETICA_POSTFLIGHT: no se confirmó formato nuevo o preservación de los demás campos.');
  const ss=SpreadsheetApp.openById(QUIZ_PIPELINE.SPREADSHEET_ID);
  const sh=requireSheet_(ss,'Tareas');
  const records=readObjects_(sh).filter(function(r){
    return String(r.data['ID curso']||'')===courseId&&String(r.data['ID Classroom']||'')===workId&&
      String(r.data['Título']||'')===title;
  });
  if(records.length!==1)throw new Error('TAREA02_ETICA_AUDIT: debe existir una única fila original en Tareas.');
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const descCol=headers.indexOf('Instrucciones');
  if(descCol<0)throw new Error('TAREA02_ETICA_AUDIT: falta columna Instrucciones.');
  if(String(records[0].data['Instrucciones']||'')!==formatted)
    sh.getRange(records[0].row,descCol+1).setValue(formatted);
  if(String(sh.getRange(records[0].row,descCol+1).getDisplayValue())!==formatted)
    throw new Error('TAREA02_ETICA_AUDIT: no coincidió la descripción de Sheets con Classroom.');
  return {ok:true,courseId:courseId,workId:workId,title:title,state:String(now.state),
    changed:source!==formatted,formatVerified:true,auditVerified:true,
    alteredFields:['description'],noNewCourseWork:true};
}

/** Diagnóstico de solo lectura para evitar modificar una versión equivocada. */
function diagnosticarTarea02EticaFormato(){
 const courseId='871149624583',workId='869495257435';
 const w=Classroom.Courses.CourseWork.get(courseId,workId);
 return {ok:true,readOnly:true,courseId:courseId,workId:String(w.id||''),
 title:String(w.title||''),state:String(w.state||''),points:Number(w.maxPoints||0),
 topicId:String(w.topicId||''),description:String(w.description||''),
 dueDate:w.dueDate||null,dueTime:w.dueTime||null,materials:w.materials||[]};
}
