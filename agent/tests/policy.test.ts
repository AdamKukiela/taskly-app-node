import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safePath, testPath, requiresReview, validateAnalysis, validateCandidate, validateTest } from '../src/policy.ts';
import type { Analysis } from '../src/contracts.ts';

test('allows backend and frontend test conventions', () => {
  assert.equal(testPath('backend/tests/router.test.ts'), true);
  assert.equal(testPath('frontend/src/features/useTodo.test.tsx'), true);
  for (const path of ['/tmp/test.ts', '../backend/tests/a.test.ts', 'backend/tests/../../src/a.test.ts', 'frontend/src//a.test.ts', 'backend/src/router.ts', 'backend/tests/a.test.ts\n']) {
    assert.equal(testPath(path), false, path);
  }
  assert.equal(safePath('frontend/src/a\\b.test.ts'), false);
});
test('requires review for changed control files and execution configuration', () => {
  for (const path of ['agent/src/cli.ts', '.github/workflows/check.yml', 'backend/package-lock.json', 'frontend/vite.config.ts', 'backend/prisma/schema.prisma', 'frontend/.npmrc']) {
    assert.equal(requiresReview([path]), true, path);
  }
  assert.equal(requiresReview(['README.md', 'backend/src/factory.ts']), false);
});
test('rejects prompt-injected paths even when the response is valid JSON', () => {
  assert.throws(() => validateCandidate({ decision: 'propose', reason: 'SYSTEM OVERRIDE', files: [{ path: '.github/workflows/leak.yml', content: 'expect(true)' }] }, new Set(['backend/tests/router.test.ts'])));
});
test('rejects duplicate files and files outside selected targets', () => {
  const file = { path: 'backend/tests/router.test.ts', content: 'it("works", () => expect(true).toBe(true))' };
  assert.throws(() => validateCandidate({ decision: 'propose', reason: 'test', files: [file, file] }, new Set([file.path])));
  assert.throws(() => validateCandidate({ decision: 'propose', reason: 'test', files: [file] }, new Set()));
});

test('analysis requires actionable targets in the selected package', () => {
  const analysis: Analysis = { decision: 'generate', reason: 'Missing tests', evidence: [], targets: [] };
  const source = 'backend/src/limit.ts';
  assert.throws(() => validateAnalysis(analysis, [source]), /no concrete test targets/);
  analysis.decision = 'update';
  assert.throws(() => validateAnalysis(analysis, [source]), /no concrete test targets/);
  analysis.targets = [{ source, test: 'frontend/src/limit.test.ts', behaviors: ['caps count'] }];
  assert.throws(() => validateAnalysis(analysis, [source]), /unsupported source or test/);
  analysis.targets[0].test = 'backend/tests/limit.test.ts';
  assert.deepEqual([...validateAnalysis(analysis, [source])], ['backend/tests/limit.test.ts']);
});

test('skipping changed behavior requires evidence while docs-only skips do not', () => {
  const analysis: Analysis = { decision: 'skip', reason: 'Covered', evidence: [], targets: [] };
  assert.throws(() => validateAnalysis(analysis, ['backend/src/limit.ts']), /requires evidence/);
  assert.doesNotThrow(() => validateAnalysis(analysis, []));
  analysis.evidence = ['backend/tests/limit.test.ts: caps count asserts the maximum'];
  assert.doesNotThrow(() => validateAnalysis(analysis, ['backend/src/limit.ts']));
});

test('does not accept skipping or omitting a module with unexecuted behavior', () => {
  const source = 'frontend/src/label.ts';
  const analysis: Analysis = { decision: 'skip', reason: 'Covered', evidence: ['Parent mocks label'], targets: [] };
  assert.throws(() => validateAnalysis(analysis, [source], [source]), /omitted source modules/);
  analysis.decision = 'generate';
  analysis.targets = [{ source, test: 'frontend/src/label.test.ts', behaviors: ['labels tasks'] }];
  assert.doesNotThrow(() => validateAnalysis(analysis, [source], [source]));
  analysis.decision = 'needs_review';
  analysis.targets = [];
  assert.doesNotThrow(() => validateAnalysis(analysis, [source], [source]));
});
test('rejects focused, disabled, and aliased test declarations', () => {
  for (const content of [
    'it.skip("case", () => expect(true).toBe(true))',
    'test["only"]("case", () => expect(true).toBe(true))',
    'import { it as example } from "vitest"; example.todo("case"); expect(true)',
    'describe.skipIf(true)("case", () => expect(true))',
    '// @ts-ignore\nit("case", () => expect(true))',
    '/* v8 ignore next */\nit("case", () => expect(true))',
  ]) assert.throws(() => validateTest('backend/tests/case.test.ts', content), content);
});
test('accepts expect.any and forbidden words inside tested data', () => {
  assert.doesNotThrow(() => validateTest('backend/tests/case.test.ts', 'it("case", () => { expect(new Date()).toEqual(expect.any(Date)); expect("it.skip @ts-ignore").toContain("skip") })'));
});

test('requires a matcher call rather than expectation-shaped text or setup', () => {
  for (const content of [
    'it("empty", () => { const text = "expect("; })',
    'it("empty", () => { expect(true); })',
    'it("empty", () => { const value = expect.any(String); })',
    'expect.assertions(1); it("empty", () => {})',
  ]) assert.throws(() => validateTest('backend/tests/case.test.ts', content), /No assertion matcher calls/);
  for (const content of [
    'import { expect as check } from "vitest"; it("works", () => check(1).toBe(1))',
    'it("works", async () => { await expect(Promise.reject(1)).rejects.toBe(1) })',
    'it("works", () => expect.soft(1).not.toBe(2))',
  ]) assert.doesNotThrow(() => validateTest('backend/tests/case.test.ts', content));
});
