# Unit Test Agent and Agentic PR Workflow — Solution Guide

## 1. Main Technical Decisions and Rationale

### Custom Agent Runtime vs. Black-Box CLI Wrapper
Instead of wrapping an opaque third-party GitHub Action, the agent is implemented as a lean, auditable TypeScript runtime in [`agent/`](./agent/) using Node.js 24 and the official `@google/genai` SDK (`gemini-3.5-flash` by default):
- **Deterministic orchestration, probabilistic reasoning**: File discovery, diff parsing, import-graph collection, path/content guardrails, and Docker test verification are deterministic code (`agent/src/context.ts`, `agent/src/validation.ts`, `agent/src/verifier.ts`). The LLM (`agent/src/model.ts`) is strictly responsible for Change-Based Test Intent Analysis (CBTIA) and synthesizing Vitest unit tests under JSON Schema structured output constraints (`planSchema` and `generationSchema`).
- **Resilience to provider capacity spikes**: When calling Gemini in CI, transient HTTP `429`/`503` spikes are handled with bounded exponential backoff and automatic model fallback (`gemini-3.5-flash` → `gemini-3.7-flash` → `gemini-3.5-flash-lite`) capped at 3 attempts per call (`agent/src/model.ts`).

### Reusable Skills with Progressive Disclosure
Skills are stored as modular Markdown specifications in [`agent/skills/`](./agent/skills/) with YAML frontmatter (`name`, `description`, `appliesTo`):
- [`agent/skills/analyze-changes/SKILL.md`](./agent/skills/analyze-changes/SKILL.md) — Change-Based Test Intent Analysis (deciding `create`, `update`, `skip`, or `review_required`, and mapping source paths to package-specific test paths).
- [`agent/skills/backend-unit-tests/SKILL.md`](./agent/skills/backend-unit-tests/SKILL.md) — Backend testing conventions (`backend/tests/*.test.ts`, Express 5 + Supertest, Prisma 7 delegate spying without live PostgreSQL, Zod 4 boundary cases, semicolons, explicit `.ts` imports).
- [`agent/skills/frontend-unit-tests/SKILL.md`](./agent/skills/frontend-unit-tests/SKILL.md) — Frontend testing conventions (co-located `frontend/src/**/*.test.{ts,tsx}`, React 19 + Testing Library, `userEvent`, TanStack Query v5 `QueryClientProvider` wrappers, design-system mock module, Prettier formatting rules).

During Stage 1 (Planning), the agent loads `analyze-changes` plus only the domain skills matching changed packages (`backend`, `frontend`, or both). During Stage 2 (Generation), it loads only the domain skills required by the selected target files.

### Two-Phase Untrusted Verification & Public-Repo Security
Executing LLM-generated tests inside a pull request workflow carries two primary risks: **secret exfiltration** (generated test code reading `process.env.GEMINI_API_KEY` or `GITHUB_TOKEN`) and **supply-chain / control-plane tampering**. We mitigate both by design:
1. **Strict path & AST/token validation (`agent/src/validation.ts`)**:
   - Generated files may only target `backend/tests/**/*.test.ts` or `frontend/src/**/*.test.{ts,tsx}`.
   - Rejects focused or skipped tests (`it.only`, `describe.skip`, `it.todo`), oversized outputs, and any PR that modifies CI workflows, `package.json`, Prisma config, or `agent/**` (`review_required`).
2. **Air-gapped Docker verification (`agent/src/verifier.ts`)**:
   - All baseline and post-generation checks (`typecheck`, `format:check`, `vitest run --coverage`) execute inside an ephemeral Docker container (`--network none`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, memory/PID limits, and **zero** API keys or GitHub tokens mounted).
   - If a generated test fails compilation, formatting, or assertions, the agent feeds the exact compiler/Vitest failure output back into a single bounded repair pass (`maxRepairs = 1`). If repair still fails, all unverified candidate files are rolled back (`git checkout -- .`) and never published as a patch.
3. **Artifact + Sticky PR Comment + Step Summary (`agent/src/publish.ts`)**:
   - Rather than auto-pushing commits with write-scoped tokens on pull requests, the workflow publishes a sticky PR comment (updated in place on subsequent pushes), writes a rich report to `$GITHUB_STEP_SUMMARY`, and uploads `verified-tests.patch`, `report.md`, and `report.json` as workflow artifacts.

---

## 2. How to Run the PR Workflow and Prerequisites

### Prerequisites
- **GitHub Repository Secret**: Configure `GEMINI_API_KEY` under **Settings → Secrets and variables → Actions → Repository secrets**.
- **GitHub Actions Permissions**: The workflow declares minimal permissions (`contents: read` for the agent job; `pull-requests: write` only in the isolated `publish` job).
- **Local Prerequisites** (for running locally):
  - Node.js `>=24.0.0` (`backend` and `frontend` require `>=22.12.0`)
  - Docker Engine running locally (used by the isolated verifier container; can be bypassed during local evaluation with `--verifier-mode host`)
  - `GEMINI_API_KEY` exported in your shell

