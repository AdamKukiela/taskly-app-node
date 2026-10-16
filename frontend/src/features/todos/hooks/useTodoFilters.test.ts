import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

it('filters, searches, and sorts visible tasks when state updates', () => {
  const activeLow: Todo = {
    ...todoFixture,
    id: 1,
    title: 'Write docs',
    priority: 'low',
    completed: false,
  }
  const completedHigh: Todo = {
    ...todoFixture,
    id: 2,
    title: 'Ship release',
    priority: 'high',
    completed: true,
  }
  const { result } = renderHook(() =>
    useTodoFilters([activeLow, completedHigh]),
  )

  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([completedHigh, activeLow])

  act(() => {
    result.current.setFilter('completed')
  })
  expect(result.current.visible).toEqual([completedHigh])

  act(() => {
    result.current.setFilter('all')
    result.current.setSearch('docs')
  })
  expect(result.current.visible).toEqual([activeLow])

  act(() => {
    result.current.setSearch('')
    result.current.setSort('priority')
  })
  expect(result.current.visible).toEqual([completedHigh, activeLow])
})
