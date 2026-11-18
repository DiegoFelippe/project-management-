// Quadros pessoais e de time contra o Supabase local de verdade (banco, Storage e Realtime): o que um mock esconde —
// a regra do balde "quadros" na pasta quadro/<quadro>/<cartão>/ (subir, link assinado, lista), a recusa do servidor do
// Realtime no canal privado "quadro:<id>" e o aviso de acesso quando alguém sai do time. Os quadros das primeiras provas
// nascem pela chave de serviço; a última cria, renomeia, arquiva, restaura e apaga pelas funções do app (src/data/quadros.js,
// Task 2 do plano docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  criarTimeDeTeste,
  entrarComo,
  limparTudo,
} from './ambiente.js'

// O cliente do Supabase de quem está "logado" no teste (o ouvirQuadro do app usa o supabase de '@/lib/supabase').
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
const quadros = await import('../../src/data/quadros.js')

const admin = clienteAdmin()
const BALDE = 'quadros'
// Aceite do desenho do quadro: o que muda aparece em até 2 s.
const ATE_2_S = 2000
// A primeira entrada no canal pode demorar (o Realtime local abre a conexão com o banco na primeira vez).
const ENTRAR = 20000
// PNG de 1 x 1 pixel.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

let A
let adminA, gestorA, pessoaA, colegaA, central
let sessoes = {}
let time
let pessoal
let doTime
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

// O quadro pelo sistema, com as colunas "A fazer" e "Feito": { id, coluna } (coluna = "A fazer").
async function criarQuadro(dados) {
  const { data, error } = await admin.from('quadros').insert(dados).select('id').single()
  if (error) throw error
  const afazer = await admin.from('quadro_colunas').insert({ quadro_id: data.id, nome: 'A fazer' }).select('id').single()
  if (afazer.error) throw afazer.error
  const feito = await admin.from('quadro_colunas').insert({ quadro_id: data.id, nome: 'Feito', concluidos: true })
  if (feito.error) throw feito.error
  return { id: data.id, coluna: afazer.data.id }
}

async function novoCartao(quem, colunaId, titulo) {
  const { data, error } = await sessoes[quem].from('cartoes').insert({ coluna_id: colunaId, titulo }).select('id').single()
  expect(error).toBeNull()
  return data.id
}

const existe = async (caminho) => (await admin.storage.from(BALDE).exists(caminho)).data

// Ouve o quadro como a pessoa (o mesmo ouvirQuadro do app); guarda os eventos recebidos.
function ouvir(quem, quadroId) {
  atual.cliente = sessoes[quem]
  const eventos = []
  const parar = ouvirQuadro(quadroId, (evento) => eventos.push(evento))
  ouvintes.push(parar)
  return eventos
}

const canalDe = (quem, quadroId) =>
  sessoes[quem].realtime.getChannels().find((c) => c.topic === `realtime:quadro:${quadroId}`)

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  colegaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  central = await criarPerfilDeTeste({ papel: 'central' })
  sessoes = {
    admin: await entrarComo(adminA),
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    colega: await entrarComo(colegaA),
    central: await entrarComo(central),
  }
  time = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestorA.id })
  const membros = await admin.from('time_membros').insert([
    { time_id: time, pessoa_id: pessoaA.id },
    { time_id: time, pessoa_id: colegaA.id },
  ])
  if (membros.error) throw membros.error
  pessoal = await criarQuadro({ tipo: 'pessoa', pessoa_id: pessoaA.id, consultoria_id: A, nome: 'Pessoal integração' })
  doTime = await criarQuadro({ tipo: 'time', time_id: time, nome: 'Time integração' })
})

afterAll(async () => {
  for (const parar of ouvintes) parar()
  for (const sessao of Object.values(sessoes)) {
    await sessao.removeAllChannels()
    sessao.realtime.disconnect()
  }
  await limparTudo()
})

