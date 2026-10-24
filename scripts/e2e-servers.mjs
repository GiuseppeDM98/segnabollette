/**
 * The two Playwright servers on one production build: closed signup on 3101, open signup on 3100.
 *
 * Why in this order: Playwright waits only for 3100, so 3101 is started first and polled until it
 * answers; when 3100 is up both are ready. If either child exits, the other is stopped too, so a
 * crashed server never leaves an orphan holding its port.
 */
import { spawn } from 'node:child_process';

const POLL_INTERVAL_MS = 500;
const READY_TIMEOUT_MS = 60_000;
const children = [];

function startServer(port, signupEnabled) {
  const child = spawn('pnpm', ['start', '--port', String(port)], {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      BETTER_AUTH_URL: `http://localhost:${port}`,
      SIGNUP_ENABLED: signupEnabled ? 'true' : 'false',
    },
  });
  child.on('exit', (code) => stopAll(code ?? 1));
  children.push(child);
}

async function waitUntilReady(url) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch {
      // Not listening yet: poll again.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.error(`e2e-servers: ${url} did not answer 200 within ${READY_TIMEOUT_MS} ms`);
  stopAll(1);
}

function stopAll(code) {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

startServer(3101, false);
await waitUntilReady('http://localhost:3101/accedi');
startServer(3100, true);
