import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import {
  adicionarResponsavel,
  apagarCartao,
  apagarColuna,
  apagarComentario,
  apagarItemDoChecklist,
  arquivarCartao,
  buscarCartao,
  cartoesArquivados,
  cartoesDoQuadro,
  comentar,
  comentariosDoCartao,
  criarCartao,
  criarColuna,
  criarItemDoChecklist,
  editarCartao,
  editarColuna,
  editarComentario,
  editarItemDoChecklist,
  indicadoresDoQuadro,
  moverCartao,
  moverColuna,
  pessoasDoQuadro,
  quadroDoCliente,
  restaurarCartao,
  tirarResponsavel,
} from './quadro'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const SEM_PERMISSAO = 'Você não tem permissão para isso.'

let banco
beforeEach(() => {
  vi.clearAllMocks()
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

const rpcResponde = (data, error = null) => vi.mocked(supabase.rpc).mockResolvedValue({ data, error })

describe('leituras do quadro (funções do banco)', () => {
  it('quadroDoCliente abre (ou cria) o quadro pelo cliente; null quando não há quadro para a pessoa', async () => {
    rpcResponde({ id: 'q1', colunas: [] })
    expect(await quadroDoCliente('k1')).toEqual({ id: 'q1', colunas: [] })
    expect(supabase.rpc).toHaveBeenCalledWith('quadro_do_cliente', { p_cliente: 'k1' })
    rpcResponde(null)
    expect(await quadroDoCliente('k1')).toBeNull()
    vi.mocked(supabase.rpc).mockClear()
    expect(await quadroDoCliente(null)).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('o erro do banco numa leitura sobe', async () => {
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    await expect(quadroDoCliente('k1')).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
  })

  it('cartoesDoQuadro pede uma página da coluna com os filtros e devolve { itens, total }', async () => {
    rpcResponde({ itens: [{ id: 'c1' }], total: 51 })
    const r = await cartoesDoQuadro({
      quadroId: 'q1', colunaId: 'col1', pagina: 2, busca: '  ação ', prioridade: 'alta', responsavel: 'sem', prazo: 'atrasados',
    })
    expect(r).toEqual({ itens: [{ id: 'c1' }], total: 51 })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('cartoes_do_quadro', {
      p_quadro: 'q1', p_coluna: 'col1', p_pagina: 2, p_busca: 'ação', p_prioridade: 'alta', p_responsavel: 'sem',
      p_prazo: 'atrasados',
    })
  })

  it('filtro vazio vai como nulo; resposta vazia vira lista vazia', async () => {
    rpcResponde(null)
    expect(await cartoesDoQuadro({ quadroId: 'q1', colunaId: 'col1', busca: '   ', prioridade: '' })).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenCalledWith('cartoes_do_quadro', {
      p_quadro: 'q1', p_coluna: 'col1', p_pagina: 1, p_busca: null, p_prioridade: null, p_responsavel: null, p_prazo: null,
    })
  })

  it('indicadoresDoQuadro manda os mesmos filtros (sem a coluna)', async () => {
    rpcResponde({ cartoes: 6, atrasados: 1, vencem_em_7_dias: 2, sem_responsavel: 3 })
    expect(await indicadoresDoQuadro({ quadroId: 'q1', responsavel: 'p1' })).toEqual({
      cartoes: 6, atrasados: 1, vencem_em_7_dias: 2, sem_responsavel: 3,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('indicadores_do_quadro', {
      p_quadro: 'q1', p_busca: null, p_prioridade: null, p_responsavel: 'p1', p_prazo: null,
    })
  })

  it('cartoesArquivados pagina no banco, com busca', async () => {
    rpcResponde({ itens: [{ id: 'c9' }], total: 16 })
    expect(await cartoesArquivados({ quadroId: 'q1', busca: ' kickoff ', pagina: 2 })).toEqual({ itens: [{ id: 'c9' }], total: 16 })
    expect(supabase.rpc).toHaveBeenCalledWith('cartoes_arquivados', { p_quadro: 'q1', p_busca: 'kickoff', p_pagina: 2 })
  })

  it('pessoasDoQuadro busca no banco: { itens, total }', async () => {
    rpcResponde([{ id: 'p1', nome: 'Ana', foto: null, cor: null }])
    expect(await pessoasDoQuadro({ quadroId: 'q1', termo: ' an ' })).toEqual({
      itens: [{ id: 'p1', nome: 'Ana', foto: null, cor: null }], total: 1,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('pessoas_do_quadro', { p_quadro: 'q1', p_busca: 'an', p_limite: 50 })
    expect(await pessoasDoQuadro({})).toEqual({ itens: [], total: 0 })
  })

  it('buscarCartao e comentariosDoCartao (30 por vez, "ver anteriores" pelo id do mais antigo)', async () => {
    rpcResponde({ id: 'c1', titulo: 'X' })
    expect(await buscarCartao('c1')).toEqual({ id: 'c1', titulo: 'X' })
    expect(supabase.rpc).toHaveBeenCalledWith('cartao_do_quadro', { p_cartao: 'c1' })
    rpcResponde({ itens: [{ id: 'm1' }], ha_mais: true })
    expect(await comentariosDoCartao({ cartaoId: 'c1', antesId: 'm9' })).toEqual({ itens: [{ id: 'm1' }], haMais: true })
    expect(supabase.rpc).toHaveBeenCalledWith('comentarios_do_cartao', { p_cartao: 'c1', p_antes: 'm9', p_limite: 30 })
  })
})

describe('mover e apagar coluna', () => {
  it('moverCartao manda os vizinhos e devolve a posição que o banco gravou', async () => {
    rpcResponde({ id: 'c1', coluna_id: 'col2', posicao: 1536, renumerou: false })
    expect(await moverCartao({ cartaoId: 'c1', colunaId: 'col2', antesId: 'c0' })).toEqual({
      erro: null, cartao: { id: 'c1', coluna_id: 'col2', posicao: 1536 }, renumerou: false,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('mover_cartao', { p_cartao: 'c1', p_coluna: 'col2', p_antes: 'c0', p_depois: null })
  })

  it('moverCartao recusado volta com a mensagem (a tela desfaz o arrastar)', async () => {
    rpcResponde(null, { code: 'P0001', message: 'vizinho_invalido' })
    expect(await moverCartao({ cartaoId: 'c1', colunaId: 'col2' })).toEqual({
      erro: 'O quadro mudou enquanto você arrastava. Atualize o quadro e tente de novo.',
    })
  })

  it('moverColuna', async () => {
    rpcResponde({ id: 'col1', posicao: 2560, renumerou: true })
    expect(await moverColuna({ colunaId: 'col1', antesId: 'col0', depoisId: 'col2' })).toEqual({
      erro: null, coluna: { id: 'col1', posicao: 2560 }, renumerou: true,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('mover_coluna', { p_coluna: 'col1', p_antes: 'col0', p_depois: 'col2' })
  })

  it('apagarColuna manda o destino (ou "apagar junto") e diz quantos foram movidos e apagados', async () => {
    rpcResponde({ movidos: 2, apagados: 0, ids_apagados: [] })
    expect(await apagarColuna('col1', { destinoId: 'col2' })).toEqual({ erro: null, movidos: 2, apagados: 0, idsApagados: [] })
    expect(supabase.rpc).toHaveBeenCalledWith('apagar_coluna', { p_coluna: 'col1', p_destino: 'col2', p_apagar_cartoes: false })
    rpcResponde({ movidos: 0, apagados: 1, ids_apagados: ['c1'] })
    expect(await apagarColuna('col1', { apagarCartoes: true })).toEqual({ erro: null, movidos: 0, apagados: 1, idsApagados: ['c1'] })
    expect(supabase.rpc).toHaveBeenCalledWith('apagar_coluna', { p_coluna: 'col1', p_destino: null, p_apagar_cartoes: true })
  })

  it('coluna com cartões e sem escolha: a recusa do banco vira mensagem', async () => {
    rpcResponde(null, { code: 'P0001', message: 'coluna_com_cartoes' })
    expect(await apagarColuna('col1')).toEqual({
      erro: 'Esta coluna tem cartões. Escolha para qual coluna eles vão ou apague junto.',
    })
  })
})

describe('cartões', () => {
  it('criarCartao grava na coluna (título sem espaços nas pontas) e depois os responsáveis', async () => {
    banco.resposta = { data: { id: 'c1' }, error: null }
    expect(await criarCartao({ colunaId: 'col1', titulo: '  Levantar requisitos ', prioridade: 'alta', responsaveis: ['p1', 'p2'] }))
      .toEqual({ erro: null, cartao: { id: 'c1' } })
    expect(banco.chamou('insert', { coluna_id: 'col1', titulo: 'Levantar requisitos', descricao: null, prioridade: 'alta', prazo: null }))
      .toBe(true)
    expect(banco.chamou('from', 'cartao_responsaveis')).toBe(true)
    expect(banco.chamou('insert', [{ cartao_id: 'c1', perfil_id: 'p1' }, { cartao_id: 'c1', perfil_id: 'p2' }])).toBe(true)
  })

  it('criarCartao sem responsáveis não chama a tabela deles; erro do banco vira mensagem', async () => {
    banco.resposta = { data: { id: 'c1' }, error: null }
    await criarCartao({ colunaId: 'col1', titulo: 'X' })
    expect(banco.chamou('from', 'cartao_responsaveis')).toBe(false)
    banco.resposta = { data: null, error: { code: '42501' } }
    expect(await criarCartao({ colunaId: 'col1', titulo: 'X' })).toEqual({ erro: SEM_PERMISSAO })
  })

  it('editarCartao manda só os campos do cartão que vieram (a coluna muda por moverCartao)', async () => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
    expect(await editarCartao('c1', { titulo: ' Novo ', prazo: null, coluna_id: 'col9', ignorado: 1 })).toEqual({ erro: null })
    expect(banco.chamou('update', { titulo: 'Novo', prazo: null })).toBe(true)
    expect(banco.chamou('eq', 'id', 'c1')).toBe(true)
  })

  it('nenhuma linha de volta = o banco recusou', async () => {
    banco.resposta = { data: [], error: null }
    expect(await editarCartao('c1', { titulo: 'X' })).toEqual({ erro: SEM_PERMISSAO })
    expect(await apagarCartao('c1')).toEqual({ erro: SEM_PERMISSAO })
  })

  it('arquivar marca a data (o banco grava a dele); restaurar limpa', async () => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
    await arquivarCartao('c1')
    const arquivar = banco.chamadas.find(([m]) => m === 'update')[1]
    expect(typeof arquivar.arquivado_em).toBe('string')
    await restaurarCartao('c1')
    expect(banco.chamou('update', { arquivado_em: null })).toBe(true)
  })

  it('apagarCartao e responsáveis', async () => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
    expect(await apagarCartao('c1')).toEqual({ erro: null })
    expect(banco.chamou('delete')).toBe(true)
    expect(await tirarResponsavel('c1', 'p1')).toEqual({ erro: null })
    expect(banco.chamou('eq', 'perfil_id', 'p1')).toBe(true)
    banco.resposta = { data: null, error: { code: 'P0001', message: 'responsavel_invalido' } }
    expect(await adicionarResponsavel('c1', 'p9')).toEqual({
      erro: 'Escolha alguém que atende este cliente: o consultor dele ou quem cuida da consultoria.',
    })
    expect(banco.chamou('insert', { cartao_id: 'c1', perfil_id: 'p9' })).toBe(true)
  })
})

describe('colunas, checklist e comentários', () => {
  it('criarColuna e editarColuna', async () => {
    banco.resposta = { data: { id: 'col1', nome: 'Revisão', cor: 3, concluidos: false, posicao: 4096 }, error: null }
    expect(await criarColuna({ quadroId: 'q1', nome: ' Revisão ', cor: 3 })).toEqual({
      erro: null, coluna: { id: 'col1', nome: 'Revisão', cor: 3, concluidos: false, posicao: 4096 },
    })
    expect(banco.chamou('insert', { quadro_id: 'q1', nome: 'Revisão', cor: 3, concluidos: false })).toBe(true)
    banco.resposta = { data: [{ id: 'col1' }], error: null }
    expect(await editarColuna('col1', { concluidos: true, posicao: 1 })).toEqual({ erro: null })
    expect(banco.chamou('update', { concluidos: true })).toBe(true)
  })

  it('checklist: criar, marcar e apagar', async () => {
    banco.resposta = { data: { id: 'i1', texto: 'Mapear', feito: false, posicao: 1024 }, error: null }
    expect(await criarItemDoChecklist('c1', ' Mapear ')).toEqual({
      erro: null, item: { id: 'i1', texto: 'Mapear', feito: false, posicao: 1024 },
    })
    expect(banco.chamou('insert', { cartao_id: 'c1', texto: 'Mapear' })).toBe(true)
    banco.resposta = { data: [{ id: 'i1' }], error: null }
    expect(await editarItemDoChecklist('i1', { feito: true })).toEqual({ erro: null })
    expect(banco.chamou('update', { feito: true })).toBe(true)
    expect(await apagarItemDoChecklist('i1')).toEqual({ erro: null })
    banco.resposta = { data: null, error: { code: 'P0001', message: 'checklist_cheio' } }
    expect(await criarItemDoChecklist('c1', 'Mais')).toEqual({ erro: 'O checklist chegou ao limite de 200 itens.' })
  })

  it('comentários: comentar, editar o próprio e apagar', async () => {
    banco.resposta = { data: { id: 'm1', texto: 'Oi', criado_em: 'x', editado_em: null, autor_id: 'p1' }, error: null }
    expect(await comentar('c1', ' Oi ')).toEqual({
      erro: null, comentario: { id: 'm1', texto: 'Oi', criado_em: 'x', editado_em: null, autor_id: 'p1' },
    })
    expect(banco.chamou('insert', { cartao_id: 'c1', texto: 'Oi' })).toBe(true)
    banco.resposta = { data: [], error: null }
    expect(await editarComentario('m1', 'Outro')).toEqual({ erro: SEM_PERMISSAO })
    banco.resposta = { data: [{ id: 'm1' }], error: null }
    expect(await apagarComentario('m1')).toEqual({ erro: null })
    banco.resposta = { data: null, error: { code: '23514' } }
    expect(await comentar('c1', 'x'.repeat(2001))).toEqual({ erro: 'Confira os campos destacados.' })
  })
})
