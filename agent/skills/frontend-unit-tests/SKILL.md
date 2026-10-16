---
name: frontend-unit-tests
description: Write Vitest and React Testing Library tests for components, hooks, and HTTP behavior.
---

Co-locate tests as frontend/src/**/*.test.ts or .test.tsx. Match Prettier's no-semicolon convention. Existing component tests replace design-system components using vi.mock with the design-system/mocks module; reuse this only when relevant.

Test user-visible behavior with accessible queries and userEvent. Hook tests use renderHook, act, and waitFor. Create a fresh QueryClient per test with query and mutation retries disabled, and clear it after use. Mock the API boundary, not the hook under test.

For mutations, inspect actual cached data after success and failure. Cover missing cache, replacement, deletion, duplicate prevention, and query cancellation when relevant. For HTTP, cover JSON success, 204, validation errors, network failure, and abort propagation. Restore fetch mocks and fake timers. Avoid wall-clock and locale-dependent assertions.

Reset shared mock implementations and call history before each test. Pair vi.stubGlobal with vi.unstubAllGlobals; vi.restoreAllMocks does not restore stubbed globals.
