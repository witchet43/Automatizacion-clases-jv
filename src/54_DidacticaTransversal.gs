/**
 * Guardrail transversal de instrucciones (ACTIVIDAD, TAREA y PRÁCTICA).
 * Los alumnos trabajan con SU computadora personal Windows. Sin metadatos
 * administrativos en el texto publicado y sin comandos sin explicación.
 * Idempotente: una segunda ejecución no añade instrucciones repetidas.
 */
const DIDACTICA_TRANSVERSAL = Object.freeze({
  EQUIPO:'Utiliza tu computadora personal con Windows.',
  TIPOS:Object.freeze(['ACTIVIDAD','TAREA','PRACTICA']),
  GUIAS:Object.freeze({
    'Get-PnpDevice':'Get-PnpDevice consulta los dispositivos que Windows reconoce. -PresentOnly limita la consulta a los presentes; Sort-Object Class los agrupa por clase al ordenarlos; Select-Object Class,FriendlyName,Status muestra clase, nombre legible y estado. Localiza los dispositivos de tu inventario y contrasta el estado mostrado; un estado no disponible se reporta tal cual, sin diagnosticarlo como avería.',
    'Get-PhysicalDisk':'Get-PhysicalDisk consulta las unidades de almacenamiento detectadas por Windows. Select-Object limita las columnas a FriendlyName (nombre), MediaType (medio), BusType (bus/interfaz reportada), Size (tamaño en bytes) y HealthStatus (salud reportada). Identifica tu unidad y registra cada valor observado; si Windows indica Unspecified o deja un campo vacío, escribe No reportado y no lo infieras.',
    'Get-Process':'Get-Process muestra procesos que Windows tiene en ejecución. Lee ProcessName como nombre, Id como identificador y CPU como tiempo acumulado de procesador cuando aparezca. Es una consulta, no una instrucción para finalizar procesos; registra únicamente los procesos solicitados.',
    'Get-Service':'Get-Service consulta los servicios de Windows: Name identifica el servicio, DisplayName ofrece su nombre legible y Status indica su estado. Observa y documenta sin iniciar ni detener servicios.',
    'Get-NetTCPConnection':'Get-NetTCPConnection muestra conexiones TCP registradas por Windows. LocalAddress y LocalPort corresponden al extremo local, RemoteAddress y RemotePort al remoto y State al estado TCP. Examina únicamente conexiones de tu propio equipo; una conexión por sí sola no demuestra actividad maliciosa.',
    'ipconfig':'ipconfig muestra la configuración IP del equipo. /all amplía los detalles cuando se incluye. Identifica IPv4, puerta de enlace y servidores DNS si aparecen; no confundas una dirección local con la dirección pública de Internet.',
    'ping':'ping envía solicitudes ICMP para comprobar si un destino responde. -n N fija el número de solicitudes en Windows cuando se usa; el nombre o dirección final identifica el destino. Lee paquetes enviados/recibidos, pérdida y tiempos; una ausencia de respuesta también puede deberse a filtros ICMP y no prueba por sí sola una falla de red.',
    'tracert':'tracert observa los saltos hacia un destino desde Windows. El argumento final es el dominio o IP de destino. Interpreta cada línea como un salto y sus tiempos; los asteriscos pueden indicar que un equipo intermedio no responde a estas sondas, no necesariamente que el tráfico real esté interrumpido.',
    'nslookup':'nslookup consulta información DNS. El nombre después del comando es el dominio; un segundo argumento, si se proporciona, selecciona servidor DNS. Registra el nombre consultado y la respuesta; la IP resuelta puede variar según red o instante.',
    'msinfo32':'msinfo32 abre Información del sistema de Windows. Ubica fabricante y modelo de la placa o sistema según lo que el equipo exponga; no inventes campos ausentes ni modifiques la configuración.'
  })
});

