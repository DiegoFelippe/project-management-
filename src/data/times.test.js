import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { listarTimes } from './times'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

describe('listarTimes', () => {
  it('busca pelo nome sem acento e sem maiúscula (nome_busca), como clientes e pessoas', async () => {
    await listarTimes({ busca: 'IMPLANTAÇÃO' })
    expect(banco.chamou('ilike', 'nome_busca', '%implantacao%')).toBe(true)
    expect(banco.chamadas.some((c) => c[0] === 'ilike' && c[1] === 'nome')).toBe(false)
  })

  it('%, _ e \\ procuram o próprio caractere; * sai do termo', async () => {
    await listarTimes({ busca: '50%_a\\b*' })
    expect(banco.chamou('ilike', 'nome_busca', '%50\\%\\_a\\\\b%')).toBe(true)
  })

  it('sem termo não filtra por nome; a consultoria do filtro vai ao banco', async () => {
    await listarTimes({ busca: '  ', consultoriaId: 'k1' })
    expect(banco.chamadas.some((c) => c[0] === 'ilike')).toBe(false)
    expect(banco.chamou('eq', 'consultoria_id', 'k1')).toBe(true)
  })

  it('pagina no banco (15 por página) e conta os membros sem trazer todos', async () => {
    banco.resposta = { data: [{ id: 't1', nome: 'Suporte', membros: [], total: [{ count: 7 }] }], error: null, count: 1 }
    const r = await listarTimes({ pagina: 2 })
    expect(banco.chamou('range', 15, 29)).toBe(true)
    expect(r).toEqual({ itens: [{ id: 't1', nome: 'Suporte', membros: [], totalMembros: 7 }], total: 1 })
  })
})
