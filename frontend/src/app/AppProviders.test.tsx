import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useTheme } from 'styled-components'
import { expect, it, vi } from 'vitest'
import { GlobalStyles, theme } from '../design-system'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

it('provides QueryClient, theme, and GlobalStyles to children', () => {
  const customClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders client={customClient}>{children}</AppProviders>
  )
  const { result } = renderHook(
    () => ({ client: useQueryClient(), theme: useTheme() }),
    { wrapper },
  )

  expect(result.current.client).toBe(customClient)
  expect(result.current.theme).toEqual(theme)
  expect(GlobalStyles).toHaveBeenCalled()
})
