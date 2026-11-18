import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  argumentosDoPeriodo,
  checkinsPorSemana,
  clientesEmRisco,
  comparacaoDoInicio,
  filaDeClientes,
  horasPorCliente,
  painelDoInicio,
} from './painel'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

describe('painelDoInicio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pede o mês numa chamada só e devolve o objeto do banco sem mexer', async () => {
    const painel = { recorte: 'consultoria', mes: '2026-11-01', passado: false, indicadores: { clientes_em_atendimento: 4 } }
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

  it('pede o período (de e até, dias de São Paulo) quando vem um objeto', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: {}, error: null })
    await painelDoInicio({ de: '2026-09-16', ate: '2026-10-15' })
    expect(supabase.rpc).toHaveBeenCalledWith('painel_do_inicio', { p_de: '2026-09-16', p_ate: '2026-10-15' })
  })

  it('propaga o erro', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(painelDoInicio('2026-11-01')).rejects.toEqual({ code: '42501' })
  })
})

describe('argumentosDoPeriodo', () => {
  it('o mês (ou nulo) vira p_mes; { de, ate } vira p_de e p_ate', () => {
    expect(argumentosDoPeriodo('2026-10-01')).toEqual({ p_mes: '2026-10-01' })
    expect(argumentosDoPeriodo()).toEqual({ p_mes: null })
    expect(argumentosDoPeriodo(null)).toEqual({ p_mes: null })
    expect(argumentosDoPeriodo({ de: '2026-01-01', ate: '2026-11-18' })).toEqual({ p_de: '2026-01-01', p_ate: '2026-11-18' })
  })
})

describe('as funções dos gráficos do Início', () => {
  beforeEach(() => vi.clearAllMocks())

  // Cada função manda p_mes ou p_de/p_ate (e p_pagina) com esses nomes: o PostgREST escolhe a função pelos nomes.
  it.each([
    ['comparacaoDoInicio', comparacaoDoInicio, 'comparacao_do_inicio'],
    ['filaDeClientes', filaDeClientes, 'fila_de_clientes'],
    ['checkinsPorSemana', checkinsPorSemana, 'checkins_por_semana'],
  ])('%s manda o mês ou o período com os nomes do banco', async (_, funcao, rpc) => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: {}, error: null })
    await funcao('2026-10-01')
    expect(supabase.rpc).toHaveBeenLastCalledWith(rpc, { p_mes: '2026-10-01' })
    await funcao({ de: '2026-09-16', ate: '2026-10-15' })
    expect(supabase.rpc).toHaveBeenLastCalledWith(rpc, { p_de: '2026-09-16', p_ate: '2026-10-15' })
    await funcao()
    expect(supabase.rpc).toHaveBeenLastCalledWith(rpc, { p_mes: null })
  })

  it('horasPorCliente manda o período e p_pagina (nula: os 10 maiores e o resto; com número: a página)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: {}, error: null })
    await horasPorCliente('2026-10-01')
    expect(supabase.rpc).toHaveBeenLastCalledWith('horas_por_cliente', { p_mes: '2026-10-01', p_pagina: null })
    await horasPorCliente({ de: '2026-09-16', ate: '2026-10-15' }, 2)
    expect(supabase.rpc).toHaveBeenLastCalledWith('horas_por_cliente', { p_de: '2026-09-16', p_ate: '2026-10-15', p_pagina: 2 })
  })

  it('clientesEmRisco manda só a página (não depende do período), 1 por padrão', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: {}, error: null })
    await clientesEmRisco()
    expect(supabase.rpc).toHaveBeenLastCalledWith('clientes_em_risco', { p_pagina: 1 })
    await clientesEmRisco(3)
    expect(supabase.rpc).toHaveBeenLastCalledWith('clientes_em_risco', { p_pagina: 3 })
  })

  it('devolvem o JSON do banco como está', async () => {
    const fila = { a_distribuir: null, sem_consultor: { total: 2, media_dias: 3.5, maior_dias: 5 }, pontos: [] }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: fila, error: null })
    expect(await filaDeClientes()).toBe(fila)
  })

  it('números que o PostgREST manda como texto viram Number', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { total: '3', itens: [{ id: 'a', nome: 'Cliente 1', horas: '12.5', ritmo: null, ultimo_checkin: '2026-11-10' }] },
      error: null,
    })
    expect(await clientesEmRisco()).toEqual({
      total: 3, itens: [{ id: 'a', nome: 'Cliente 1', horas: 12.5, ritmo: null, ultimo_checkin: '2026-11-10' }],
    })
  })

  it('propagam o erro (sem_recorte da fila para o consultor)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '42501', message: 'sem_recorte' } })
    await expect(filaDeClientes()).rejects.toEqual({ code: '42501', message: 'sem_recorte' })
  })
})
