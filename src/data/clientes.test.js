import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import {
  buscarClientes, contarClientesAtivos, hojeDoCliente, horasPorDia, horasPorMes, listarClientes, listarEventos,
} from './clientes'

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

  it('qualquer (a busca da central, usabilidade U1): todas as situações, com os arquivados, e o termo no banco', async () => {
    await listarClientes({ aba: 'qualquer', busca: 'usabilidade' })
    expect(banco.chamadas.some((c) => c[0] === 'eq' && c[1] === 'arquivado')).toBe(false)
    expect(banco.chamadas.some((c) => ['is', 'not'].includes(c[0]))).toBe(false)
    expect(banco.chamou('ilike', 'busca', '%usabilidade%')).toBe(true)
    expect(banco.chamou('range', 0, 14)).toBe(true)
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

describe('listarEventos (histórico do cliente)', () => {
  it('pede a página ao banco e traz o nome do modelo de check-in que o banco deixou ver', async () => {
    const linhas = [
      { id: 'e1', tipo: 'modelo_trocado', modelo: 'Implantação', total: 2 },
      { id: 'e2', tipo: 'modelo_aplicado', modelo: null, total: 2 },
    ]
    vi.mocked(supabase.rpc).mockResolvedValue({ data: linhas, error: null })
    expect(await listarEventos('k1', { pagina: 2 })).toEqual({ itens: linhas, total: 2 })
    expect(supabase.rpc).toHaveBeenCalledWith('historico_do_cliente', { p_cliente: 'k1', p_limite: 15, p_deslocamento: 15 })
  })
})

describe('gráficos da aba Geral (nomes dos parâmetros)', () => {
  it('horasPorMes(id, mês) manda p_ate; sem o mês, p_ate nulo (o atual)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ mes: '2026-09-01', realizado: '12.5' }], error: null })
    expect(await horasPorMes('k1', '2026-09-01')).toEqual([{ mes: '2026-09-01', realizado: 12.5 }])
    expect(supabase.rpc).toHaveBeenLastCalledWith('horas_do_cliente_por_mes', { p_cliente: 'k1', p_meses: 6, p_ate: '2026-09-01' })
    await horasPorMes('k1')
    expect(supabase.rpc).toHaveBeenLastCalledWith('horas_do_cliente_por_mes', { p_cliente: 'k1', p_meses: 6, p_ate: null })
  })

  it('horasPorDia manda p_cliente e p_mes e devolve o JSON do banco', async () => {
    const mes = { mes: '2026-11-01', dias: [{ dia: '2026-11-01', horas: 2, acumulado: 2 }], realizado: 2, previsao: 30,
      projecao: null, dias_no_mes: 30 }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: mes, error: null })
    expect(await horasPorDia('k1', '2026-11-01')).toEqual(mes)
    expect(supabase.rpc).toHaveBeenLastCalledWith('horas_do_cliente_por_dia', { p_cliente: 'k1', p_mes: '2026-11-01' })
  })

  it('hojeDoCliente manda p_cliente e devolve o JSON do banco (nulo quando a pessoa não vê o cliente)', async () => {
    const hoje = { arquivado_em: null, previsao: { horas_mes: 30, realizado: 18, dia: 17, dias_no_mes: 30, projecao: 31.8,
      ritmo: 'acima' }, checkin: null, reuniao: null, quadro: null, checklist: null }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: hoje, error: null })
    expect(await hojeDoCliente('k1')).toEqual(hoje)
    expect(supabase.rpc).toHaveBeenLastCalledWith('hoje_do_cliente', { p_cliente: 'k1' })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null })
    expect(await hojeDoCliente('k2')).toBeNull()
  })

  it('o erro do banco sobe (a tela mostra "Tentar de novo")', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'P0001', message: 'sem_permissao' } })
    await expect(hojeDoCliente('k1')).rejects.toMatchObject({ message: 'sem_permissao' })
    await expect(horasPorDia('k1', null)).rejects.toMatchObject({ message: 'sem_permissao' })
  })
})
