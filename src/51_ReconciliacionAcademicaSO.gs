/**
 * RECONCILIACIÓN ACADÉMICA EXCEPCIONAL — ITQ SISTEMAS OPERATIVOS
 * Caso autorizado por el docente: reconstruye evidencias faltantes de sesiones históricas
 * sin vencimiento, siempre DRAFT, sin alterar recursos PUBLISHED ya existentes.
 * Es idempotente y usa preflight/postflight del Maestro con override explícito de secuencia.
 */
function crearRecursoReconciliacionSO_(spec) {
  const courseId='875776451793';
  const works=listarCourseWorkClase_(courseId);
  const exact=works.find(function(w){return String(w.title||'').trim()===spec.titulo;});
  if(exact) return {reutilizado:true,workId:String(exact.id),estado:String(exact.state||''),title:String(exact.title||''),documentId:(exact.materials||[]).map(function(m){return m.driveFile&&m.driveFile.driveFile?String(m.driveFile.driveFile.id||''):'';}).filter(Boolean)[0]||''};

  const req={operation:'RESOURCE_CREATE',materia:'Sistemas Operativos',temaSubtema:spec.tema,resourceType:spec.tipo,resourceState:'DRAFT',explicitSequenceOverride:true,reconciliation:true};
  preflightDocumentoMaestro(req);
  assertAcademicAutomationWriteEnabled_();

  let documentId=String(spec.documentId||'').trim();
  let documentoCreado=false;
  if(spec.requiereDocumento===true && !documentId){
    const creado=crearGoogleDocumentoPractica_({titulo:spec.titulo,descripcion:spec.descripcion,contenidoDocumento:spec.contenido.join('\n')});
    documentId=String(creado.id);
    documentoCreado=true;
  }

  const p=normalizarCreacionDirecta_({
    courseId:courseId,
    courseKey:'ITQ_SO',
    materia:'Sistemas Operativos',
    temaSubtema:spec.tema,
    unidad:'2',
    topicId:spec.topicId,
    titulo:spec.titulo,
    descripcion:spec.descripcion,
    puntos:100,
    documentId:documentId,
    shareMode:documentId?'STUDENT_COPY':'',
    studentCopy:documentId?true:undefined
  },spec.tipo);

  // Reconciliación histórica: deliberadamente SIN dueDate/dueTime.
  delete p.fechaLimite; delete p.horaLimite; delete p.dueDate; delete p.dueTime;
  const result=crearCourseWorkDirecto_(p);
  const verified=Classroom.Courses.CourseWork.get(courseId,String(result.workId));
  if(String(verified.state||'').toUpperCase()!=='DRAFT') throw new Error('RECONCILIACION_SO: recurso no quedó DRAFT: '+spec.titulo);
  if(verified.dueDate||verified.dueTime) throw new Error('RECONCILIACION_SO: recurso quedó con vencimiento: '+spec.titulo);
  if(documentId){
    const mat=(verified.materials||[]).find(function(m){return m.driveFile&&m.driveFile.driveFile&&String(m.driveFile.driveFile.id||'')===documentId;});
    if(!mat) throw new Error('RECONCILIACION_SO: documento no quedó adjunto: '+spec.titulo);
    if(String(mat.driveFile.shareMode||'').toUpperCase()!=='STUDENT_COPY') throw new Error('RECONCILIACION_SO: adjunto no quedó STUDENT_COPY: '+spec.titulo);
  }
  postflightDocumentoMaestro({ok:true,state:'DRAFT',workId:String(result.workId),documentId:documentId},req);
  return {reutilizado:false,workId:String(result.workId),estado:'DRAFT',title:spec.titulo,documentId:documentId,documentoCreado:documentoCreado};
}

