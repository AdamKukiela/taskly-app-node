import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/core/database.ts';
import { createApp } from '../src/factory.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  return { database, app: createApp(database) };
}

it('serves health check, OpenAPI specification, and todos routes without x-powered-by', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null);
  vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);

  const health = await request(app).get('/api/health');
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ status: 'ok' });
  expect(health.headers['x-powered-by']).toBeUndefined();

  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200);
  expect(spec.body.info.title).toBeDefined();

  const todos = await request(app).get('/api/todos');
  expect(todos.status).toBe(200);
  expect(todos.body).toEqual([todo]);
});

it('returns 404 JSON for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('returns 422 when request body contains malformed JSON', async () => {
  const { app } = setup();
  const response = await request(app)
    .post('/api/todos')
    .set('Content-Type', 'application/json')
    .send('{"title": ');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});

it('returns 413 when JSON payload exceeds the body size limit', async () => {
  const { app } = setup();
  const response = await request(app)
    .post('/api/todos')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ title: 'x'.repeat(150_000) }));
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});

it('logs unexpected errors and returns 500 Internal Server Error', async () => {
  const { app, database } = setup();
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(database.todo, 'findMany').mockRejectedValue(new Error('Unexpected database failure'));

  const response = await request(app).get('/api/todos');

  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(errorSpy).toHaveBeenCalledOnce();
});
