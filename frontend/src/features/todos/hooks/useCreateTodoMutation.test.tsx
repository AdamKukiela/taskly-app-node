import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    create: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

it('creates a task and prepends it to the cached list without duplicates', async () => {
  const existing: Todo = { ...todoFixture, id: 1, title: 'Existing task' }
  const duplicate: Todo = { ...todoFixture, id: 7, title: 'Old version' }
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { queryClient, wrapper } = createWrapper()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [existing, duplicate])
  const cancelSpy = vi.spyOn(queryClient, 'cancelQueries')

  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync({
      title: todoFixture.title,
      description: todoFixture.description,
      priority: todoFixture.priority,
      due_date: todoFixture.due_date,
      completed: todoFixture.completed,
    })
  })

  expect(cancelSpy).toHaveBeenCalledWith({ queryKey: todoKeys.list })
  expect(queryClient.getQueryData<Todo[]>(todoKeys.list)).toEqual([
    todoFixture,
    existing,
  ])
  queryClient.clear()
})

it('initializes the cached list when no prior cache entry exists', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { queryClient, wrapper } = createWrapper()

  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync(todoFixture)
  })

  expect(queryClient.getQueryData<Todo[]>(todoKeys.list)).toEqual([todoFixture])
  queryClient.clear()
})
