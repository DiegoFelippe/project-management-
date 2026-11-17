import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { apagarModelo, arquivarModelo, lerModelo, listarModelos, reativarModelo, salvarModelo } from './modelos'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const SEM_PERMISSAO = 'Você não tem permissão para isso.'

let banco
beforeEach(() => {
  vi.clearAllMocks()
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

const rpcResponde = (data, error = null) => vi.mocked(supabase.rpc).mockResolvedValue({ data, error })

describe('leituras dos modelos (funções do banco)', () => {
  it('listarModelos pede a página ao banco com os filtros da barra e devolve { itens, total }', async () => {
    const itens = [{ id: 'm1', nome: 'Implantação' }]
    rpcResponde({ itens, total: 16 })
    expect(await listarModelos({ aba: 'arquivados', busca: ' análise ', tipo: 'gestao', consultoriaId: 'k1', pagina: 2 }))
      .toEqual({ itens, total: 16 })
    expect(supabase.rpc).toHaveBeenCalledWith('modelos_da_lista', {
      p_aba: 'arquivados', p_busca: 'análise', p_tipo: 'gestao', p_consultoria: 'k1', p_pagina: 2,
    })
  })

  it('listarModelos sem filtros: aba Ativos, página 1 e o resto nulo', async () => {
    rpcResponde({ itens: [], total: 0 })
    expect(await listarModelos()).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenCalledWith('modelos_da_lista', {
      p_aba: 'ativos', p_busca: null, p_tipo: null, p_consultoria: null, p_pagina: 1,
    })
  })

  it('página que deixou de existir (apagou o último item dela) volta com foraDaFaixa', async () => {
    rpcResponde({ itens: [], total: 15 })
    expect(await listarModelos({ pagina: 2 })).toEqual({ itens: [], total: 15, foraDaFaixa: true })
  })

  it('lerModelo traz o modelo inteiro; null quando a pessoa não vê', async () => {
    rpcResponde({ id: 'm1', etapas: [] })
    expect(await lerModelo('m1')).toEqual({ id: 'm1', etapas: [] })
    expect(supabase.rpc).toHaveBeenCalledWith('modelo_completo', { p_modelo: 'm1' })
    rpcResponde(null)
    expect(await lerModelo('m2')).toBeNull()
  })

  it('erro do banco nas leituras sobe', async () => {
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    await expect(listarModelos()).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(lerModelo('m1')).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
  })
})

describe('escritas dos modelos', () => {
  const dados = { nome: 'Implantação', para: 'todas', etapas: [] }

  it('salvarModelo cria (id nulo) e edita numa chamada só, devolvendo o id', async () => {
    rpcResponde('m9')
    expect(await salvarModelo(null, dados)).toEqual({ id: 'm9', erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('salvar_modelo', { p_id: null, p_dados: dados })
    rpcResponde('m1')
    expect(await salvarModelo('m1', dados)).toEqual({ id: 'm1', erro: null })
    expect(supabase.rpc).toHaveBeenLastCalledWith('salvar_modelo', { p_id: 'm1', p_dados: dados })
  })

  it('salvarModelo traduz a recusa do banco', async () => {
    rpcResponde(null, { code: 'P0001', message: 'dependencia_invalida' })
    expect(await salvarModelo(null, dados)).toEqual({
      id: null,
      erro: 'Uma tarefa só pode depender de tarefas que vêm antes dela na lista.',
    })
    rpcResponde(null, {
      code: '23514',
      message: 'new row for relation "modelo_tarefas" violates check constraint "modelo_tarefas_titulo_check"',
    })
    expect((await salvarModelo(null, dados)).erro).toMatch(/até 80 letras/)
  })

  it('arquivar marca a data (o banco grava a dele); reativar limpa', async () => {
    banco.resposta = { data: [{ id: 'm1' }], error: null }
    expect(await arquivarModelo('m1')).toEqual({ erro: null })
    expect(banco.chamou('from', 'modelos')).toBe(true)
    expect(typeof banco.chamadas.find(([m]) => m === 'update')[1].arquivado_em).toBe('string')
    expect(banco.chamou('eq', 'id', 'm1')).toBe(true)
    expect(await reativarModelo('m1')).toEqual({ erro: null })
    expect(banco.chamou('update', { arquivado_em: null })).toBe(true)
  })

  it('nenhuma linha de volta = a regra do banco recusou', async () => {
    banco.resposta = { data: [], error: null }
    expect(await arquivarModelo('m1')).toEqual({ erro: SEM_PERMISSAO })
    expect(await reativarModelo('m1')).toEqual({ erro: SEM_PERMISSAO })
    expect(await apagarModelo('m1')).toEqual({ erro: SEM_PERMISSAO })
  })

  it('apagarModelo apaga pela regra do banco; etapas e tarefas saem junto', async () => {
    banco.resposta = { data: [{ id: 'm1' }], error: null }
    expect(await apagarModelo('m1')).toEqual({ erro: null })
    expect(banco.chamou('delete')).toBe(true)
    expect(banco.chamou('eq', 'id', 'm1')).toBe(true)
  })

  it('erro do banco ao arquivar ou apagar vira texto', async () => {
    banco.resposta = { data: null, error: { code: '42501', message: 'permission denied' } }
    expect(await arquivarModelo('m1')).toEqual({ erro: SEM_PERMISSAO })
    expect(await apagarModelo('m1')).toEqual({ erro: SEM_PERMISSAO })
  })
})
