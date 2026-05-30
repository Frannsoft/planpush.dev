import { randomBytes } from 'crypto';

// Attach a unique request-id to every request for correlation and debugging
export function attachRequestId(req, res, next) {
  // Use X-Request-ID header if provided, otherwise generate one
  req.requestId = req.get('X-Request-ID') || `req_${randomBytes(8).toString('hex')}`;
  next();
}
