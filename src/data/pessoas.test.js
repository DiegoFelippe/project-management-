import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { buscarPessoas } from './pessoas'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

describe('buscarPessoas', () => {
  it('busca no banco por nome, na consultoria e nos papéis, com limite e total', async () => {
    banco.resposta = { data: [{ id: 'g1', nome: 'Gil' }], error: null, count: 45 }
    expect(await buscarPessoas({ consultoriaId: 'c1', papeis: ['gestor', 'admin'], termo: 'gi' })).toEqual({ itens: [{ id: 'g1', nome: 'Gil' }], total: 45 })
    expect(banco.chamou('from', 'perfis')).toBe(true)
    expect(banco.chamou('select', 'id, nome, email, papel, foto, cor', { count: 'exact' })).toBe(true)
    expect(banco.chamou('eq', 'consultoria_id', 'c1')).toBe(true)
    expect(banco.chamou('in', 'papel', ['gestor', 'admin'])).toBe(true)
    expect(banco.chamou('ilike', 'nome_busca', '%gi%')).toBe(true)
    expect(banco.chamou('order', 'nome')).toBe(true)
    expect(banco.chamou('limit', 20)).toBe(true)
  })

  it('a busca ignora acento e maiúscula: "JOÃO" e "joao" pedem o mesmo padrão sobre nome_busca', async () => {
    await buscarPessoas({ termo: 'JOÃO' })
    expect(banco.chamou('ilike', 'nome_busca', '%joao%')).toBe(true)
    expect(banco.chamadas.some((c) => c[0] === 'ilike' && c[1] === 'nome')).toBe(false)
  })

  it('sem termo não filtra por nome', async () => {
    await buscarPessoas({ consultoriaId: 'c1' })
    expect(banco.chamadas.some((c) => c[0] === 'ilike')).toBe(false)
  })

  it('quem deve ficar de fora sai no banco (até 100 ids) e o resto sai do resultado', async () => {
    const muitos = Array.from({ length: 101 }, (_, i) => `x${i}`)
    banco.resposta = { data: [{ id: 'a' }, { id: 'x100' }], error: null, count: 2 }
    const r = await buscarPessoas({ excluirIds: muitos })
    expect(banco.chamou('not', 'id', 'in', `(${muitos.slice(0, 100).join(',')})`)).toBe(true)
    expect(r).toEqual({ itens: [{ id: 'a' }], total: 1 })
  })

  it('erro do banco sobe', async () => {
    banco.resposta = { data: null, error: { message: 'falhou' } }
    await expect(buscarPessoas()).rejects.toEqual({ message: 'falhou' })
  })
})