function reconciliarMaterialAcademicoSistemasOperativosITQ(){
  const course=resolverCursoClassroomPorMateria_('Sistemas Operativos');
  if(String(course.id)!=='875776451793'||String(course.name)!=='ITQ - Sistemas Operativos') throw new Error('RECONCILIACION_SO: identidad del curso no coincide con la auditoría.');

  const TOPIC={unidad2:'884914355906',actividades:'872612341045',tareas:'869333855811',practicas:'875974805153'};
  const specs=[
    {sesion:9,tipo:'TAREA',tema:'Programa vs proceso; concepto de proceso',topicId:TOPIC.tareas,titulo:'Tarea 08 - Programa vs proceso; concepto de proceso',documentId:'1-nJcuN0LnKs0FESoOOGEfbEuU5lSaQZk2dL_oNTyhLA',requiereDocumento:true,descripcion:'Preparación previa: distinguir programa, proceso, hilo, PID y recursos antes de la sesión.',contenido:[]},

    {sesion:10,tipo:'ACTIVIDAD',tema:'Estados y transición de procesos',topicId:TOPIC.actividades,titulo:'Actividad 05 - Estados y transición de procesos',documentId:'1y0AgfBQ1JCg0tB0KWHq10mr-V5Moy6Zs8xv2yR5_OZE',requiereDocumento:true,descripcion:'Resolver secuencias de eventos y actualizar correctamente los estados de un proceso; entregar un diagrama final de transiciones.',contenido:[]},
    {sesion:10,tipo:'TAREA',tema:'Estados y transición de procesos',topicId:TOPIC.tareas,titulo:'Tarea 10 - Control e información de procesos',requiereDocumento:true,descripcion:'Preparación para la siguiente sesión: reconocer qué información de un proceso puede consultarse en Windows 10/11.',contenido:['Revisa Microsoft Learn — Processes and Threads: https://learn.microsoft.com/windows/win32/procthread/about-processes-and-threads','Identifica y explica con tus palabras PID, proceso padre (PPID), uso de CPU, memoria y ruta del ejecutable.','En PowerShell ejecuta Get-Process | Select-Object -First 5 Name,Id,CPU,WorkingSet64 y registra una observación sobre lo que sí puedes ver.','Producto: tabla breve con los cinco conceptos y una captura o transcripción de la salida, sin datos personales.']},

    {sesion:11,tipo:'PRACTICA',tema:'Control e información de procesos',topicId:TOPIC.practicas,titulo:'Práctica 04 - Control e información de procesos',requiereDocumento:true,descripcion:'Explorar un proceso real en Windows 10/11 y construir una ficha técnica con información observable.',contenido:['Objetivo: relacionar PID, PPID, nombre, CPU y memoria con la administración de procesos.','1. Ejecuta Get-Process | Select-Object -First 8 Name,Id,CPU,WorkingSet64 y selecciona tres procesos.','2. Para un proceso propio usa Get-CimInstance Win32_Process -Filter "ProcessId = PID" | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CreationDate. Sustituye PID por el elegido.','3. Contrasta PID, memoria y nombre con Administrador de tareas. No finalices procesos del sistema ni ajenos.','4. Distingue entre información observable y datos internos del contexto/PCB que estas herramientas no exponen directamente.','Evidencia: tabla de tres procesos + ficha de un proceso con PID/PPID/CPU/memoria + capturas sin información personal.','Cierre: explica por qué un PID no es una identidad permanente.']},
    {sesion:11,tipo:'TAREA',tema:'Control e información de procesos',topicId:TOPIC.tareas,titulo:'Tarea 11 - Creación y terminación de procesos',requiereDocumento:true,descripcion:'Preparación para creación, espera y terminación de procesos en Windows.',contenido:['Revisa Microsoft Learn — Processes and Threads: https://learn.microsoft.com/windows/win32/procthread/about-processes-and-threads','Describe qué ocurre conceptualmente cuando un proceso crea otro proceso y cuándo termina.','Localiza en PowerShell la ayuda de Start-Process y Wait-Process con Get-Help Start-Process y Get-Help Wait-Process.','Producto: secuencia de 5 pasos desde creación hasta terminación y dos comandos que usarás en clase.']},

    {sesion:12,tipo:'PRACTICA',tema:'Creación y terminación de procesos',topicId:TOPIC.practicas,titulo:'Práctica 05 - Creación y terminación de procesos',requiereDocumento:true,descripcion:'Crear, observar y terminar de forma controlada un proceso propio en Windows 10/11.',contenido:['Objetivo: identificar creación, ejecución, espera y terminación de un proceso hijo.','1. Ejecuta $p = Start-Process notepad.exe -PassThru y registra $p.Id y hora de inicio.','2. Ejecuta Get-Process -Id $p.Id | Select-Object Id,ProcessName,StartTime,Responding.','3. Cierra manualmente Bloc de notas; ejecuta Wait-Process -Id $p.Id -ErrorAction SilentlyContinue y comprueba con Get-Process -Id $p.Id -ErrorAction SilentlyContinue que ya no aparece.','4. Explica la diferencia entre esperar, consultar y forzar la finalización. No uses Stop-Process sobre procesos ajenos.','Evidencia: comandos, salidas comentadas, PID y secuencia temporal.','Cierre: razona qué sucede si el PID ya no existe al esperar.']},
    {sesion:12,tipo:'TAREA',tema:'Creación y terminación de procesos',topicId:TOPIC.tareas,titulo:'Tarea 12 - Procesos e hilos',requiereDocumento:true,descripcion:'Preparación para comparar procesos e hilos.',contenido:['Revisa Microsoft Learn — Processes and Threads: https://learn.microsoft.com/windows/win32/procthread/about-processes-and-threads','Construye una tabla con: espacio de memoria, recursos, identificador, costo de creación, comunicación y aislamiento.','Escribe un ejemplo de una aplicación donde varios hilos compartan datos y un riesgo que pueda aparecer.','Producto: tabla comparativa proceso/hilo y un párrafo de conclusión.']},

    {sesion:13,tipo:'PRACTICA',tema:'Procesos e hilos',topicId:TOPIC.practicas,titulo:'Práctica 06 - Procesos e hilos',requiereDocumento:true,descripcion:'Observar procesos e hilos en Windows 10/11 y ejecutar un ejemplo multihilo seguro.',contenido:['Objetivo: comparar identidad de proceso y concurrencia de hilos en una aplicación propia.','1. En PowerShell ejecuta $p=Get-Process -Id $PID; $p | Select-Object Id,ProcessName,@{N="Hilos";E={$_.Threads.Count}},CPU,WorkingSet64.','2. Ejecuta $jobs=1..3 | ForEach-Object { Start-ThreadJob -ScriptBlock { Start-Sleep -Seconds 5; [System.Threading.Thread]::CurrentThread.ManagedThreadId } }; $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job.','3. Si Start-ThreadJob no está disponible, registra versión de PowerShell y la limitación; no instales software adicional.','4. Consulta nuevamente el número de hilos y explica por qué una observación puntual puede no capturar hilos temporales.','Evidencia: código, salida, tabla antes/durante/después y dos limitaciones de la medición.','Cierre: distingue concurrencia de paralelismo y menciona un riesgo de sincronización.']},
    {sesion:13,tipo:'TAREA',tema:'Procesos e hilos',topicId:TOPIC.tareas,titulo:'Tarea 13 - Fundamentos de planificación del procesador',requiereDocumento:true,descripcion:'Preparación para métricas y objetivos de planificación de CPU.',contenido:['Revisa OSTEP — CPU Scheduling: https://pages.cs.wisc.edu/~remzi/OSTEP/','Define turnaround time, response time, throughput y fairness con tus palabras.','Para tres procesos con tiempos de llegada 0, 1 y 2 y ráfagas 5, 2 y 4, identifica qué datos serían necesarios para calcular las métricas, sin resolver todavía un algoritmo.','Producto: glosario de cuatro métricas + tabla de datos del ejemplo.']},

    {sesion:14,tipo:'ACTIVIDAD',tema:'Fundamentos de planificación del procesador',topicId:TOPIC.actividades,titulo:'Actividad 06 - Fundamentos de planificación del procesador',documentId:'1VFNa44FNkR-hTj8X-M9yl1Z1FbhnUv7vTmf8IPQ6yDo',requiereDocumento:true,descripcion:'Simular una carga de procesos y calcular métricas básicas de planificación del procesador.',contenido:[]},
    {sesion:14,tipo:'TAREA',tema:'Fundamentos de planificación del procesador',topicId:TOPIC.tareas,titulo:'Tarea 14 - FCFS y SJF',requiereDocumento:true,descripcion:'Preparación para comparar FCFS y SJF.',contenido:['Revisa OSTEP — CPU Scheduling: https://pages.cs.wisc.edu/~remzi/OSTEP/','Explica en una frase FCFS y SJF y qué información necesita cada política.','Identifica qué significa convoy effect y escribe un escenario sencillo donde pueda aparecer.','Producto: cuadro comparativo FCFS/SJF con ventajas, limitaciones y dato requerido para decidir el orden.']},

    {sesion:15,tipo:'ACTIVIDAD',tema:'FCFS y SJF',topicId:TOPIC.actividades,titulo:'Actividad 07 - FCFS y SJF',documentId:'1w66SoZLiioKqbdAw-pE-kSdAb6O5szFRDhFPCcKKg4o',requiereDocumento:true,descripcion:'Resolver un conjunto de procesos con FCFS y SJF; construir diagramas de Gantt y comparar espera, retorno y respuesta.',contenido:[]},
    {sesion:15,tipo:'TAREA',tema:'FCFS y SJF',topicId:TOPIC.tareas,titulo:'Tarea 15 - Round Robin y prioridades',documentId:'1kHGQErLPU2OCswKQUHBtk38aFmay-ir6WaFPTyIJCvU',requiereDocumento:true,descripcion:'Preparación para Round Robin, quantum, apropiación y prioridades.',contenido:[]},

    {sesion:16,tipo:'ACTIVIDAD',tema:'Round Robin y prioridades',topicId:TOPIC.actividades,titulo:'Actividad 08 - Round Robin y prioridades',documentId:'1cQPHObZtDV1btCGc6m3DRPYliCEJdEGiQeLHDEfjLys',requiereDocumento:true,descripcion:'Simular Round Robin con distintos quantums y analizar respuesta, overhead, prioridades y riesgo de starvation.',contenido:[]},
    {sesion:16,tipo:'TAREA',tema:'Round Robin y prioridades',topicId:TOPIC.tareas,titulo:'Tarea 16 - Comunicación entre procesos (IPC)',requiereDocumento:true,descripcion:'Preparación para mecanismos IPC en Windows.',contenido:['Revisa Microsoft Learn — Interprocess Communications: https://learn.microsoft.com/windows/win32/ipc/interprocess-communications','Identifica al menos tres mecanismos IPC en Windows y para cada uno indica qué problema resuelve.','Distingue pipe, named pipe y memoria compartida en términos de comunicación y alcance.','Producto: tabla mecanismo / uso / ventaja / limitación y una pregunta técnica que quieras resolver en clase.']}
  ];

  const results=[];
  specs.forEach(function(s){results.push(Object.assign({sesion:s.sesion,tipo:s.tipo},crearRecursoReconciliacionSO_(s)));});

  // Reconciliar trazabilidad de la planeación con la realidad.
  const ss=SpreadsheetApp.openById('1xsmIk26Jn-wyBq6KdW4b7lPrB_1lUHDn7d6pcRivKCI'), sh=ss.getSheetByName('Planeación maestra');
  const values=sh.getDataRange().getDisplayValues(), headers=values[0], idx={};
  headers.forEach(function(h,i){idx[String(h).trim()]=i;});
  const bySession={}; results.forEach(function(r){(bySession[r.sesion]||(bySession[r.sesion]=[])).push(r);});
  for(let rr=1;rr<values.length;rr++){
    const clase=Number(values[rr][idx['Clase']]);
    if(clase<9||clase>16) continue;
    const worksNow=listarCourseWorkClase_(courseId);
    const rel=worksNow.filter(function(w){
      const t=String(w.title||'');
      return (clase===9&&(/Tarea 08 - Programa vs proceso/.test(t)||/Práctica 03 - Programa vs proceso/.test(t)||/Tarea 09 - Estados/.test(t))) ||
             (clase===10&&(/Actividad 05 - Estados/.test(t)||/Tarea 10 - Control/.test(t))) ||
             (clase===11&&(/Práctica 04 - Control/.test(t)||/Tarea 11 - Creación/.test(t))) ||
             (clase===12&&(/Práctica 05 - Creación/.test(t)||/Tarea 12 - Procesos/.test(t))) ||
             (clase===13&&(/Práctica 06 - Procesos/.test(t)||/Tarea 13 - Fundamentos/.test(t))) ||
             (clase===14&&(/Actividad 06 - Fundamentos/.test(t)||/Tarea 14 - FCFS/.test(t))) ||
             (clase===15&&(/Actividad 07 - FCFS/.test(t)||/Tarea 15 - Round Robin/.test(t))) ||
             (clase===16&&(/Actividad 08 - Round Robin/.test(t)||/Tarea 16 - Comunicación/.test(t)));
    });
    const trace=rel.map(function(w){return String(w.title||'')+' ['+String(w.state||'')+'] ID '+String(w.id);}).join(' | ');
    if(idx['ID / estado Classroom']!==undefined) sh.getRange(rr+1,idx['ID / estado Classroom']+1).setValue(trace);
    if(idx['Estado integral de la sesión']!==undefined) sh.getRange(rr+1,idx['Estado integral de la sesión']+1).setValue('RECONCILIADA — recursos académicos verificados contra Classroom real; nuevos recursos en DRAFT sin vencimiento.');
  }
  SpreadsheetApp.flush();

  return auditarReconciliacionSistemasOperativosITQ();
}

