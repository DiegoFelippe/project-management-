// O quadro Kanban do cliente contra o Supabase local de verdade: roda as funções de src/data/quadro.js (as mesmas
// chamadas que o app faz) como cada tipo de usuário. Pega o que um mock esconde: permissão por coluna que falta no
// grant, regra de leitura errada por papel, função que a API não enxerga, e a corrida de dois arrastos na mesma coluna
// (duas sessões, duas conexões ao banco). Os anexos e as imagens da descrição vão ao balde "quadros" de verdade: enviar,
// baixar pelo link assinado, apagar (linha e depois objeto) e o que sai do Storage ao apagar cartão, coluna e cliente.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { caminhoDoAnexo, TAMANHO_MAXIMO_ARQUIVO } from '../../src/lib/arquivos.js'
import { ARQUIVO_GRANDE_DEMAIS, traduzirErroBanco } from '../../src/lib/erros.js'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

// O cliente do Supabase de quem está "logado" no teste (entrar): funções (from, rpc) e o Storage (supabase.storage).
const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get: (_, nome) => {
      const valor = atual.cliente[nome]
      return typeof valor === 'function' ? valor.bind(atual.cliente) : valor
    },
  }),
}))

const {
  adicionarResponsavel,
  anexosDoCartao,
  apagarAnexo,
  apagarCartao,
  apagarColuna,
  apagarComentario,
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
  limparQuadroDoCliente,
  moverCartao,
  moverColuna,
  pessoasDoQuadro,
  quadroDoCliente,
  quadroPorId,
  quadrosDoCliente,
  restaurarCartao,
  urlAssinada,
  urlsAssinadas,
} = await import('../../src/data/quadro.js')

// Os números do quadro saíram da tela (17/11) e da camada de dados, mas a função do banco continua: lida direto.
async function indicadoresDoQuadro({ quadroId }) {
  const { data, error } = await atual.cliente.rpc('indicadores_do_quadro', { p_quadro: quadroId })
  if (error) throw error
  return { cartoes: 0, atrasados: 0, vencem_em_7_dias: 0, sem_responsavel: 0, ...data }
}

const admin = clienteAdmin()
const SEM_PERMISSAO = 'Você não tem permissão para isso.'

let A, B
let central, gestorA, pessoaA, colegaA, pessoaB
let sessoes = {}
let cliente
let quadro
const coluna = {}
const cartao = {}

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}
const titulos = (r) => r.itens.map((c) => c.titulo)

async function novoCartao(chave, colunaId, extras = {}) {
  const r = await criarCartao({ colunaId, titulo: `Integração ${chave}`, ...extras })
  expect(r.erro).toBeNull()
  cartao[chave] = r.cartao.id
  return r.cartao.id
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  central = await criarPerfilDeTeste({ papel: 'central' })
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  colegaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: B })
  sessoes = {
    central: await entrarComo(central),
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    colega: await entrarComo(colegaA),
    pessoaB: await entrarComo(pessoaB),
  }
  const { data, error } = await admin
    .from('clientes')
    .insert({ nome: 'Cliente quadro integração', horas_mes: 10, consultoria_id: A, consultor_id: pessoaA.id })
    .select('id')
    .single()
  if (error) throw error
  cliente = data.id
  registrarCliente(cliente)
})

afterAll(limparTudo)

