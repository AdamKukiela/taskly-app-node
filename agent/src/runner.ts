import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { analysisSchema, candidateSchema, AgentError, type Report, type Verification } from './contracts.ts';
import { sourcePath, requiresReview, validateAnalysis, validateCandidate } from './policy.ts';
import { changedPaths, collectContext, diff, readTree, revision, writeTree } from './repository.ts';
import { command } from './process.ts';
import { Gemini } from './model.ts';
import { Sandbox } from './sandbox.ts';
import { renderReport } from './report.ts';

const agentDirectory = fileURLToPath(new URL('../', import.meta.url));
export type Options = { repo: string; mode: 'pr' | 'coverage'; base: string; head: string; targets: string[]; output: string };

export function preserveBaseline(baseline: Verification, result: Verification): void {
  for (const previous of baseline.results.filter(check => check.tests)) {
    const current = result.results.find(check => check.name === previous.name);
    if (!current?.tests || current.tests.total < previous.tests!.total || current.tests.pending > previous.tests!.pending) {
      result.passed = false;
      if (current) { current.exitCode = 1; current.output += '\nTest count decreased or pending tests increased.'; }
    }
    if (previous.coverage) {
      for (const metric of ['lines', 'statements', 'functions', 'branches'] as const) {
        if (!current?.coverage || current.coverage[metric].covered < previous.coverage[metric].covered) {
          result.passed = false;
          if (current) {
            current.exitCode = 1;
            current.output += `\nCovered ${metric} decreased or coverage is missing.`;
          }
        }
      }
    }
  }
}