describe('quadros pessoais e de time contra o Supabase local', () => {
  it('a pessoa sobe anexo e imagem no quadro pessoal e baixa pela URL assinada; o admin e a central não baixam nem listam', async () => {
    const cartao = await novoCartao('pessoa', pessoal.coluna, 'Cartão pessoal')
    const pasta = `quadro/${pessoal.id}/${cartao}`
    const anexo = `${pasta}/${randomUUID()}-relatorio.txt`
    const enviado = await sessoes.pessoa.storage
      .from(BALDE)
      .upload(anexo, new File(['Conteudo pessoal'], 'relatorio.txt', { type: 'text/plain' }), { contentType: 'text/plain' })
    expect(enviado.error).toBeNull()
    const linha = await sessoes.pessoa
      .from('cartao_anexos')
      .insert({ cartao_id: cartao, caminho: anexo, nome: 'relatorio.txt', tamanho: 16, tipo: 'text/plain' })
      .select('id')
      .single()
    expect(linha.error).toBeNull()

    const imagem = `${pasta}/imagens/${randomUUID()}.png`
    const subiu = await sessoes.pessoa.storage
      .from(BALDE)
      .upload(imagem, new File([PNG], 'print.png', { type: 'image/png' }), { contentType: 'image/png' })
    expect(subiu.error).toBeNull()
    const descrita = await sessoes.pessoa
      .from('cartoes')
      .update({ descricao: { type: 'doc', content: [{ type: 'image', attrs: { src: imagem } }] } })
      .eq('id', cartao)
      .select('id')
    expect(descrita.error).toBeNull()
    expect(descrita.data).toHaveLength(1)

    const link = await sessoes.pessoa.storage.from(BALDE).createSignedUrl(anexo, 60, { download: 'relatorio.txt' })
    expect(link.error).toBeNull()
    const baixado = await fetch(link.data.signedUrl)
    expect(baixado.status).toBe(200)
    expect(await baixado.text()).toBe('Conteudo pessoal')
    const linkDaImagem = await sessoes.pessoa.storage.from(BALDE).createSignedUrl(imagem, 60, { download: true })
    expect(linkDaImagem.error).toBeNull()
    expect((await fetch(linkDaImagem.data.signedUrl)).status).toBe(200)
    expect((await sessoes.pessoa.storage.from(BALDE).list(pasta)).data.map((o) => o.name)).toContain(anexo.split('/').at(-1))

    for (const quem of ['admin', 'central']) {
      const balde = sessoes[quem].storage.from(BALDE)
      expect((await balde.createSignedUrl(anexo, 60)).error, `${quem}: link do anexo`).toBeTruthy()
      expect((await balde.createSignedUrl(imagem, 60)).error, `${quem}: link da imagem`).toBeTruthy()
      expect((await balde.list(pasta)).data, `${quem}: lista da pasta do cartão`).toEqual([])
      expect((await balde.list(`${pasta}/imagens`)).data, `${quem}: lista das imagens`).toEqual([])
      expect((await balde.list(`quadro/${pessoal.id}`)).data, `${quem}: lista da pasta do quadro`).toEqual([])
      const tirados = await balde.remove([anexo, imagem])
      expect(tirados.data ?? [], `${quem}: tirar`).toEqual([])
      const linhas = await sessoes[quem].from('cartao_anexos').select('id').eq('cartao_id', cartao)
      expect(linhas.data, `${quem}: linhas do anexo`).toEqual([])
    }
    expect(await existe(anexo)).toBe(true)
    expect(await existe(imagem)).toBe(true)
  })

  it('upload com a pasta do cliente para cartão pessoal é recusado (e com a pasta de outro quadro)', async () => {
    const cartao = await novoCartao('pessoa', pessoal.coluna, 'Cartão pessoal 2')
    const formaDoCliente = `${randomUUID()}/${cartao}/${randomUUID()}-x.txt`
    const recusado = await sessoes.pessoa.storage
      .from(BALDE)
      .upload(formaDoCliente, new File(['x'], 'x.txt', { type: 'text/plain' }))
    expect(recusado.error).toBeTruthy()
    expect(await existe(formaDoCliente)).toBe(false)

    const outroQuadro = `quadro/${doTime.id}/${cartao}/${randomUUID()}-x.txt`
    const tambem = await sessoes.pessoa.storage
      .from(BALDE)
      .upload(outroQuadro, new File(['x'], 'x.txt', { type: 'text/plain' }))
    expect(tambem.error).toBeTruthy()
    expect(await existe(outroQuadro)).toBe(false)
  })

  it('o admin não entra no canal do quadro pessoal (o servidor recusa); no do time, entra', async () => {
    const recusas = []
    const recebidos = []
    await sessoes.admin.realtime.setAuth((await sessoes.admin.auth.getSession()).data.session.access_token)
    sessoes.admin
      .channel(`quadro:${pessoal.id}`, { config: { private: true } })
      .on('broadcast', { event: 'mudou' }, (m) => recebidos.push(m))
      .subscribe((estado, erro) => recusas.push({ estado, mensagem: erro?.message }))
    const recusa = await esperar(() => recusas.find((r) => r.estado === 'CHANNEL_ERROR'), ENTRAR,
      'o servidor recusar o administrador no canal do quadro pessoal')
    expect(recusa.mensagem).toMatch(/Unauthorized/)
    await sessoes.admin.removeAllChannels()

    // Pelo app: o ouvirQuadro do administrador recebe "sem_acesso" no pessoal e "conectou" no do time.
    const noPessoal = ouvir('admin', pessoal.id)
    await esperar(() => noPessoal.find((e) => e.motivo === 'sem_acesso'), ENTRAR, 'o administrador ser recusado')
    const noTime = ouvir('admin', doTime.id)
    await esperar(() => noTime.find((e) => e.motivo === 'conectou'), ENTRAR, 'o administrador entrar no canal do time')

    // A pessoa entra no canal do próprio quadro e recebe o que muda nele; o administrador não recebe nada.
    const dona = ouvir('pessoa', pessoal.id)
    await esperar(() => dona.find((e) => e.motivo === 'conectou'), ENTRAR, 'a pessoa entrar no canal do quadro dela')
    const cartao = await novoCartao('pessoa', pessoal.coluna, 'Só a pessoa vê')
    await esperar(() => dona.find((e) => e.tabela === 'cartoes' && e.cartoes?.includes(cartao)), ATE_2_S,
      'a pessoa receber o cartão novo')
    await espera(300)
    expect(noPessoal.filter((e) => e.tabela)).toEqual([])
    expect(recebidos).toEqual([])
  })

  it('membro tirado do time recebe o aviso de acesso e é recusado ao entrar de novo', async () => {
    const membro = ouvir('colega', doTime.id)
    await esperar(() => membro.find((e) => e.motivo === 'conectou'), ENTRAR, 'o membro entrar no canal do quadro do time')
    expect(canalDe('colega', doTime.id)?.state).toBe('joined')
    // Antes: o membro grava no quadro do time.
    await novoCartao('colega', doTime.coluna, 'Antes de sair')

    const { error } = await admin.from('time_membros').delete().eq('time_id', time).eq('pessoa_id', colegaA.id)
    expect(error).toBeNull()
    const aviso = await esperar(() => membro.find((e) => e.acesso), ATE_2_S, 'o aviso de acesso chegar')
    expect(aviso).toMatchObject({ tabela: 'time_membros', operacao: 'delete', acesso: true })
    expect(aviso).not.toHaveProperty('cartoes')
    await esperar(() => membro.find((e) => e.motivo === 'sem_acesso'), ENTRAR, 'o membro ser recusado ao entrar de novo')
    expect(canalDe('colega', doTime.id)).toBeUndefined()

    // A gravação que estava pendente é recusada, e a leitura não traz mais o quadro.
    const pendente = await sessoes.colega.from('cartoes').insert({ coluna_id: doTime.coluna, titulo: 'Depois de sair' })
    expect(pendente.error?.code).toBe('42501')
    const releitura = await sessoes.colega.rpc('quadro_por_id', { p_quadro: doTime.id })
    expect(releitura.error).toBeNull()
    expect(releitura.data).toBeNull()
  })
})