describe('quadro do cliente contra o banco de verdade', () => {
  it('quem não atende o cliente não recebe o quadro; o consultor cria o quadro com as três colunas', async () => {
    entrar('colega')
    expect(await quadroDoCliente(cliente)).toBeNull()
    entrar('pessoaB')
    expect(await quadroDoCliente(cliente)).toBeNull()
    entrar('central')
    expect(await quadroDoCliente(cliente)).toBeNull()

    entrar('pessoa')
    quadro = await quadroDoCliente(cliente)
    expect(quadro.colunas.map((c) => c.nome)).toEqual(['A fazer', 'Em andamento', 'Concluído'])
    expect(quadro.colunas.map((c) => c.concluidos)).toEqual([false, false, true])
    expect(quadro).toMatchObject({ cliente_id: cliente, consultoria_id: A, pode_mexer: true, pode_gerir: false })
    ;[coluna.afazer, coluna.fazendo, coluna.feito] = quadro.colunas.map((c) => c.id)

    entrar('gestor')
    expect(await quadroDoCliente(cliente)).toMatchObject({ id: quadro.id, pode_mexer: true, pode_gerir: true })
    entrar('central')
    expect(await quadroDoCliente(cliente)).toMatchObject({ id: quadro.id, pode_mexer: false, pode_gerir: false })
  })

  it('o consultor cria cartões com responsáveis; a página da coluna traz nomes, checklist e comentários', async () => {
    entrar('pessoa')
    await novoCartao('um', coluna.afazer, { prioridade: 'alta', responsaveis: [pessoaA.id, gestorA.id] })
    await novoCartao('dois', coluna.afazer, {
      descricao: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Configurar integração' }] }] },
    })
    expect((await criarItemDoChecklist(cartao.um, ' Mapear notas ')).item).toMatchObject({ texto: 'Mapear notas', feito: false })
    const item = (await criarItemDoChecklist(cartao.um, 'Mapear boletos')).item
    expect(await editarItemDoChecklist(item.id, { feito: true })).toEqual({ erro: null })
    expect((await comentar(cartao.um, 'Primeira conversa')).erro).toBeNull()

    const pagina = await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer })
    expect(pagina.total).toBe(2)
    expect(titulos(pagina)).toEqual(['Integração um', 'Integração dois'])
    const um = pagina.itens[0]
    expect(um.responsaveis.map((p) => p.id).sort()).toEqual([gestorA.id, pessoaA.id].sort())
    expect(um.responsaveis.every((p) => p.nome)).toBe(true)
    expect(um.checklist).toEqual({ total: 2, feitos: 1 })
    expect(um.comentarios).toBe(1)
    expect(pagina.itens[1].resumo).toBe('Configurar integração')

    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer, busca: 'INTEGRACAO' })))
      .toEqual(['Integração um', 'Integração dois'])
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer, busca: 'configurar' })))
      .toEqual(['Integração dois'])
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer, responsavel: 'sem' })))
      .toEqual(['Integração dois'])
    expect(await indicadoresDoQuadro({ quadroId: quadro.id }))
      .toEqual({ cartoes: 2, atrasados: 0, vencem_em_7_dias: 0, sem_responsavel: 1 })
  })

  it('o cartão inteiro e os comentários (para a janela do cartão)', async () => {
    entrar('pessoa')
    const um = await buscarCartao(cartao.um)
    expect(um).toMatchObject({ titulo: 'Integração um', prioridade: 'alta', pode_mexer: true, pode_apagar: true })
    expect(um.coluna.nome).toBe('A fazer')
    expect(um.checklist.map((i) => i.texto)).toEqual(['Mapear notas', 'Mapear boletos'])
    expect(um.criado_por.id).toBe(pessoaA.id)
    const { itens, haMais } = await comentariosDoCartao({ cartaoId: cartao.um })
    expect(haMais).toBe(false)
    expect(itens[0]).toMatchObject({ texto: 'Primeira conversa', editado_em: null })
    expect(itens[0].autor.id).toBe(pessoaA.id)
    expect(await editarComentario(itens[0].id, 'Primeira conversa feita')).toEqual({ erro: null })
    expect((await comentariosDoCartao({ cartaoId: cartao.um })).itens[0].editado_em).not.toBeNull()

    entrar('gestor')
    expect(await editarComentario(itens[0].id, 'Trocado pela gestão')).toEqual({ erro: SEM_PERMISSAO })
    expect(await apagarComentario(itens[0].id)).toEqual({ erro: null })
  })

  it('responsável só entre quem atende o cliente; a lista de quem pode vem do banco', async () => {
    entrar('pessoa')
    expect(await adicionarResponsavel(cartao.dois, colegaA.id)).toEqual({
      erro: 'Escolha alguém que atende este cliente: o consultor dele ou quem cuida da consultoria.',
    })
    const { itens } = await pessoasDoQuadro({ quadroId: quadro.id })
    expect(itens.map((p) => p.id).sort()).toEqual([gestorA.id, pessoaA.id].sort())
  })

  it('editar, arquivar, restaurar e apagar', async () => {
    entrar('pessoa')
    expect(await editarCartao(cartao.dois, { titulo: ' Integração dois (editado) ', prazo: '2020-01-01' })).toEqual({ erro: null })
    expect(await indicadoresDoQuadro({ quadroId: quadro.id })).toMatchObject({ atrasados: 1 })
    expect(await arquivarCartao(cartao.dois)).toEqual({ erro: null })
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer }))).toEqual(['Integração um'])
    const arquivados = await cartoesArquivados({ quadroId: quadro.id })
    expect(arquivados.total).toBe(1)
    expect(arquivados.itens[0]).toMatchObject({ titulo: 'Integração dois (editado)', coluna: { nome: 'A fazer' } })
    expect(await restaurarCartao(cartao.dois)).toEqual({ erro: null })
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer })))
      .toEqual(['Integração um', 'Integração dois (editado)'])

    entrar('gestor')
    await novoCartao('gestao', coluna.afazer)
    entrar('pessoa')
    expect(await apagarCartao(cartao.gestao)).toEqual({ erro: SEM_PERMISSAO })
    entrar('gestor')
    expect(await apagarCartao(cartao.gestao)).toEqual({ erro: null })
  })

  it('a central e quem não atende o cliente não gravam nada', async () => {
    entrar('central')
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer })))
      .toEqual(['Integração um', 'Integração dois (editado)'])
    expect(await criarCartao({ colunaId: coluna.afazer, titulo: 'Da central' })).toEqual({ erro: SEM_PERMISSAO })
    expect(await editarCartao(cartao.um, { titulo: 'Da central' })).toEqual({ erro: SEM_PERMISSAO })
    expect(await moverCartao({ cartaoId: cartao.um, colunaId: coluna.fazendo })).toEqual({ erro: SEM_PERMISSAO })
    expect(await criarColuna({ quadroId: quadro.id, nome: 'Da central' })).toEqual({ erro: SEM_PERMISSAO })
    expect(await comentar(cartao.um, 'Da central')).toEqual({ erro: SEM_PERMISSAO })

    entrar('colega')
    await expect(cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer })).rejects.toMatchObject({ message: 'sem_permissao' })
    expect(await buscarCartao(cartao.um)).toBeNull()
    expect(await criarCartao({ colunaId: coluna.afazer, titulo: 'Do colega' })).toEqual({ erro: SEM_PERMISSAO })
    entrar('pessoaB')
    await expect(indicadoresDoQuadro({ quadroId: quadro.id })).rejects.toMatchObject({ message: 'sem_permissao' })
  })

  it('mover cartões e colunas: a posição final é a do banco', async () => {
    entrar('pessoa')
    const r = await moverCartao({ cartaoId: cartao['dois'], colunaId: coluna.fazendo })
    expect(r).toMatchObject({ erro: null, cartao: { id: cartao['dois'], coluna_id: coluna.fazendo }, renumerou: false })
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.fazendo }))).toEqual(['Integração dois (editado)'])
    expect(await moverCartao({ cartaoId: cartao.um, colunaId: coluna.fazendo, antesId: cartao['dois'] })).toMatchObject({ erro: null })
    expect(await moverCartao({ cartaoId: cartao.um, colunaId: coluna.fazendo, depoisId: cartao['dois'] })).toMatchObject({ erro: null })
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.fazendo })))
      .toEqual(['Integração um', 'Integração dois (editado)'])
    expect(await moverCartao({ cartaoId: cartao.um, colunaId: coluna.afazer, antesId: cartao['dois'] })).toEqual({
      erro: 'O quadro mudou enquanto você arrastava. Atualize o quadro e tente de novo.',
    })

    expect(await moverColuna({ colunaId: coluna.feito, depoisId: coluna.afazer })).toMatchObject({ erro: null })
    expect((await quadroDoCliente(cliente)).colunas.map((c) => c.nome)).toEqual(['Concluído', 'A fazer', 'Em andamento'])
    expect(await moverColuna({ colunaId: coluna.feito })).toMatchObject({ erro: null })
    expect((await quadroDoCliente(cliente)).colunas.map((c) => c.nome)).toEqual(['A fazer', 'Em andamento', 'Concluído'])
  })

  it('duas pessoas arrastando para o mesmo lugar ao mesmo tempo: ninguém perde cartão nem empata posição', async () => {
    entrar('pessoa')
    const corrida = (await criarColuna({ quadroId: quadro.id, nome: 'Corrida' })).coluna.id
    const topo = await novoCartao('topo', corrida)
    await novoCartao('fundo', corrida)
    const movidos = []
    for (let i = 0; i < 6; i++) movidos.push(await novoCartao(`movido${i}`, coluna.afazer))

    // Em pares: a consultora e o gestor soltam um cartão cada logo abaixo do "topo", no mesmo instante.
    for (let i = 0; i < movidos.length; i += 2) {
      entrar('pessoa')
      const daConsultora = moverCartao({ cartaoId: movidos[i], colunaId: corrida, antesId: topo })
      entrar('gestor')
      const doGestor = moverCartao({ cartaoId: movidos[i + 1], colunaId: corrida, antesId: topo })
      const resultados = await Promise.all([daConsultora, doGestor])
      expect(resultados.map((r) => r.erro)).toEqual([null, null])
    }

    entrar('pessoa')
    const { itens, total } = await cartoesDoQuadro({ quadroId: quadro.id, colunaId: corrida })
    expect(total).toBe(8)
    expect(itens[0].titulo).toBe('Integração topo')
    expect(itens.at(-1).titulo).toBe('Integração fundo')
    const posicoes = itens.map((c) => c.posicao)
    expect(new Set(posicoes).size).toBe(8)
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
  })

  it('apagar coluna: só a gestão, e com cartões a escolha do destino é explícita', async () => {
    entrar('pessoa')
    const revisao = (await criarColuna({ quadroId: quadro.id, nome: 'Revisão', cor: 3 })).coluna
    expect(await editarColuna(revisao.id, { nome: 'Em revisão', concluidos: true })).toEqual({ erro: null })
    await novoCartao('revisao', revisao.id)
    expect(await apagarColuna(revisao.id, { destinoId: coluna.feito })).toEqual({ erro: SEM_PERMISSAO })

    entrar('gestor')
    expect(await apagarColuna(revisao.id)).toEqual({
      erro: 'Esta coluna tem cartões. Escolha para qual coluna eles vão ou apague junto.',
    })
    expect(await apagarColuna(revisao.id, { destinoId: coluna.feito })).toEqual({
      erro: null, movidos: 1, apagados: 0, idsApagados: [],
    })
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.feito }))).toEqual(['Integração revisao'])

    const lixo = (await criarColuna({ quadroId: quadro.id, nome: 'Lixo' })).coluna
    await novoCartao('lixo', lixo.id)
    expect(await apagarColuna(lixo.id, { apagarCartoes: true })).toEqual({
      erro: null, movidos: 0, apagados: 1, idsApagados: [cartao.lixo],
    })
  })

  it('o cliente muda de consultoria: a antiga perde o quadro e a nova começa outro', async () => {
    const { error: erroMover } = await admin.from('clientes').update({ consultoria_id: B }).eq('id', cliente)
    expect(erroMover).toBeNull()
    const { error: erroConsultor } = await admin.from('clientes').update({ consultor_id: pessoaB.id }).eq('id', cliente)
    expect(erroConsultor).toBeNull()

    entrar('pessoa')
    expect(await quadroDoCliente(cliente)).toBeNull()
    await expect(cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.afazer })).rejects.toMatchObject({ message: 'sem_permissao' })
    entrar('gestor')
    expect(await buscarCartao(cartao.um)).toBeNull()

    entrar('pessoaB')
    const novo = await quadroDoCliente(cliente)
    expect(novo.id).not.toBe(quadro.id)
    expect(novo.colunas.map((c) => c.cartoes)).toEqual([0, 0, 0])

    entrar('central')
    expect(titulos(await cartoesDoQuadro({ quadroId: quadro.id, colunaId: coluna.fazendo })))
      .toEqual(['Integração um', 'Integração dois (editado)'])

    // A central escolhe entre os quadros do cliente (o atual primeiro) e abre o antigo só para ler.
    const lista = await quadrosDoCliente(cliente)
    expect(lista.map((q) => [q.id, q.atual, q.consultoria.id])).toEqual([[novo.id, true, B], [quadro.id, false, A]])
    expect(await quadroPorId(quadro.id)).toMatchObject({ id: quadro.id, consultoria_id: A, pode_mexer: false, pode_gerir: false })

    // Quem é de consultoria não lista os quadros do cliente nem abre o de outra consultoria pelo id.
    entrar('pessoaB')
    await expect(quadrosDoCliente(cliente)).rejects.toMatchObject({ message: 'sem_permissao' })
    expect(await quadroPorId(quadro.id)).toBeNull()
    expect(await quadroPorId(novo.id)).toMatchObject({ id: novo.id, pode_mexer: true })
    entrar('gestor')
    expect(await quadroPorId(quadro.id)).toBeNull()
  })
})