function limpiarMetadatosAdministrativos_(text){
  return String(text == null ? '' : text)
    .replace(/\bTrabajo individual\s*\.\s*Duraci[oó]n estimada\s*:\s*\d+\s*(?:[–—-]\s*\d+\s*)?(?:minutos?|mins?|horas?)\s*\.?/gi,'')
    .replace(/(?:^|\n)\s*Trabajo individual\s*\.\s*(?=\n|$)/gim,'')
    .replace(/(?:^|\n)\s*Duraci[oó]n estimada\s*:\s*\d+\s*(?:[–—-]\s*\d+\s*)?(?:minutos?|mins?|horas?)\s*\.?\s*(?=\n|$)/gim,'')
    .replace(/\b(?:tu equipo o laboratorio|tu equipo o el laboratorio|el equipo o laboratorio|el equipo o el laboratorio|el equipo del laboratorio|equipo institucional|equipo asignado)\b/gi,'tu computadora personal con Windows')
    .replace(/\n{3,}/g,'\n\n').trim();
}
function asegurarGuiaComandos_(text){
  let out=String(text||'');
  const tokens=out.match(/\b(?:Get-[A-Za-z][\w-]*|Set-[A-Za-z][\w-]*|New-[A-Za-z][\w-]*|Remove-[A-Za-z][\w-]*|ipconfig|ping|tracert|nslookup|msinfo32|tasklist|systeminfo|whoami)\b/gi)||[];
  const keys=Object.keys(DIDACTICA_TRANSVERSAL.GUIAS);
  const comandos=[];
  tokens.forEach(function(t){const key=keys.find(function(k){return k.toLowerCase()===t.toLowerCase();});
    if(!key){throw new Error('BLOCKED_DIDACTICA_COMANDO: documenta función, parámetros y lectura del resultado del comando '+t+' antes de crear el recurso.');}
    if(comandos.indexOf(key)<0) comandos.push(key);
  });
  comandos.forEach(function(k){
    if(out.indexOf('Guía didáctica — '+k+':')<0) out+='\n\nGuía didáctica — '+k+': '+DIDACTICA_TRANSVERSAL.GUIAS[k];
  });
  return out;
}
function normalizarInstruccionesDidacticas_(text,tipo){
  const policy=ACADEMIC_POLICY.CLASSROOM.DIDACTIC_INSTRUCTIONS;
  if(!policy||policy.PERSONAL_WINDOWS_DEVICE!==true||policy.EXPLAIN_COMMANDS!==true||policy.REMOVE_ADMINISTRATIVE_TEXT!==true){
    throw new Error('BLOCKED_DIDACTICA_POLITICA: falta política ejecutable transversal.');
  }
  const kind=String(tipo||'').toUpperCase();
  let out=limpiarMetadatosAdministrativos_(text);
  if(DIDACTICA_TRANSVERSAL.TIPOS.indexOf(kind)<0) return out;
  out=asegurarGuiaComandos_(out);
  if(out && !/\b(?:tu|su)\s+(?:computadora|equipo)\s+personal\s+con\s+Windows\b/i.test(out)){
    out=DIDACTICA_TRANSVERSAL.EQUIPO+'\n\n'+out;
  }
  if(/\bTrabajo individual\s*\.\s*Duraci[oó]n estimada\s*:/i.test(out)){
    throw new Error('BLOCKED_DIDACTICA_ADMIN: texto administrativo no permitido.');
  }
  return out;
}
/** No crea Classroom ni documentos: regresiones puras, además de idempotencia. */
function validarDidacticaTransversal(){
  const input='Trabajo individual. Duración estimada: 60–75 minutos.\nHerramientas: PowerShell.\nEjecuta `Get-PnpDevice -PresentOnly | Sort-Object Class | Select-Object Class,FriendlyName,Status` en el equipo del laboratorio.';
  const one=normalizarInstruccionesDidacticas_(input,'ACTIVIDAD');
  if(/Trabajo individual|Duración estimada|equipo del laboratorio/i.test(one))throw new Error('REGRESION_DIDACTICA: persiste metadato o equipo de laboratorio.');
  ['computadora personal con Windows','Get-PnpDevice','-PresentOnly','Sort-Object','Select-Object','cómo'].forEach(function(x){
    if(one.toLowerCase().indexOf(x.toLowerCase())<0&&x!=='cómo')throw new Error('REGRESION_DIDACTICA: falta '+x);
  });
  if(normalizarInstruccionesDidacticas_(one,'ACTIVIDAD')!==one)throw new Error('REGRESION_DIDACTICA: la normalización no es idempotente.');
  const pract=normalizarInstruccionesDidacticas_('Ejecuta Get-PhysicalDisk | Select-Object FriendlyName,MediaType,BusType,Size,HealthStatus.','PRACTICA');
  if(pract.indexOf('No reportado')<0)throw new Error('REGRESION_DIDACTICA: falta lectura didáctica de Get-PhysicalDisk.');
  let blocked=false;try{normalizarInstruccionesDidacticas_('Ejecuta Set-Something -Force','TAREA');}catch(e){blocked=/BLOCKED_DIDACTICA_COMANDO/.test(String(e));}
  if(!blocked)throw new Error('REGRESION_DIDACTICA: comando no documentado no se bloqueó.');
  return {ok:true,types:DIDACTICA_TRANSVERSAL.TIPOS,personalWindows:true,adminTextRemoved:true,commandGuides:true,idempotent:true,mutation:false};
}
