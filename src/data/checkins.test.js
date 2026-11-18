import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { editarCheckin, fazerCheckout, listarCheckins, tarefasDoCheckin } from './checkins'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

const selecionado = () => banco.chamadas.find(([metodo]) => metodo === 'select')[1]

describe('listarCheckins', () => {
  it('o nome do consultor vem de consultor_do_checkin (o gestor não enxerga todos em perfis)', async () => {
    await listarCheckins({ clienteId: 'k1' })
    expect(selecionado()).toContain('consultor:consultor_do_checkin(nome)')
    expect(selecionado()).not.toContain('perfis(')
    expect(banco.chamou('eq', 'cliente_id', 'k1')).toBe(true)
  })

  it('traz as tarefas marcadas em cada check-in: até 3 títulos (na ordem em que foram marcadas) e o total', async () => {
    banco.resposta = {
      data: [{ id: 'c1', tarefas: [{ titulo: 'Análise do DRE' }], total_tarefas: [{ count: 4 }] }, { id: 'c2', tarefas: [], total_tarefas: [] }],
      error: null,
      count: 2,
    }
    const { itens } = await listarCheckins({ clienteId: 'k1' })
    // Com o estado e o motivo: a que não se aplica tem o chip dela.
    expect(selecionado()).toContain('tarefas:checkin_tarefas(titulo, estado, motivo)')
    expect(selecionado()).toContain('total_tarefas:checkin_tarefas(count)')
    // A mesma ordem das tarefas de um check-in em todo lugar (lista, check-out e a sessão do check-list).
    const ordemDasTarefas = banco.chamadas.filter(([metodo, , opcoes]) => metodo === 'order' && opcoes?.referencedTable === 'tarefas')
    expect(ordemDasTarefas.map(([, coluna]) => coluna)).toEqual(['marcada_em', 'titulo', 'tarefa_id'])
    expect(banco.chamou('limit', 3, { referencedTable: 'tarefas' })).toBe(true)
    expect(itens.map((k) => [k.tarefas, k.total_tarefas])).toEqual([[[{ titulo: 'Análise do DRE' }], 4], [[], 0]])
  })
})

describe('tarefasDoCheckin', () => {
  it('as tarefas marcadas no check-in, na ordem em que foram marcadas', async () => {
    banco.resposta = { data: [{ tarefa_id: 't1', titulo: 'Análise do DRE' }], error: null }
    expect(await tarefasDoCheckin('c1')).toEqual([{ tarefa_id: 't1', titulo: 'Análise do DRE' }])
    expect(banco.chamou('from', 'checkin_tarefas')).toBe(true)
    expect(banco.chamou('select', 'tarefa_id, titulo, estado, motivo')).toBe(true)
    expect(banco.chamou('eq', 'checkin_id', 'c1')).toBe(true)
    // marcada_em, titulo, tarefa_id: a mesma ordem da lista de check-ins e da sessão no check-list.
    expect(banco.chamadas.filter(([metodo]) => metodo === 'order').map(([, coluna]) => coluna))
      .toEqual(['marcada_em', 'titulo', 'tarefa_id'])
  })

  it('erro do banco sobe', async () => {
    banco.resposta = { data: null, error: { code: '42501' } }
    await expect(tarefasDoCheckin('c1')).rejects.toEqual({ code: '42501' })
  })
})

describe('escritas do check-in', () => {
  beforeEach(() => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
  })

  it('check-out manda o fim escolhido e a descrição', async () => {
    expect(await fazerCheckout('c1', { fim: '2026-11-10T15:00:00.000Z', descricao: ' Suporte ' })).toEqual({ erro: null })
    expect(banco.chamou('update', { fim: '2026-11-10T15:00:00.000Z', descricao: 'Suporte' })).toBe(true)
    expect(banco.chamou('eq', 'id', 'c1')).toBe(true)
  })

  it('editar manda só o que veio (início e fim só quando mudaram)', async () => {
    await editarCheckin('c1', { descricao: 'Reunião ' })
    expect(banco.chamou('update', { descricao: 'Reunião' })).toBe(true)
    await editarCheckin('c1', { fim: '2026-11-10T15:00:00.000Z', descricao: 'Reunião' })
    expect(banco.chamou('update', { fim: '2026-11-10T15:00:00.000Z', descricao: 'Reunião' })).toBe(true)
  })

  it('o check-in que passou de 24 h tem mensagem própria', async () => {
    banco.resposta = { data: null, error: { code: '23514' } }
    expect(await fazerCheckout('c1', { fim: '2026-11-10T15:00:00.000Z', descricao: 'Suporte' })).toEqual({
      erro: 'Um check-in não pode passar de 24 h. Ajuste o horário de fim.',
    })
  })
})
