# Unit test agent

## Design

The custom agent is a small Node.js 24/TypeScript runner using Gemini's REST API and Zod-validated structured responses. The model analyzes behavior and writes tests; application snapshots, allowed paths, execution, retry limits, and publication belong to deterministic code. No agent framework or persistent memory is required for this repository.

- `agent/AGENT.md` defines the agent's role and boundaries.
- `agent/skills/analyze-changes/SKILL.md` classifies changes and maps behaviors to tests. A mocked component is not evidence that its implementation is covered.
- `agent/skills/backend-unit-tests/SKILL.md` supplies Vitest, Supertest, and Prisma delegate-mocking conventions.
- `agent/skills/frontend-unit-tests/SKILL.md` supplies React Testing Library, React Query, and frontend formatting conventions.
- `agent/src/runner.ts` orchestrates analysis, generation, and verification. It loads the analysis skill first, then only the test-writing skills required by selected targets.
- `agent/src/repository.ts`, `policy.ts`, and `sandbox.ts` handle Git snapshots/context, validation, and Docker execution respectively. `model.ts` handles structured responses and bounded HTTP retries. `report.ts` and `publish.ts` render results and update the PR comment.

The agent can create new tests or extend existing passing suites. Generated files are limited to `backend/tests/**/*.test.ts` and `frontend/src/**/*.test.{ts,tsx}`. Production code, dependency/configuration files, and CI are outside its write scope. Focused/skipped tests and suppression comments are rejected, and candidates must contain an assertion matcher call.

The input SHA must pass typechecks and tests before generation. Each run allows up to three generated candidates. Invalid frontend syntax and compiler/test failures feed bounded diagnostics into the next attempt. Every executable candidate gets a fresh container; a passing candidate must preserve test counts, pending-test counts, and covered line/statement/function/branch counts. Percentages alone are not used for this guard because importing additional modules can increase the denominator.

## GitHub workflow and security

`.github/workflows/unit-test-agent.yml` runs on PR `opened`, `synchronize`, `reopened`, and `ready_for_review` events. It generates tests for non-draft PRs from the same repository. Forks and drafts receive an explanatory Actions summary, without access to the Gemini secret.

The generation job checks out runner code from the PR's base SHA and application code from the exact head SHA. It has `contents: read`; checkout credentials are not persisted. Changes to agent instructions, workflows, dependencies, Prisma schema, or execution configuration require manual review instead of generation.

Docker installs locked application dependencies once per run with npm lifecycle scripts disabled, then generates the Prisma client. This preparation needs network access. Typechecks and tests run as a non-root user in fresh containers with `--network none`, dropped capabilities, `no-new-privileges`, and CPU/memory/PID limits. No API keys, GitHub tokens, Docker socket, or host source directories are mounted. The container filesystem is writable for test and coverage output; it is not a read-only sandbox or a proof that arbitrary hostile code is harmless.

A separate job has `pull-requests: write` and publishes a sticky PR comment. It consumes schema/size-checked artifacts, rejects symlink artifacts, checks the current head SHA, and only updates the Actions bot's own marked comment. The result also appears in the Actions summary and `unit-test-agent-report` artifact. `verified-tests.patch` is published only for a verified candidate; the agent does not push commits to developer branches.

## Running

Prerequisites: a public GitHub repository with Actions enabled, repository secret `GEMINI_API_KEY`, and a base branch containing the agent/workflow. `GEMINI_MODEL` is an optional repository variable; the default is `gemini-3.5-flash`. The client retries transient HTTP failures at most three times per call, including fallback models, and reports the models that actually responded. Model availability and quota depend on the API project.

For local runs, install Node.js >=24 and Docker, start Docker, and export `GEMINI_API_KEY` in the shell. Run these commands from the repository root:

