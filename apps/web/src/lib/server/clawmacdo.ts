import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const TIMEOUT_MS = 30_000;

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
  sandboxDir: string;
}

export interface ExecOptions {
  sandboxDir?: string;
  env?: Record<string, string>;
}

type CliExecutor = (args: string[], options?: ExecOptions) => Promise<CliResult>;

let _executor: CliExecutor | null = null;

/** Inject a custom executor for testing. Call with null to reset. */
export function setCliExecutor(fn: CliExecutor | null): void {
  _executor = fn;
}

function getBinaryPath(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('clawmacdo/package.json') as { bin?: Record<string, string> | string };
    const binEntry = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.['clawmacdo'] ?? 'bin/clawmacdo');
    const pkgDir = require.resolve('clawmacdo/package.json').replace('/package.json', '');
    return `${pkgDir}/${binEntry}`;
  } catch {
    return 'clawmacdo'; // fallback to PATH
  }
}

/** Execute a clawmacdo CLI command in an isolated sandbox. */
export function execClawmacdo(args: string[], options: ExecOptions = {}): Promise<CliResult> {
  if (_executor) {
    return _executor(args, options);
  }

  return new Promise((resolve, reject) => {
    const sandboxDir = options.sandboxDir ?? `/tmp/clawmacdo-${randomUUID()}`;

    try {
      mkdirSync(sandboxDir, { recursive: true });
    } catch (err) {
      reject(new Error(`Failed to create sandbox dir ${sandboxDir}: ${err}`));
      return;
    }

    const binaryPath = getBinaryPath();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: sandboxDir,
      NO_COLOR: '1',
      ...options.env,
    };

    const startMs = Date.now();
    // Redact credential env vars in logs
    const safeArgs = args.join(' ');
    console.log(`[clawmacdo] Spawning: clawmacdo ${safeArgs}`);

    const proc = spawn(binaryPath, args, {
      env,
      shell: false, // array form prevents shell injection
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;
      const exitCode = code ?? (timedOut ? 124 : -1);
      console.log(`[clawmacdo] Exited: code=${exitCode} duration=${durationMs}ms`);
      resolve({ stdout, stderr, code: exitCode, sandboxDir });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Parse NDJSON (newline-delimited JSON) output from clawmacdo track. */
export function parseNdjson(stdout: string): object[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as object];
      } catch {
        return [];
      }
    });
}
