import { spawnSync } from 'node:child_process';
import { AgentError } from './contracts.ts';

export function command(executable: string, args: string[], options: { cwd?: string; timeout?: number; input?: string } = {}): string {
  const env = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'TMPDIR'].flatMap(name =>
    process.env[name] ? [[name, process.env[name]!]] : []));
  const result = spawnSync(executable, args, {
    ...options, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: options.timeout ?? 60_000,
  });
  if (result.error || result.status !== 0) {
    throw new AgentError('FAILED', `${executable} ${args[0]} failed (${result.status ?? 'timeout'}): ${(result.stderr || result.error?.message || result.stdout).slice(-6000)}`);
  }
  return result.stdout;
}
