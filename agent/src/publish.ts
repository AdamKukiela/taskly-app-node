import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { reportSchema, type Report } from './contracts.ts';
import { renderReport } from './report.ts';

export const marker = '<!-- taskly-unit-test-agent -->';
export function ownComment(comments: { id: number; body?: string; user?: { login?: string } }[]): number | undefined {
  return comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker))?.id;
}
export function currentReport(report: Report, expected: string, actual: string): boolean {
  return report.head === expected && expected === actual;
}
export async function readArtifact(path: string, maximum: number): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.size > maximum) throw new Error('Invalid report artifact');
  return readFile(path, 'utf8');
}
export async function publish(directory: string): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const number = process.env.PR_NUMBER ?? '';
  const expected = process.env.EXPECTED_HEAD ?? '';
  const runId = process.env.GITHUB_RUN_ID ?? '';
  const token = process.env.GITHUB_TOKEN;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository) || !/^\d+$/.test(number) ||
      !/^[a-f0-9]{40}$/.test(expected) || !/^\d+$/.test(runId) || !token) throw new Error('Invalid publication context');
  async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub publication HTTP ${response.status}`);
    return response.json();
  }
  let report: Report;
  try { report = reportSchema.parse(JSON.parse(await readArtifact(join(directory, 'report.json'), 512_000))); }
  catch {
    report = { version: 1, status: 'FAILED', base: expected, head: expected, mode: 'pr', model: 'unavailable',
      reason: 'The verification job did not produce a valid report. Inspect the linked workflow run.', skills: [], attempts: [], files: [], modifiedExistingTests: [], requests: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  }
  const pull = await request(`pulls/${number}`);
  if (!currentReport(report, expected, pull.head.sha)) { console.log('Ignoring report for an outdated SHA'); return; }
  let patch = '';
  if (report.status === 'VERIFIED') patch = await readArtifact(join(directory, 'verified-tests.patch'), 1024 * 1024);
  const body = renderReport(report, patch) + `\n[Workflow run and full artifacts](https://github.com/${repository}/actions/runs/${runId})\n`;
  if (body.length > 60_000) throw new Error('Rendered PR comment exceeds the publication limit');
  let identifier: number | undefined;
  for (let page = 1; page <= 10; page++) {
    const comments = await request(`issues/${number}/comments?per_page=100&page=${page}`);
    identifier = ownComment(comments);
    if (identifier || comments.length < 100) break;
    if (page === 10) throw new Error('Too many comments to safely identify the agent comment');
  }
  const latest = await request(`pulls/${number}`);
  if (!currentReport(report, expected, latest.head.sha)) { console.log('PR changed before publication; ignoring report'); return; }
  if (identifier) await request(`issues/comments/${identifier}`, 'PATCH', { body });
  else await request(`issues/${number}/comments`, 'POST', { body });
  console.log(`Published ${report.status} for ${expected}`);
}
