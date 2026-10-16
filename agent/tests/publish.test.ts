import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentReport, ownComment, readArtifact, marker } from '../src/publish.ts';
import type { Report } from '../src/contracts.ts';

test('only updates comments owned by the GitHub Actions bot', () => {
  assert.equal(ownComment([
    { id: 1, body: marker, user: { login: 'contributor' } },
    { id: 2, body: marker, user: { login: 'github-actions[bot]' } },
  ]), 2);
});
test('rejects stale or incorrectly associated reports', () => {
  const report = { head: 'a'.repeat(40) } as Report;
  assert.equal(currentReport(report, report.head, report.head), true);
  assert.equal(currentReport(report, report.head, 'b'.repeat(40)), false);
  assert.equal(currentReport(report, 'b'.repeat(40), 'b'.repeat(40)), false);
});
test('rejects symlinks and oversized artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'taskly-artifact-'));
  try {
    await writeFile(join(directory, 'actual'), 'payload');
    await symlink(join(directory, 'actual'), join(directory, 'link'));
    await assert.rejects(readArtifact(join(directory, 'link'), 100));
    await assert.rejects(readArtifact(join(directory, 'actual'), 3));
    assert.equal(await readArtifact(join(directory, 'actual'), 100), 'payload');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