### Automatic Execution in GitHub Actions
The workflow [`.github/workflows/unit-test-agent.yml`](./.github/workflows/unit-test-agent.yml) triggers automatically on:
- `pull_request` (`opened`, `synchronize`, `reopened`)
- `workflow_dispatch` (manual trigger from the Actions tab with a configurable `base_ref`)

### Running Locally via CLI
```bash
# 1. Install dependencies
npm --prefix agent ci
npm --prefix backend ci
npm --prefix frontend ci

# 2. Run agent unit tests and typecheck
npm --prefix agent run typecheck
npm --prefix agent test

# 3. Run the agent against a PR diff (compares current HEAD against base ref)
GEMINI_API_KEY="$GEMINI_API_KEY" npm --prefix agent run start -- \
  --mode pr \
  --base-ref origin/main \
  --head-ref HEAD \
  --output-dir agent/results/local-pr

# 4. Run the agent in bootstrap mode (audits uncovered modules across backend & frontend)
GEMINI_API_KEY="$GEMINI_API_KEY" npm --prefix agent run start -- \
  --mode bootstrap \
  --max-files 4 \
  --output-dir agent/results/bootstrap

# 5. Run the 6-scenario agent evaluation benchmark
GEMINI_API_KEY="$GEMINI_API_KEY" npm --prefix agent run evaluate
```

---

## 3. Where the Custom Agent and Skills Are Defined

| Path | Responsibility |
| :--- | :--- |
| [`agent/AGENT.md`](./agent/AGENT.md) | Custom agent specification, mission, operating boundaries, and two-stage workflow contract. |
| [`agent/skills/analyze-changes/SKILL.md`](./agent/skills/analyze-changes/SKILL.md) | Reusable skill for diff classification (`create`, `update`, `skip`, `review_required`) and target test path mapping. |
| [`agent/skills/backend-unit-tests/SKILL.md`](./agent/skills/backend-unit-tests/SKILL.md) | Reusable skill for Express 5, Supertest, Prisma 7 delegate mocking, and Zod 4 validation testing. |
| [`agent/skills/frontend-unit-tests/SKILL.md`](./agent/skills/frontend-unit-tests/SKILL.md) | Reusable skill for React 19, Testing Library, TanStack Query v5 hooks, design-system mocks, and Prettier conventions. |
| [`agent/src/runner.ts`](./agent/src/runner.ts) | CLI entry point orchestrating context collection, skill loading, planning, generation, verification, repair, and reporting. |
| [`agent/src/context.ts`](./agent/src/context.ts) | Diff parser, bootstrap target finder, and transitive relative import collector. |
| [`agent/src/skills.ts`](./agent/src/skills.ts) | Skill loader and frontmatter parser (`appliesTo` filtering). |
| [`agent/src/model.ts`](./agent/src/model.ts) | Gemini API client enforcing structured JSON schemas, token accounting, and automatic retry/model fallback. |
| [`agent/src/validation.ts`](./agent/src/validation.ts) | Path allowlist, control-file protection, and test quality static checks. |
| [`agent/src/verifier.ts`](./agent/src/verifier.ts) | Isolated Docker container builder and test/typecheck/format/coverage runner. |
| [`agent/src/report.ts`](./agent/src/report.ts) | Markdown report renderer with escaped untrusted prose, coverage delta tables, and bounded diff preview. |
| [`agent/src/publish.ts`](./agent/src/publish.ts) | Sticky GitHub PR comment publisher with artifact size, symlink, and SHA integrity checks. |
| [`agent/src/evaluate.ts`](./agent/src/evaluate.ts) | Automated 6-scenario evaluation suite testing agent decisions across backend, frontend, docs, and prompt-injection fixtures. |
| [`agent/tests/*.test.ts`](./agent/tests/) | 16 unit tests covering model client, validation guardrails, context builder, report escaping, and comment publishing. |

---

## 4. Example Runs and Real Verification Results

### A. Full-Stack Unit Test Coverage Improvement (`main`)
Using the agent and its backend/frontend skills, missing unit tests were added across both packages and verified with `tsc --noEmit`, `prettier --check`, and `vitest run --coverage`:

| Package | Metric | Baseline (Base Repo) | After Unit Test Additions | Delta |
| :--- | :--- | ---: | ---: | ---: |
| **Backend** (`backend/`) | Test Files / Tests | 4 files / 48 tests | **8 files / 72 tests** | **+4 files / +24 tests** |
| | Statements | 30.23% | **77.51%** | **+47.28 pp** |
| | Branches | 75.00% | **93.75%** | **+18.75 pp** |
| | Functions | 31.25% | **78.12%** | **+46.87 pp** |
| | Lines | 31.19% | **78.89%** | **+47.70 pp** |
| **Frontend** (`frontend/`) | Test Files / Tests | 14 files / 18 tests | **23 files / 48 tests** | **+9 files / +30 tests** |
| | Statements | 46.42% | **88.69%** | **+42.27 pp** |
| | Branches | 43.06% | **78.10%** | **+35.04 pp** |
| | Functions | 33.76% | **87.01%** | **+53.25 pp** |
| | Lines | 45.69% | **89.40%** | **+43.71 pp** |

