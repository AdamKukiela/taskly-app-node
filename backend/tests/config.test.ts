import { afterEach, describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const envKeys = [
  'DATABASE_URL',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_HOST',
  'DB_PORT',
  'POSTGRES_DB',
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('resolveDatabaseUrl', () => {
  it('uses an explicit override and normalizes postgresql+psycopg scheme', () => {
    expect(resolveDatabaseUrl('postgresql+psycopg://user:pass@db:5432/taskly')).toBe(
      'postgresql://user:pass@db:5432/taskly',
    );
  });

  it('uses DATABASE_URL from environment when no override is passed', () => {
    process.env.DATABASE_URL = 'postgresql+psycopg://envuser:envpass@localhost:5432/envdb';
    expect(resolveDatabaseUrl()).toBe('postgresql://envuser:envpass@localhost:5432/envdb');
  });

  it('builds a connection URL from individual POSTGRES_* variables and encodes the database name', () => {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_USER = 'taskly_user';
    process.env.POSTGRES_PASSWORD = 'secret';
    process.env.POSTGRES_HOST = 'db.internal';
    process.env.DB_PORT = '5433';
    process.env.POSTGRES_DB = 'taskly db';

    expect(resolveDatabaseUrl()).toBe('postgresql://taskly_user:secret@db.internal:5433/taskly%20db');
  });

  it.each(['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'])(
    'throws when required environment variable %s is missing',
    (missingKey) => {
      delete process.env.DATABASE_URL;
      process.env.POSTGRES_USER = 'taskly';
      process.env.POSTGRES_PASSWORD = 'taskly';
      process.env.POSTGRES_HOST = 'localhost';
      process.env.DB_PORT = '5432';
      process.env.POSTGRES_DB = 'taskly';
      delete process.env[missingKey];

      expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${missingKey}`);
    },
  );
});
