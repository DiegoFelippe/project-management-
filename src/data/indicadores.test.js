import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  indicadoresDeClientes, indicadoresDeConsultorias, indicadoresDeIntegracoes, indicadoresDeModelos, indicadoresDeTimes,
  indicadoresDeUsuarios,
} from './indicadores'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

const numeros = { recorte: 'consultoria', em_atendimento: 4 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.rpc).mockResolvedValue({ data: numeros, error: null })
})

describe('cartões de números: uma chamada ao banco por tela', () => {
  it('clientes: consultoria e consultor do filtro; o objeto do banco volta sem mexer', async () => {
    expect(await indicadoresDeClientes({ consultoriaId: 'k1', consultorId: 'p1' })).toBe(numeros)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('indicadores_de_clientes',
      { p_consultoria: 'k1', p_consultor: 'p1', p_sem_consultor: false })
  })

  it('clientes: "sem" (Sem consultor) vira p_sem_consultor; sem filtro, tudo nulo', async () => {
    await indicadoresDeClientes({ consultorId: 'sem' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_clientes',
      { p_consultoria: null, p_consultor: null, p_sem_consultor: true })
    await indicadoresDeClientes()
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_clientes',
      { p_consultoria: null, p_consultor: null, p_sem_consultor: false })
  })

  it('times: a consultoria do filtro (vazio = todas)', async () => {
    await indicadoresDeTimes({ consultoriaId: 'k1' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_times', { p_consultoria: 'k1' })
    await indicadoresDeTimes({ consultoriaId: '' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_times', { p_consultoria: null })
  })

  it('usuários: o mês da navegação e a consultoria do filtro', async () => {
    await indicadoresDeUsuarios({ consultoriaId: 'k1', mes: '2026-10-01' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_usuarios', { p_mes: '2026-10-01', p_consultoria: 'k1' })
    await indicadoresDeUsuarios()
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_usuarios', { p_mes: null, p_consultoria: null })
  })

  it('consultorias: o mês', async () => {
    await indicadoresDeConsultorias({ mes: '2026-11-01' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_consultorias', { p_mes: '2026-11-01' })
  })

  it('integrações: a consultoria (vazio = todas, para o dono)', async () => {
    await indicadoresDeIntegracoes({ consultoriaId: 'k1' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_integracoes', { p_consultoria: 'k1' })
    await indicadoresDeIntegracoes({})
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_integracoes', { p_consultoria: null })
  })

  it('modelos de check-in: a consultoria do filtro (vazio = todas, para a Central)', async () => {
    await indicadoresDeModelos({ consultoriaId: 'k1' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_modelos', { p_consultoria: 'k1' })
    await indicadoresDeModelos()
    expect(supabase.rpc).toHaveBeenLastCalledWith('indicadores_de_modelos', { p_consultoria: null })
  })

  it('erro do banco sobe', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'P0001', message: 'sem_permissao' } })
    await expect(indicadoresDeTimes()).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
  })
})
