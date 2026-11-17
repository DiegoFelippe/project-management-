// O quadro Kanban do cliente contra o Supabase local de verdade: roda as funções de src/data/quadro.js (as mesmas
// chamadas que o app faz) como cada tipo de usuário. Pega o que um mock esconde: permissão por coluna que falta no
// grant, regra de leitura errada por papel, função que a API não enxerga, e a corrida de dois arrastos na mesma coluna
// (duas sessões, duas conexões ao banco).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
}))

const {
  adicionarResponsavel,
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
  indicadoresDoQuadro,
  moverCartao,
  moverColuna,
  pessoasDoQuadro,
  quadroDoCliente,
  restaurarCartao,
} = await import('../../src/data/quadro.js')

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
  })
})