describe('anexos e imagens dos cartões no balde quadros', () => {
  const BALDE = 'quadros'
  const IMAGEM_INVALIDA = traduzirErroBanco({ code: '23514', message: 'imagem_invalida' })
  const LINK_INVALIDO = traduzirErroBanco({ code: '23514', message: 'link_invalido' })
  // PNG de 1 x 1 pixel.
  const PNG = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  )
  const png = () => new File([PNG], 'print.png', { type: 'image/png' })
  const texto = (conteudo, nome) => new File([conteudo], nome, { type: 'text/plain' })
  const doc = (...conteudo) => ({ type: 'doc', content: conteudo })
  const existe = async (caminho) => (await admin.storage.from(BALDE).exists(caminho)).data

  let clienteAnexos
  let quadroAnexos
  let colunaAnexos
  let pasta

  async function novoClienteDeTeste(nome) {
    const { data, error } = await admin
      .from('clientes')
      .insert({ nome, horas_mes: 10, consultoria_id: A, consultor_id: pessoaA.id })
      .select('id')
      .single()
    if (error) throw error
    registrarCliente(data.id)
    return data.id
  }

  beforeAll(async () => {
    clienteAnexos = await novoClienteDeTeste('Cliente anexos integração')
    entrar('pessoa')
    quadroAnexos = await quadroDoCliente(clienteAnexos)
    colunaAnexos = quadroAnexos.colunas[0].id
    const cartaoId = await novoCartao('anexos', colunaAnexos)
    pasta = { pasta: clienteAnexos, cartaoId }
  })

  it('a consultora anexa; a gestão e a central baixam pelo link assinado; quem não vê o quadro, não', async () => {
    entrar('pessoa')
    const { erro, anexo } = await enviarAnexo(pasta, texto('Conteúdo do relatório', 'Relatório final.txt'))
    expect(erro).toBeNull()
    expect(anexo.caminho).toMatch(new RegExp(`^${clienteAnexos}/${pasta.cartaoId}/[0-9a-f-]{36}-Relatorio_final\\.txt$`))
    expect(anexo).toMatchObject({ nome: 'Relatório final.txt', tipo: 'text/plain', enviado_por: pessoaA.id })
    expect(await existe(anexo.caminho)).toBe(true)
    expect((await cartoesDoQuadro({ quadroId: quadroAnexos.id, colunaId: colunaAnexos })).itens[0].anexos).toBe(1)
    expect((await buscarCartao(pasta.cartaoId)).anexos).toBe(1)

    entrar('gestor')
    const { itens, total } = await anexosDoCartao({ cartaoId: pasta.cartaoId })
    expect(total).toBe(1)
    expect(itens[0]).toMatchObject({ id: anexo.id, nome: 'Relatório final.txt', caminho: anexo.caminho, pode_apagar: true })
    expect(itens[0].enviado_por).toMatchObject({ id: pessoaA.id, nome: 'Teste pessoa' })
    const { url } = await urlAssinada(itens[0].caminho, { nome: itens[0].nome })
    const resposta = await fetch(url)
    expect(resposta.status).toBe(200)
    expect(await resposta.text()).toBe('Conteúdo do relatório')

    entrar('central')
    expect((await urlAssinada(anexo.caminho)).url).toBeTruthy()
    expect((await anexosDoCartao({ cartaoId: pasta.cartaoId })).itens[0].pode_apagar).toBe(false)
    expect((await enviarAnexo(pasta, texto('x', 'da central.txt'))).erro).toBe(SEM_PERMISSAO)

    entrar('colega')
    expect(await anexosDoCartao({ cartaoId: pasta.cartaoId })).toEqual({ itens: [], total: 0 })
    expect((await urlAssinada(anexo.caminho)).erro).toBeTruthy()
    expect((await enviarAnexo(pasta, texto('x', 'do colega.txt'))).erro).toBe(SEM_PERMISSAO)
    entrar('pessoaB')
    expect((await urlAssinada(anexo.caminho)).erro).toBeTruthy()
  })

  it('acima de 25 MB o balde recusa (a tela confere antes de enviar)', async () => {
    const caminho = caminhoDoAnexo(clienteAnexos, pasta.cartaoId, 'grande.bin')
    const { error } = await sessoes.pessoa.storage
      .from(BALDE)
      .upload(caminho, new Blob([new Uint8Array(TAMANHO_MAXIMO_ARQUIVO + 1)]))
    expect(traduzirErroBanco(error, { sobre: 'arquivo' })).toBe(ARQUIVO_GRANDE_DEMAIS)
    expect(await existe(caminho)).toBe(false)
  })

  it('apagar anexo: quem enviou ou a gestão; a linha sai e depois o objeto', async () => {
    entrar('gestor')
    const doGestor = (await enviarAnexo(pasta, texto('g', 'do gestor.txt'))).anexo
    entrar('pessoa')
    const daPessoa = (await enviarAnexo(pasta, texto('p', 'da pessoa.txt'))).anexo
    expect(await apagarAnexo(doGestor)).toEqual({ erro: SEM_PERMISSAO })
    expect(await existe(doGestor.caminho)).toBe(true)
    expect(await apagarAnexo(daPessoa)).toEqual({ erro: null })
    expect(await existe(daPessoa.caminho)).toBe(false)

    entrar('gestor')
    const { itens } = await anexosDoCartao({ cartaoId: pasta.cartaoId })
    expect(itens.map((a) => a.nome).sort()).toEqual(['Relatório final.txt', 'do gestor.txt'])
    for (const anexo of itens) {
      expect(await apagarAnexo(anexo)).toEqual({ erro: null })
      expect(await existe(anexo.caminho)).toBe(false)
    }
    expect((await anexosDoCartao({ cartaoId: pasta.cartaoId })).total).toBe(0)
  })

  it('imagem da descrição: sobe ao balde, o nó guarda o caminho e abre pelo link assinado; imagem de fora e link javascript: o banco recusa', async () => {
    entrar('pessoa')
    const { erro, caminho } = await enviarImagemDaDescricao(pasta, png())
    expect(erro).toBeNull()
    expect(caminho).toMatch(new RegExp(`^${clienteAnexos}/${pasta.cartaoId}/imagens/[0-9a-f-]{36}\\.png$`))
    const descricao = doc(
      { type: 'paragraph', content: [{ type: 'text', text: 'Manual', marks: [{ type: 'link', attrs: { href: 'https://cliente.test/manual' } }] }] },
      { type: 'image', attrs: { src: caminho, alt: 'print' } },
    )
    expect(await editarCartao(pasta.cartaoId, { descricao })).toEqual({ erro: null })
    expect((await buscarCartao(pasta.cartaoId)).descricao).toEqual(descricao)
    // Enquanto o cartão existe, a imagem fica (a descrição pode voltar a usá-la): nem quem a enviou a tira.
    expect((await sessoes.pessoa.storage.from(BALDE).remove([caminho])).data).toEqual([])
    expect(await existe(caminho)).toBe(true)

    entrar('gestor')
    const resposta = await fetch((await urlAssinada(caminho)).url)
    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('content-type')).toContain('image/png')
    // Assinada como download: o <img> mostra igual, mas o link aberto sozinho baixa (não vira página no navegador).
    expect(resposta.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(PNG)
    const { urls } = await urlsAssinadas([caminho])
    const emLote = await fetch(urls[caminho])
    expect(emLote.status).toBe(200)
    expect(emLote.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(new Uint8Array(await emLote.arrayBuffer())).toEqual(PNG)
    entrar('colega')
    expect((await urlAssinada(caminho)).erro).toBeTruthy()

    entrar('pessoa')
    expect(await editarCartao(pasta.cartaoId, { descricao: doc({ type: 'image', attrs: { src: 'https://exemplo.test/x.png' } }) }))
      .toEqual({ erro: IMAGEM_INVALIDA })
    expect(await editarCartao(pasta.cartaoId, {
      descricao: doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }),
    })).toEqual({ erro: LINK_INVALIDO })
    expect((await buscarCartao(pasta.cartaoId)).descricao).toEqual(descricao)
    expect((await enviarImagemDaDescricao(pasta, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))).erro)
      .toBe('Envie uma imagem PNG, JPG, GIF ou WEBP.')
  })

  it('apagar o cartão tira do Storage os anexos e as imagens dele', async () => {
    entrar('pessoa')
    const anexo = (await enviarAnexo(pasta, texto('a', 'último.txt'))).anexo
    const { caminho: imagem } = await enviarImagemDaDescricao(pasta, png())
    expect(await apagarCartao(pasta.cartaoId)).toEqual({ erro: null })
    expect(await existe(anexo.caminho)).toBe(false)
    expect(await existe(imagem)).toBe(false)
    // A imagem do teste anterior também saiu: a pasta do cartão ficou vazia.
    expect((await admin.storage.from(BALDE).list(`${clienteAnexos}/${pasta.cartaoId}`)).data).toEqual([])
    expect((await admin.storage.from(BALDE).list(`${clienteAnexos}/${pasta.cartaoId}/imagens`)).data).toEqual([])
  })

  it('apagar a coluna com os cartões junto tira os objetos deles', async () => {
    entrar('pessoa')
    const lixo = (await criarColuna({ quadroId: quadroAnexos.id, nome: 'Lixo com anexos' })).coluna
    const cartaoId = await novoCartao('lixo com anexos', lixo.id)
    const anexo = (await enviarAnexo({ pasta: clienteAnexos, cartaoId }, texto('l', 'lixo.txt'))).anexo
    const { caminho: imagem } = await enviarImagemDaDescricao({ pasta: clienteAnexos, cartaoId }, png())
    entrar('gestor')
    expect(await apagarColuna(lixo.id, { apagarCartoes: true })).toEqual({
      erro: null, movidos: 0, apagados: 1, idsApagados: [cartaoId],
    })
    expect(await existe(anexo.caminho)).toBe(false)
    expect(await existe(imagem)).toBe(false)
  })

  it('cliente apagado: a central tira o que sobrou do quadro na pasta dele', async () => {
    const clienteSai = await novoClienteDeTeste('Cliente com sobras no quadro')
    entrar('pessoa')
    const quadroSai = await quadroDoCliente(clienteSai)
    const cartaoId = await novoCartao('sobra', quadroSai.colunas[0].id)
    const anexo = (await enviarAnexo({ pasta: clienteSai, cartaoId }, texto('s', 'sobra.txt'))).anexo
    const { caminho: imagem } = await enviarImagemDaDescricao({ pasta: clienteSai, cartaoId }, png())
    // O cartão sai pelo banco, mas tirar os objetos falha (a conexão caiu): eles ficam no Storage.
    expect((await sessoes.pessoa.rpc('apagar_cartao', { p_cartao: cartaoId })).error).toBeNull()
    expect(await existe(anexo.caminho)).toBe(true)

    // Sem cartões, a central apaga o cliente (o quadro vazio sai junto) e tira o que sobrou.
    const { data, error } = await sessoes.central.from('clientes').delete().eq('id', clienteSai).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    entrar('central')
    expect(await limparQuadroDoCliente(clienteSai)).toEqual({ erro: null })
    expect(await existe(anexo.caminho)).toBe(false)
    expect(await existe(imagem)).toBe(false)
  })
})
