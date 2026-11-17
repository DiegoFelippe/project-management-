// O quadro em tempo real contra o Supabase local de verdade (Realtime + banco): sessões abertas ao mesmo tempo, cada uma
// com a sua conexão. O que uma muda (pela API, como o app grava) a outra recebe pelo canal privado "quadro:<id>"
// (ouvirQuadro, src/data/quadroAoVivo.js), só com tabela, operação e ids; quem não vê o quadro não entra no canal (o
// servidor recusa, não só o app); o consultor que deixa de ser o consultor do cliente sai do canal.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

// O cliente do Supabase de quem está "logado" no teste (entrar).
const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get: (_, nome) => {
      const valor = atual.cliente[nome]
      return typeof valor === 'function' ? valor.bind(atual.cliente) : valor
    },
  }),
}))

const { ouvirQuadro } = await import('../../src/data/quadroAoVivo.js')

const admin = clienteAdmin()
// Aceite do desenho: o que outra pessoa muda aparece em até 2 s.
const ATE_2_S = 2000
// A primeira entrada no canal pode demorar (o Realtime local abre a conexão com o banco na primeira vez).
const ENTRAR = 20000

let A, B
let gestorA, pessoaA, colegaA, pessoaB
let sessoes = {}
let cliente
let quadro
let colunas = []
const coluna = (i) => colunas[i].id
const ouvintes = []

const espera = (ms) => new Promise((pronto) => setTimeout(pronto, ms))

async function esperar(condicao, ms, oQue) {
  const fim = Date.now() + ms
  for (;;) {
    const valor = condicao()
    if (valor) return valor
    if (Date.now() > fim) throw new Error(`não aconteceu em ${ms} ms: ${oQue}`)
    await espera(25)
  }
}

// Ouve o quadro como a pessoa (o mesmo ouvirQuadro do app); guarda os eventos recebidos.
function ouvir(quem) {
  atual.cliente = sessoes[quem]
  const eventos = []
  const parar = ouvirQuadro(quadro, (evento) => eventos.push({ ...evento, chegou: Date.now() }))
  const ouvinte = { quem, eventos, parar }
  ouvintes.push(ouvinte)
  return ouvinte
}

const canalDe = (quem) => sessoes[quem].realtime.getChannels().find((c) => c.topic === `realtime:quadro:${quadro}`)
const noCanal = (quem) => esperar(() => canalDe(quem)?.state === 'joined', ENTRAR, `${quem} entrar no canal`)
const doBanco = (eventos) => eventos.filter((e) => e.tabela)

async function novoCartao(quem, titulo) {
  const { data, error } = await sessoes[quem]
    .from('cartoes')
    .insert({ coluna_id: coluna(0), titulo })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data.id
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  colegaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: B })
  sessoes = {
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    colega: await entrarComo(colegaA),
    pessoaB: await entrarComo(pessoaB),
  }
  const { data, error } = await admin
    .from('clientes')
    .insert({ nome: 'Cliente quadro ao vivo', horas_mes: 10, consultoria_id: A, consultor_id: pessoaA.id })
    .select('id')
    .single()
  if (error) throw error
  cliente = data.id
  registrarCliente(cliente)
  const aberto = await sessoes.pessoa.rpc('quadro_do_cliente', { p_cliente: cliente })
  if (aberto.error) throw aberto.error
  quadro = aberto.data.id
  colunas = aberto.data.colunas
})

afterAll(async () => {
  for (const ouvinte of ouvintes) ouvinte.parar()
  for (const sessao of Object.values(sessoes)) {
    await sessao.removeAllChannels()
    sessao.realtime.disconnect()
  }
  await limparTudo()
})

