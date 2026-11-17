import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { painelDoInicio } from './painel'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

describe('painelDoInicio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pede o mês numa chamada só e devolve o objeto do banco sem mexer', async () => {
    const painel = { recorte: 'consultoria', mes: '2026-11-01', passado: false, indicadores: { clientes_ativos: 4 } }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: painel, error: null })
    expect(await painelDoInicio('2026-11-01')).toBe(painel)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('painel_do_inicio', { p_mes: '2026-11-01' })
  })

  it('manda mês nulo quando não vem', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: {}, error: null })
    await painelDoInicio()
    expect(supabase.rpc).toHaveBeenCalledWith('painel_do_inicio', { p_mes: null })
  })

  it('propaga o erro', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(painelDoInicio('2026-11-01')).rejects.toEqual({ code: '42501' })
  })
})
