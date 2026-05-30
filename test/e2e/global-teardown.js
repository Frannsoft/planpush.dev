/**
 * Global teardown for Playwright E2E tests
 */

export default async function globalTeardown() {
  // Clean up any processes
  if (global.__SERVER_PROCESS__) {
    console.log('[e2e-teardown] Killing server process...');
    global.__SERVER_PROCESS__.kill('SIGTERM');
    // Clear the timeout if it exists
    if (global.__SERVER_PROCESS__.__timeoutHandle__) {
      clearTimeout(global.__SERVER_PROCESS__.__timeoutHandle__);
    }
  }

  // Give processes time to shut down
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('[e2e-teardown] Done');
}
