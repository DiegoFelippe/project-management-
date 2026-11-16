import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { atualizarMeuContato, listarUsuarios } from './usuarios'

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