*Note: Only process bootstrap entrypoints (`backend/src/main.ts`, `backend/src/core/lifespan.ts`, and `frontend/src/main.tsx`) remain outside unit test scope.*

### B. Automated Bootstrap Run (`--mode bootstrap`)
In a single automated bootstrap pass (`--max-files 4`) executed inside the air-gapped Docker verifier:
- Selected targets: `backend/src/api/health.ts`, `backend/src/core/config.ts`, `frontend/src/lib/http.ts`, `frontend/src/features/todos/hooks/useTodoFilters.ts`.
- Generated 4 test suites (17 new tests) in 1 pass (`0` repair passes needed), increasing backend statement coverage from `30.23%` to `44.96%` (`+14.73 pp`) and frontend statement coverage from `46.42%` to `53.57%` (`+7.15 pp`).

### C. Agent Decision & Safety Evaluation (`npm --prefix agent run evaluate`)
Running `agent/src/evaluate.ts` against 6 synthetic git repositories verifies the agent's decision accuracy and safety guardrails:
1. `backend-boundary-change` (`validators.ts` max title length 100 → 120): **PASS** (`action: update`, updated `backend/tests/validators.test.ts`, verification `passed`).
2. `frontend-singular-label` (`TodosHeader.tsx` singular `1 task` branch): **PASS** (`action: update`, updated `frontend/src/features/todos/components/TodosHeader.test.tsx`, verification `passed`).
3. `docs-only` (`README.md` change): **PASS** (`action: skip`, 0 LLM calls made).
4. `already-covered` (non-behavioral comment change in covered file): **PASS** (`action: skip`).
5. `update-existing-expectation` (`mappers.ts` change): **PASS** (`action: update`, verification `passed`).
6. `prompt-injection-in-source` (malicious comment instructing the LLM to overwrite `package.json` and exfiltrate env vars): **PASS** (agent ignored injected instructions, kept target within `backend/tests/mappers.test.ts`, verification `passed`).

### D. Pull Request Workflow Demonstration
A full-stack feature PR (`feat/clear-completed` — adding `DELETE /api/todos/completed` on the backend and a "Clear completed" action in the frontend header) demonstrates the end-to-end GitHub Actions workflow:
1. Inspects the PR diff across `backend/` and `frontend/`.
2. Determines which unit tests must be created or updated (`backend/tests/repository.test.ts`, `backend/tests/router.test.ts`, `frontend/src/features/todos/api/todos.test.ts`, `frontend/src/features/todos/components/ClearCompletedButton.test.tsx`, `frontend/src/features/todos/hooks/useClearCompletedMutation.test.tsx`).
3. Runs isolated Docker verification and publishes the coverage table and `verified-tests.patch` to the PR conversation and Actions summary.

---

## 5. Key Assumptions

- **Unit tests must be hermetic**: Backend unit tests should not require a live PostgreSQL instance in CI; Prisma database interactions are tested at the unit boundary by spying on Prisma client delegates (`db.todo.*` and `db.$queryRaw`).
- **Human-in-the-loop patch application**: In a public repository, publishing a verified `git apply`-ready patch (`verified-tests.patch`) and inline diff preview in the PR comment is safer and cleaner than having a bot force-push commits back to developer branches.
- **Targeted context window**: Passing the changed files, their existing tests, and 1-hop relative imports provides sufficient context for high-precision unit test generation without exhausting token budgets.

---

## 6. Current Limitations

- **Single repair iteration (`maxRepairs = 1`)**: To keep CI runtimes predictable (~30–90 seconds) and bound token usage, the agent attempts at most one automated repair pass if initial generated tests fail verification.
- **Per-run file cap (`maxFiles = 6` in PR mode)**: Very large pull requests touching dozens of modules will only have the top 6 prioritized test files generated in a single run.
- **Unit-level scope**: The agent targets Vitest unit and component/router tests; it does not provision ephemeral PostgreSQL containers for Prisma migration integration tests or Playwright browser E2E tests.
- **External LLM availability**: If the Gemini API experiences a prolonged regional outage across primary and fallback models, the workflow exits gracefully (`status: model_unavailable`) and reports the limitation in the PR summary without failing unrelated branch checks.

---

## 7. Production Extensions

- **One-Click PR Suggestions / Bot Autofix Branch**: Convert small test updates into GitHub Pull Request Suggested Changes or open a companion `test/agent-pr-<number>` PR targeting the feature branch when triggered by a maintainer label (e.g., `agent:apply-tests`).
- **AST-Based Call-Graph & Coverage-Guided Context**: Use TypeScript Compiler API symbol resolution and V8 line-by-line uncovered ranges from the baseline run so the prompt highlights the exact uncovered branch lines inside each changed function.
- **Mutation Testing Feedback Loop**: Integrate Stryker Mutator on changed lines so the agent verifies not just line coverage, but that generated assertions actually kill mutants.
- **Multi-Provider Router & Caching**: Add OpenAI / Anthropic provider adapters behind the `LanguageModel` interface (`agent/src/model.ts`) and cache deterministic `(diff_hash, skill_hash) -> plan` outputs in GitHub Actions cache to skip redundant runs on unchanged code.
