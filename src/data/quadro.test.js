import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import {
  adicionarResponsavel,
  anexosDoCartao,
  apagarAnexo,
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
  enviarAnexo,
  enviarImagemDaDescricao,
  indicadoresDoQuadro,
  limparQuadroDoCliente,
  moverCartao,
  moverColuna,
  pessoasDoQuadro,
  quadroDoCliente,
  restaurarCartao,
  tirarResponsavel,
  urlAssinada,
  urlsAssinadas,
} from './quadro'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }))

const SEM_PERMISSAO = 'Você não tem permissão para isso.'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

let banco
let balde
beforeEach(() => {
  vi.clearAllMocks()
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
  balde = {
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    remove: vi.fn(async (caminhos) => ({ data: caminhos.map((name) => ({ name })), error: null })),
    createSignedUrl: vi.fn(),
    createSignedUrls: vi.fn(),
  }
  vi.mocked(supabase.storage.from).mockReturnValue(balde)
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

  it('apagar junto tira do balde quadros os anexos e as imagens dos cartões apagados (depois das linhas)', async () => {
    rpcResponde({ movidos: 0, apagados: 1, ids_apagados: ['c1'], caminhos: ['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'] })
    expect(await apagarColuna('col1', { apagarCartoes: true })).toEqual({ erro: null, movidos: 0, apagados: 1, idsApagados: ['c1'] })
    expect(supabase.storage.from).toHaveBeenCalledWith('quadros')
    expect(balde.remove).toHaveBeenCalledWith(['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'])
  })

  it('se os objetos não saem, a coluna continua apagada e vem um aviso', async () => {
    rpcResponde({ movidos: 0, apagados: 1, ids_apagados: ['c1'], caminhos: ['k1/c1/a-x.pdf'] })
    balde.remove.mockResolvedValue({ data: null, error: { statusCode: '500' } })
    expect(await apagarColuna('col1', { apagarCartoes: true })).toEqual({
      erro: null, movidos: 0, apagados: 1, idsApagados: ['c1'],
      aviso: 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.',
    })
  })

  it('coluna movida (sem objetos para tirar) não chama o Storage', async () => {
    rpcResponde({ movidos: 2, apagados: 0, ids_apagados: [], caminhos: [] })
    await apagarColuna('col1', { destinoId: 'col2' })
    expect(balde.remove).not.toHaveBeenCalled()
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

  it('editarCartao: campo opcional esvaziado vai como nulo (prazo, prioridade, descrição); o título vazio o banco recusa', async () => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
    expect(await editarCartao('c1', { prazo: '', prioridade: '  ', descricao: '' })).toEqual({ erro: null })
    expect(banco.chamou('update', { prazo: null, prioridade: null, descricao: null })).toBe(true)
    await editarCartao('c1', { titulo: '   ' })
    expect(banco.chamou('update', { titulo: '' })).toBe(true)
  })

  it('editarCartao sem nenhum campo do cartão não manda update vazio', async () => {
    expect(await editarCartao('c1', { coluna_id: 'col9', ignorado: 1 })).toEqual({ erro: null })
    expect(await editarCartao('c1', {})).toEqual({ erro: null })
    expect(await editarCartao('c1')).toEqual({ erro: null })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('nenhuma linha de volta = o banco recusou', async () => {
    banco.resposta = { data: [], error: null }
    expect(await editarCartao('c1', { titulo: 'X' })).toEqual({ erro: SEM_PERMISSAO })
  })

  it('arquivar marca a data (o banco grava a dele); restaurar limpa', async () => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
    await arquivarCartao('c1')
    const arquivar = banco.chamadas.find(([m]) => m === 'update')[1]
    expect(typeof arquivar.arquivado_em).toBe('string')
    await restaurarCartao('c1')
    expect(banco.chamou('update', { arquivado_em: null })).toBe(true)
  })

  it('apagarCartao apaga pelo banco (quem criou ou a gestão) e depois tira do balde os anexos e as imagens dele', async () => {
    rpcResponde({ caminhos: ['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'] })
    expect(await apagarCartao('c1')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('apagar_cartao', { p_cartao: 'c1' })
    expect(supabase.storage.from).toHaveBeenCalledWith('quadros')
    expect(balde.remove).toHaveBeenCalledWith(['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'])
  })

  it('apagarCartao recusado não toca no Storage; cartão sem objetos também não', async () => {
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    expect(await apagarCartao('c1')).toEqual({ erro: SEM_PERMISSAO })
    rpcResponde({ caminhos: [] })
    expect(await apagarCartao('c1')).toEqual({ erro: null })
    expect(balde.remove).not.toHaveBeenCalled()
  })

  it('apagarCartao: se os objetos não saem, o cartão continua apagado e vem um aviso', async () => {
    rpcResponde({ caminhos: ['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'] })
    balde.remove.mockResolvedValue({ data: [{ name: 'k1/c1/a-x.pdf' }], error: null })
    expect(await apagarCartao('c1')).toEqual({
      erro: null, aviso: 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.',
    })
  })

  it('apagarCartao tira os objetos em lotes de 1000 (o limite do Storage por pedido)', async () => {
    const caminhos = Array.from({ length: 1001 }, (_, i) => `k1/c1/${i}-x.pdf`)
    rpcResponde({ caminhos })
    expect(await apagarCartao('c1')).toEqual({ erro: null })
    expect(balde.remove).toHaveBeenCalledTimes(2)
    expect(balde.remove.mock.calls[0][0]).toHaveLength(1000)
    expect(balde.remove.mock.calls[1][0]).toEqual(['k1/c1/1000-x.pdf'])
  })

  it('responsáveis', async () => {
    banco.resposta = { data: [{ id: 'c1' }], error: null }
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

  it('editarColuna: cor esvaziada volta a ser automática (nulo); sem campo da coluna não manda update vazio', async () => {
    banco.resposta = { data: [{ id: 'col1' }], error: null }
    expect(await editarColuna('col1', { cor: '' })).toEqual({ erro: null })
    expect(banco.chamou('update', { cor: null })).toBe(true)
    vi.mocked(supabase.from).mockClear()
    expect(await editarColuna('col1', { posicao: 1 })).toEqual({ erro: null })
    expect(await editarColuna('col1', {})).toEqual({ erro: null })
    expect(supabase.from).not.toHaveBeenCalled()
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

describe('anexos do cartão (balde quadros)', () => {
  const cartao = { clienteId: 'k1', cartaoId: 'c1' }
  const arquivo = (nome, tamanho = 10, tipo = 'application/pdf') => ({ name: nome, size: tamanho, type: tipo })

  it('enviarAnexo sobe o objeto na pasta do cartão e depois grava a linha', async () => {
    const linha = { id: 'x1', nome: 'Relatório final.pdf', tamanho: 10, tipo: 'application/pdf', caminho: 'k1/c1/u-x.pdf' }
    banco.resposta = { data: linha, error: null }
    expect(await enviarAnexo(cartao, arquivo(' Relatório final.pdf '))).toEqual({ erro: null, anexo: linha })
    const [caminho, enviado, opcoes] = balde.upload.mock.calls[0]
    expect(caminho).toMatch(new RegExp(`^k1/c1/${UUID}-Relatorio_final\\.pdf$`))
    expect(enviado.name).toBe(' Relatório final.pdf ')
    expect(opcoes).toEqual({ contentType: 'application/pdf' })
    expect(banco.chamou('from', 'cartao_anexos')).toBe(true)
    expect(banco.chamou('insert', { cartao_id: 'c1', caminho, nome: 'Relatório final.pdf', tamanho: 10, tipo: 'application/pdf' }))
      .toBe(true)
  })

  it('arquivo vazio ou acima de 25 MB nem sobe', async () => {
    expect(await enviarAnexo(cartao, arquivo('vazio.txt', 0))).toEqual({ erro: 'O arquivo está vazio.' })
    expect(await enviarAnexo(cartao, arquivo('grande.zip', 26214401))).toEqual({ erro: 'O arquivo passa de 25 MB.' })
    expect(balde.upload).not.toHaveBeenCalled()
  })

  it('sem tipo, sobe como application/octet-stream e a linha fica sem tipo', async () => {
    banco.resposta = { data: { id: 'x1' }, error: null }
    await enviarAnexo(cartao, arquivo('dados', 5, ''))
    expect(balde.upload.mock.calls[0][2]).toEqual({ contentType: 'application/octet-stream' })
    expect(banco.chamadas.find(([m]) => m === 'insert')[1].tipo).toBeNull()
  })

  it('se o Storage recusa, não grava a linha; se a linha não grava, tira o objeto que subiu', async () => {
    balde.upload.mockResolvedValueOnce({ data: null, error: { statusCode: '413' } })
    expect(await enviarAnexo(cartao, arquivo('a.pdf'))).toEqual({ erro: 'O arquivo passa de 25 MB.' })
    expect(banco.chamou('from', 'cartao_anexos')).toBe(false)

    banco.resposta = { data: null, error: { code: '42501', message: 'sem_permissao' } }
    expect(await enviarAnexo(cartao, arquivo('b.pdf'))).toEqual({ erro: SEM_PERMISSAO })
    const caminho = balde.upload.mock.calls[1][0]
    expect(balde.remove).toHaveBeenCalledWith([caminho])
  })

  it('anexosDoCartao pagina no banco (15 por página): { itens, total }', async () => {
    rpcResponde({ itens: [{ id: 'x1' }], total: 16 })
    expect(await anexosDoCartao({ cartaoId: 'c1', pagina: 2 })).toEqual({ itens: [{ id: 'x1' }], total: 16 })
    expect(supabase.rpc).toHaveBeenCalledWith('anexos_do_cartao', { p_cartao: 'c1', p_pagina: 2 })
    rpcResponde(null)
    expect(await anexosDoCartao({ cartaoId: 'c1' })).toEqual({ itens: [], total: 0 })
  })

  it('apagarAnexo apaga a linha (quem enviou ou a gestão) e depois o objeto', async () => {
    banco.resposta = { data: [{ caminho: 'k1/c1/u-x.pdf' }], error: null }
    expect(await apagarAnexo({ id: 'x1' })).toEqual({ erro: null })
    expect(banco.chamou('delete')).toBe(true)
    expect(banco.chamou('eq', 'id', 'x1')).toBe(true)
    expect(balde.remove).toHaveBeenCalledWith(['k1/c1/u-x.pdf'])
  })

  it('apagarAnexo: nenhuma linha = sem permissão (nada sai do Storage); objeto que fica vira aviso', async () => {
    banco.resposta = { data: [], error: null }
    expect(await apagarAnexo({ id: 'x1' })).toEqual({ erro: SEM_PERMISSAO })
    expect(balde.remove).not.toHaveBeenCalled()
    banco.resposta = { data: [{ caminho: 'k1/c1/u-x.pdf' }], error: null }
    balde.remove.mockResolvedValue({ data: [], error: null })
    expect(await apagarAnexo({ id: 'x1' })).toEqual({
      erro: null, aviso: 'O anexo saiu do cartão, mas a cópia guardada não foi apagada. Avise o suporte.',
    })
  })
})

describe('imagens da descrição e links assinados', () => {
  const cartao = { clienteId: 'k1', cartaoId: 'c1' }

  it('enviarImagemDaDescricao sobe na pasta de imagens do cartão e devolve o caminho para o nó', async () => {
    const r = await enviarImagemDaDescricao(cartao, { name: 'print.png', size: 100, type: 'image/png' })
    expect(r.erro).toBeNull()
    expect(r.caminho).toMatch(new RegExp(`^k1/c1/imagens/${UUID}\\.png$`))
    expect(balde.upload).toHaveBeenCalledWith(r.caminho, expect.anything(), { contentType: 'image/png' })
    const jpg = await enviarImagemDaDescricao(cartao, { name: 'foto.JPEG', size: 100, type: 'image/jpeg' })
    expect(jpg.caminho).toMatch(/\.jpg$/)
  })

  it('só PNG, JPG, GIF e WEBP de até 25 MB; recusa do Storage vira mensagem', async () => {
    const tipo = 'Envie uma imagem PNG, JPG, GIF ou WEBP.'
    expect(await enviarImagemDaDescricao(cartao, { name: 'x.svg', size: 10, type: 'image/svg+xml' })).toEqual({ erro: tipo })
    expect(await enviarImagemDaDescricao(cartao, { name: 'x.html', size: 10, type: 'text/html' })).toEqual({ erro: tipo })
    expect(await enviarImagemDaDescricao(cartao, { name: 'x.png', size: 26214401, type: 'image/png' })).toEqual({
      erro: 'O arquivo passa de 25 MB.',
    })
    expect(balde.upload).not.toHaveBeenCalled()
    balde.upload.mockResolvedValueOnce({ data: null, error: { statusCode: '403' } })
    expect(await enviarImagemDaDescricao(cartao, { name: 'x.png', size: 10, type: 'image/png' })).toEqual({ erro: SEM_PERMISSAO })
  })

  it('urlAssinada: com nome baixa o anexo (60 s); sem nome mostra a imagem (1 h)', async () => {
    balde.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://assinado' }, error: null })
    expect(await urlAssinada('k1/c1/u-x.pdf', { nome: 'Relatório.pdf' })).toEqual({ url: 'https://assinado' })
    expect(balde.createSignedUrl).toHaveBeenCalledWith('k1/c1/u-x.pdf', 60, { download: 'Relatório.pdf' })
    await urlAssinada('k1/c1/imagens/u.png')
    expect(balde.createSignedUrl).toHaveBeenLastCalledWith('k1/c1/imagens/u.png', 3600)
    balde.createSignedUrl.mockResolvedValue({ data: null, error: { statusCode: '404' } })
    expect(await urlAssinada('k1/c1/u-x.pdf')).toEqual({ erro: 'Esse arquivo não foi encontrado.' })
  })

  it('urlsAssinadas: as imagens de uma descrição num pedido só', async () => {
    balde.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'k1/c1/imagens/a.png', signedUrl: 'https://a', error: null },
        { path: 'k1/c1/imagens/b.png', signedUrl: null, error: 'Not found' },
      ],
      error: null,
    })
    expect(await urlsAssinadas(['k1/c1/imagens/a.png', 'k1/c1/imagens/b.png'])).toEqual({
      urls: { 'k1/c1/imagens/a.png': 'https://a' },
    })
    expect(balde.createSignedUrls).toHaveBeenCalledTimes(1)
    expect(balde.createSignedUrls).toHaveBeenCalledWith(['k1/c1/imagens/a.png', 'k1/c1/imagens/b.png'], 3600)
    expect(await urlsAssinadas([])).toEqual({ urls: {} })
    expect(balde.createSignedUrls).toHaveBeenCalledTimes(1)
  })
})

describe('limparQuadroDoCliente (depois de apagar o cliente)', () => {
  it('pede ao banco o que sobrou na pasta do cliente e tira do balde', async () => {
    rpcResponde(['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'])
    expect(await limparQuadroDoCliente('k1')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('objetos_para_tirar_do_quadro', { p_cliente: 'k1' })
    expect(balde.remove).toHaveBeenCalledWith(['k1/c1/a-x.pdf', 'k1/c1/imagens/b.png'])
  })

  it('nada para tirar: não chama o Storage; sem cliente, nem o banco', async () => {
    rpcResponde([])
    expect(await limparQuadroDoCliente('k1')).toEqual({ erro: null })
    expect(balde.remove).not.toHaveBeenCalled()
    vi.mocked(supabase.rpc).mockClear()
    expect(await limparQuadroDoCliente(null)).toEqual({ erro: null })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('1000 de uma vez: pede de novo até acabar', async () => {
    const mil = Array.from({ length: 1000 }, (_, i) => `k1/c1/${i}-x.pdf`)
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: mil, error: null })
      .mockResolvedValueOnce({ data: ['k1/c1/ultimo-x.pdf'], error: null })
    expect(await limparQuadroDoCliente('k1')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(balde.remove).toHaveBeenCalledTimes(2)
  })

  it('erro do banco ou do Storage vira aviso', async () => {
    const aviso = 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.'
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    expect(await limparQuadroDoCliente('k1')).toEqual({ erro: aviso })
    rpcResponde(['k1/c1/a-x.pdf'])
    balde.remove.mockResolvedValue({ data: null, error: { statusCode: '500' } })
    expect(await limparQuadroDoCliente('k1')).toEqual({ erro: aviso })
  })
})
