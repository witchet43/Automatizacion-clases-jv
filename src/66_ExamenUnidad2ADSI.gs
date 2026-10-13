/**
 * Examen final de Unidad 2 (ADSI) construido exclusivamente desde Gamma 2.1–2.4.
 * 25 reactivos, alta dificultad, 100 puntos, sin retroalimentación visible.
 * Limpia la versión inicial DRAFT para conservar un único examen canónico.
 */
function crearExamenUnidad2ADSI() {
  const courseId='871158479566';
  const obsoleteWorkId='889508620258';
  const obsoleteFormId='1klPaT07xI_rD7mA7h8ZKExNZ9K70S_SFhOE3LejU1NY';

  try {
    const oldWork=Classroom.Courses.CourseWork.get(courseId,obsoleteWorkId);
    if(String(oldWork.state||'').toUpperCase()==='DRAFT') {
      Classroom.Courses.CourseWork.remove(courseId,obsoleteWorkId);
    }
  } catch(ignore) {}

  try {
    Drive.Files.update({trashed:true},obsoleteFormId);
  } catch(ignore) {}

  const preguntas=[
    {
      tipo:'CASILLAS',
      pregunta:'Una plataforma universitaria registra fallas de infraestructura, permite al coordinador reasignar técnicos y entrega a la dirección tendencias semestrales. ¿Cuáles tres afirmaciones son las más rigurosas para clasificarla? Selecciona exactamente tres.',
      opciones:[
        'Puede apoyar simultáneamente niveles operativo, táctico y estratégico si cada clasificación se justifica por la decisión que soporta.',
        'El nivel predominante debe inferirse del cargo más alto que tenga acceso a la plataforma.',
        'La clasificación debe sustentarse en evidencia del uso real y no en una sola etiqueta tecnológica.',
        'La coexistencia de varios niveles invalida la clasificación porque un SI solo puede pertenecer a una categoría.',
        'Conviene distinguir la clasificación predominante de otras clasificaciones complementarias válidas.'
      ],
      respuestaCorrecta:'A,C,E',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'Un equipo afirma que su solución es “estratégica” porque será crítica para la universidad y utilizará inteligencia artificial. Con la evidencia disponible, ¿cuál es la objeción más precisa?',
      opciones:[
        'La criticidad y la sofisticación tecnológica no determinan el nivel; debe analizarse la decisión apoyada, su horizonte y la información utilizada.',
        'Todo sistema con inteligencia artificial debe clasificarse como táctico.',
        'Un sistema estratégico necesariamente debe carecer de usuarios operativos.',
        'La importancia organizacional solo permite distinguir entre alcance departamental y organizacional.'
      ],
      respuestaCorrecta:'A',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'Se planea integrar en una versión futura pagos, nómina y autenticación biométrica, pero hoy el sistema únicamente registra solicitudes dentro de un laboratorio. ¿Cuáles dos conclusiones respetan mejor el criterio de alcance? Selecciona exactamente dos.',
      opciones:[
        'El alcance actual debe clasificarse por las funciones efectivamente implementadas.',
        'Las integraciones planeadas pueden documentarse como supuestos o posibilidades futuras, pero no prueban alcance actual.',
        'El impacto potencial permite clasificar desde ahora el sistema como organizacional.',
        'La existencia de varias tecnologías amplía automáticamente el alcance.',
        'Si la solución puede crecer, debe clasificarse por su máximo alcance posible.'
      ],
      respuestaCorrecta:'A,B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'En un sistema de mantenimiento, una misma persona genera reportes como docente y aprueba prioridades como coordinador. ¿Qué principio explica mejor cómo debe modelarse?',
      opciones:[
        'El departamento al que pertenece la persona determina un único rol.',
        'El rol depende de quién actúa y para qué; una misma persona puede desempeñar roles distintos según el contexto.',
        'Debe elegirse el rol de mayor jerarquía y descartar los demás.',
        'Los usuarios no forman parte de los criterios de clasificación de un SI.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'Para justificar que un módulo apoya una decisión específica, ¿cuáles cuatro elementos forman la evidencia mínima trabajada en 2.1? Selecciona exactamente cuatro.',
      opciones:[
        'Necesidad de información.',
        'Evento detonador.',
        'Usuario decisor.',
        'Consecuencia de la decisión.',
        'Lenguaje de programación.',
        'Proveedor de nube.'
      ],
      respuestaCorrecta:'A,B,C,D',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'Un jefe consulta cada mañana ventas acumuladas de las últimas seis semanas para detectar desviaciones respecto a meta y redistribuir personal durante el mes. ¿Qué clasificación predomina?',
      opciones:[
        'Operacional, porque el reporte se consulta diariamente.',
        'Táctica, porque usa agregados, busca excepciones y ajusta recursos en un horizonte de semanas–meses.',
        'Estratégica, porque el usuario tiene responsabilidad gerencial.',
        'Operacional, porque los datos provienen de transacciones.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'La dirección abre un tablero en tiempo real para verificar únicamente que las cajas del día hayan cerrado correctamente. ¿Qué nivel describe mejor esa decisión?',
      opciones:[
        'Estratégico, por el puesto de quien consulta.',
        'Táctico, porque se usa un tablero.',
        'Operacional, porque supervisa una ejecución inmediata y concreta.',
        'Estratégico, porque utiliza información agregada.'
      ],
      respuestaCorrecta:'C',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'¿Cuáles tres asociaciones corresponden mejor a las dimensiones comparativas de los niveles de decisión trabajadas en 2.2? Selecciona exactamente tres.',
      opciones:[
        'Operacional → datos de máxima granularidad, uso continuo y decisiones estructuradas.',
        'Táctico → agregados de corto/mediano plazo, monitoreo de metas y decisiones semi-estructuradas.',
        'Estratégico → fuentes internas y externas, horizonte amplio e incertidumbre alta.',
        'Operacional → fuentes externas predominantes y horizonte de años.',
        'Estratégico → registro transacción por transacción y ejecución repetitiva.'
      ],
      respuestaCorrecta:'A,B,C',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'Un gerente define una regla de reabasto mensual y luego el sistema ejecuta automáticamente cada reorden cuando el inventario cae bajo el umbral. ¿Cuál interpretación es más precisa?',
      opciones:[
        'Toda la operación es táctica porque la regla la configuró un gerente.',
        'Configurar la regla puede ser una decisión táctica; ejecutar cada reorden bajo esa regla es operacional.',
        'La automatización convierte necesariamente el proceso en estratégico.',
        'El nivel depende exclusivamente de la frecuencia con que se ejecute el reorden.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'Un mismo módulo entrega al cajero una transacción individual y al jefe de tienda un resumen semanal. ¿Cuáles dos afirmaciones son correctas? Selecciona exactamente dos.',
      opciones:[
        'El mismo sistema puede apoyar niveles diferentes cuando soporta decisiones diferentes.',
        'La clasificación múltiple debe justificarse con usuario, pregunta, horizonte, detalle de datos, fuentes y acción.',
        'Debe elegirse un único nivel para evitar contradicciones.',
        'El resumen semanal siempre es estratégico.',
        'La transacción individual se vuelve táctica porque comparte la misma base de datos.'
      ],
      respuestaCorrecta:'A,B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'En la jerarquía función → proceso → actividad → tarea, ¿en qué nivel se recomienda construir la matriz IPO trabajada en 2.3?',
      opciones:[
        'Únicamente a nivel de función completa.',
        'A nivel de proceso o actividad.',
        'Solo a nivel de tarea atómica.',
        'A nivel de tecnología utilizada.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'Una solicitud de crédito se procesa con los campos “monto solicitado”, “score” y “adeudos vencidos”; además, la llegada de la solicitud dispara el análisis. ¿Qué tipos de entrada están explícitamente presentes? Selecciona exactamente dos.',
      opciones:[
        'Datos.',
        'Evento.',
        'Salida.',
        'Regla de negocio.',
        'Decisión estratégica.'
      ],
      respuestaCorrecta:'A,B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'Un analista escribe como procesamiento: “analizar datos del cliente”. ¿Cuál es la principal deficiencia según 2.3?',
      opciones:[
        'Describe una transformación demasiado específica.',
        'No explicita una regla de negocio verificable y deja el proceso como caja negra.',
        'Confunde una salida con un actor externo.',
        'Utiliza demasiadas entradas.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'¿Cuáles tres formulaciones describen mejor una salida informacional bien especificada? Selecciona exactamente tres.',
      opciones:[
        'Es resultado del procesamiento y no simplemente el nombre de una actividad.',
        'Tiene un consumidor identificable.',
        'Debe apoyar una decisión o acción concreta.',
        'Siempre debe ser un archivo PDF.',
        'Puede carecer de destinatario si el sistema la almacena.'
      ],
      respuestaCorrecta:'A,B,C',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'El registro de cada venta alimenta, al cierre de semana, un indicador consolidado por canal. ¿Cuál explicación integra mejor 2.2 y 2.3?',
      opciones:[
        'El dato individual puede ser entrada operacional y, una vez agregado, convertirse en entrada para análisis táctico.',
        'Un dato conserva necesariamente el mismo nivel organizacional en cualquier uso.',
        'El agregado semanal convierte automáticamente al sistema en estratégico.',
        'La transformación elimina la necesidad de identificar consumidor y decisión.'
      ],
      respuestaCorrecta:'A',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'En la cadena “función → entrada → regla/proceso → salida → consumidor/decisión”, ¿cuáles tres fallas indican con mayor claridad un análisis incompleto? Selecciona exactamente tres.',
      opciones:[
        'Una entrada sin fuente o formato suficientemente especificado.',
        'Un proceso sin regla de negocio.',
        'Una salida sin consumidor ni decisión asociada.',
        'Una interfaz con más de un color.',
        'Una función con nombre corto.'
      ],
      respuestaCorrecta:'A,B,C',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'Un reporte contiene todos los campos requeridos, llega después de que se tomó la decisión y nadie puede comprobar su fuente. ¿Qué dos dimensiones de calidad fallan de manera directa? Selecciona exactamente dos.',
      opciones:[
        'Completitud.',
        'Oportunidad.',
        'Verificabilidad.',
        'Pertinencia.',
        'Precisión necesariamente.'
      ],
      respuestaCorrecta:'B,C',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'En una matriz IPO se anota como salida “registrar pedido”. ¿Cuál corrección es conceptualmente mejor?',
      opciones:[
        'Mantenerla: toda acción del sistema es una salida.',
        'Cambiarla por un producto de información, por ejemplo “pedido registrado y confirmación enviada al cliente”.',
        'Cambiarla por “información del pedido”.',
        'Moverla a actor externo.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'En un diagrama de contexto, un alumno solicita una beca al sistema. ¿Dónde debe aparecer el alumno?',
      opciones:[
        'Dentro de la frontera porque inicia una función.',
        'Fuera de la frontera como actor humano que intercambia información con el sistema.',
        'Dentro de la frontera si utiliza autenticación institucional.',
        'Fuera del alcance porque no es software.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'El sistema envía una solicitud a una pasarela bancaria y recibe confirmación del pago. ¿Cuáles tres afirmaciones respetan mejor la frontera del sistema? Selecciona exactamente tres.',
      opciones:[
        'La pasarela debe modelarse como sistema externo.',
        'La solicitud de pago y la confirmación deben representarse como flujos con nombres concretos.',
        'Procesar el cargo bancario es responsabilidad externa si lo ejecuta la pasarela.',
        'La pasarela debe dibujarse como módulo interno porque participa en el proceso.',
        'La integración convierte automáticamente el alcance en organizacional.'
      ],
      respuestaCorrecta:'A,B,C',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'¿Cuál diferencia entre “fuera del sistema” y “fuera del alcance” es la más precisa?',
      opciones:[
        'Son sinónimos: todo lo externo está excluido.',
        'Fuera del sistema incluye actores o sistemas que interactúan; fuera del alcance son funciones excluidas explícitamente de esta versión.',
        'Fuera del alcance solo aplica a personas.',
        'Fuera del sistema significa que no existe intercambio de información.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'En un diagrama aparece una flecha etiquetada únicamente como “Datos”. ¿Cuál es la crítica principal?',
      opciones:[
        'Toda flecha debe ser bidireccional.',
        'El flujo debe nombrar la información concreta intercambiada, no una etiqueta genérica.',
        'Las flechas no deben cruzar la frontera.',
        'Un actor externo no puede enviar información.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'CASILLAS',
      pregunta:'Un equipo propone clasificar su solución como DSS. ¿Qué tres evidencias ausentes debilitarían especialmente esa clasificación según 2.4? Selecciona exactamente tres.',
      opciones:[
        'Flujos de análisis histórico agregado.',
        'Usuarios o decisiones de nivel táctico.',
        'Procesamiento orientado a análisis/modelos de decisión.',
        'Una interfaz web moderna.',
        'Autenticación mediante Google.'
      ],
      respuestaCorrecta:'A,B,C',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'Un diagrama muestra operadores que registran solicitudes, reglas rutinarias, confirmaciones inmediatas y ningún flujo de análisis histórico. ¿Qué tipo queda mejor sustentado por la evidencia?',
      opciones:[
        'DSS, porque existe una decisión.',
        'TPS, porque predominan transacciones, usuarios operativos y decisiones rutinarias.',
        'EIS, porque todo sistema genera información.',
        'Estratégico, porque las solicitudes pueden ser importantes.'
      ],
      respuestaCorrecta:'B',puntos:4
    },
    {
      tipo:'OPCION_MULTIPLE',
      pregunta:'Caso integrador: una universidad recibe solicitudes de mantenimiento. El sistema registra cada ticket y asigna técnico por zona/disponibilidad; el coordinador revisa semanalmente tiempos promedio para reasignar cuadrillas; una pasarela externa procesa pagos de proveedores; la dirección considera a futuro usar datos semestrales para presupuesto, pero ese módulo aún no existe. ¿Cuál formulación integra mejor los cuatro subtemas?',
      opciones:[
        'El sistema es estratégico porque la dirección podría usarlo en el futuro; la pasarela forma parte del sistema y el alcance es organizacional.',
        'El núcleo actual es principalmente operacional por el registro/asignación estructurada; existe apoyo táctico por el análisis semanal; la pasarela es externa; y el uso estratégico futuro no debe contarse como alcance implementado.',
        'Debe clasificarse solo como táctico porque el coordinador consulta indicadores y todos los demás usos heredan ese nivel.',
        'La clasificación depende de que la aplicación sea web y de que los pagos estén integrados.'
      ],
      respuestaCorrecta:'B',puntos:4
    }
  ];

  const result=crearExamen({
    courseId:courseId,
    materia:'Análisis y Diseño de Sistemas Computacionales',
    unidad:'Unidad 2',
    temaSubtema:'Evaluación de la Unidad 2',
    titulo:'Examen Unidad 2 - Tipología de Sistemas de Información',
    descripcion:'Examen individual y autocalificable de la Unidad 2, construido exclusivamente a partir de las presentaciones Gamma 2.1, 2.2, 2.3 y 2.4. Los reactivos priorizan aplicación, análisis, integración de criterios y discriminación entre alternativas conceptualmente cercanas. El examen contiene 25 reactivos y suma 100 puntos. Responde con la misma cuenta de Google registrada en Classroom. Las respuestas correctas, claves y retroalimentación no deben mostrarse al finalizar.',
    barajarPreguntas:false,
    preguntas:preguntas
  });

  return {
    ok:true,
    fuente:'Gamma 2.1–2.4',
    dificultad:'ALTA',
    reactivos:25,
    puntos:100,
    result:result
  };
}
