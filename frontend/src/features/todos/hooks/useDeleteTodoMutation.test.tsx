import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    remove: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

it('removes the deleted task from the cached list after success', async () => {
  const remaining: Todo = { ...todoFixture, id: 2, title: 'Keep me' }
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture, remaining])
  const cancelSpy = vi.spyOn(queryClient, 'cancelQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync(todoFixture.id)
  })

  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(cancelSpy).toHaveBeenCalledWith({ queryKey: todoKeys.list })
  expect(queryClient.getQueryData<Todo[]>(todoKeys.list)).toEqual([remaining])
  queryClient.clear()
})
