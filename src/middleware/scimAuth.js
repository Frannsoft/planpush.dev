import crypto from 'crypto';

// SCIM authentication middleware using RFC 8628 device flow bearer token
export function scimAuth(req, res, next) {
  const token = process.env.SCIM_AUTH_TOKEN;
  
  // Fail closed: SCIM_AUTH_TOKEN must be set
  if (!token) {
    return res.status(401).json({ error: 'SCIM auth not configured' });
  }
  
  // Extract bearer token from Authorization header
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  const provided = match ? match[1] : '';
  
  // Constant-time comparison to prevent timing attacks
  if (!provided || !constantTimeCompare(provided, token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Constant-time string comparison (prevents timing attacks)
function constantTimeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  if (bufA.length !== bufB.length) {
    // Still compare lengths worth of bytes to maintain constant timing
    const len = Math.max(bufA.length, bufB.length);
    let result = bufA.length !== bufB.length ? 1 : 0;
    for (let i = 0; i < len; i++) {
      result |= (bufA[i] || 0) ^ (bufB[i] || 0);
    }
    return result === 0;
  }
  
  return crypto.timingSafeEqual(bufA, bufB);
}
