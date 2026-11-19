import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { buscarConsultorias, buscarConsultoriasAtivas } from './consultorias'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

describe('buscarConsultorias', () => {
  it('para o filtro das listas: todas, inclusive as arquivadas, pelo nome, com limite e total', async () => {
    banco.resposta = { data: [{ id: 'k1', nome: 'Acme' }], error: null, count: 130 }
    expect(await buscarConsultorias('ac_me%')).toEqual({ itens: [{ id: 'k1', nome: 'Acme' }], total: 130 })
    expect(banco.chamou('from', 'consultorias')).toBe(true)
    expect(banco.chamou('select', 'id, nome', { count: 'exact' })).toBe(true)
    expect(banco.chamou('is', 'arquivada_em', null)).toBe(false)
    expect(banco.chamou('ilike', 'nome_busca', '%ac\\_me\\%%')).toBe(true)
    expect(banco.chamou('order', 'nome')).toBe(true)
    expect(banco.chamou('limit', 20)).toBe(true)
  })

  it('sem termo não filtra por nome', async () => {
    await buscarConsultorias('')
    expect(banco.chamadas.some((c) => c[0] === 'ilike')).toBe(false)
  })

  it('a busca ignora acento e maiúscula, sobre nome_busca', async () => {
    await buscarConsultorias('Açaí')
    expect(banco.chamou('ilike', 'nome_busca', '%acai%')).toBe(true)
  })

  it('erro do banco sobe', async () => {
    banco.resposta = { data: null, error: { message: 'falhou' } }
    await expect(buscarConsultorias()).rejects.toEqual({ message: 'falhou' })
  })
})

describe('buscarConsultoriasAtivas', () => {
  it('pede só as ativas, pelo nome, com limite e total, sem trazer a lista inteira', async () => {
    banco.resposta = { data: [{ id: 'k1', nome: 'Acme' }], error: null, count: 130 }
    expect(await buscarConsultoriasAtivas('ac_me%')).toEqual({ itens: [{ id: 'k1', nome: 'Acme' }], total: 130 })
    expect(banco.chamou('select', 'id, nome', { count: 'exact' })).toBe(true)
    expect(banco.chamou('is', 'arquivada_em', null)).toBe(true)
    expect(banco.chamou('ilike', 'nome_busca', '%ac\\_me\\%%')).toBe(true)
    expect(banco.chamou('limit', 20)).toBe(true)
  })

  it('sem termo não filtra por nome', async () => {
    await buscarConsultoriasAtivas('  ')
    expect(banco.chamadas.some((c) => c[0] === 'ilike')).toBe(false)
  })

  it('erro do banco sobe', async () => {
    banco.resposta = { data: null, error: { message: 'falhou' } }
    await expect(buscarConsultoriasAtivas()).rejects.toEqual({ message: 'falhou' })
  })
})