```bash
npm --prefix agent ci
npm --prefix agent run typecheck
npm --prefix agent test
npm --prefix agent run preflight

# Analyze committed changes on the current branch.
npm --prefix agent run run -- --mode pr --repo .. \
  --base origin/main --head HEAD --output results/local-pr

# Audit explicitly selected modules without a PR diff.
npm --prefix agent run run -- --mode coverage --repo .. \
  --targets backend/src/api/health.ts,frontend/src/lib/http.ts \
  --output results/local-coverage

# Seven live-model analysis fixtures; consumes API quota.
npm --prefix agent run evaluate
```

The agent installs application dependencies inside Docker. To run application checks directly on the host, install each package's dependencies first (`npm --prefix backend ci` and `npm --prefix frontend ci`); the backend postinstall generates Prisma without requiring PostgreSQL.

Reports are written under `agent/results/` and ignored by Git. Review a verified patch before applying it from the repository root, for example `git apply --check agent/results/local-pr/verified-tests.patch` followed by `git apply agent/results/local-pr/verified-tests.patch`. There is no host-verifier bypass or manual workflow-dispatch trigger.

## Observed results

Application checks on `main` pass: 72 backend tests and 48 frontend tests. Statement coverage rises from 30.23% to 77.51% on the backend and from 46.42% to 88.69% on the frontend compared with the base application's measured baseline. Backend tests mock database IO and require no PostgreSQL service.

The earlier automated coverage run loaded all three skills and produced a verified four-file patch. It increased backend tests from 48 to 56 and frontend tests from 18 to 25; statement coverage rose to 44.96% and 53.57% respectively. Further test additions on `main` account for the totals above.

`agent/src/evaluate.ts` sends seven small fixtures to the analysis stage: backend boundaries, frontend labels, docs-only changes, already-covered behavior, an outdated expectation, a mocked parent, and prompt injection. It checks decisions and concrete allowed target paths using the runtime's analysis guard. These are decision evaluations, not synthetic Git repositories, generated-test verification, or proof of injection resistance. The outdated-expectation fixture assesses triage only: a full run with that failing baseline stops for manual review.

The post-review live evaluation passed 7/7 fixtures using 18 API requests across the configured model and fallbacks. The runner's 25 deterministic unit tests also pass, including malformed-candidate repair and failing-baseline refusal.

The [clear-completed example PR](https://github.com/AdamKukiela/taskly-app-node/pull/1) exercises both application packages. The PR comment links the exact workflow run, records selected skills, and shows baseline/candidate test counts, coverage, and any verified patch. Its initial `SKIPPED` result incorrectly treated a mocked button as implementation coverage; the analysis skill and mocked-parent evaluation were corrected after review.

## Assumptions and limits

- The committed base branch is trusted. Generated tests and repository contents remain untrusted input; prompts, path guards, and AST checks cannot establish semantic correctness. Existing assertion changes still need human review.
- A failing input baseline stops with `BASELINE_FAILED`. If a feature intentionally changes an old expectation, a maintainer must review/update that contract first. The agent does not decide that a failing assertion is obsolete merely to make CI green.
- Context comes from selected modules, adjacent test files, and transitive relative imports. Dynamic imports/aliases may need additional context. Runs are capped at 20 selected source modules, 10 target files, bounded content size, and three generation attempts.
- Coverage preservation discourages replacing useful tests with empty ones; coverage and passing tests do not prove that assertions catch regressions. The current checks do not compare every original assertion or test identity.
- Gemini availability, response latency, and nondeterminism affect runs. Configuration/provider failures produce an explicit failure report; they are not silently treated as successful generation.
- The scope is unit/component/router testing. It does not include real PostgreSQL integration tests, migrations, browser E2E tests, or autonomous patch application. Process entrypoints/lifecycle code remain incompletely covered.

## Production follow-up

Add mutation testing on changed behavior, per-file coverage evidence for triage, stronger sandbox isolation for hostile contributors, and a maintainer-approved companion PR for applying patches. Keep provider choices configurable and extend the live evaluation corpus with failures observed in real PRs before adding more agent infrastructure.
