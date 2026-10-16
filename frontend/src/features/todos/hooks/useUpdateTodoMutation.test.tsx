import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    update: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

it('updates the matching task in the cache and leaves other tasks unchanged', async () => {
  const other: Todo = { ...todoFixture, id: 2, title: 'Other task' }
  const updated: Todo = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(updated)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture, other])
  const cancelSpy = vi.spyOn(queryClient, 'cancelQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    })
  })

  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    completed: true,
  })
  expect(cancelSpy).toHaveBeenCalledWith({ queryKey: todoKeys.list })
  expect(queryClient.getQueryData<Todo[]>(todoKeys.list)).toEqual([
    updated,
    other,
  ])
  queryClient.clear()
})
