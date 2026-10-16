import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from '../api/todos'
import { todoKeys } from '../api/queryKeys'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos', () => ({
  todosApi: { clearCompleted: vi.fn() },
}))

it('invalidates the cached task list after a successful clear', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deletedCount: 1 })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result, unmount } = renderHook(() => useClearCompletedMutation(), {
    wrapper,
  })

  try {
    await act(async () => {
      await result.current.mutateAsync(undefined)
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ deletedCount: 1 })
    expect(todosApi.clearCompleted).toHaveBeenCalledOnce()
    expect(queryClient.getQueryState(todoKeys.list)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
  } finally {
    unmount()
    queryClient.clear()
    vi.resetAllMocks()
  }
})
