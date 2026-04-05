// Attach computed baseUrl to every request
// In production, BASE_URL is required to prevent Host header injection
export function attachBaseUrl(req, res, next) {
  if (process.env.BASE_URL) {
    req.planpushBaseUrl = process.env.BASE_URL;
  } else {
    req.planpushBaseUrl = `${req.protocol}://${req.get('host')}`;
  }
  next();
}
