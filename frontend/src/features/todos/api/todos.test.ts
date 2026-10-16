import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])
  await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it('sends only writable task fields on update', async () => {
  const updated = { ...todoFixture, completed: true }
  vi.mocked(request).mockResolvedValue(updated)
  await expect(
    todosApi.update(todoFixture.id, { completed: true }),
  ).resolves.toEqual(updated)
  expect(request).toHaveBeenCalledWith(`/todos/${todoFixture.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: undefined,
      description: undefined,
      priority: undefined,
      due_date: undefined,
      completed: true,
    }),
  })
})

it('deletes a task by id', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await expect(todosApi.remove(todoFixture.id)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledWith(`/todos/${todoFixture.id}`, {
    method: 'DELETE',
  })
})
