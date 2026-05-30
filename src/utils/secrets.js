// AES-256-GCM encryption for sensitive config values
// Key derived from SECRET_KEY using scrypt + HKDF

import crypto from 'crypto';

/**
 * Derive an encryption key from SECRET_KEY using scrypt + HKDF
 */
function deriveEncryptionKey(secretKey) {
  // Fixed salt for derivation (allows consistent key regeneration)
  const salt = Buffer.from('planpush-settings-v1', 'utf8');

  // scrypt: 32 bytes output (256 bits for AES-256)
  const derivedKey = crypto.scryptSync(secretKey, salt, 32, {
    N: 16384, // 2^14, OWASP recommendation for interactive use
    r: 8,
    p: 1,
  });

  // HKDF-SHA256: extract-expand for additional security
  const hkdf = crypto.hkdfSync('sha256', derivedKey, salt, Buffer.from('aes-256-gcm', 'utf8'), 32);
  return hkdf;
}

/**
 * Encrypt plaintext with AES-256-GCM
 * Returns: JSON {iv, ct, tag} as base64url (no colons/special chars)
 * Note: plaintext can be empty string, which is valid
 */
export function encryptSecret(plaintext, secretKey) {
  const key = deriveEncryptionKey(secretKey);
  const iv = crypto.randomBytes(12); // 96-bit IV (recommended for GCM)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Return compact JSON with base64url encoding
  // Note: ct can be empty string for empty plaintext (valid)
  return JSON.stringify({
    iv: iv.toString('base64url'),
    ct: encrypted.toString('base64url'),
    tag: authTag.toString('base64url'),
  });
}

/**
 * Decrypt AES-256-GCM ciphertext
 * Input: JSON {iv, ct, tag} as base64url strings
 */
export function decryptSecret(ciphertext, secretKey) {
  try {
    const key = deriveEncryptionKey(secretKey);
    const data = JSON.parse(ciphertext);

    if (!data.iv || !data.ct || !data.tag) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(data.iv, 'base64url');
    const encrypted = Buffer.from(data.ct, 'base64url');
    const authTag = Buffer.from(data.tag, 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(`Failed to decrypt secret: ${err.message}`);
  }
}
