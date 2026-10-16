import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

it('executes schema initialization query on the database client', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const executeRaw = vi.spyOn(database, '$executeRaw').mockResolvedValue(0);

  await initialize(database);

  expect(executeRaw).toHaveBeenCalledOnce();
  const [strings] = executeRaw.mock.calls[0];
  expect(Array.isArray(strings) ? strings.join('') : String(strings)).toContain('CREATE TABLE IF NOT EXISTS todos');
});
