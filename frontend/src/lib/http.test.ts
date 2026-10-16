import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request } from './http'

describe('http request', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefixes request path with /api and sets Content-Type header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    })

    const data = await request<{ id: number }>('/todos', {
      headers: { Authorization: 'Bearer token' },
    })

    expect(data).toEqual({ id: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
    })
  })

  it('returns undefined for 204 No Content response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
    })

    const result = await request<void>('/todos/1', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('throws validation message on 422 status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: [] }),
    })

    await expect(request('/todos', { method: 'POST' })).rejects.toThrow(
      'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
    )
  })

  it('throws body detail message on non-ok status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Task not found.' }),
    })

    await expect(request('/todos/999')).rejects.toThrow('Task not found.')
  })

  it('throws fallback error message when json parsing fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON')
      },
    })

    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })

  it('throws network error on fetch failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(request('/todos')).rejects.toThrow(
      'Cannot connect to the server. Please try again.',
    )
  })

  it('rethrows original error when request is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = controller.signal.reason || new Error('Aborted')

    fetchMock.mockRejectedValue(abortError)

    await expect(
      request('/todos', { signal: controller.signal }),
    ).rejects.toThrow(abortError)
  })
})
