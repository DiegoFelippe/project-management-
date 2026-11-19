import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import {
  QUADROS_ARQUIVADOS_POR_PAGINA,
  apagarQuadro,
  arquivarQuadro,
  criarQuadro,
  marcarFavorito,
  quadrosArquivados,
  quadrosParaEscolher,
  quadrosPorIds,
  renomearQuadro,
  restaurarQuadro,
  timesParaNovoQuadro,
} from './quadros'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }))

const SEM_PERMISSAO = 'Você não tem permissão para isso.'
const OBJETOS_FICARAM = 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.'

let banco
let balde
beforeEach(() => {
  vi.clearAllMocks()
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
  balde = { remove: vi.fn(async (caminhos) => ({ data: caminhos.map((name) => ({ name })), error: null })) }
  vi.mocked(supabase.storage.from).mockReturnValue(balde)
})

const rpcResponde = (data, error = null) => vi.mocked(supabase.rpc).mockResolvedValue({ data, error })

describe('leituras dos quadros do menu (funções do banco)', () => {
  it('quadrosParaEscolher pede a busca (sem espaços nas pontas) e o limite; devolve os três grupos { itens, total }', async () => {
    const item = { id: 'q1', nome: 'Sprint', tipo: 'time', time: { id: 't1', nome: 'Comercial' }, cartoes: 3, favorito: true }
    rpcResponde({
      favoritos: { itens: [item], total: 1 },
      meus: { itens: [], total: 0 },
      dos_times: { itens: [item], total: 230 },
    })
    expect(await quadrosParaEscolher({ termo: '  spri ', limite: 20 })).toEqual({
      favoritos: { itens: [item], total: 1 },
      meus: { itens: [], total: 0 },
      dosTimes: { itens: [item], total: 230 },
    })
    expect(supabase.rpc).toHaveBeenCalledWith('quadros_para_escolher', { p_busca: 'spri', p_limite: 20 })
  })

  it('quadrosParaEscolher sem termo manda nulo e o limite padrão (20); grupo que não vem vira vazio', async () => {
    rpcResponde({ favoritos: { itens: [], total: 0 } })
    expect(await quadrosParaEscolher()).toEqual({
      favoritos: { itens: [], total: 0 },
      meus: { itens: [], total: 0 },
      dosTimes: { itens: [], total: 0 },
    })
    expect(supabase.rpc).toHaveBeenCalledWith('quadros_para_escolher', { p_busca: null, p_limite: 20 })
    await quadrosParaEscolher({ termo: '   ', limite: 1 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('quadros_para_escolher', { p_busca: null, p_limite: 1 })
  })

  it('o erro do banco numa leitura sobe', async () => {
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    await expect(quadrosParaEscolher()).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(quadrosArquivados()).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(timesParaNovoQuadro()).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(quadrosPorIds(['q1'])).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
  })

  it('quadrosPorIds manda os ids e devolve a lista do banco (na ordem dele); sem ids, nem chama', async () => {
    rpcResponde([{ id: 'q2' }, { id: 'q1' }])
    expect(await quadrosPorIds(['q2', 'q1'])).toEqual([{ id: 'q2' }, { id: 'q1' }])
    expect(supabase.rpc).toHaveBeenCalledWith('quadros_por_ids', { p_ids: ['q2', 'q1'] })
    rpcResponde(null)
    expect(await quadrosPorIds(['q1'])).toEqual([])
    vi.mocked(supabase.rpc).mockClear()
    expect(await quadrosPorIds([])).toEqual([])
    expect(await quadrosPorIds(null)).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('quadrosArquivados pede a página com busca e tipo; devolve { itens, total } (15 por página)', async () => {
    expect(QUADROS_ARQUIVADOS_POR_PAGINA).toBe(15)
    rpcResponde({ itens: [{ id: 'q1', arquivado_em: '2026-11-17T10:00:00Z', pode_administrar: true }], total: 16 })
    expect(await quadrosArquivados({ busca: ' sprint ', tipo: 'time', pagina: 2 })).toEqual({
      itens: [{ id: 'q1', arquivado_em: '2026-11-17T10:00:00Z', pode_administrar: true }],
      total: 16,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('quadros_arquivados', { p_busca: 'sprint', p_tipo: 'time', p_pagina: 2 })
    rpcResponde(null)
    expect(await quadrosArquivados({ busca: '', tipo: '' })).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('quadros_arquivados', { p_busca: null, p_tipo: null, p_pagina: 1 })
  })

  it('timesParaNovoQuadro busca no banco e devolve { itens, total } (o formato do buscar do Seletor)', async () => {
    rpcResponde({ itens: [{ id: 't1', nome: 'Comercial' }], total: 1 })
    expect(await timesParaNovoQuadro({ termo: ' com ' })).toEqual({ itens: [{ id: 't1', nome: 'Comercial' }], total: 1 })
    expect(supabase.rpc).toHaveBeenCalledWith('times_para_novo_quadro', { p_busca: 'com', p_limite: 50 })
    rpcResponde(null)
    expect(await timesParaNovoQuadro()).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('times_para_novo_quadro', { p_busca: null, p_limite: 50 })
  })
})

describe('criar, renomear, arquivar, restaurar', () => {
  it('criarQuadro pessoal manda o nome sem espaços nas pontas e time nulo; devolve { id, erro: null }', async () => {
    rpcResponde({ id: 'q9' })
    expect(await criarQuadro({ nome: '  Minhas tarefas ' })).toEqual({ id: 'q9', erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('criar_quadro', { p_nome: 'Minhas tarefas', p_time: null })
  })

  it('criarQuadro do time manda o time', async () => {
    rpcResponde({ id: 'q9' })
    await criarQuadro({ nome: 'Sprint', timeId: 't1' })
    expect(supabase.rpc).toHaveBeenCalledWith('criar_quadro', { p_nome: 'Sprint', p_time: 't1' })
  })

  it('criarQuadro: as recusas do banco viram mensagem (nome em uso, nome inválido, time, permissão)', async () => {
    rpcResponde(null, { code: '23505', message: 'duplicate key value violates unique constraint "quadros_nome_pessoal_unico"' })
    expect(await criarQuadro({ nome: 'Sprint' })).toEqual({ id: null, erro: 'Já existe um quadro aberto com esse nome.' })
    rpcResponde(null, { code: '23514', message: 'new row for relation "quadros" violates check constraint "quadros_nome_check"' })
    expect(await criarQuadro({ nome: 'x'.repeat(81) })).toEqual({
      id: null, erro: 'O nome do quadro precisa ter de 1 a 80 letras.',
    })
    rpcResponde(null, { code: 'P0001', message: 'time_invalido' })
    expect(await criarQuadro({ nome: 'Sprint', timeId: 't1' })).toEqual({
      id: null, erro: 'Esse time não está mais disponível para você. Escolha outro time.',
    })
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    expect(await criarQuadro({ nome: 'Sprint', timeId: 't1' })).toEqual({ id: null, erro: SEM_PERMISSAO })
  })

  it('renomearQuadro grava o nome (sem espaços nas pontas) direto na tabela; 0 linhas = sem permissão', async () => {
    banco.resposta = { data: [{ id: 'q1' }], error: null }
    expect(await renomearQuadro('q1', '  Novo nome ')).toEqual({ erro: null })
    expect(banco.chamou('from', 'quadros')).toBe(true)
    expect(banco.chamou('update', { nome: 'Novo nome' })).toBe(true)
    expect(banco.chamou('eq', 'id', 'q1')).toBe(true)
    expect(banco.chamou('select', 'id')).toBe(true)
    banco.resposta = { data: [], error: null }
    expect(await renomearQuadro('q1', 'Outro')).toEqual({ erro: SEM_PERMISSAO })
  })

  it('renomear um quadro arquivado ou para um nome em uso: a recusa do banco vira mensagem', async () => {
    banco.resposta = { data: null, error: { code: 'P0001', message: 'quadro_arquivado' } }
    expect(await renomearQuadro('q1', 'Outro')).toEqual({ erro: 'Este quadro está arquivado: restaure antes de renomear.' })
    banco.resposta = { data: null, error: { code: '23505', message: 'duplicate key' } }
    expect(await renomearQuadro('q1', 'Outro')).toEqual({ erro: 'Já existe um quadro aberto com esse nome.' })
  })

  it('arquivarQuadro manda uma hora (o banco grava a dele) e restaurarQuadro limpa; 0 linhas = sem permissão', async () => {
    banco.resposta = { data: [{ id: 'q1' }], error: null }
    expect(await arquivarQuadro('q1')).toEqual({ erro: null })
    const atualizacao = banco.chamadas.find(([metodo]) => metodo === 'update')
    expect(Object.keys(atualizacao[1])).toEqual(['arquivado_em'])
    expect(Number.isNaN(Date.parse(atualizacao[1].arquivado_em))).toBe(false)
    expect(await restaurarQuadro('q1')).toEqual({ erro: null })
    expect(banco.chamou('update', { arquivado_em: null })).toBe(true)
    banco.resposta = { data: [], error: null }
    expect(await arquivarQuadro('q1')).toEqual({ erro: SEM_PERMISSAO })
    expect(await restaurarQuadro('q1')).toEqual({ erro: SEM_PERMISSAO })
  })

  it('restaurar com um nome que já está em uso entre os abertos: a mensagem do design (renomear um deles)', async () => {
    banco.resposta = { data: null, error: { code: '23505', message: 'duplicate key' } }
    expect(await restaurarQuadro('q1')).toEqual({
      erro: 'Já existe um quadro aberto com esse nome. Renomeie um deles e tente de novo.',
    })
    // As outras recusas continuam com o texto de sempre.
    banco.resposta = { data: null, error: { code: 'P0001', message: 'sem_permissao' } }
    expect(await restaurarQuadro('q1')).toEqual({ erro: SEM_PERMISSAO })
  })
})

describe('favorito', () => {
  it('marcar insere só o quadro (quem marca é quem está logado)', async () => {
    banco.resposta = { data: null, error: null }
    expect(await marcarFavorito('q1', true)).toEqual({ erro: null })
    expect(banco.chamou('from', 'quadro_favoritos')).toBe(true)
    expect(banco.chamou('insert', { quadro_id: 'q1' })).toBe(true)
  })

  it('já marcado (23505) não é erro; quadro que a pessoa não vê é recusado', async () => {
    banco.resposta = { data: null, error: { code: '23505', message: 'duplicate key' } }
    expect(await marcarFavorito('q1', true)).toEqual({ erro: null })
    banco.resposta = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
    expect(await marcarFavorito('q1', true)).toEqual({ erro: SEM_PERMISSAO })
  })

  it('desmarcar apaga o favorito daquele quadro (o banco só deixa apagar os seus); já desmarcado não é erro', async () => {
    banco.resposta = { data: [{ quadro_id: 'q1' }], error: null }
    expect(await marcarFavorito('q1', false)).toEqual({ erro: null })
    expect(banco.chamou('delete')).toBe(true)
    expect(banco.chamou('eq', 'quadro_id', 'q1')).toBe(true)
    banco.resposta = { data: [], error: null }
    expect(await marcarFavorito('q1', false)).toEqual({ erro: null })
    banco.resposta = { data: null, error: { code: '42501', message: 'permission denied' } }
    expect(await marcarFavorito('q1', false)).toEqual({ erro: SEM_PERMISSAO })
  })
})

describe('apagar', () => {
  it('apagarQuadro chama a função e tira do balde "quadros" os objetos da pasta do quadro', async () => {
    rpcResponde({ caminhos: ['quadro/q1/c1/a-x.pdf', 'quadro/q1/c1/imagens/b.png'] })
    expect(await apagarQuadro('q1')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('apagar_quadro', { p_quadro: 'q1' })
    expect(supabase.storage.from).toHaveBeenCalledWith('quadros')
    expect(balde.remove).toHaveBeenCalledWith(['quadro/q1/c1/a-x.pdf', 'quadro/q1/c1/imagens/b.png'])
  })

  it('tira em lotes de 1.000 (o limite do Storage por pedido)', async () => {
    const caminhos = Array.from({ length: 2500 }, (_, i) => `quadro/q1/c1/${i}-a.pdf`)
    rpcResponde({ caminhos })
    expect(await apagarQuadro('q1')).toEqual({ erro: null })
    expect(balde.remove).toHaveBeenCalledTimes(3)
    expect(balde.remove.mock.calls.map(([lote]) => lote.length)).toEqual([1000, 1000, 500])
    expect(balde.remove.mock.calls.flatMap(([lote]) => lote)).toEqual(caminhos)
  })

  it('sem objetos, não chama o Storage', async () => {
    rpcResponde({ caminhos: [] })
    expect(await apagarQuadro('q1')).toEqual({ erro: null })
    expect(balde.remove).not.toHaveBeenCalled()
  })

  it('se algum objeto não sai, o quadro continua apagado e vem um aviso', async () => {
    rpcResponde({ caminhos: ['quadro/q1/c1/a-x.pdf', 'quadro/q1/c1/b-y.pdf'] })
    balde.remove.mockResolvedValue({ data: [{ name: 'quadro/q1/c1/a-x.pdf' }], error: null })
    expect(await apagarQuadro('q1')).toEqual({ erro: null, aviso: OBJETOS_FICARAM })
    balde.remove.mockResolvedValue({ data: null, error: { statusCode: '500' } })
    expect(await apagarQuadro('q1')).toEqual({ erro: null, aviso: OBJETOS_FICARAM })
  })

  it('quem não administra: a recusa do banco vira mensagem e nada sai do balde', async () => {
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    expect(await apagarQuadro('q1')).toEqual({ erro: SEM_PERMISSAO })
    expect(balde.remove).not.toHaveBeenCalled()
  })
})
