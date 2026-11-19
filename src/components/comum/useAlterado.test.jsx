import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAlterado } from './useAlterado'

describe('useAlterado', () => {
  it('compara com o que estava ao abrir (e volta a false se a pessoa desfaz)', () => {
    const { result, rerender } = renderHook(({ valores }) => useAlterado(valores), { initialProps: { valores: { nome: '', times: [] } } })
    expect(result.current).toBe(false)
    rerender({ valores: { nome: 'A', times: [] } })
    expect(result.current).toBe(true)
    rerender({ valores: { nome: '', times: ['t1'] } })
    expect(result.current).toBe(true)
    rerender({ valores: { nome: '', times: [] } })
    expect(result.current).toBe(false)
  })

  it('um arquivo escolhido conta como mudança', () => {
    const { result, rerender } = renderHook(({ valores }) => useAlterado(valores), { initialProps: { valores: { logo: null } } })
    rerender({ valores: { logo: new File(['x'], 'logo.png') } })
    expect(result.current).toBe(true)
  })
})