describe('quadro em tempo real contra o Supabase local', () => {
  it('o que uma pessoa muda a outra recebe pelo canal, em até 2 s, só com ids (sem o texto)', async () => {
    // "conectou" diz à tela que o canal está no ar (ela relê uma vez e fecha a janela da primeira leitura).
    const gestor = ouvir('gestor')
    await esperar(() => gestor.eventos.find((e) => e.motivo === 'conectou'), ENTRAR, 'o canal do gestor entrar no ar')
    expect(canalDe('gestor').state).toBe('joined')

    const antes = Date.now()
    const cartaoId = await novoCartao('pessoa', 'Título que não vai no aviso')
    const criado = await esperar(() => doBanco(gestor.eventos).find((e) => e.tabela === 'cartoes'), ATE_2_S,
      'o gestor receber o cartão novo')
    expect(criado).toMatchObject({ tabela: 'cartoes', operacao: 'insert', cartoes: [cartaoId], colunas: [coluna(0)] })
    expect(criado.chegou - antes).toBeLessThanOrEqual(ATE_2_S)
    expect(JSON.stringify(criado)).not.toContain('Título que não vai no aviso')

    // Comentário (outra tabela, pela API) e mover (função do banco): cada um chega com o cartão e as colunas.
    gestor.eventos.length = 0
    const comentario = await sessoes.pessoa.from('cartao_comentarios').insert({ cartao_id: cartaoId, texto: 'Texto do comentário' })
    expect(comentario.error).toBeNull()
    const comentado = await esperar(() => doBanco(gestor.eventos).find((e) => e.tabela === 'cartao_comentarios'), ATE_2_S,
      'o gestor receber o comentário')
    expect(comentado).toMatchObject({ operacao: 'insert', cartoes: [cartaoId], colunas: [coluna(0)] })
    expect(JSON.stringify(comentado)).not.toContain('Texto do comentário')

    gestor.eventos.length = 0
    const movido = await sessoes.pessoa.rpc('mover_cartao', { p_cartao: cartaoId, p_coluna: coluna(1) })
    expect(movido.error).toBeNull()
    const moveu = await esperar(() => doBanco(gestor.eventos).find((e) => e.tabela === 'cartoes'), ATE_2_S,
      'o gestor receber o cartão movido')
    expect(moveu.operacao).toBe('update')
    expect(moveu.colunas.toSorted()).toEqual([coluna(0), coluna(1)].toSorted())

    // E no outro sentido: o gestor apaga, a pessoa (ouvindo agora) recebe.
    const pessoa = ouvir('pessoa')
    await esperar(() => pessoa.eventos.find((e) => e.motivo === 'conectou'), ENTRAR, 'o canal da pessoa entrar no ar')
    // Outro ouvinte do gestor no mesmo canal (já no ar): recebe o seu "conectou" logo em seguida, e o primeiro não.
    const jaTinha = gestor.eventos.length
    const gestor2 = ouvir('gestor')
    await esperar(() => gestor2.eventos.find((e) => e.motivo === 'conectou'), ATE_2_S, 'o segundo ouvinte do gestor')
    expect(gestor.eventos.slice(jaTinha).filter((e) => e.motivo)).toEqual([])
    const apagado = await sessoes.gestor.rpc('apagar_cartao', { p_cartao: cartaoId })
    expect(apagado.error).toBeNull()
    const apagou = await esperar(() => doBanco(pessoa.eventos).find((e) => e.operacao === 'delete'), ATE_2_S,
      'a pessoa receber o cartão apagado')
    expect(apagou).toMatchObject({ tabela: 'cartoes', cartoes: [cartaoId] })
    // Um aviso só para o cartão apagado (o que sai junto com ele não avisa de novo).
    await espera(300)
    expect(doBanco(pessoa.eventos).filter((e) => e.operacao === 'delete')).toHaveLength(1)
  })

  it('quem não vê o quadro não entra no canal: o servidor recusa e não manda nada', async () => {
    // Direto no Realtime (sem o ouvirQuadro): a recusa é do servidor, pela regra do banco.
    const recusas = []
    const recebidos = []
    sessoes.pessoaB
      .channel(`quadro:${quadro}`, { config: { private: true } })
      .on('broadcast', { event: 'mudou' }, (m) => recebidos.push(m))
      .subscribe((estado, erro) => recusas.push({ estado, mensagem: erro?.message }))
    const recusa = await esperar(() => recusas.find((r) => r.estado === 'CHANNEL_ERROR'), ENTRAR,
      'o servidor recusar a pessoa de outra consultoria')
    expect(recusa.mensagem).toMatch(/Unauthorized/)

    // Pelo app: o colega da mesma consultoria (que não é o consultor do cliente) recebe "sem_acesso" e nada mais.
    const colega = ouvir('colega')
    await esperar(() => colega.eventos.find((e) => e.motivo === 'sem_acesso'), ENTRAR, 'o colega ser recusado')
    expect(canalDe('colega')).toBeUndefined()

    const gestor = ouvir('gestor')
    await noCanal('gestor')
    await novoCartao('pessoa', 'Ninguém de fora vê')
    await esperar(() => doBanco(gestor.eventos).length, ATE_2_S, 'o gestor receber')
    await espera(500)
    expect(doBanco(colega.eventos)).toEqual([])
    expect(recebidos).toEqual([])
    await sessoes.pessoaB.removeAllChannels()
  })

  it('o consultor que deixa de ser o consultor do cliente sai do canal; o novo entra', async () => {
    const antigo = ouvir('pessoa')
    await noCanal('pessoa')
    const gestor = ouvir('gestor')
    await noCanal('gestor')

    const { error } = await admin.from('clientes').update({ consultor_id: colegaA.id }).eq('id', cliente)
    expect(error).toBeNull()
    // O canal avisa que o acesso mudou; o app entra de novo no canal (o servidor confere outra vez) e é recusado.
    await esperar(() => antigo.eventos.find((e) => e.acesso), ATE_2_S, 'o aviso de acesso chegar')
    await esperar(() => antigo.eventos.find((e) => e.motivo === 'sem_acesso'), ENTRAR, 'o consultor antigo ser recusado')
    expect(canalDe('pessoa')).toBeUndefined()

    const novo = ouvir('colega')
    await noCanal('colega')
    antigo.eventos.length = 0
    gestor.eventos.length = 0
    await novoCartao('colega', 'Depois da troca')
    await esperar(() => doBanco(novo.eventos).find((e) => e.tabela === 'cartoes'), ATE_2_S, 'o consultor novo receber')
    await esperar(() => doBanco(gestor.eventos).find((e) => e.tabela === 'cartoes'), ATE_2_S, 'a gestão receber')
    await espera(500)
    expect(doBanco(antigo.eventos)).toEqual([])
  })

  it('parar deixa de receber e sai do canal', async () => {
    const gestor = ouvir('gestor')
    await noCanal('gestor')
    for (const ouvinte of ouvintes.filter((o) => o.quem === 'gestor')) ouvinte.parar()
    await esperar(() => !canalDe('gestor'), ENTRAR, 'o gestor sair do canal')
    gestor.eventos.length = 0
    await novoCartao('colega', 'Depois de parar')
    await espera(1000)
    expect(doBanco(gestor.eventos)).toEqual([])
  })
})
