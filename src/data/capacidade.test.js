import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { ocupacaoDasPessoas } from './capacidade'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

describe('ocupacaoDasPessoas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sem ids devolve vazio e não chama o banco', async () => {
    expect(await ocupacaoDasPessoas({ ids: [], mes: '2026-11-01' })).toEqual({})
    expect(await ocupacaoDasPessoas()).toEqual({})
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('pede tudo numa chamada e devolve um objeto por id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: 'a', capacidade: 167.2, reservado: 70, realizado: 0, ocupacao: 0.4187, clientes: 2 },
        { id: 'b', capacidade: 0, reservado: 0, realizado: 0, ocupacao: null, clientes: 0 },
      ],
      error: null,
    })
    const r = await ocupacaoDasPessoas({ ids: ['a', 'b'], mes: '2026-11-01' })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('ocupacao_das_pessoas', { p_ids: ['a', 'b'], p_mes: '2026-11-01' })
    expect(r).toEqual({
      a: { capacidade: 167.2, reservado: 70, realizado: 0, ocupacao: 0.4187, clientes: 2 },
      b: { capacidade: 0, reservado: 0, realizado: 0, ocupacao: null, clientes: 0 },
    })
  })

  it('manda mês nulo quando não vem e propaga o erro', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'x' } })
    await expect(ocupacaoDasPessoas({ ids: ['a'] })).rejects.toEqual({ message: 'x' })
    expect(supabase.rpc).toHaveBeenCalledWith('ocupacao_das_pessoas', { p_ids: ['a'], p_mes: null })
  })
})
