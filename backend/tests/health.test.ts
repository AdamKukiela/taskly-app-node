import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import { createDatabase } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

it('checks database connectivity and returns status ok', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const findFirst = vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null);
  const app = express();
  app.use('/api', createHealthRouter(database));

  const response = await request(app).get('/api/health');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('propagates database errors when health check query fails', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(new Error('Database down'));
  const app = express();
  app.use('/api', createHealthRouter(database));

  const response = await request(app).get('/api/health');

  expect(response.status).toBe(500);
});
