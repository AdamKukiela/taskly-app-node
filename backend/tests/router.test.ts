import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = {
    list: vi.fn().mockResolvedValue([todo]),
    create: vi.fn().mockResolvedValue(todo),
    get: vi.fn().mockResolvedValue(todo),
    update: vi.fn().mockResolvedValue(todo),
    delete: vi.fn().mockResolvedValue(true),
    deleteCompleted: vi.fn(),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});

it('clears completed tasks and returns the deleted count', async () => {
  const { app, repository } = setup();
  repository.deleteCompleted.mockResolvedValue(3);
  const response = await request(app).delete('/api/todos/completed');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ deletedCount: 3 });
  expect(repository.deleteCompleted).toHaveBeenCalledOnce();
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it('returns 422 when id parameter is invalid', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos/invalid-id');
  expect(response.status).toBe(422);
  expect(response.body).toHaveProperty('detail');
  expect(repository.get).not.toHaveBeenCalled();
});
it('gets todo by id', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});
it('returns 404 when getting non-existent todo', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/999');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('updates todo by id', async () => {
  const { app, repository } = setup();
  const response = await request(app).patch('/api/todos/1').send({ title: 'Updated Title' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.update).toHaveBeenCalledWith(1, { title: 'Updated Title' });
});
it('rejects invalid update payload without calling repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).patch('/api/todos/1').send({});
  expect(response.status).toBe(422);
  expect(repository.update).not.toHaveBeenCalled();
});
it('returns 404 when updating non-existent todo', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(null);
  const response = await request(app).patch('/api/todos/999').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('deletes todo by id', async () => {
  const { app, repository } = setup();
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(repository.delete).toHaveBeenCalledWith(1);
});
it('returns 404 when deleting non-existent todo', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(false);
  const response = await request(app).delete('/api/todos/999');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
