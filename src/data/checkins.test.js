import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { editarCheckin, fazerCheckout, listarCheckins } from './checkins'

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
