/**
 * Infrastructure provisioning through authenticated Apps Script execution only.
 * Do not expose through doGet/doPost or any academic operation.
 * Pass the secret only as an API parameter; never paste a literal into source.
 * Not installed or executed.
 */
function configurarClaveHmacAcademica(key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
    throw new Error('HMAC_KEY_FORMAT_INVALID');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('HMAC_PROVISIONING_BUSY');
  try {
    const properties=PropertiesService.getScriptProperties();
    const previous=properties.getProperty('ACADEMIC_WRITE_HMAC_KEY');
    if (previous && previous!==key)
      throw new Error('EXISTING_HMAC_KEY_PRESERVED_ROTATION_REQUIRES_AUTHORIZATION');
    if (!previous) properties.setProperty('ACADEMIC_WRITE_HMAC_KEY',key);
    if (properties.getProperty('ACADEMIC_WRITE_HMAC_KEY')!==key)
      throw new Error('HMAC_PROVISIONING_VERIFY_FAILED');
    return {ok:true,configured:true,changed:!previous};
  } finally {
    lock.releaseLock();
  }
}

function estadoClaveHmacAcademica() {
  const key=PropertiesService.getScriptProperties().getProperty('ACADEMIC_WRITE_HMAC_KEY');
  return {configured:typeof key==='string' && /^[a-f0-9]{64}$/.test(key)};
}
