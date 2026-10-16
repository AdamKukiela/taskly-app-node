import type { Report } from './contracts.ts';

export function escapeMarkdown(value: string): string {
  return value.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!)
    .replace(/([\\`*_\[\]#!|])/g, '\\$1').replace(/@/g, '&#64;');
}
export function renderReport(report: Report, patch = ''): string {
  const latest = report.attempts.at(-1);
  const rows: string[] = [];
  for (const side of ['backend', 'frontend']) {
    const before = report.baseline?.results.find(result => result.name === `${side}:tests`);
    const after = latest?.results.find(result => result.name === `${side}:tests`);
    rows.push(`| ${side} | ${before?.tests?.passed ?? '—'} → ${after?.tests?.passed ?? '—'} | ${before?.coverage?.statements.pct ?? '—'} → ${after?.coverage?.statements.pct ?? '—'} | ${before?.coverage?.branches.pct ?? '—'} → ${after?.coverage?.branches.pct ?? '—'} |`);
  }
  const text = [
    '<!-- taskly-unit-test-agent -->',
    `## Unit test agent: ${report.status}`,
    `Commit: \`${report.head}\` · Model: \`${escapeMarkdown(report.model)}\``,
    escapeMarkdown(report.reason),
    `Skills loaded: ${report.skills.map(skill => `\`${escapeMarkdown(skill)}\``).join(', ') || 'none'}`,
    `Candidates checked: ${report.attempts.length}. API requests: ${report.requests}. Tokens: ${report.inputTokens} input / ${report.outputTokens} output.`,
    ['| Suite | Passing tests: before → after | Statements % | Branches % |',
      '| --- | --- | --- | --- |', ...rows].join('\n'),
    ...report.files.map(path => `- ${escapeMarkdown(path)}`),
    report.modifiedExistingTests.length ? `Existing tests modified; review assertion changes: ${report.modifiedExistingTests.map(escapeMarkdown).join(', ')}.` : '',
    ...[...(report.analysis?.evidence ?? []), ...(report.analysis?.targets.flatMap(target => target.behaviors) ?? [])].map(item => `- ${escapeMarkdown(item)}`),
    '<details><summary>Executed checks</summary>', '',
    ...(latest ?? report.baseline)?.results.map(result => `- ${escapeMarkdown(result.name)}: exit ${result.exitCode}; \`${escapeMarkdown(result.command)}\``) ?? [],
    '', '</details>',
  ];
  if (patch && report.status === 'VERIFIED') {
    const truncated = patch.length > 24_000;
    const preview = patch.slice(0, 24_000);
    const ticks = Math.max(3, ...[...preview.matchAll(/`+/g)].map(match => match[0].length + 1));
    const tildes = Math.max(3, ...[...preview.matchAll(/~+/g)].map(match => match[0].length + 1));
    const fence = ticks <= 6 ? '`'.repeat(ticks) : '~'.repeat(tildes);
    text.push('<details><summary>Verified test patch</summary>', '', `${fence}diff`, preview, fence,
      truncated ? 'Preview truncated. Download verified-tests.patch from the workflow artifact for the complete patch.' : '', '', '</details>');
  }
  return text.filter(Boolean).join('\n\n') + '\n';
}
