const SESSION_ID_RE = /^(sess_[0-9a-f]{12}|[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)$/;
const DEVICE_CODE_RE = /^dc_[0-9a-f]{32}$/;
const USER_CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

export function isValidDeviceCode(code) {
  return typeof code === 'string' && DEVICE_CODE_RE.test(code);
}

export function isValidUserCode(code) {
  return typeof code === 'string' && USER_CODE_RE.test(code);
}
