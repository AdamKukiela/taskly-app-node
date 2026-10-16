import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../test/todoFixture'
import { todoKeys } from './api/queryKeys'
import { todosApi } from './api/todos'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('./api/todos', () => ({
  todosApi: { list: vi.fn(), clearCompleted: vi.fn() },
}))

const active = { ...todoFixture, id: 1, title: 'Active task', completed: false }
const completed = {
  ...todoFixture,
  id: 2,
  title: 'Completed task',
  completed: true,
}
const clients = new Set<QueryClient>()

afterEach(() => {
  for (const client of clients) client.clear()
  clients.clear()
  vi.resetAllMocks()
})

function setup(todos: Todo[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  clients.add(client)
  client.setQueryData(todoKeys.list, todos)
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <TodosPage />
    </QueryClientProvider>,
  )
  return { client, user }
}

it('clears completed tasks, refreshes the list, and shows the returned count', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([active])
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deletedCount: 1 })
  const { client, user } = setup([active, completed])

  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(await screen.findByText('1 completed task cleared.')).toBeVisible()
  await waitFor(() =>
    expect(client.getQueryData(todoKeys.list)).toEqual([active]),
  )
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  expect(todosApi.list).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Clear completed' })).toBeDisabled()
})

it('keeps the cached list and displays an API failure without a success notice', async () => {
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(
    new Error('Could not clear tasks'),
  )
  const { client, user } = setup([active, completed])

  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(await screen.findByText('Could not clear tasks')).toBeVisible()
  expect(client.getQueryData(todoKeys.list)).toEqual([active, completed])
  expect(todosApi.list).not.toHaveBeenCalled()
  expect(screen.queryByText(/completed tasks? cleared/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Clear completed' })).toBeEnabled()
})

it('blocks duplicate clears and other task actions while the request is pending', async () => {
  let finish: (result: { deletedCount: number }) => void = () => {
    throw new Error('Request was not started')
  }
  vi.mocked(todosApi.clearCompleted).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  vi.mocked(todosApi.list).mockResolvedValue([active])
  const { user } = setup([active, completed])

  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  const pending = await screen.findByRole('button', { name: 'Clearing…' })
  expect(pending).toBeDisabled()
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
  await user.click(pending)
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  await act(async () => finish({ deletedCount: 1 }))
  expect(await screen.findByText('1 completed task cleared.')).toBeVisible()
})

it('does not call the API when there are no completed tasks', async () => {
  const { user } = setup([active])
  const clear = screen.getByRole('button', { name: 'Clear completed' })
  expect(clear).toBeDisabled()
  await user.click(clear)
  expect(todosApi.clearCompleted).not.toHaveBeenCalled()
})
