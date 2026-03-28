// Crypto utilities for token generation and hashing

export function generateId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateDeviceCode() {
  return 'dc_' + generateId();
}

export function generateUserCode() {
  // 8 character uppercase alphanumeric, formatted as XXXX-XXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I to avoid confusion
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

export function generateRefreshToken() {
  return 'rt_' + generateId() + generateId();
}

export function generateAccessToken() {
  return 'at_' + generateId() + generateId();
}

export function generateSessionId() {
  return 'sess_' + generateId().slice(0, 12);
}

export async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