describe('o que se faz com o quadro, pela API real (src/data/quadros.js)', () => {
  // As funções do app rodam como quem está "logado" no teste.
  const como = (quem) => {
    atual.cliente = sessoes[quem]
    return quadros
  }

  it('criar, renomear, arquivar, restaurar e apagar pela API real; apagar tira os objetos do balde', async () => {
    // Criar: o pessoal e um do time (pelo membro), com as três colunas.
    const pessoalNovo = await como('pessoa').criarQuadro({ nome: '  Integração: meu quadro ' })
    expect(pessoalNovo.erro).toBeNull()
    const novo = await como('pessoa').criarQuadro({ nome: 'Integração: do time', timeId: time })
    expect(novo.erro).toBeNull()
    const aberto = (await sessoes.pessoa.rpc('quadro_por_id', { p_quadro: novo.id })).data
    expect(aberto).toMatchObject({ tipo: 'time', nome: 'Integração: do time', pode_mexer: true, pode_administrar: false })
    expect(aberto.colunas.map((c) => c.nome)).toEqual(['A fazer', 'Em andamento', 'Concluído'])
    expect((await como('pessoa').criarQuadro({ nome: 'integração: DO time', timeId: time })).erro)
      .toBe('Já existe um quadro aberto com esse nome.')
    expect((await como('central').criarQuadro({ nome: 'Da central', timeId: time })).erro)
      .toBe('Você não tem permissão para isso.')

    // O seletor da pessoa traz os dois; a estrela vira favorito.
    expect((await como('pessoa').marcarFavorito(novo.id, true)).erro).toBeNull()
    const seletor = await como('pessoa').quadrosParaEscolher({ termo: 'integracao' })
    expect(seletor.meus.itens.map((q) => q.nome)).toEqual(['Integração: meu quadro', 'Pessoal integração'])
    expect(seletor.dosTimes.itens.map((q) => q.nome)).toContain('Integração: do time')
    expect(seletor.favoritos.itens.map((q) => q.id)).toEqual([novo.id])
    expect(await como('pessoa').quadrosPorIds([novo.id, pessoal.id, doTime.id])).toHaveLength(3)

    // Renomear: o membro não; o gestor do time sim.
    expect((await como('pessoa').renomearQuadro(novo.id, 'Tomado')).erro).toBe('Você não tem permissão para isso.')
    expect((await como('gestor').renomearQuadro(novo.id, ' Integração: renomeado ')).erro).toBeNull()

    // Arquivar: sai do seletor e vai para os arquivados (só para ler; não se renomeia); restaurar volta.
    expect((await como('gestor').arquivarQuadro(novo.id)).erro).toBeNull()
    expect((await como('pessoa').quadrosParaEscolher({ termo: 'renomeado' })).dosTimes.total).toBe(0)
    const arquivados = await como('gestor').quadrosArquivados({ busca: 'renomeado', tipo: 'time' })
    expect(arquivados.itens).toEqual([expect.objectContaining({ id: novo.id, pode_administrar: true })])
    expect((await como('gestor').renomearQuadro(novo.id, 'Outro')).erro)
      .toBe('Este quadro está arquivado: restaure antes de renomear.')
    expect((await como('gestor').restaurarQuadro(novo.id)).erro).toBeNull()
    expect((await como('pessoa').quadrosParaEscolher({ termo: 'renomeado' })).favoritos.total).toBe(1)

    // Um cartão com anexo e imagem, e uma sobra (objeto sem linha) na pasta do quadro.
    const coluna = aberto.colunas[0].id
    const cartao = await novoCartao('pessoa', coluna, 'Cartão do quadro que vai sair')
    const pasta = `quadro/${novo.id}/${cartao}`
    const anexo = `${pasta}/${randomUUID()}-ata.txt`
    const imagem = `${pasta}/imagens/${randomUUID()}.png`
    const sobra = `${pasta}/${randomUUID()}-sobra.txt`
    const balde = sessoes.pessoa.storage.from(BALDE)
    expect((await balde.upload(anexo, new File(['ata'], 'ata.txt', { type: 'text/plain' }))).error).toBeNull()
    expect((await sessoes.pessoa.from('cartao_anexos')
      .insert({ cartao_id: cartao, caminho: anexo, nome: 'ata.txt', tamanho: 3, tipo: 'text/plain' })).error).toBeNull()
    expect((await balde.upload(imagem, new File([PNG], 'p.png', { type: 'image/png' }), { contentType: 'image/png' })).error)
      .toBeNull()
    expect((await balde.upload(sobra, new File(['x'], 'sobra.txt', { type: 'text/plain' }))).error).toBeNull()
    // O quadro que fica (doTime) com um objeto que não pode sair junto.
    const cartaoQueFica = await novoCartao('pessoa', doTime.coluna, 'Cartão do quadro que fica')
    const deOutro = `quadro/${doTime.id}/${cartaoQueFica}/${randomUUID()}-fica.txt`
    expect((await balde.upload(deOutro, new File(['fica'], 'fica.txt', { type: 'text/plain' }))).error).toBeNull()

    // Apagar: o membro não; o gestor sim, e os objetos da pasta saem do balde (os de outro quadro ficam).
    expect((await como('pessoa').apagarQuadro(novo.id)).erro).toBe('Você não tem permissão para isso.')
    expect(await como('gestor').apagarQuadro(novo.id)).toEqual({ erro: null })
    expect(await existe(anexo)).toBe(false)
    expect(await existe(imagem)).toBe(false)
    expect(await existe(sobra)).toBe(false)
    expect(await existe(deOutro)).toBe(true)
    expect((await admin.from('quadros').select('id').eq('id', novo.id)).data).toEqual([])
    expect((await admin.from('cartoes').select('id').eq('id', cartao)).data).toEqual([])
    expect((await admin.from('quadro_favoritos').select('quadro_id').eq('quadro_id', novo.id)).data).toEqual([])
    expect(await como('pessoa').quadrosPorIds([novo.id])).toEqual([])

    // O pessoal: a própria pessoa apaga; o administrador não vê nem apaga.
    expect((await como('admin').apagarQuadro(pessoalNovo.id)).erro).toBe('Você não tem permissão para isso.')
    expect(await como('pessoa').apagarQuadro(pessoalNovo.id)).toEqual({ erro: null })
  })
})

