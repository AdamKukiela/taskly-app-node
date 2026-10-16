import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

afterEach(() => {
  vi.useRealTimers()
})

it('starts without a notice and exposes a notification callback', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  expect(result.current.notify).toEqual(expect.any(Function))
})

it('displays a notification and clears it after 4000ms', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())

  act(() => {
    result.current.notify('Task saved.')
  })
  expect(result.current.message).toBe('Task saved.')

  act(() => {
    vi.advanceTimersByTime(3999)
  })
  expect(result.current.message).toBe('Task saved.')

  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current.message).toBe('')
})
