import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { aoMudarOCheckin } from '@/lib/checkinMudou'
import { apagarCheckin, editarCheckin, fazerCheckin, fazerCheckout, lancarHoras, listarCheckins, tarefasDoCheckin } from './checkins'

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

describe('fazerCheckin', () => {
  it('devolve o id do check-in feito (para o Desfazer do aviso)', async () => {
    banco.resposta = { data: { id: 'c9' }, error: null }
    expect(await fazerCheckin('k1')).toEqual({ erro: null, id: 'c9' })
    expect(banco.chamou('insert', { cliente_id: 'k1' })).toBe(true)
    expect(banco.chamou('select', 'id')).toBe(true)
    expect(banco.chamou('single')).toBe(true)
  })

  it('tempo esgotado no banco (57014): diz que o check-in não foi feito e marca tempoEsgotado (usabilidade, U11)', async () => {
    banco.resposta = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
    expect(await fazerCheckin('k1')).toEqual({
      erro: 'O sistema demorou para responder. O check-in não foi feito; tente de novo.',
      tempoEsgotado: true,
    })
  })

  it('outra recusa continua com a mensagem de sempre', async () => {
    banco.resposta = { data: null, error: { message: 'checkin_sem_cliente' } }
    expect(await fazerCheckin('k1')).toEqual({ erro: 'Você não é o consultor deste cliente.' })
  })
})

describe('aviso de que o check-in mudou (o selo da barra de cima e o Início relêem: auditoria, G2)', () => {
  it('toda escrita que deu certo avisa; a recusada não', async () => {
    const ouvinte = vi.fn()
    const parar = aoMudarOCheckin(ouvinte)
    banco.resposta = { data: { id: 'c9' }, error: null }
    await fazerCheckin('k1')
    banco.resposta = { data: [{ id: 'c9' }], error: null }
    await fazerCheckout('c9', { fim: '2026-11-10T15:00:00.000Z', descricao: 'Suporte' })
    await editarCheckin('c9', { descricao: 'Suporte' })
    await apagarCheckin('c9')
    await lancarHoras({ clienteId: 'k1', inicio: '2026-11-10T14:00:00.000Z', fim: '2026-11-10T15:00:00.000Z', descricao: 'Suporte' })
    expect(ouvinte).toHaveBeenCalledTimes(5)
    banco.resposta = { data: null, error: { code: '42501' } }
    await fazerCheckin('k1')
    await apagarCheckin('c9')
    expect(ouvinte).toHaveBeenCalledTimes(5)
    parar()
    banco.resposta = { data: { id: 'c9' }, error: null }
    await fazerCheckin('k1')
    expect(ouvinte).toHaveBeenCalledTimes(5)
  })
})
