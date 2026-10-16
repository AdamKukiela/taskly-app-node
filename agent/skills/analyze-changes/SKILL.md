---
name: analyze-changes
description: Identify behavioral changes and decide whether unit tests need creation or updates.
---

Read changed code together with existing tests and relevant imports. Distinguish a missing test file from missing behavior coverage. In coverage mode, use the selected modules and coverage report to identify gaps even when there is no diff.

Choose generate, update, skip, or needs_review. A skip for already-covered behavior must identify the existing test cases. A documentation-only change requires no test generation. Configuration and dependency changes are handled by the runner's review gate.

Check each changed module before skipping the whole PR. Name the existing test file, test title, and assertion that exercises each changed behavior. A parent test that mocks a component or hook does not cover its implementation. Passing tests and aggregate coverage percentages alone are not evidence that new behavior is tested. If no test directly or transitively exercises a changed component or hook, propose its missing behavioral tests even when backend and API changes are already covered.

The baseline's uncoveredFiles lists selected source modules whose statements or functions were never executed. Every listed source must receive a test target, or the decision must be needs_review. The runner disallows skip for those modules. Type-only modules and files intentionally excluded from coverage are not treated as unexecuted behavior by this guard.

List source paths, target test paths, and concrete behaviors. Backend test paths must use `backend/tests/<module>.test.ts` (for example `backend/src/limit.ts` maps to `backend/tests/limit.test.ts`). Frontend test paths must be co-located under `frontend/src/**/*.test.ts` or `.test.tsx` (for example `frontend/src/label.ts` maps to `frontend/src/label.test.ts`). Select backend-unit-tests for backend changes and frontend-unit-tests for frontend changes. Consider success, failure, boundaries, and state transitions without duplicating existing tests. Do not infer requirements solely from a PR title.

Choose .test.tsx for React component targets so generated render tests can use JSX. Hook tests using a JSX provider wrapper also need .test.tsx.
