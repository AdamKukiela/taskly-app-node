import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

it('reports true while a todos mutation is in flight and false once settled', async () => {
  let resolveMutation!: () => void
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey: todoKeys.create,
        mutationFn: () =>
          new Promise<void>((resolve) => {
            resolveMutation = resolve
          }),
      }),
    }),
    { wrapper },
  )

  expect(result.current.busy).toBe(false)

  act(() => {
    result.current.mutation.mutate()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))

  await act(async () => {
    resolveMutation()
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
  queryClient.clear()
})
