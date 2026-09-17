/** Diagnóstico mínimo de identidad de ejecución para autorizaciones incrementales. */
function diagnosticarIdentidadEjecucion() {
  const profile = Classroom.UserProfiles.get('me');
  return {
    ok: true,
    classroomUserId: String(profile && profile.id || ''),
    classroomEmail: String(profile && profile.emailAddress || ''),
    classroomName: String(profile && profile.name && profile.name.fullName || ''),
    timezone: Session.getScriptTimeZone()
  };
}
