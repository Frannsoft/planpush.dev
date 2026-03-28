// Attach computed baseUrl to every request
export function attachBaseUrl(req, res, next) {
  req.planpushBaseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  next();
}
