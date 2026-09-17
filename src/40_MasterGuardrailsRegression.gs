/** Regresiones deterministas: no crean recursos reales. */
function validarMasterGuardrailsCanonicos() {
  const failures = [];
  function expectThrow(label, fn, fragment) {
    try { fn(); failures.push(label + ': no bloqueó'); }
    catch (err) {
      const msg = String(err && err.message || err);
      if (fragment && msg.indexOf(fragment) < 0) failures.push(label + ': mensaje inesperado: ' + msg);
    }
  }

  expectThrow('sin materia', function () {
    preflightDocumentoMaestro({operation:'RESOURCE_CREATE', temaSubtema:'2.5 Procesos e hilos'});
  }, 'falta materia');

  expectThrow('publicación fuera de draft', function () {
    preflightDocumentoMaestro({operation:'RESOURCE_CREATE', materia:'Sistemas Operativos', temaSubtema:'2.5 Procesos e hilos', resourceState:'PUBLISHED'});
  }, 'DRAFT');

  expectThrow('modificación de planeación', function () {
    preflightDocumentoMaestro({operation:'RESOURCE_CREATE', materia:'Sistemas Operativos', temaSubtema:'2.5 Procesos e hilos', modifyPlanning:true});
  }, 'planeación');

  expectThrow('paquete incompleto', function () {
    validateClassPackageRequest_({unidad:'2', temaSubtema:'2.5 Procesos e hilos'});
  }, 'BLOCKED_INCOMPLETE_CLASS_PACKAGE');

  if (typeof prepararContextoGuardrailRecurso_ !== 'function') failures.push('falta prepararContextoGuardrailRecurso_');
  if (typeof preflightDocumentoMaestro !== 'function') failures.push('falta preflightDocumentoMaestro');
  if (typeof postflightDocumentoMaestro !== 'function') failures.push('falta postflightDocumentoMaestro');

  if (failures.length) throw new Error('MASTER_GUARDRAILS_REGRESSION_FAILED: ' + failures.join(' | '));
  return {ok:true, guardrails:'ENFORCED', regressions:4};
}
