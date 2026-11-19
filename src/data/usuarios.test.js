import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { atualizarMeuContato, buscarUsuario, listarUsuarios } from './usuarios'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() }, chamarFuncao: vi.fn() }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
  vi.mocked(supabase.rpc).mockReset()
})

describe('listarUsuarios', () => {
  it('pede os campos da ficha: cargo, telefone, cidade, UF, data de entrada e carga', async () => {
    banco.resposta = { data: [{ id: 'p1', nome: 'Ana', times: [{ time: { id: 't1', nome: 'X' } }] }], error: null, count: 1 }
    const { itens } = await listarUsuarios({ pagina: 1 })
    const campos = banco.chamadas.find(([m]) => m === 'select')[1]
    for (const campo of ['cargo', 'telefone', 'cidade', 'uf', 'data_entrada', 'carga_semanal']) expect(campos).toContain(campo)
    expect(itens[0].times).toEqual([{ id: 't1', nome: 'X' }])
  })
})

describe('listarUsuarios: tipo de consultoria', () => {
  it('pede o campo tipos_de_consultoria', async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await listarUsuarios({ pagina: 1 })
    expect(banco.chamadas.find(([m]) => m === 'select')[1]).toContain('tipos_de_consultoria')
  })

  it('com tipo, filtra no banco quem tem aquele tipo', async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await listarUsuarios({ pagina: 1, tipo: 'gestao' })
    expect(banco.chamou('contains', 'tipos_de_consultoria', ['gestao'])).toBe(true)
  })

  // Usabilidade, U5: o cartão "Sem tipo de consultoria" leva a este filtro (o mesmo recorte do número: consultores
  // ativos — administrador, gestor e consultor — com a lista vazia; o índice GIN serve ao "=").
  it("tipo 'sem': quem é de consultoria e não tem tipo nenhum", async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await listarUsuarios({ pagina: 1, tipo: 'sem' })
    expect(banco.chamou('eq', 'tipos_de_consultoria', '{}')).toBe(true)
    expect(banco.chamou('in', 'papel', ['admin', 'gestor', 'pessoa'])).toBe(true)
    expect(banco.chamadas.some(([m]) => m === 'contains')).toBe(false)
  })

  it('sem tipo, não filtra', async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await listarUsuarios({ pagina: 1 })
    expect(banco.chamadas.some(([m]) => m === 'contains')).toBe(false)
  })
})

// Usabilidade, U5: o cartão "Acima de 100%" leva a este filtro. As linhas vêm de pessoas_acima_de_100 (a conta e o recorte
// do cartão, no mês da tela); colunas, filtros, ordem e página são os da lista.
describe('listarUsuarios: acima de 100%', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockImplementation((...argumentos) => {
      const consulta = banco.from('perfis (pela função)')
      banco.chamadas.push(['rpc', ...argumentos])
      return consulta
    })
  })

  it('pede ao banco as pessoas acima de 100% no mês, com os mesmos campos, filtros, ordem e página', async () => {
    banco.resposta = { data: [{ id: 'p1', nome: 'Ana', times: [] }], error: null, count: 16 }
    const { itens, total } = await listarUsuarios({ pagina: 2, acima: true, mes: '2026-10-01', consultoriaId: 'c1', tipo: 'gestao' })
    expect(banco.chamou('rpc', 'pessoas_acima_de_100', { p_mes: '2026-10-01', p_consultoria: 'c1' }, { count: 'exact' })).toBe(true)
    expect(supabase.from).not.toHaveBeenCalledWith('perfis')
    expect(banco.chamadas.find(([m]) => m === 'select')[1]).toContain('tipos_de_consultoria')
    expect(banco.chamou('eq', 'ativo', true)).toBe(true)
    expect(banco.chamou('neq', 'papel', 'dono')).toBe(true)
    expect(banco.chamou('contains', 'tipos_de_consultoria', ['gestao'])).toBe(true)
    expect(banco.chamou('order', 'nome')).toBe(true)
    expect(banco.chamou('range', 15, 29)).toBe(true)
    expect({ itens, total }).toEqual({ itens: [{ id: 'p1', nome: 'Ana', times: [] }], total: 16 })
  })

  it('a central sem consultoria escolhida pede todas', async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await listarUsuarios({ pagina: 1, acima: true, mes: '2026-11-01' })
    expect(banco.chamou('rpc', 'pessoas_acima_de_100', { p_mes: '2026-11-01', p_consultoria: null }, { count: 'exact' })).toBe(true)
  })

  it('sem o filtro, a lista continua lendo perfis direto', async () => {
    banco.resposta = { data: [], error: null, count: 0 }
    await listarUsuarios({ pagina: 1 })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(banco.chamou('from', 'perfis')).toBe(true)
  })
})

describe('buscarUsuario', () => {
  it('carrega uma pessoa por id (o RLS decide se ela aparece) com os times achatados', async () => {
    banco.resposta = { data: { id: 'p1', nome: 'Ana', times: [{ time: { id: 't1', nome: 'X' } }] }, error: null }
    const p = await buscarUsuario('p1')
    expect(banco.chamou('eq', 'id', 'p1')).toBe(true)
    expect(p.times).toEqual([{ id: 't1', nome: 'X' }])
  })
  it('pessoa invisível: null', async () => {
    banco.resposta = { data: null, error: null }
    expect(await buscarUsuario('zzz')).toBeNull()
  })
})

describe('atualizarMeuContato', () => {
  it('chama a função do banco com telefone, cidade e UF', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null })
    expect(await atualizarMeuContato({ telefone: '1199', cidade: 'Santos', uf: 'SP' })).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_meu_contato', { p_telefone: '1199', p_cidade: 'Santos', p_uf: 'SP' })
  })

  it('traduz a recusa do banco', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'P0001', message: 'sem_permissao' } })
    expect(await atualizarMeuContato({ telefone: '', cidade: '', uf: '' })).toEqual({ erro: 'Você não tem permissão para isso.' })
  })
})
