import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GlobalStyles } from '../design-system'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function Consumer() {
  const client = useQueryClient()
  return <div>{client ? 'QueryClient ready' : 'Missing client'}</div>
}

it('provides QueryClient, theme, and GlobalStyles to children', () => {
  const customClient = new QueryClient()
  render(
    <AppProviders client={customClient}>
      <Consumer />
    </AppProviders>,
  )

  expect(screen.getByText('QueryClient ready')).toBeVisible()
  expect(GlobalStyles).toHaveBeenCalled()
})
