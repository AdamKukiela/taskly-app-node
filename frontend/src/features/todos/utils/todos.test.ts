import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Todo, TodoInput } from '../types'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('validateTodo', () => {
  const validInput: TodoInput = {
    title: 'Prepare release',
    description: 'Notes',
    priority: 'medium',
    due_date: '2026-10-15',
    completed: false,
  }

  it('returns no errors for valid input', () => {
    expect(validateTodo(validInput)).toEqual({})
  })

  it('validates empty and overly long titles and descriptions', () => {
    expect(validateTodo({ ...validInput, title: '   ' }).title).toBe(
      'Enter a task title.',
    )
    expect(validateTodo({ ...validInput, title: 'x'.repeat(121) }).title).toBe(
      'The title must be at most 120 characters.',
    )
    expect(
      validateTodo({ ...validInput, description: 'x'.repeat(2001) })
        .description,
    ).toBe('The description must be at most 2000 characters.')
  })

  it.each(['2026/10/15', '2026-13-01', '2026-02-30'])(
    'rejects invalid due_date %s',
    (due_date) => {
      expect(validateTodo({ ...validInput, due_date }).due_date).toBe(
        'Enter a valid date.',
      )
    },
  )
})

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
    expect(selectTodos(todos, 'completed', 'api', 'newest')).toEqual([
      { ...matching, id: 2, completed: true },
    ])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('sorts by due date with null dates last and breaks ties by id descending', () => {
    const noDue: Todo = { ...base, id: 1, due_date: null }
    const earlierDue: Todo = { ...base, id: 2, due_date: '2026-10-10' }
    const sameDueHigherId: Todo = { ...base, id: 3, due_date: '2026-10-10' }
    expect(
      selectTodos([noDue, earlierDue, sameDueHigherId], 'all', '', 'due'),
    ).toEqual([sameDueHigherId, earlierDue, noDue])
  })
})

describe('isOverdue and formatDate', () => {
  it('marks only incomplete tasks with a due date before today as overdue', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0))

    expect(
      isOverdue({ ...base, due_date: '2026-10-15', completed: false }),
    ).toBe(true)
    expect(
      isOverdue({ ...base, due_date: '2026-10-16', completed: false }),
    ).toBe(false)
    expect(
      isOverdue({ ...base, due_date: '2026-10-15', completed: true }),
    ).toBe(false)
    expect(isOverdue({ ...base, due_date: null, completed: false })).toBe(false)
  })

  it('formats calendar dates in en-GB format', () => {
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
  })
})
