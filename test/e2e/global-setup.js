import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Generate a temp database for this test run
const testDbDir = join(tmpdir(), `planpush-e2e-${randomBytes(8).toString('hex')}`);

// Ensure directory exists
if (!existsSync(testDbDir)) {
  mkdirSync(testDbDir, { recursive: true });
}

// Clean up old test databases (keep the ones from last hour)
const oneHourAgo = Date.now() - 60 * 60 * 1000;
const tmpDir = tmpdir();
if (existsSync(tmpDir)) {
  try {
    const files = readdirSync(tmpDir);
    files.forEach(file => {
      if (file.startsWith('planpush-e2e-')) {
        const filePath = join(tmpDir, file);
        try {
          const stat = statSync(filePath);
          if (stat.mtimeMs < oneHourAgo) {
            try {
              rmSync(filePath, { recursive: true, force: true });
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        } catch (e) {
          // Ignore stat errors
        }
      }
    });
  } catch (e) {
    // Ignore cleanup errors
  }
}

console.log(`[e2e-setup] Using test database at ${testDbDir}`);

// Store server process globally for cleanup
let serverProcess = null;

// Start server in background and wait for it
async function startServer() {
  return new Promise((resolve, reject) => {
    const secret = randomBytes(32).toString('hex');

    serverProcess = spawn('node', [join(__dirname, 'server-start.js')], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: undefined,
        PORT: '5273',
        DATA_DIR: testDbDir,
        SECRET_KEY: secret,
        GITHUB_CLIENT_ID: 'test-client-id',
        GITHUB_CLIENT_SECRET: 'test-client-secret',
        GITHUB_ORG: 'test-org',
        BASE_URL: 'http://localhost:5273',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = 30000; // 30 second timeout

    // Monitor stdout for server ready signal
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[server] ${output}`);
      if (output.includes('listening on port 5273')) {
        if (!resolved) {
          resolved = true;
          // Give it a moment to stabilize
          setTimeout(() => {
            // Store globally for cleanup in globalTeardown
            global.__SERVER_PROCESS__ = serverProcess;
            resolve(serverProcess);
          }, 500);
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      process.stdout.write(`[server-err] ${data}`);
    });

    serverProcess.on('error', (err) => {
      console.error('[server-start] error:', err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    serverProcess.on('exit', (code, signal) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Server exited before ready: code ${code}, signal ${signal}`));
      }
    });

    // Timeout fallback
    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        serverProcess.kill();
        reject(new Error(`Server startup timeout after ${timeout}ms`));
      }
    }, timeout);
  });
}

// Export as default function (Playwright will call this)
export default startServer;
