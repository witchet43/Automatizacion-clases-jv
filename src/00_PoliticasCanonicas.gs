/**
 * POLÍTICAS CANÓNICAS EJECUTABLES
 * Fuente única para parámetros deterministas. El Maestro conserva intención
 * y política académica; el código contiene ejecución, validaciones e invariantes.
 */
const ACADEMIC_POLICY = Object.freeze({
  EXECUTION: Object.freeze({
    RESOURCE_CREATION_MODE: 'DIRECT_SCRIPT',
    SHEETS_ROLE: 'AUDIT_AND_CONFIGURATION_ONLY',
    MONITOR_REQUIRED_FOR_CREATION: false,
    LEGACY_MONITOR_COMPATIBILITY: true,
    DIRECT_RESOURCE_TYPES: Object.freeze(['ACTIVIDAD','TAREA','PRACTICA','QUIZ','QUIZ_SENCILLO','EXAMEN']),
    CANONICAL_RESOURCE_ENTRYPOINTS: Object.freeze(['crearActividad','crearTarea','crearPractica','crearQuiz','crearQuizSencillo','crearExamen'])
  }),
  ERROR_REPORTING: Object.freeze({
    NOTIFY_ON_ERROR: true,
    SILENT_FAILURE_ALLOWED: false,
    PRIMARY_CHANNEL: 'EMAIL',
    AUDIT_LOG: true,
    SCRIPT_PROPERTY_EMAIL: 'ACADEMIC_ERROR_NOTIFICATION_EMAIL',
    LEGACY_ERROR_WATCH: true,
    PRESERVE_ORIGINAL_EXCEPTION: true
  }),
  CLASSROOM: Object.freeze({
    DIDACTIC_INSTRUCTIONS: Object.freeze({PERSONAL_WINDOWS_DEVICE:true,EXPLAIN_COMMANDS:true,REMOVE_ADMINISTRATIVE_TEXT:true,FOR_ALL_SUBJECTS:true,FORMAT_REQUIRED:true}),
    DEFAULT_COURSEWORK_STATE: 'DRAFT',
    DEFAULT_POINTS: 100,
    DEFAULT_TOPIC_PREFIX: 'Unidad ',
    FINAL_GRADE_PREFIX: 'Calificación Unidad ',
    FINAL_GRADE_COURSEWORK_STATE: 'PUBLISHED',
    AUTOMATIC_GRADE_FIELD: 'draftGrade',
    AUTOMATIC_ASSIGNED_GRADE: false,
    AUTOMATIC_RETURN: false,
    MANUAL_PUBLICATION_REQUIRED: true,
    ACTIVITY_IN_CLASS_DUE: Object.freeze({
      REQUIRED: true,
      DEFAULT: 'SESSION_END',
      MAXIMUM: 'SESSION_END',
      REQUIRES_SESSION_CONTEXT: true,
      PAST_SESSION_CREATION: 'BLOCK',
      DUE_MUST_BE_FUTURE: true,
      SESSION_DATE_PARAM: 'fechaSesion',
      SESSION_END_PARAM: 'horaFinSesion',
      TIMEZONE: 'America/Mexico_City',
      UTC_OFFSET_MINUTES: -360
    }),
    TASK_DUE: Object.freeze({
      REQUIRED: true,
      DEFAULT: 'NEXT_SESSION_START',
      MAXIMUM: 'NEXT_SESSION_START',
      REQUIRES_NEXT_SESSION_CONTEXT: true,
      PAST_NEXT_SESSION_CREATION: 'BLOCK',
      DUE_MUST_BE_FUTURE: true,
      NEXT_SESSION_DATE_PARAM: 'fechaSiguienteSesion',
      NEXT_SESSION_START_PARAM: 'horaInicioSiguienteSesion',
      TIMEZONE: 'America/Mexico_City',
      UTC_OFFSET_MINUTES: -360
    }),
    PRACTICE: Object.freeze({
      DUE_MODE: 'NONE',
      DUE_ALLOWED: false,
      GOOGLE_DOCUMENT_REQUIRED: true,
      GOOGLE_DOCUMENT_MIME: 'application/vnd.google-apps.document',
      STUDENT_COPY_REQUIRED: true,
      SHARE_MODE: 'STUDENT_COPY',
      CREATE_GOOGLE_DOCUMENT_IF_MISSING: true
    }),
    SIMPLE_QUIZ: Object.freeze({
      TITLE_PREFIX: 'Quiz ',
      SEQUENCE_SOURCE: 'CLASSROOM',
      EMPTY_ASSIGNMENT: true,
      STATE: 'DRAFT',
      UNIT_ASSIGNMENT_REQUIRED: true,
      UNIT_SOURCE: 'LATEST_PUBLISHED_ACADEMIC_COURSEWORK_WITHOUT_UNIT_EXAM',
      UNIT_RESOURCE_STATE: 'PUBLISHED',
      UNIT_EXCLUDE_SIMPLE_QUIZ: true,
      UNIT_EXCLUDE_FINAL_GRADE: true,
      UNIT_EXCLUDE_EXAM: true,
      UNIT_CLOSE_EXAM_STATES: Object.freeze(['DRAFT','PUBLISHED']),
      DUE_MODE: 'NEXT_NATURAL_HOUR',
      DUE_STRICTLY_AFTER_REQUEST: true,
      PAST_DUE_CREATION: 'BLOCK',
      REQUEST_TIME_PARAM: 'solicitadoEnLocal',
      TIMEZONE: 'America/Mexico_City',
      UTC_OFFSET_MINUTES: -360
    })
  }),
  UNIT_GRADING: Object.freeze({
    EXAM_WEIGHT: 0.70,
    NON_EXAM_WEIGHT: 0.30,
    MISSING_GRADE_VALUE: 0,
    UNASSIGNED_COUNTS_AS_MISSING: true,
    SCOPE: 'EXACT_UNIT_PUBLISHED',
    FINAL_ROUNDING: 'NEAREST_INTEGER',
    RECALC_OVERWRITES_REPORT: true,
    RECALC_OVERWRITES_FINAL_DRAFT: true,
    TOUCH_OTHER_UNITS: false
  }),
  FORMS: Object.freeze({
    VERIFIED_EMAIL: true,
    LIMIT_ONE_RESPONSE: true,
    MANUAL_EMAIL_QUESTION_ALLOWED: false,
    SEND_RESPONSE_COPY: false
  }),
  QUIZ: Object.freeze({
    FEEDBACK_REQUIRED: true,
    PRACTICE_QUIZ_MIN_ITEMS: 3,
    PRACTICE_QUIZ_MAX_ITEMS: 5,
    ENTRANCE_QUIZ_MIN_ITEMS: 3,
    ENTRANCE_QUIZ_MAX_ITEMS: 5
  }),
  EXAM: Object.freeze({
    STANDARD_ITEM_COUNT: 25,
    STANDARD_TOTAL_POINTS: 100,
    INITIAL_FEEDBACK_VISIBLE: false,
    MIN_TRACEABLE_ITEMS: 13,
    MIN_APPLICATION_ANALYSIS_RATIO: 0.70
  }),
  DOCUMENTS: Object.freeze({
    PRACTICE_STUDENT_COPY: true,
    PRACTICE_DOCUMENT_FORMAT: 'GOOGLE_DOC',
    ACTIVITY_DOC_STUDENT_COPY: true,
    TASK_STUDENT_COPY_DEFAULT: false,
    PRACTICE_REFLECTION_COUNT: 3,
    CANONICAL_PRACTICE_ACTIVITY_FOLDER: 'Prácticas y Actividades',
    DUPLICATE_VERSION_FILES_ALLOWED: false
  }),
  NAMING: Object.freeze({
    INSTITUTIONS: Object.freeze(['ITQ', 'UMx', 'UAQ']),
    COURSE_FOLDER_PATTERN: '<SIGLA> - <Nombre oficial de la materia>',
    PRACTICE_PREFIX: 'Práctica ',
    TASK_PREFIX: 'Tarea ',
    ACTIVITY_PREFIX: 'Actividad ',
    UNIT_PREFIX: 'Unidad '
  }),
  GAMMA: Object.freeze({
    TITLE_PATTERN: '<número del subtema> - <nombre del subtema>',
    MAX_SLIDES: 25,
    ORDINARY_MINUTES_MIN: 15,
    ORDINARY_MINUTES_MAX: 25,
    ONE_CANONICAL_PER_SESSION: true
  }),
  CALENDAR: Object.freeze({
    CANONICAL_SOURCE: 'CLASSROOM_COURSE_CALENDAR',
    PRIMARY_ALLOWED_AS_CANONICAL: false,
    EVENT_TITLE_PATTERN: '<SIGLA> | <Nombre oficial de la materia> | Aula <aula verificada>',
    DESCRIPTION_FIELDS: Object.freeze(['Unidad','Tema/Subtema','Tarea previa','Actividad en clase','Práctica formal','Evaluación/Proyecto','Tarea siguiente'])
  }),
  COURSE_OVERRIDES: Object.freeze({
    ITQ_SISTEMAS_OPERATIVOS: Object.freeze({
      PLATFORM: 'WINDOWS_10_11',
      TOPICS: Object.freeze({PRACTICE:'Prácticas',TASK:'Tareas',ACTIVITY:'Actividades en Clase'}),
      TASK_STUDENT_COPY: true
    }),
    UAQ_SISTEMAS_DISTRIBUIDOS: Object.freeze({
      PRACTICE_DOMINANT: true,
      GAMMA_MINUTES_MIN: 15,
      GAMMA_MINUTES_MAX: 20,
      GAMMA_REFLECTION_QUESTIONS_DEFAULT: 0,
      FORMAL_PRACTICE_MINUTES_TARGET: 60
    })
  })
});
function politicaAcademicaCanonica_(){return ACADEMIC_POLICY;}
function politicaCurso_(courseKey){const key=String(courseKey||'').trim().toUpperCase();return ACADEMIC_POLICY.COURSE_OVERRIDES[key]||Object.freeze({});}
function redondearCalificacionFinalCanonica_(value){const n=Number(value);if(!Number.isFinite(n))throw new Error('La calificación final debe ser numérica.');return Math.round(n);}
function validarPoliticasCanonicas_(){
  const p=ACADEMIC_POLICY;
  if(p.EXECUTION.RESOURCE_CREATION_MODE!=='DIRECT_SCRIPT'||p.EXECUTION.SHEETS_ROLE!=='AUDIT_AND_CONFIGURATION_ONLY'||p.EXECUTION.MONITOR_REQUIRED_FOR_CREATION!==false) throw new Error('La creación directa por script debe ser el camino canónico.');
  if(!p.ERROR_REPORTING||p.ERROR_REPORTING.NOTIFY_ON_ERROR!==true||p.ERROR_REPORTING.SILENT_FAILURE_ALLOWED!==false||p.ERROR_REPORTING.PRIMARY_CHANNEL!=='EMAIL'||p.ERROR_REPORTING.PRESERVE_ORIGINAL_EXCEPTION!==true) throw new Error('La política de notificación de errores fue debilitada.');
  if(Math.abs((p.UNIT_GRADING.EXAM_WEIGHT+p.UNIT_GRADING.NON_EXAM_WEIGHT)-1)>0.000001) throw new Error('La ponderación canónica de unidad no suma 100%.');
  if(p.CLASSROOM.DEFAULT_COURSEWORK_STATE!=='DRAFT') throw new Error('El estado automático ordinario de Classroom debe ser DRAFT.');
  const did=p.CLASSROOM.DIDACTIC_INSTRUCTIONS;
  if(!did||did.PERSONAL_WINDOWS_DEVICE!==true||did.EXPLAIN_COMMANDS!==true||did.REMOVE_ADMINISTRATIVE_TEXT!==true||did.FOR_ALL_SUBJECTS!==true||did.FORMAT_REQUIRED!==true) throw new Error('La didáctica transversal (Windows personal, comandos explicados, sin texto administrativo) es obligatoria.');
  if(p.CLASSROOM.AUTOMATIC_GRADE_FIELD!=='draftGrade'||p.CLASSROOM.AUTOMATIC_ASSIGNED_GRADE!==false||p.CLASSROOM.AUTOMATIC_RETURN!==false) throw new Error('La política automática de calificaciones debe ser DRAFT_ONLY.');
  const activityDue=p.CLASSROOM.ACTIVITY_IN_CLASS_DUE;
  if(!activityDue||activityDue.REQUIRED!==true||activityDue.DEFAULT!=='SESSION_END'||activityDue.MAXIMUM!=='SESSION_END'||activityDue.REQUIRES_SESSION_CONTEXT!==true||activityDue.PAST_SESSION_CREATION!=='BLOCK'||activityDue.DUE_MUST_BE_FUTURE!==true) throw new Error('La política de vencimiento de ACTIVIDAD EN CLASE debe exigir fin de sesión, futuro válido y bloqueo posterior.');
  if(activityDue.TIMEZONE!=='America/Mexico_City'||activityDue.UTC_OFFSET_MINUTES!==-360) throw new Error('La conversión horaria canónica de ACTIVIDAD EN CLASE no coincide con America/Mexico_City 2026.');
  const taskDue=p.CLASSROOM.TASK_DUE;
  if(!taskDue||taskDue.REQUIRED!==true||taskDue.DEFAULT!=='NEXT_SESSION_START'||taskDue.MAXIMUM!=='NEXT_SESSION_START'||taskDue.REQUIRES_NEXT_SESSION_CONTEXT!==true||taskDue.PAST_NEXT_SESSION_CREATION!=='BLOCK'||taskDue.DUE_MUST_BE_FUTURE!==true) throw new Error('La política de vencimiento de TAREA debe exigir inicio de siguiente sesión, futuro válido y bloqueo posterior.');
  if(taskDue.TIMEZONE!=='America/Mexico_City'||taskDue.UTC_OFFSET_MINUTES!==-360) throw new Error('La conversión horaria canónica de TAREA no coincide con America/Mexico_City 2026.');
  const practice=p.CLASSROOM.PRACTICE;
  if(!practice||practice.DUE_MODE!=='NONE'||practice.DUE_ALLOWED!==false||practice.GOOGLE_DOCUMENT_REQUIRED!==true||practice.GOOGLE_DOCUMENT_MIME!=='application/vnd.google-apps.document'||practice.STUDENT_COPY_REQUIRED!==true||practice.SHARE_MODE!=='STUDENT_COPY'||practice.CREATE_GOOGLE_DOCUMENT_IF_MISSING!==true) throw new Error('La política canónica de PRÁCTICA debe exigir Google Documento, STUDENT_COPY y ausencia total de vencimiento.');
  if(p.DOCUMENTS.PRACTICE_STUDENT_COPY!==true||p.DOCUMENTS.PRACTICE_DOCUMENT_FORMAT!=='GOOGLE_DOC') throw new Error('La política documental de PRÁCTICA debe permanecer en Google Documento con copia individual.');
  const simpleQuiz=p.CLASSROOM.SIMPLE_QUIZ;
  if(!simpleQuiz||simpleQuiz.TITLE_PREFIX!=='Quiz '||simpleQuiz.SEQUENCE_SOURCE!=='CLASSROOM'||simpleQuiz.EMPTY_ASSIGNMENT!==true||simpleQuiz.STATE!=='DRAFT'||simpleQuiz.UNIT_ASSIGNMENT_REQUIRED!==true||simpleQuiz.UNIT_SOURCE!=='LATEST_PUBLISHED_ACADEMIC_COURSEWORK_WITHOUT_UNIT_EXAM'||simpleQuiz.UNIT_RESOURCE_STATE!=='PUBLISHED'||simpleQuiz.UNIT_EXCLUDE_SIMPLE_QUIZ!==true||simpleQuiz.UNIT_EXCLUDE_FINAL_GRADE!==true||simpleQuiz.UNIT_EXCLUDE_EXAM!==true||JSON.stringify(simpleQuiz.UNIT_CLOSE_EXAM_STATES)!==JSON.stringify(['DRAFT','PUBLISHED'])||simpleQuiz.DUE_MODE!=='NEXT_NATURAL_HOUR'||simpleQuiz.DUE_STRICTLY_AFTER_REQUEST!==true||simpleQuiz.PAST_DUE_CREATION!=='BLOCK') throw new Error('La política canónica de QUIZ SENCILLO debe exigir secuencia Classroom, unidad abierta por recurso académico publicado, tarea vacía, DRAFT y siguiente hora natural.');
  if(simpleQuiz.TIMEZONE!=='America/Mexico_City'||simpleQuiz.UTC_OFFSET_MINUTES!==-360) throw new Error('La conversión horaria de QUIZ SENCILLO no coincide con America/Mexico_City 2026.');
  if(p.UNIT_GRADING.MISSING_GRADE_VALUE!==0||p.UNIT_GRADING.TOUCH_OTHER_UNITS!==false) throw new Error('La política de cierre perdió aislamiento o tratamiento de faltantes.');
  if(redondearCalificacionFinalCanonica_(91.75)!==92||redondearCalificacionFinalCanonica_(64.18)!==64) throw new Error('La política de redondeo final no coincide con el contrato.');
  if(p.EXAM.STANDARD_ITEM_COUNT!==25||p.EXAM.STANDARD_TOTAL_POINTS!==100) throw new Error('Los parámetros estándar del examen formal cambiaron sin actualización explícita.');
  if(p.DOCUMENTS.PRACTICE_REFLECTION_COUNT!==3||p.GAMMA.MAX_SLIDES!==25) throw new Error('Una convención académica determinista cambió sin actualización explícita.');
  return {ok:true,source:'CODE',policy:p};
}
function obtenerPoliticasAcademicasCanonicas(){validarContratoArquitectura_();return validarPoliticasCanonicas_();}
