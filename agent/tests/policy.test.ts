import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safePath, testPath, requiresReview, validateCandidate, validateTest } from '../src/policy.ts';

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
  ]) assert.throws(() => validateTest('backend/tests/case.test.ts', content), /No assertions/);
  for (const content of [
    'import { expect as check } from "vitest"; it("works", () => check(1).toBe(1))',
    'it("works", async () => { await expect(Promise.reject(1)).rejects.toBe(1) })',
    'it("works", () => expect.soft(1).not.toBe(2))',
  ]) assert.doesNotThrow(() => validateTest('backend/tests/case.test.ts', content));
});
