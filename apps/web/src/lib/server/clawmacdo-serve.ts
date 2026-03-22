import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildCliBaseEnv } from './deployments';

const DEFAULT_PORT = 3456;
const PID_FILE = '/tmp/clawmacdo-serve.pid';
const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

let _sidecarProcess: ChildProcess | null = null;
let _sidecarPort: number | null = null;
let _startupPromise: Promise<{ port: number }> | null = null;

function getBinaryPath(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('clawmacdo/package.json') as { bin?: Record<string, string> | string };
    const binEntry = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.['clawmacdo'] ?? 'bin/clawmacdo');
    const pkgDir = require.resolve('clawmacdo/package.json').replace('/package.json', '');
    return `${pkgDir}/${binEntry}`;
  } catch {
    return 'clawmacdo';
  }
}

function getPort(): number {
  const envPort = process.env.CLAWMACDO_SERVE_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  return DEFAULT_PORT;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanStalePid(): void {
  if (!existsSync(PID_FILE)) return;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (isNaN(pid) || !isProcessAlive(pid)) {
      unlinkSync(PID_FILE);
    }
  } catch {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  }
}

async function healthCheck(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function waitForHealthy(port: number): Promise<boolean> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await healthCheck(port)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  return false;
}

async function startSidecarProcess(port: number): Promise<ChildProcess> {
  const binaryPath = getBinaryPath();
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NO_COLOR: '1',
    ...buildCliBaseEnv(),
  };

  console.log(`[clawmacdo-serve] Starting sidecar on port ${port}`);

  const proc = spawn(binaryPath, ['serve', '--port', String(port)], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  proc.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[clawmacdo-serve:stdout] ${chunk.toString().trimEnd()}`);
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[clawmacdo-serve:stderr] ${chunk.toString().trimEnd()}`);
  });

  proc.on('exit', (code) => {
    console.log(`[clawmacdo-serve] Process exited with code ${code}`);
    if (_sidecarProcess === proc) {
      _sidecarProcess = null;
      _sidecarPort = null;
      _startupPromise = null;
    }
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  });

  if (proc.pid) {
    writeFileSync(PID_FILE, String(proc.pid), 'utf-8');
  }

  return proc;
}

async function doEnsureSidecar(): Promise<{ port: number }> {
  const port = getPort();

  // Check if existing sidecar is healthy
  if (_sidecarProcess && _sidecarPort === port) {
    if (await healthCheck(port)) {
      return { port };
    }
    // Process exists but unhealthy — kill and restart
    console.log('[clawmacdo-serve] Sidecar unhealthy, restarting');
    stopSidecar();
  }

  // Check for orphaned process from a previous run
  cleanStalePid();
  if (existsSync(PID_FILE)) {
    // Verify the PID file owner is actually clawmacdo before trusting the port
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid) && isProcessAlive(pid) && await healthCheck(port)) {
        _sidecarPort = port;
        return { port };
      }
    } catch { /* ignore */ }
    cleanStalePid();
  }

  // Start with retries
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const proc = await startSidecarProcess(port);
      const healthy = await waitForHealthy(port);
      if (healthy) {
        _sidecarProcess = proc;
        _sidecarPort = port;
        console.log(`[clawmacdo-serve] Sidecar healthy on port ${port}`);
        return { port };
      }
      // Not healthy — kill and retry
      proc.kill('SIGTERM');
      lastError = new Error(`Sidecar failed health check after ${STARTUP_TIMEOUT_MS}ms`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_RETRIES) {
      console.log(`[clawmacdo-serve] Retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  throw new Error(`Failed to start clawmacdo serve after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/** Start the clawmacdo serve sidecar if not running. Returns the port. */
export function ensureSidecar(): Promise<{ port: number }> {
  // Mutex: if startup is already in progress, wait for it
  if (_startupPromise) return _startupPromise;
  _startupPromise = doEnsureSidecar().finally(() => {
    _startupPromise = null;
  });
  return _startupPromise;
}

/** Fetch helper that ensures sidecar is running, then proxies the request. */
export async function proxySidecar(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const { port } = await ensureSidecar();
  const url = `http://127.0.0.1:${port}${path}`;
  return fetch(url, options);
}

/** Gracefully stop the sidecar process. */
export function stopSidecar(): void {
  if (_sidecarProcess) {
    console.log('[clawmacdo-serve] Stopping sidecar');
    _sidecarProcess.kill('SIGTERM');
    _sidecarProcess = null;
    _sidecarPort = null;
    _startupPromise = null;
  }
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
}

// Cleanup on process exit
function registerCleanup(): void {
  const cleanup = () => {
    stopSidecar();
    process.exit(0);
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}
registerCleanup();
