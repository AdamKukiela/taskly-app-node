import { lstat, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { command } from './process.ts';
import { AgentError, verificationSchema, type Verification } from './contracts.ts';

export class Sandbox {
  image = `taskly-agent:${randomUUID()}`;
  directory: string;
  constructor(directory: string) { this.directory = directory; }
  async prepare(): Promise<void> {
    await writeFile(join(this.directory, 'Dockerfile.agent'), [
      'FROM node:24.14.1-bookworm-slim',
      'WORKDIR /workspace',
      'COPY backend/package.json backend/package-lock.json ./backend/',
      'COPY frontend/package.json frontend/package-lock.json ./frontend/',
      'RUN npm --prefix backend ci --ignore-scripts --no-audit --no-fund && npm --prefix frontend ci --ignore-scripts --no-audit --no-fund',
      'COPY backend ./backend',
      'COPY frontend ./frontend',
      'RUN cd backend && ./node_modules/.bin/prisma generate',
      'RUN chown -R node:node /workspace',
      'USER node',
    ].join('\n'));
    command('docker', ['build', '--tag', this.image, '--file', join(this.directory, 'Dockerfile.agent'), this.directory], { timeout: 600_000 });
  }
  async verify(candidateDirectory?: string, files: string[] = []): Promise<Verification> {
    const name = `taskly-check-${randomUUID()}`;
    const formatting = files.filter(path => path.startsWith('frontend/')).map(path => path.slice('frontend/'.length));
    const checks = ['backend', 'frontend'].flatMap(side => [
      { name: `${side}:types`, cwd: `/workspace/${side}`, executable: './node_modules/.bin/tsc', args: ['--noEmit'] },
      { name: `${side}:tests`, cwd: `/workspace/${side}`, executable: './node_modules/.bin/vitest', args: ['run', '--coverage', '--coverage.reporter=json-summary', '--coverage.reporter=text', '--reporter=json', `--outputFile=/tmp/${side}-tests.json`] },
    ]);
    if (formatting.length) checks.push({ name: 'frontend:format', cwd: '/workspace/frontend', executable: './node_modules/.bin/prettier', args: ['--check', ...formatting] });
    const script = `
      const { spawnSync } = require('node:child_process');
      const { readFileSync, writeFileSync } = require('node:fs');
      const results = [];
      for (const check of ${JSON.stringify(checks)}) {
        const execution = spawnSync(check.executable, check.args, { cwd: check.cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 2097152 });
        const result = { name: check.name, command: check.executable + ' ' + check.args.join(' '), exitCode: execution.status ?? 1, output: ((execution.stdout ?? '') + (execution.stderr ?? '') + (execution.error?.message ?? '')).slice(-12000) };
        if (check.name.endsWith(':tests')) {
          const side = check.name.split(':')[0];
          try {
            const tests = JSON.parse(readFileSync('/tmp/' + side + '-tests.json', 'utf8'));
            result.tests = { passed: tests.numPassedTests, failed: tests.numFailedTests, pending: tests.numPendingTests, total: tests.numTotalTests };
            const coverage = JSON.parse(readFileSync(check.cwd + '/coverage/coverage-summary.json', 'utf8')).total;
            result.coverage = Object.fromEntries(['lines', 'statements', 'functions', 'branches'].map(metric => [metric, coverage[metric]]));
            if (!tests.numTotalTests || tests.numFailedTests || tests.numRuntimeErrorTestSuites) result.exitCode = 1;
          } catch (error) { result.exitCode = 1; result.output += '\\nMissing test or coverage report'; }
        }
        results.push(result);
      }
      const passed = results.every(result => result.exitCode === 0);
      writeFileSync('/tmp/verification.json', JSON.stringify({ passed, results }));
      process.exitCode = passed ? 0 : 1;
    `;
    const destination = join(this.directory, `${name}.json`);
    try {
      command('docker', ['create', '--name', name, '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '3g', '--cpus', '2', '--pids-limit', '256', this.image, 'node', '-e', script]);
      if (candidateDirectory) {
        for (const directory of ['backend/tests', 'frontend/src']) {
          command('docker', ['cp', `${join(candidateDirectory, directory)}/.`, `${name}:/workspace/${directory}/`]);
        }
      }
      let executionFailed = false;
      try { command('docker', ['start', '--attach', name], { timeout: 900_000 }); } catch { executionFailed = true; }
      const state = JSON.parse(command('docker', ['inspect', '--format', '{{json .State}}', name]));
      if (state.Running || state.OOMKilled) throw new AgentError('FAILED', 'Verification timed out or exceeded memory');
      command('docker', ['cp', `${name}:/tmp/verification.json`, destination]);
      const metadata = await lstat(destination);
      if (!metadata.isFile() || metadata.size > 150_000) throw new AgentError('FAILED', 'Invalid verification artifact');
      const result = verificationSchema.parse(JSON.parse(await readFile(destination, 'utf8')));
      if (executionFailed || state.ExitCode !== 0 || result.results.length !== checks.length || result.results.some(check => check.exitCode !== 0)) result.passed = false;
      return result;
    } finally {
      try { command('docker', ['rm', '--force', name]); } catch { }
      await rm(destination, { force: true });
    }
  }
  close(): void {
    try { command('docker', ['image', 'rm', '--force', this.image]); } catch { }
  }
}
