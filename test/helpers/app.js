// Dynamic app import to ensure setup.js env vars are loaded first
export async function getApp() {
  const { app } = await import('../../src/app.js');
  return app;
}
