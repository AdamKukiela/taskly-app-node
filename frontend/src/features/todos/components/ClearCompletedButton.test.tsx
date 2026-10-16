import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { todosApi } from '../api/todos'
import { ClearCompletedButton } from './ClearCompletedButton'

vi.mock('../api/todos', () => ({
  todosApi: {
    clearCompleted: vi.fn(),
  },
}))

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

const clients = new Set<QueryClient>()

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  clients.add(queryClient)
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

afterEach(() => {
  for (const client of clients) client.clear()
  clients.clear()
  vi.resetAllMocks()
})

it('renders clear completed button and handles click triggers successfully', async () => {
  const user = userEvent.setup()
  const onCleared = vi.fn()
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deletedCount: 2 })

  renderWithClient(
    <ClearCompletedButton disabled={false} onCleared={onCleared} />,
  )

  const button = screen.getByRole('button', { name: 'Clear completed' })
  expect(button).toBeInTheDocument()
  expect(button).not.toBeDisabled()

  await user.click(button)

  await waitFor(() => expect(onCleared).toHaveBeenCalledWith(2))
  expect(todosApi.clearCompleted).toHaveBeenCalledOnce()
})

it('displays error message when clear completed mutation fails', async () => {
  const user = userEvent.setup()
  const onCleared = vi.fn()
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(
    new Error('Failed to connect'),
  )

  renderWithClient(
    <ClearCompletedButton disabled={false} onCleared={onCleared} />,
  )

  const button = screen.getByRole('button', { name: 'Clear completed' })
  await user.click(button)

  await waitFor(() =>
    expect(screen.getByTestId('alert')).toHaveTextContent('Failed to connect'),
  )
  expect(onCleared).not.toHaveBeenCalled()
})