export async function run(options: Options): Promise<Report> {
  const started = Date.now();
  const report: Report = {
    version: 1, status: 'FAILED', base: options.base, head: options.head, mode: options.mode,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash', skills: [], reason: '',
    attempts: [], files: [], modifiedExistingTests: [], requests: 0, inputTokens: 0, outputTokens: 0, durationMs: 0,
  };
  let provider: Gemini | undefined;
  let sandbox: Sandbox | undefined;
  let temporary: string | undefined;
  let patch = '';
  async function skill(name: string): Promise<string> {
    if (!report.skills.includes(name)) report.skills.push(name);
    return readFile(join(agentDirectory, 'skills', name, 'SKILL.md'), 'utf8');
  }
  try {
    report.head = revision(options.repo, options.head);
    const base = revision(options.repo, options.base);
    report.base = options.mode === 'pr' ? command('git', ['merge-base', base, report.head], { cwd: options.repo }).trim() : base;
    const changed = options.mode === 'pr' ? changedPaths(options.repo, report.base, report.head) : options.targets;
    if (options.mode === 'pr' && requiresReview(changed)) throw new AgentError('NEEDS_REVIEW', 'Agent, workflow, dependency, schema, or execution configuration changed. Review this PR manually.');
    const tree = readTree(options.repo, report.head);
    const targets = changed.filter(path => sourcePath(path) && tree.has(path));
    if (!targets.length) {
      report.status = 'SKIPPED'; report.reason = 'No supported production TypeScript modules changed or selected.'; return report;
    }
    if (targets.length > 20) throw new AgentError('LIMIT_EXCEEDED', 'More than 20 source modules selected; split this change.');
    const context = collectContext(tree, targets);
    const changes = options.mode === 'pr' ? diff(options.repo, report.base, report.head) : '';
    if (Buffer.byteLength(JSON.stringify(context)) + Buffer.byteLength(changes) > 850_000) throw new AgentError('LIMIT_EXCEEDED', 'Repository context exceeds the supported size.');
    provider = new Gemini(report.model, process.env.GEMINI_API_KEY ?? '');
    temporary = await mkdtemp(join(tmpdir(), 'taskly-agent-'));
    const snapshot = join(temporary, 'snapshot');
    await writeTree(tree, snapshot);
    sandbox = new Sandbox(snapshot);
    console.error('[agent] Preparing dependency image once for this run');
    await sandbox.prepare();
    console.error('[agent] Running baseline checks');
    report.baseline = await sandbox.verify();
    if (!report.baseline.passed) throw new AgentError('BASELINE_FAILED', 'Existing tests or type checks fail on the input SHA. Review failures and update intended contract changes manually before generation.');
    const definition = await readFile(join(agentDirectory, 'AGENT.md'), 'utf8');
    const analyzer = await skill('analyze-changes');
    const evidence = { mode: options.mode, targets, changes, files: context, baseline: report.baseline.results.map(({ output, ...result }) => result) };
    console.error('[agent] Analyzing behavior and existing coverage');
    report.analysis = await provider.generate(analysisSchema, `${definition}\n${analyzer}`, evidence);
    const permitted = validateAnalysis(report.analysis, targets);
    if (report.analysis.decision === 'skip' || report.analysis.decision === 'needs_review') {
      report.status = report.analysis.decision === 'skip' ? 'SKIPPED' : 'NEEDS_REVIEW';
      report.reason = report.analysis.reason;
      return report;
    }
    const writers: string[] = [];
    if (report.analysis.targets.some(target => target.source.startsWith('backend/'))) writers.push(await skill('backend-unit-tests'));
    if (report.analysis.targets.some(target => target.source.startsWith('frontend/'))) writers.push(await skill('frontend-unit-tests'));
    let feedback: unknown = undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      console.error(`[agent] Generating candidate ${attempt + 1}/3`);
      let candidate;
      try {
        candidate = await provider.generate(candidateSchema, `${definition}\n${writers.join('\n')}`, { ...evidence, analysis: report.analysis, feedback });
      } catch (error) {
        if (error instanceof AgentError || attempt === 2) throw error;
        feedback = { error: 'Your response was not valid JSON matching the provided schema.' };
        continue;
      }
      validateCandidate(candidate, permitted);
      try {
        for (const file of candidate.files) {
          if (file.path.startsWith('frontend/')) {
            file.content = await format(file.content, { parser: 'typescript', semi: false, singleQuote: true, trailingComma: 'all' });
          }
        }
      } catch (error) {
        feedback = { candidate, error: error instanceof Error ? error.message.slice(-8000) : 'Frontend formatting failed.' };
        continue;
      }
      candidate.files = candidate.files.filter(file => tree.get(file.path) !== file.content);
      if (!candidate.files.length) { report.status = 'SKIPPED'; report.reason = 'Candidate made no changes to the existing tests.'; return report; }
      const working = join(temporary, `attempt-${attempt}`);
      await writeTree(tree, working);
      command('git', ['init', '--quiet'], { cwd: working });
      command('git', ['-c', 'core.autocrlf=false', 'add', '--', 'backend', 'frontend'], { cwd: working });
      for (const file of candidate.files) {
        await mkdir(dirname(join(working, file.path)), { recursive: true });
        await writeFile(join(working, file.path), file.content);
      }
      command('git', ['add', '--intent-to-add', '--', ...candidate.files.map(file => file.path)], { cwd: working });
      console.error(`[agent] Checking candidate ${attempt + 1}/3 in a fresh offline container`);
      const result = await sandbox.verify(working, candidate.files.map(file => file.path));
      preserveBaseline(report.baseline, result);
      report.attempts.push(result);
      if (result.passed) {
        report.files = candidate.files.map(file => file.path);
        report.modifiedExistingTests = report.files.filter(path => tree.has(path));
        patch = command('git', ['diff', '--no-ext-diff', '--no-textconv', '--', ...report.files], { cwd: working });
        if (!patch) throw new AgentError('FAILED', 'Verification produced an empty patch.');
        report.status = 'VERIFIED'; report.reason = candidate.reason;
        return report;
      }
      feedback = { candidate, failures: result.results.filter(check => check.exitCode !== 0).map(check => ({ name: check.name, output: check.output.slice(-8000) })) };
    }
    throw new AgentError('FAILED', 'No candidate passed verification within three generation attempts.');
  } catch (error) {
    report.status = error instanceof AgentError ? error.status : 'FAILED';
    report.reason = (error instanceof Error ? error.message : 'Unexpected runner error').slice(0, 6000);
    return report;
  } finally {
    sandbox?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
    report.requests = provider?.requests ?? 0;
    if (provider?.modelsUsed.length) report.model = provider.modelsUsed.join(', ');
    report.inputTokens = provider?.inputTokens ?? 0;
    report.outputTokens = provider?.outputTokens ?? 0;
    report.durationMs = Date.now() - started;
    await mkdir(options.output, { recursive: true });
    await rm(join(options.output, 'verified-tests.patch'), { force: true });
    if (report.status === 'VERIFIED') await writeFile(join(options.output, 'verified-tests.patch'), patch);
    await writeFile(join(options.output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(join(options.output, 'report.md'), renderReport(report, patch));
  }
}
