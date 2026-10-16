---
name: analyze-changes
description: Identify behavioral changes and decide whether unit tests need creation or updates.
---

Read changed code together with existing tests and relevant imports. Distinguish a missing test file from missing behavior coverage. In coverage mode, use the selected modules and coverage report to identify gaps even when there is no diff.

Choose generate, update, skip, or needs_review. A skip for already-covered behavior must identify the existing test cases. A documentation-only change requires no test generation. Configuration and dependency changes are handled by the runner's review gate.

List source paths, target test paths, and concrete behaviors. Backend test paths must use `backend/tests/<module>.test.ts` (for example `backend/src/limit.ts` maps to `backend/tests/limit.test.ts`). Frontend test paths must be co-located under `frontend/src/**/*.test.ts` or `.test.tsx` (for example `frontend/src/label.ts` maps to `frontend/src/label.test.ts`). Select backend-unit-tests for backend changes and frontend-unit-tests for frontend changes. Consider success, failure, boundaries, and state transitions without duplicating existing tests. Do not infer requirements solely from a PR title.
