import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../src/report.ts';
import { preserveBaseline } from '../src/runner.ts';
import type { Report, Verification } from '../src/contracts.ts';

const report: Report = {
  version: 1, status: 'VERIFIED', base: 'a'.repeat(40), head: 'b'.repeat(40), mode: 'pr', model: 'fixture',
  reason: '<script> @everyone [click](https://example.com)', skills: ['analyze-changes'], attempts: [], files: [],
  modifiedExistingTests: [], requests: 1, inputTokens: 1, outputTokens: 1, durationMs: 1,
};
test('escapes untrusted prose and prevents diff fence breakout', () => {
  const rendered = renderReport(report, '+const text = "```";\n+// <script>');
  assert.ok(rendered.includes('&lt;script&gt;'));
  assert.ok(rendered.includes('&#64;everyone'));
  assert.ok(rendered.includes('````diff'));
  assert.ok(!rendered.includes('\n```\n'));
});
test('does not publish a failed patch and bounds successful previews', () => {
  assert.ok(!renderReport({ ...report, status: 'FAILED' }, '+secretCandidate').includes('secretCandidate'));
  assert.ok(renderReport(report, '+'.repeat(25_000)).includes('Preview truncated'));
  assert.ok(renderReport(report).includes('| --- | --- | --- | --- |\n| backend'));
});
test('marks fewer tests or additional skipped tests as failed verification', () => {
  const baseline: Verification = { passed: true, results: [{ name: 'backend:tests', command: 'vitest', exitCode: 0, output: '', tests: { passed: 10, failed: 0, pending: 0, total: 10 } }] };
  const candidate = structuredClone(baseline);
  candidate.results[0].tests!.total = 9;
  preserveBaseline(baseline, candidate);
  assert.equal(candidate.passed, false);
  assert.equal(candidate.results[0].exitCode, 1);
});

test('rejects lost covered code even when test counts are unchanged', () => {
  const metric = { total: 100, covered: 90, pct: 90 };
  const baseline: Verification = { passed: true, results: [{ name: 'backend:tests', command: 'vitest', exitCode: 0, output: '', tests: { passed: 10, failed: 0, pending: 0, total: 10 }, coverage: { lines: metric, statements: metric, functions: metric, branches: metric } }] };
  for (const name of ['lines', 'statements', 'functions', 'branches'] as const) {
    const candidate = structuredClone(baseline);
    candidate.results[0].coverage![name] = { total: 100, covered: 1, pct: 1 };
    preserveBaseline(baseline, candidate);
    assert.equal(candidate.passed, false, name);
    assert.match(candidate.results[0].output, new RegExp(`Covered ${name} decreased`));
  }
  const expanded = structuredClone(baseline);
  expanded.results[0].coverage!.statements = { total: 200, covered: 100, pct: 50 };
  preserveBaseline(baseline, expanded);
  assert.equal(expanded.passed, true);
  const missing = structuredClone(baseline);
  delete missing.results[0].coverage;
  preserveBaseline(baseline, missing);
  assert.equal(missing.passed, false);
});
