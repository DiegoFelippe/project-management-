import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { buscarClientes, contarClientesAtivos, eventosDoMes, listarClientes } from './clientes'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

describe('listarClientes: abas', () => {
  it.each(['aguardando', 'atendimento', 'distribuir', 'nas_consultorias'])(
    'a aba %s não mostra arquivados',
    async (aba) => {
      await listarClientes({ aba })
      expect(banco.chamou('eq', 'arquivado', false)).toBe(true)
      expect(banco.chamou('eq', 'arquivado', true)).toBe(false)
    },
  )

  it('a aba meus não mostra arquivados', async () => {
    await listarClientes({ aba: 'meus', consultorId: 'p1' })
    expect(banco.chamou('eq', 'arquivado', false)).toBe(true)
    expect(banco.chamou('eq', 'consultor_id', 'p1')).toBe(true)
  })

  it('a aba arquivados mostra só os arquivados', async () => {
    await listarClientes({ aba: 'arquivados' })
    expect(banco.chamou('eq', 'arquivado', true)).toBe(true)
    expect(banco.chamou('eq', 'arquivado', false)).toBe(false)
  })

  it('aguardando: na consultoria e sem consultor', async () => {
    await listarClientes({ aba: 'aguardando' })
    expect(banco.chamou('not', 'consultoria_id', 'is', null)).toBe(true)
    expect(banco.chamou('is', 'consultor_id', null)).toBe(true)
  })
})

describe('contarClientesAtivos', () => {
  it('conta no banco só os ativos da consultoria, sem trazer linhas', async () => {
    banco.resposta = { data: null, error: null, count: 7 }
    expect(await contarClientesAtivos({ consultoriaId: 's1' })).toBe(7)
    expect(banco.chamou('from', 'clientes')).toBe(true)
    expect(banco.chamou('select', 'id', { count: 'exact', head: true })).toBe(true)
    expect(banco.chamou('eq', 'arquivado', false)).toBe(true)
    expect(banco.chamou('eq', 'consultoria_id', 's1')).toBe(true)
  })

  it('conta os ativos de um consultor', async () => {
    banco.resposta = { data: null, error: null, count: 1 }
    expect(await contarClientesAtivos({ consultorId: 'p1' })).toBe(1)
    expect(banco.chamou('eq', 'consultor_id', 'p1')).toBe(true)
    expect(banco.chamou('eq', 'arquivado', false)).toBe(true)
  })

  it('erro do banco vira exceção', async () => {
    banco.resposta = { data: null, error: { code: '42501' }, count: null }
    await expect(contarClientesAtivos({ consultorId: 'p1' })).rejects.toEqual({ code: '42501' })
  })
})

describe('eventosDoMes', () => {
  it('pede o histórico entre os limites do mês em São Paulo (o deslocamento vem do fuso)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null })
    await eventosDoMes('k1', '2018-12-01')
    expect(supabase.rpc).toHaveBeenCalledWith('historico_do_cliente', expect.objectContaining({
      p_cliente: 'k1', p_de: '2018-12-01T00:00:00-02:00', p_ate: '2019-01-01T00:00:00-02:00',
    }))
  })
})

describe('buscarClientes (seletores)', () => {
  it('busca no banco pelo nome, só os ativos da consultoria pedida, poucos por vez', async () => {
    banco.resposta = { data: [{ id: 'k1', nome: 'Provedor Alfa' }], error: null, count: 42 }
    const r = await buscarClientes({ termo: 'Alfá', consultoriaId: 's1', ativos: true })
    expect(r).toEqual({ itens: [{ id: 'k1', nome: 'Provedor Alfa' }], total: 42 })
    expect(banco.chamou('eq', 'arquivado', false)).toBe(true)
    expect(banco.chamou('eq', 'consultoria_id', 's1')).toBe(true)
    expect(banco.chamou('ilike', 'busca', '%alfa%')).toBe(true)
    expect(banco.chamou('limit', 8)).toBe(true)
    const select = banco.chamadas.find(([m]) => m === 'select')
    expect(select[1]).toContain('contato_email')
  })

  it('sem termo nem filtros: a primeira leva, com arquivados (filtro do calendário)', async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await buscarClientes({})
    expect(banco.chamadas.some(([m, c]) => m === 'eq' && c === 'arquivado')).toBe(false)
    expect(banco.chamadas.some(([m]) => m === 'ilike')).toBe(false)
  })
})
