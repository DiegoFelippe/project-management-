import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { listarNomesDeConsultorias } from './consultorias'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

describe('listarNomesDeConsultorias', () => {
  it('para o seletor da ficha: só as ativas, por nome', async () => {
    banco.resposta = { data: [{ id: 'k1', nome: 'Acme' }], error: null }
    expect(await listarNomesDeConsultorias({ ativas: true })).toEqual([{ id: 'k1', nome: 'Acme' }])
    expect(banco.chamou('from', 'consultorias')).toBe(true)
    expect(banco.chamou('select', 'id, nome')).toBe(true)
    expect(banco.chamou('is', 'arquivada_em', null)).toBe(true)
    expect(banco.chamou('order', 'nome')).toBe(true)
  })

  it('para o filtro das listas: todas, inclusive as arquivadas', async () => {
    await listarNomesDeConsultorias()
    expect(banco.chamou('is', 'arquivada_em', null)).toBe(false)
    expect(banco.chamou('order', 'nome')).toBe(true)
  })

  it('erro do banco sobe', async () => {
    banco.resposta = { data: null, error: { message: 'falhou' } }
    await expect(listarNomesDeConsultorias({ ativas: true })).rejects.toEqual({ message: 'falhou' })
  })
})
