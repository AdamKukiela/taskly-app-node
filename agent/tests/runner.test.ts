import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { run } from '../src/runner.ts';
import { Gemini } from '../src/model.ts';
import { Sandbox } from '../src/sandbox.ts';
import { command } from '../src/process.ts';
import type { Verification } from '../src/contracts.ts';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'taskly-runner-test-'));
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture-key';
  await mkdir(join(directory, 'frontend/src'), { recursive: true });
  await mkdir(join(directory, 'backend/tests'), { recursive: true });
  await writeFile(join(directory, 'backend/tests/.gitkeep'), '');
  await writeFile(join(directory, 'frontend/src/label.ts'), 'export const label = "task";');
  command('git', ['init', '--quiet'], { cwd: directory });
  command('git', ['add', '.'], { cwd: directory });
  command('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture'], { cwd: directory });
  const prepare = mock.method(Sandbox.prototype, 'prepare', async () => {});
  const close = mock.method(Sandbox.prototype, 'close', () => {});
  return {
    options: { repo: directory, mode: 'coverage' as const, base: 'HEAD', head: 'HEAD', targets: ['frontend/src/label.ts'], output: join(directory, 'results') },
    async cleanup() {
      prepare.mock.restore();
      close.mock.restore();
      if (key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = key;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

const baseline: Verification = { passed: true, results: [{ name: 'frontend:tests', command: 'vitest', exitCode: 0, output: '', tests: { passed: 1, failed: 0, pending: 0, total: 1 } }] };

test('does not rewrite expectations when the input baseline fails', async () => {
  const context = await fixture();
  const verify = mock.method(Sandbox.prototype, 'verify', async () => ({ ...baseline, passed: false }));
  const generate = mock.method(Gemini.prototype, 'generate', () => { throw new Error('Generation must not run'); });
  try {
    const report = await run(context.options);
    assert.equal(report.status, 'BASELINE_FAILED');
    assert.match(report.reason, /manually/);
    assert.equal(generate.mock.callCount(), 0);
    await assert.rejects(access(join(context.options.output, 'verified-tests.patch')));
  } finally {
    verify.mock.restore();
    generate.mock.restore();
    await context.cleanup();
  }
});

test('repairs a malformed frontend candidate and publishes only the verified replacement', async () => {
  const context = await fixture();
  const verify = mock.method(Sandbox.prototype, 'verify', async () => {
    const result = structuredClone(baseline);
    result.results[0].uncoveredFiles = ['frontend/src/label.ts'];
    return result;
  });
  const feedback: unknown[] = [];
  const responses = [
    { decision: 'generate', reason: 'Missing label test', evidence: [], targets: [{ source: 'frontend/src/label.ts', test: 'frontend/src/label.test.ts', behaviors: ['exports the task label'] }] },
    { decision: 'propose', reason: 'Test label', files: [{ path: 'frontend/src/label.test.ts', content: 'it("label", () => { expect(1).toBe(1)' }] },
    { decision: 'propose', reason: 'Test label', files: [{ path: 'frontend/src/label.test.ts', content: 'import { it, expect } from "vitest"; import { label } from "./label"; it("label", () => expect(label).toBe("task"));' }] },
  ];
  const generate = mock.method(Gemini.prototype, 'generate', async function<Schema extends z.ZodType>(schema: Schema, _instructions: string, data: unknown): Promise<z.infer<Schema>> {
    feedback.push(data);
    if (feedback.length === 1) {
      assert.equal(schema.safeParse({ decision: 'skip', reason: 'Mocked parent', evidence: ['Parent test'], targets: [] }).success, false);
    }
    return schema.parse(responses.shift());
  });
  try {
    const report = await run(context.options);
    assert.equal(report.status, 'VERIFIED');
    assert.equal(generate.mock.callCount(), 3);
    assert.equal(verify.mock.callCount(), 2);
    assert.match(JSON.stringify(feedback.at(-1)), /expected/);
    assert.match(await readFile(join(context.options.output, 'verified-tests.patch'), 'utf8'), /expect\(label\)/);
  } finally {
    verify.mock.restore();
    generate.mock.restore();
    await context.cleanup();
  }
});
