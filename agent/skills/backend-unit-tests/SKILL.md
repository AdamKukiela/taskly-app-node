---
name: backend-unit-tests
description: Write Vitest tests for TypeScript backend behavior with isolated database IO.
---

Place tests in backend/tests/**/*.test.ts. Use semicolons and existing fixture patterns. Test imports use .ts extensions; production imports may use .js through TypeScript resolution.

Use Vitest and Supertest for HTTP behavior. Existing repository tests construct a Prisma client and spy on delegate IO; they do not connect to PostgreSQL. For router tests, supply a mocked repository and assert status, response, and validated arguments. HTTP tests with Express are component tests, not database integration tests.

Cover invalid IDs, invalid bodies, missing records, success, and error propagation where relevant. Verify that rejected requests do not call storage. Restore spies and environment changes. Control time for date-dependent behavior. Do not mock the function or router being tested.