function auditarReconciliacionSistemasOperativosITQ(){
  const course=resolverCursoClassroomPorMateria_('Sistemas Operativos'), courseId=String(course.id), works=listarCourseWorkClase_(courseId);
  const expected=[
    ['Tarea 08 - Programa vs proceso; concepto de proceso','DRAFT'],
    ['Práctica 03 - Programa vs proceso; concepto de proceso','LEGACY'],
    ['Tarea 09 - Estados y transición de procesos','LEGACY'],
    ['Actividad 05 - Estados y transición de procesos','DRAFT'],
    ['Tarea 10 - Control e información de procesos','DRAFT'],
    ['Práctica 04 - Control e información de procesos','DRAFT'],
    ['Tarea 11 - Creación y terminación de procesos','DRAFT'],
    ['Práctica 05 - Creación y terminación de procesos','DRAFT'],
    ['Tarea 12 - Procesos e hilos','DRAFT'],
    ['Práctica 06 - Procesos e hilos','DRAFT'],
    ['Tarea 13 - Fundamentos de planificación del procesador','DRAFT'],
    ['Actividad 06 - Fundamentos de planificación del procesador','DRAFT'],
    ['Tarea 14 - FCFS y SJF','DRAFT'],
    ['Actividad 07 - FCFS y SJF','DRAFT'],
    ['Tarea 15 - Round Robin y prioridades','DRAFT'],
    ['Actividad 08 - Round Robin y prioridades','DRAFT'],
    ['Tarea 16 - Comunicación entre procesos (IPC)','DRAFT']
  ];
  const rows=[],missing=[],wrongState=[],dueFound=[],duplicates=[];
  expected.forEach(function(e){
    const hits=works.filter(function(w){return String(w.title||'').trim()===e[0];});
    if(!hits.length){missing.push(e[0]);return;}
    if(hits.length>1) duplicates.push({title:e[0],ids:hits.map(function(w){return String(w.id);})});
    hits.forEach(function(w){
      if(e[1]==='DRAFT'&&String(w.state||'').toUpperCase()!=='DRAFT') wrongState.push({title:e[0],state:w.state,id:String(w.id)});
      if(e[1]==='DRAFT'&&(w.dueDate||w.dueTime)) dueFound.push({title:e[0],id:String(w.id),dueDate:w.dueDate||null,dueTime:w.dueTime||null});
      rows.push({title:e[0],id:String(w.id),state:String(w.state||''),expected:e[1],materials:(w.materials||[]).length});
    });
  });
  const clean=missing.length===0&&wrongState.length===0&&dueFound.length===0&&duplicates.length===0;
  if(!clean) throw new Error('AUDITORIA_RECONCILIACION_SO_NO_LIMPIA: '+JSON.stringify({missing:missing,wrongState:wrongState,dueFound:dueFound,duplicates:duplicates}));
  return {ok:true,clean:true,courseId:courseId,courseName:course.name,expectedCount:expected.length,missing:missing,wrongState:wrongState,dueFound:dueFound,duplicates:duplicates,resources:rows,legacyPublished:rows.filter(function(x){return x.expected==='LEGACY';})};
}

function validarReconciliacionAcademicaSO(){
  if(ACADEMIC_POLICY.CLASSROOM.DEFAULT_COURSEWORK_STATE!=='DRAFT') throw new Error('Reconciliación requiere DRAFT.');
  if(typeof preflightDocumentoMaestro!=='function'||typeof postflightDocumentoMaestro!=='function') throw new Error('Reconciliación requiere guardrails del Maestro.');
  return {ok:true,mode:'HISTORICAL_RECONCILIATION',state:'DRAFT',due:'NONE',sequenceOverride:'EXPLICIT_ONLY',idempotent:true};
}
