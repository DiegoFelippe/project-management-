import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { contarClientesAtivos, listarClientes } from './clientes'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

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
