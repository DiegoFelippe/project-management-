// Depois da reunião: a pasta com a transcrição e a documentação, contra o Supabase local de verdade (banco, Vault e
// Storage), com o Google falso e uma IA falsa (nenhum pedido sai para o Google nem para a IA de verdade).
// - Pela tela ("Buscar agora" e "Tentar de novo"): o núcleo da Edge Function reunioes-depois, com as permissões de
//   editar o evento.
// - A rotina (pg_cron a cada 10 minutos): as reuniões terminadas, com cliente, que ainda esperam, uma rotina por vez,
//   sem criar duas pastas para a mesma reunião; erro passageiro (Google fora do ar, falha ao guardar) fica para a
//   próxima rotina, e o erro de uma reunião não para as outras. Aqui ela roda SEMPRE com o recorte das consultorias
//   criadas pelos testes (o banco que os testes passam ao núcleo recusa alto a rotina sem recorte): sem ele, pegaria as
//   reuniões de verdade do banco local.
// - A função no ar: segredo da rotina e as ações pela tela, chamadas pelas funções de src/data/agenda.js.
// Enquanto os testes do núcleo rodam, eles seguram a vez de verdade da rotina: o pg_cron do Supabase local (que chama
// a função de verdade, sem o app do Google) fica de fora e não mexe nas reuniões dos testes.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { salvarEvento as salvarNoNucleo } from '../../supabase/functions/_shared/agenda/eventos.ts'
import { criarGoogleFalso } from '../../supabase/functions/_shared/agenda/google-falso.ts'
import { ESCOPOS_DA_PESSOA } from '../../supabase/functions/_shared/agenda/google.ts'
import { iaDaConsultoria } from '../../supabase/functions/_shared/agenda/ia.ts'
import { nomeDaPasta } from '../../supabase/functions/_shared/agenda/reuniao.ts'
import {
  buscarAgora as buscarNoNucleo,
  rodarRotina,
  segredoDaRotinaConfere,
  tentarDeNovo as tentarNoNucleo,
} from '../../supabase/functions/_shared/agenda/rotina.ts'
import { criarGoogleDe, gravarTokenDaPessoa } from '../../supabase/functions/_shared/agenda/tokens.ts'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
  status,
} from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', async () => {
  const ambiente = await import('./ambiente.js')
  return {
    supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
    chamarFuncao: (nome, corpo) => ambiente.chamarFuncao(atual.cliente, nome, corpo),
  }
})

const { buscarAgora, tentarDeNovo } = await import('../../src/data/agenda.js')

const admin = clienteAdmin()
const HORA = 3_600_000
const SEM_GOOGLE = 'Conecte o Google para buscar a gravação'
const GOOGLE_SEM_RESPOSTA = 'O Google não respondeu agora; tentamos de novo em seguida.'
const FALHOU = 'Não foi possível guardar a pasta da reunião agora; tentamos de novo em seguida.'
const SEM_PERMISSAO = 'O Google não deu permissão para ler a gravação e a transcrição do Meet nesta conta.'
const GRAVACAO = 'https://drive.google.com/file/d/gravacao-1/view'

// IA falsa no formato da Messages API da Anthropic: guarda cada pedido e pode ser mandada falhar.
function criarIaFalsa() {
  const pedidos = []
  let falhas = 0
  const resposta = {
    resumo: 'Alinhamos o escopo do projeto e os prazos.',
    decisoes: ['Começar pelo módulo financeiro'],
    proximos_passos: ['Ana envia o cronograma até sexta'],
  }
  async function buscar(url, init = {}) {
    const corpo = JSON.parse(String(init.body))
    pedidos.push({ url: String(url), cabecalhos: new Headers(init.headers), corpo })
    if (falhas > 0) {
      falhas -= 1
      return Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529 })
    }
    if (String(url) !== 'https://api.anthropic.com/v1/messages') return Response.json({}, { status: 404 })
    return Response.json({
      id: 'msg_falsa',
      type: 'message',
      role: 'assistant',
      model: corpo.model,
      content: [{ type: 'text', text: JSON.stringify(resposta) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    })
  }
  return { fetch: buscar, pedidos, falharProxima: () => { falhas += 1 } }
}

const google = criarGoogleFalso()
const APP = { id: google.cliente.id, segredo: google.cliente.segredo, volta: 'http://localhost:5173/calendario' }
const googleDeDeVerdade = criarGoogleDe({ banco: admin, app: APP, fetch: google.fetch, agora: google.agora })
// Cada pedido do Google de um organizador (a rotina usa um por organizador em cada rodada).
const googlesPedidos = []
const googleDe = (perfilId) => {
  googlesPedidos.push(perfilId)
  return googleDeDeVerdade(perfilId)
}
const ia = criarIaFalsa()
const iaDa = (consultoriaId) => iaDaConsultoria(admin, consultoriaId, ia.fetch)

// A vez de verdade da rotina, segura pelos testes do começo ao fim do núcleo (só o teste de duas rotinas ao mesmo tempo
// a solta por um instante).
const vez = { dono: null }
async function segurarVez() {
  vez.dono = conferir(await admin.rpc('reunioes_comecar_rotina', { p_minutos: 10 }))
  if (!vez.dono) throw new Error('A rotina das reuniões está rodando agora; rode os testes de novo em alguns minutos.')
}
async function soltarVez() {
  if (vez.dono) conferir(await admin.rpc('reunioes_terminar_rotina', { p_dono: vez.dono }))
  vez.dono = null
}

// O banco que os testes passam ao núcleo: o do Supabase local, com três travas.
// - A rotina sem o recorte das consultorias de teste falha alto (não chega ao banco).
// - Com a vez de verdade segura pelos testes, cada rotina dos testes ganha uma vez só dela (outro dono).
// - O envio ao Storage pode ser mandado falhar (`falhasNoEnvio`: uma função do caminho por falha, uma vez cada).
const SEM_RECORTE = 'Teste chamou a rotina sem o recorte das consultorias de teste: ela mexeria nas reuniões de ' +
  'verdade do banco local.'
const falhasNoEnvio = []
function bucketComFalhas(bucket) {
  return new Proxy(bucket, {
    get(alvo, nome) {
      if (nome === 'upload') {
        return async (caminho, ...resto) => {
          const i = falhasNoEnvio.findIndex((falha) => falha(caminho))
          if (i < 0) return alvo.upload(caminho, ...resto)
          falhasNoEnvio.splice(i, 1)
          return { data: null, error: new Error('Storage fora do ar (falha simulada)') }
        }
      }
      const valor = alvo[nome]
      return typeof valor === 'function' ? valor.bind(alvo) : valor
    },
  })
}
const banco = new Proxy(admin, {
  get(alvo, nome) {
    if (nome === 'rpc') {
      return (funcao, argumentos = {}) => {
        const recorte = argumentos.p_consultorias
        if (funcao === 'reunioes_reservar' && argumentos.p_evento == null && !(Array.isArray(recorte) && recorte.length)) {
          throw new Error(SEM_RECORTE)
        }
        if (vez.dono && funcao === 'reunioes_comecar_rotina') return Promise.resolve({ data: crypto.randomUUID(), error: null })
        if (vez.dono && funcao === 'reunioes_terminar_rotina') return Promise.resolve({ data: null, error: null })
        return alvo.rpc(funcao, argumentos)
      }
    }
    if (nome === 'storage') return { from: (nomeDoBucket) => bucketComFalhas(alvo.storage.from(nomeDoBucket)) }
    const valor = alvo[nome]
    return typeof valor === 'function' ? valor.bind(alvo) : valor
  },
})

const buscar = (quem, id) => buscarNoNucleo(banco, googleDe, iaDa, quem, id)
const tentar = (quem, id) => tentarNoNucleo(banco, googleDe, iaDa, quem, id)
// A rotina dos testes: só as consultorias criadas aqui. `imediata`: a reunião olhada já pode ser olhada de novo na
// rotina seguinte (no app, ela espera 5 minutos ou 1 hora, conforme o tempo desde o fim).
const imediata = () => new Date(Date.now() - 60_000)
const rotina = (opcoes = {}) => rodarRotina({ db: banco, googleDe, iaDa, consultorias: [C, D], ...opcoes })

const p = {}
const cli = {}
let C, D

// A promessa precisa ser recusada; devolve o erro (uma Falha: status, codigo e extra.erro em português).
const recusa = (promessa) =>
  promessa.then(
    () => {
      throw new Error('devia ter sido recusado')
    },
    (erro) => erro,
  )

function conferir({ data, error }) {
  if (error) throw error
  return data
}

// Perfil inteiro (como quemChama entrega à função), com nome próprio; com Google, um token válido no Google falso.
async function pessoa(papel, consultoriaId, nome, { comGoogle = false } = {}) {
  const { id } = await criarPerfilDeTeste({ papel, consultoriaId })
  const perfil = conferir(await admin.from('perfis').update({ nome }).eq('id', id).select('*').single())
  if (!comGoogle) return perfil
  const googleEmail = `g-${crypto.randomUUID()}@gmail.test`
  const renovacao = google.concederRenovacao(googleEmail, [...ESCOPOS_DA_PESSOA])
  await gravarTokenDaPessoa(admin, id, { refresh_token: renovacao }, { email: googleEmail, escopos: [...ESCOPOS_DA_PESSOA] })
  return { ...perfil, googleEmail }
}

async function novoCliente(consultoriaId, consultorId, nome) {
  const { id } = conferir(await admin
    .from('clientes')
    .insert({ nome, horas_mes: 10, consultoria_id: consultoriaId, consultor_id: consultorId })
    .select('id')
    .single())
  registrarCliente(id)
  return id
}

// Uma reunião com Meet criada pelo núcleo da agenda (no Google falso do organizador), terminada há `horas` horas.
async function reuniao(quem, { horas = 1, minutos = 60, titulo = 'Kickoff com o cliente', inicio, ...extras } = {}) {
  const comeco = inicio ?? new Date(Math.floor((Date.now() - horas * HORA - minutos * 60_000) / 60_000) * 60_000)
  const { evento } = await salvarNoNucleo(admin, googleDe, quem, {
    novo: true,
    id: crypto.randomUUID(),
    titulo,
    descricao: 'Pauta: escopo e prazos',
    inicio: comeco.toISOString(),
    fim: new Date(comeco.getTime() + minutos * 60_000).toISOString(),
    com_meet: true,
    gravar: true,
    ...extras,
  })
  expect(evento.meet_codigo).toBeTruthy()
  return evento
}

// O que o Meet guardou da conferência: participantes, gravação e transcrição (pronta ou ainda processando).
function conferencia(quem, evento, { transcricao = 'FILE_GENERATED', gravacao = true } = {}) {
  const inicio = Date.parse(evento.inicio)
  google.registrarConferencia(quem.googleEmail, evento.meet_codigo, {
    inicio: new Date(inicio).toISOString(),
    fim: new Date(inicio + 58 * 60_000).toISOString(),
    participantes: [
      { id: 'p1', nome: quem.nome },
      { id: 'p2', nome: 'Contato do Cliente', tipo: 'anonymousUser' },
    ],
    gravacoes: gravacao ? [{ estado: 'FILE_GENERATED', link: GRAVACAO }] : [],
    transcricoes: transcricao
      ? [{
        estado: transcricao,
        falas: [
          { participante: 'p1', inicio: new Date(inicio + 5_000).toISOString(), texto: 'Bom dia a todos.' },
          { participante: 'p2', inicio: new Date(inicio + 70_000).toISOString(), texto: 'Podemos começar pelo escopo?' },
        ],
      }]
      : [],
  })
}

const linha = async (id) => conferir(await admin.from('agenda_eventos').select('*').eq('id', id).maybeSingle())
const pastasDoEvento = async (id) => conferir(await admin.from('cliente_pastas').select('*').eq('evento_id', id))
const arquivosDaPasta = async (pastaId) =>
  conferir(await admin.from('cliente_arquivos').select('*').eq('pasta_id', pastaId).order('nome'))
const historico = async (clienteId) =>
  conferir(await admin.from('cliente_eventos').select('tipo, autor, em').eq('cliente_id', clienteId)
    .in('tipo', ['reuniao_realizada', 'pasta_da_reuniao_criada']).order('tipo'))
async function conteudo(caminho) {
  const { data, error } = await admin.storage.from('arquivos').download(caminho)
  if (error) throw error
  return await data.text()
}

beforeAll(async () => {
  C = await criarConsultoriaDeTeste()
  D = await criarConsultoriaDeTeste()
  p.ana = await pessoa('pessoa', C, 'Ana Souza', { comGoogle: true })
  p.beto = await pessoa('pessoa', C, 'Beto Lima')
  p.edu = await pessoa('pessoa', C, 'Edu Prado')
  p.gestora = await pessoa('gestor', C, 'Gina Gestora')
  p.dani = await pessoa('pessoa', D, 'Dani Dias', { comGoogle: true })
  p.central = await pessoa('central', null, 'Cris Central')
  cli.daAna = await novoCliente(C, p.ana.id, 'ACME Ltda')
  cli.doBeto = await novoCliente(C, p.beto.id, 'Beta SA')
  cli.daDani = await novoCliente(D, p.dani.id, 'Delta ME')

  // A consultoria C tem a IA conectada em Integrações; a D não.
  const integracao = conferir(await admin.rpc('integracao_salvar', {
    p_consultoria: C,
    p_tipo: 'ia',
    p_config: { provedor: 'anthropic', modelo: 'claude-opus-5-5' },
    p_segredo: 'sk-ant-falsa-dos-testes',
    p_quem: null,
  }))
  conferir(await admin.from('integracoes').update({ situacao: 'conectada' }).eq('id', integracao))
  await segurarVez()
})

afterAll(async () => {
  await soltarVez()
  await limparTudo()
})

describe('pela tela: Buscar agora e Tentar de novo (núcleo, Google falso, IA falsa)', () => {
  it('transcrição pronta: pasta no cliente com transcricao.txt e documentacao.md, "pasta criada" e histórico', async () => {
    const e = await reuniao(p.ana, {
      cliente_id: cli.daAna,
      participantes: [p.beto.id],
      convidados: ['contato@cliente.test'],
    })
    expect(e.reuniao).toBe('agendada')
    conferencia(p.ana, e)
    const pedidosAntes = ia.pedidos.length

    const r = await buscar(p.ana, e.id)
    expect(r.reuniao).toMatchObject({ reuniao: 'pasta_criada', reuniao_erro: null, gravacao_url: GRAVACAO })

    const [pasta] = await pastasDoEvento(e.id)
    expect(pasta).toMatchObject({
      cliente_id: cli.daAna,
      consultoria_id: C,
      evento_id: e.id,
      nome: nomeDaPasta({ titulo: 'Kickoff com o cliente', inicio: e.inicio }),
    })
    expect(pasta.nome).toMatch(/^Reunião \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} — Kickoff com o cliente$/)
    expect(r.reuniao.pasta_id).toBe(pasta.id)
    expect(await linha(e.id)).toMatchObject({ reuniao: 'pasta_criada', pasta_id: pasta.id, gravacao_url: GRAVACAO })

    const arquivos = await arquivosDaPasta(pasta.id)
    expect(arquivos.map((a) => a.nome)).toEqual(['documentacao.md', 'transcricao.txt'])
    for (const a of arquivos) {
      expect(a.caminho).toMatch(new RegExp(`^${cli.daAna}/[0-9a-f-]{36}-${a.nome.replace('.', '\\.')}$`))
      expect(a).toMatchObject({ cliente_id: cli.daAna, consultoria_id: C })
      expect(a.tamanho).toBe(new TextEncoder().encode(await conteudo(a.caminho)).length)
    }

    const transcricao = await conteudo(arquivos[1].caminho)
    expect(transcricao.split('\n')).toEqual([
      expect.stringMatching(/^\[\d{2}:\d{2}:05\] Ana Souza: Bom dia a todos\.$/),
      expect.stringMatching(/^\[\d{2}:\d{2}:10\] Contato do Cliente: Podemos começar pelo escopo\?$/),
      '',
    ])

    const doc = await conteudo(arquivos[0].caminho)
    expect(doc.split('\n')[0]).toBe('# Kickoff com o cliente')
    expect(doc).toContain('- **Duração:** 58 min')
    expect(doc).toContain('- **Cliente:** ACME Ltda')
    expect(doc).toContain('- **Organizador:** Ana Souza')
    expect(doc).toContain('- **Participantes:** Beto Lima (não respondeu), contato@cliente.test (convidado de fora)')
    expect(doc).toContain('- **Falaram na reunião:** Ana Souza, Contato do Cliente')
    expect(doc).toContain(`- **Gravação:** [Abrir a gravação](${GRAVACAO})`)
    const noGoogle = google.evento(p.ana.googleEmail, e.google_evento_id)
    expect(doc).toContain(`- **Evento:** [Abrir no Google Agenda](${noGoogle.htmlLink})`)
    expect(doc).toContain(`- **Meet:** [${e.meet_link}](${e.meet_link})`)
    expect(doc).toContain('## Resumo\n\nAlinhamos o escopo do projeto e os prazos.\n')
    expect(doc).toContain('## Decisões\n\n- Começar pelo módulo financeiro\n')
    expect(doc).toContain('## Próximos passos\n\n- Ana envia o cronograma até sexta\n')

    // A IA da consultoria recebeu só a transcrição e os dados da reunião (nada de e-mails nem ids), com a chave dela.
    expect(ia.pedidos.length).toBe(pedidosAntes + 1)
    const pedido = ia.pedidos.at(-1)
    expect(pedido.cabecalhos.get('x-api-key')).toBe('sk-ant-falsa-dos-testes')
    expect(pedido.corpo.model).toBe('claude-opus-5-5')
    const enviado = JSON.stringify(pedido.corpo)
    expect(enviado).toContain('Kickoff com o cliente')
    expect(enviado).toContain('Ana Souza: Bom dia a todos.')
    for (const segredo of ['contato@cliente.test', p.ana.googleEmail, e.id, cli.daAna, e.meet_codigo]) {
      expect(enviado).not.toContain(segredo)
    }

    // Histórico do cliente: "Reunião realizada" (no fim da reunião, pela organizadora) e "Pasta da reunião criada".
    const h = await historico(cli.daAna)
    expect(h.map((x) => x.tipo)).toEqual(['pasta_da_reuniao_criada', 'reuniao_realizada'])
    expect(h[1]).toMatchObject({ autor: p.ana.id })
    expect(Date.parse(h[1].em)).toBe(Date.parse(e.fim))
  })

  it('buscar de novo (e duas buscas ao mesmo tempo) não cria outra pasta nem repete o histórico', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Revisão mensal' })
    conferencia(p.ana, e)
    const historicoAntes = (await historico(cli.daAna)).length
    const resultados = await Promise.allSettled([buscar(p.ana, e.id), buscar(p.gestora, e.id)])
    // Uma das duas buscou; a outra achou a busca em andamento (ou a pasta já criada).
    for (const r of resultados) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 409, codigo: 'reuniao_em_busca' })
    }
    expect(resultados.some((r) => r.status === 'fulfilled')).toBe(true)
    const outra = await buscar(p.ana, e.id)
    expect(outra.reuniao.reuniao).toBe('pasta_criada')
    expect(await tentar(p.ana, e.id)).toEqual(outra)

    const pastas = await pastasDoEvento(e.id)
    expect(pastas).toHaveLength(1)
    expect((await arquivosDaPasta(pastas[0].id)).map((a) => a.nome)).toEqual(['documentacao.md', 'transcricao.txt'])
    // Uma "Reunião realizada" e uma "Pasta da reunião criada", nada mais.
    expect(await historico(cli.daAna)).toHaveLength(historicoAntes + 2)
  })

  it('reunião com queda: a pasta junta as falas dos dois registros; a reunião de outro dia no mesmo Meet fica de fora', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Reunião com queda', horas: 2 })
    const inicio = Date.parse(e.inicio)
    const em = (minutos) => new Date(inicio + minutos * 60_000).toISOString()
    const pessoas = [{ id: 'p1', nome: 'Ana Souza' }, { id: 'p2', nome: 'Contato do Cliente', tipo: 'anonymousUser' }]
    // Uma semana antes, no mesmo espaço do Meet (como numa reunião recorrente): outra reunião, já transcrita.
    google.registrarConferencia(p.ana.googleEmail, e.meet_codigo, {
      inicio: em(-7 * 24 * 60), fim: em(-7 * 24 * 60 + 50), participantes: pessoas,
      transcricoes: [{ estado: 'FILE_GENERATED', falas: [{ participante: 'p1', inicio: em(-7 * 24 * 60 + 1), texto: 'Semana passada' }] }],
    })
    // A conexão cai aos 20 minutos e todos voltam aos 22.
    google.registrarConferencia(p.ana.googleEmail, e.meet_codigo, {
      inicio: em(0), fim: em(20), participantes: pessoas,
      transcricoes: [{ estado: 'FILE_GENERATED', falas: [{ participante: 'p1', inicio: em(1), texto: 'Bom dia' }] }],
    })
    google.registrarConferencia(p.ana.googleEmail, e.meet_codigo, {
      inicio: em(22), fim: em(58), participantes: pessoas,
      gravacoes: [{ estado: 'FILE_GENERATED', link: GRAVACAO }],
      transcricoes: [{ estado: 'FILE_GENERATED', falas: [{ participante: 'p2', inicio: em(23), texto: 'Voltamos' }] }],
    })

    expect((await buscar(p.ana, e.id)).reuniao).toMatchObject({ reuniao: 'pasta_criada', gravacao_url: GRAVACAO })
    const [pasta] = await pastasDoEvento(e.id)
    const arquivos = await arquivosDaPasta(pasta.id)
    const transcricao = await conteudo(arquivos.find((a) => a.nome === 'transcricao.txt').caminho)
    expect(transcricao.split('\n').map((linha) => linha.replace(/^\[[\d:]+\] /, ''))).toEqual([
      'Ana Souza: Bom dia', 'Contato do Cliente: Voltamos', '',
    ])
    expect(await conteudo(arquivos.find((a) => a.nome === 'documentacao.md').caminho)).toContain('- **Duração:** 58 min')
  })

  it('transcrição ainda processando: "aguardando", com o link da gravação já guardado', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Diagnóstico' })
    conferencia(p.ana, e, { transcricao: 'STARTED' })
    expect((await buscar(p.ana, e.id)).reuniao).toEqual({
      reuniao: 'aguardando',
      reuniao_erro: null,
      pasta_id: null,
      gravacao_url: GRAVACAO,
    })
    expect(await pastasDoEvento(e.id)).toEqual([])
  })

  it('48 horas depois do fim sem transcrição: "sem gravação/transcrição"', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Ninguém gravou', horas: 49 })
    // Ninguém entrou na reunião (o Meet não tem conferência).
    expect((await buscar(p.ana, e.id)).reuniao).toMatchObject({ reuniao: 'sem_artefatos', pasta_id: null })
    // Com 47 horas, ainda espera.
    const recente = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Ainda dá tempo', horas: 47 })
    conferencia(p.ana, recente, { transcricao: 'ENDED', gravacao: false })
    expect((await buscar(p.ana, recente.id)).reuniao).toMatchObject({ reuniao: 'aguardando', gravacao_url: null })
    expect(await pastasDoEvento(e.id)).toEqual([])
  })

  it('organizador sem Google: "Conecte o Google para buscar a gravação"; conectou, "Tentar de novo" cria a pasta', async () => {
    // O Beto ainda não conectou o Google, mas a reunião tem Meet (ele desconectou depois de criar).
    const comeco = Date.now() - 2 * HORA
    const e = conferir(await admin.from('agenda_eventos').insert({
      consultoria_id: C,
      consultor_id: p.beto.id,
      cliente_id: cli.doBeto,
      titulo: 'Sem Google',
      inicio: new Date(comeco).toISOString(),
      fim: new Date(comeco + HORA).toISOString(),
      com_meet: true,
      meet_codigo: 'zzz-yyyy-xxx',
      meet_link: 'https://meet.google.com/zzz-yyyy-xxx',
    }).select('*').single())

    expect((await buscar(p.gestora, e.id)).reuniao).toMatchObject({ reuniao: 'erro', reuniao_erro: SEM_GOOGLE })
    expect(await linha(e.id)).toMatchObject({ reuniao: 'erro', reuniao_erro: SEM_GOOGLE })
    // Buscar agora não mexe numa reunião com erro: é o "Tentar de novo" que volta a buscar.
    expect((await buscar(p.beto, e.id)).reuniao).toMatchObject({ reuniao: 'erro' })

    // Ele conecta o Google (a conta onde está a sala do Meet) e tenta de novo.
    const beto = await pessoaComGoogle(p.beto)
    const sala = google.criarSala(beto.googleEmail, 'zzz-yyyy-xxx')
    expect(sala).toBeTruthy()
    conferencia(beto, e)
    const r = await tentar(p.beto, e.id)
    expect(r.reuniao).toMatchObject({ reuniao: 'pasta_criada', reuniao_erro: null })
    expect(await pastasDoEvento(e.id)).toHaveLength(1)
  })

  it('o Google recusa: passageiro (503) fica aguardando com o motivo; sem permissão e token revogado viram erro', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Google instável' })
    conferencia(p.ana, e)
    google.falhar({ url: e.meet_codigo, status: 503 })
    expect((await buscar(p.ana, e.id)).reuniao).toMatchObject({
      reuniao: 'aguardando',
      reuniao_erro: GOOGLE_SEM_RESPOSTA,
      pasta_id: null,
    })
    // O Google voltou: a próxima busca cria a pasta e o motivo some.
    expect((await buscar(p.ana, e.id)).reuniao).toMatchObject({ reuniao: 'pasta_criada', reuniao_erro: null })

    // Sem permissão na conta (403 do Meet): tentar de novo sozinho não resolve, vira erro.
    const semPermissao = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Sem permissão no Meet' })
    google.falhar({ url: semPermissao.meet_codigo, status: 403 })
    expect((await buscar(p.ana, semPermissao.id)).reuniao).toMatchObject({ reuniao: 'erro', reuniao_erro: SEM_PERMISSAO })

    // Token revogado no Google: "Reconecte o Google" e a conexão da organizadora fica marcada.
    const caio = await pessoa('pessoa', C, 'Caio Reis', { comGoogle: true })
    const doCaio = await reuniao(p.gestora, { consultor_id: caio.id, cliente_id: cli.daAna, titulo: 'Token revogado' })
    google.revogarConta(caio.googleEmail)
    expect((await buscar(caio, doCaio.id)).reuniao).toMatchObject({
      reuniao: 'erro',
      reuniao_erro: 'O Google não aceita mais esta conexão. Reconecte o Google.',
    })
    const conexao = conferir(await admin.from('google_pessoas').select('erro').eq('perfil_id', caio.id).single())
    expect(conexao.erro).toMatch(/Reconecte o Google/)
  })

  it('IA desligada (ou fora do ar): a documentação sai sem resumo e a pasta é criada', async () => {
    // A consultoria D não conectou a IA: nenhum pedido à IA.
    const antes = ia.pedidos.length
    const e = await reuniao(p.dani, { cliente_id: cli.daDani, titulo: 'Sem IA' })
    conferencia(p.dani, e)
    expect((await buscar(p.dani, e.id)).reuniao.reuniao).toBe('pasta_criada')
    expect(ia.pedidos.length).toBe(antes)
    const [pasta] = await pastasDoEvento(e.id)
    expect(pasta.consultoria_id).toBe(D)
    const doc = await conteudo((await arquivosDaPasta(pasta.id))[0].caminho)
    expect(doc).toContain('- **Organizador:** Dani Dias')
    expect(doc).not.toContain('## Resumo')

    // A IA da C fora do ar: a pasta sai do mesmo jeito, sem o resumo.
    const f = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'IA fora do ar' })
    conferencia(p.ana, f)
    ia.falharProxima()
    expect((await buscar(p.ana, f.id)).reuniao.reuniao).toBe('pasta_criada')
    const [outra] = await pastasDoEvento(f.id)
    const docSemIa = await conteudo((await arquivosDaPasta(outra.id))[0].caminho)
    expect(docSemIa).toContain('# IA fora do ar')
    expect(docSemIa).not.toContain('## Resumo')
  })

  it('sem cliente no evento: não pergunta ao Google nem muda a situação', async () => {
    const e = await reuniao(p.ana, { titulo: 'Reunião interna' })
    conferencia(p.ana, e)
    const antes = google.pedidosPara(e.meet_codigo).length
    const erro = await recusa(buscar(p.ana, e.id))
    expect(erro).toMatchObject({ status: 409, codigo: 'sem_cliente' })
    expect(erro.extra.erro).toBe('Escolha o cliente do evento: a pasta da reunião fica nos arquivos dele.')
    expect(await recusa(tentar(p.ana, e.id))).toMatchObject({ status: 409, codigo: 'sem_cliente' })
    expect(google.pedidosPara(e.meet_codigo)).toHaveLength(antes)
    expect(await linha(e.id)).toMatchObject({ reuniao: 'agendada', reuniao_erro: null, gravacao_url: null })
    expect(await pastasDoEvento(e.id)).toEqual([])
  })

  it('duas reuniões com o mesmo título no mesmo minuto: a segunda pasta ganha " (2)"', async () => {
    const inicio = new Date(Math.floor((Date.now() - 3 * HORA) / 60_000) * 60_000)
    const a = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Daily', inicio, minutos: 15 })
    const b = await reuniao(p.gestora, { consultor_id: p.ana.id, cliente_id: cli.daAna, titulo: 'Daily', inicio, minutos: 15 })
    conferencia(p.ana, a)
    conferencia(p.ana, b)
    await buscar(p.ana, a.id)
    await buscar(p.ana, b.id)
    const nome = nomeDaPasta({ titulo: 'Daily', inicio: inicio.toISOString() })
    expect((await pastasDoEvento(a.id))[0].nome).toBe(nome)
    expect((await pastasDoEvento(b.id))[0].nome).toBe(`${nome} (2)`)
  })

  it('quem pode: quem edita o evento (organizador, gestão, central); colega e outra consultoria não; só depois do fim', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Permissões', participantes: [p.edu.id] })
    const antes = google.pedidos.length
    // Convidado vê o evento e recebe "só quem organiza"; colega sem convite e outra consultoria nem ficam sabendo.
    expect(await recusa(buscar(p.edu, e.id))).toMatchObject({ status: 403, codigo: 'sem_permissao' })
    expect(await recusa(tentar(p.beto, e.id))).toMatchObject({ status: 404, codigo: 'evento_nao_encontrado' })
    expect(await recusa(buscar(p.dani, e.id))).toMatchObject({ status: 404, codigo: 'evento_nao_encontrado' })
    expect(await recusa(buscar(p.ana, crypto.randomUUID()))).toMatchObject({ status: 404 })
    expect(await recusa(buscar(p.ana, 'nao-e-uuid'))).toMatchObject({ status: 400, codigo: 'dados_invalidos' })
    expect(google.pedidos.length).toBe(antes)

    // Gestora e central podem (a reunião ainda espera a transcrição).
    expect((await buscar(p.gestora, e.id)).reuniao.reuniao).toBe('aguardando')
    expect((await buscar(p.central, e.id)).reuniao.reuniao).toBe('aguardando')

    // Antes do fim e sem Meet: nada a buscar.
    const futura = await reuniao(p.ana, { cliente_id: cli.daAna, inicio: new Date(Date.now() + HORA), titulo: 'Futura' })
    const naoTerminou = await recusa(buscar(p.ana, futura.id))
    expect(naoTerminou).toMatchObject({ status: 409, codigo: 'reuniao_nao_terminou' })
    expect(naoTerminou.extra.erro).toBe('A reunião ainda não terminou.')
    const semMeet = (await salvarNoNucleo(admin, googleDe, p.ana, {
      novo: true,
      id: crypto.randomUUID(),
      titulo: 'Sem Meet',
      inicio: new Date(Date.now() - 2 * HORA).toISOString(),
      fim: new Date(Date.now() - HORA).toISOString(),
    })).evento
    expect(await recusa(tentar(p.ana, semMeet.id))).toMatchObject({ status: 409, codigo: 'sem_meet' })
  })
})

// Uma pessoa que conecta o Google agora (token válido no Google falso).
async function pessoaComGoogle(perfil) {
  const googleEmail = `g-${crypto.randomUUID()}@gmail.test`
  const renovacao = google.concederRenovacao(googleEmail, [...ESCOPOS_DA_PESSOA])
  await gravarTokenDaPessoa(admin, perfil.id, { refresh_token: renovacao }, { email: googleEmail, escopos: [...ESCOPOS_DA_PESSOA] })
  return { ...perfil, googleEmail }
}

describe('a rotina (pg_cron a cada 10 minutos)', () => {
  it('nos testes, a rotina sem o recorte das consultorias de teste nem chega ao banco', async () => {
    await expect(rodarRotina({ db: banco, googleDe, iaDa })).rejects.toThrow(SEM_RECORTE)
  })

  it('fecha as reuniões terminadas; o erro de uma não para as outras; um Google por organizador; duas vezes, uma pasta', async () => {
    const pronta = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina pronta' })
    const quebrada = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina sem permissão' })
    const daD = await reuniao(p.dani, { cliente_id: cli.daDani, titulo: 'Rotina da D' })
    const futura = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina futura', inicio: new Date(Date.now() + HORA) })
    for (const [quem, e] of [[p.ana, pronta], [p.ana, quebrada], [p.dani, daD]]) conferencia(quem, e)
    google.falhar({ url: quebrada.meet_codigo, status: 403, vezes: 5 })
    const pedidosDaFutura = google.pedidosPara(futura.meet_codigo).length
    googlesPedidos.length = 0

    // Duas rotinas ao mesmo tempo, com a vez de verdade: uma roda, a outra fica de fora.
    await soltarVez()
    let resultados
    try {
      resultados = await Promise.all([rotina(), rotina()])
    } finally {
      await segurarVez()
    }
    expect(resultados.map((r) => r.ocupada).sort()).toEqual([false, true])

    expect(await linha(pronta.id)).toMatchObject({ reuniao: 'pasta_criada' })
    expect(await linha(daD.id)).toMatchObject({ reuniao: 'pasta_criada' })
    expect(await linha(quebrada.id)).toMatchObject({ reuniao: 'erro', reuniao_erro: SEM_PERMISSAO })
    expect(await linha(futura.id)).toMatchObject({ reuniao: 'agendada' })
    expect(google.pedidosPara(futura.meet_codigo)).toHaveLength(pedidosDaFutura)
    // Um Google por organizador na rodada (a Ana tinha duas reuniões).
    expect(googlesPedidos.filter((id) => id === p.ana.id)).toHaveLength(1)
    expect(googlesPedidos.filter((id) => id === p.dani.id)).toHaveLength(1)

    // A rotina de novo: nada muda (a reunião com erro espera o "Tentar de novo").
    const pedidosAntes = google.pedidosPara(quebrada.meet_codigo).length
    expect((await rotina({ proximaBusca: imediata })).ocupada).toBe(false)
    expect(google.pedidosPara(quebrada.meet_codigo)).toHaveLength(pedidosAntes)
    for (const e of [pronta, daD]) expect(await pastasDoEvento(e.id)).toHaveLength(1)
  })

  it('erro passageiro (503, 429) e falha ao guardar: aguardando com o motivo; a rotina seguinte termina a mesma pasta', async () => {
    const m503 = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina 503' })
    const m429 = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina 429' })
    const doStorage = await reuniao(p.dani, { cliente_id: cli.daDani, titulo: 'Rotina Storage' })
    for (const [quem, e] of [[p.ana, m503], [p.ana, m429], [p.dani, doStorage]]) conferencia(quem, e)
    google.falhar({ url: m503.meet_codigo, status: 503 })
    google.falhar({ url: m429.meet_codigo, status: 429, vezes: 10 })
    // O Storage cai na hora de guardar a documentação: a pasta fica só com a transcrição.
    falhasNoEnvio.push((caminho) => caminho.startsWith(`${cli.daDani}/`) && caminho.endsWith('-documentacao.md'))
    const historicoAntes = (await historico(cli.daDani)).length

    await rotina({ proximaBusca: imediata })
    expect(await linha(m503.id)).toMatchObject({ reuniao: 'aguardando', reuniao_erro: GOOGLE_SEM_RESPOSTA, pasta_id: null })
    expect(await linha(m429.id)).toMatchObject({ reuniao: 'aguardando', reuniao_erro: GOOGLE_SEM_RESPOSTA })
    expect(await linha(doStorage.id)).toMatchObject({ reuniao: 'aguardando', reuniao_erro: FALHOU, pasta_id: null })
    const [pasta] = await pastasDoEvento(doStorage.id)
    expect((await arquivosDaPasta(pasta.id)).map((a) => a.nome)).toEqual(['transcricao.txt'])
    expect(falhasNoEnvio).toEqual([])

    await rotina({ proximaBusca: imediata })
    expect(await linha(m503.id)).toMatchObject({ reuniao: 'pasta_criada', reuniao_erro: null })
    expect(await linha(m429.id)).toMatchObject({ reuniao: 'aguardando', reuniao_erro: GOOGLE_SEM_RESPOSTA })
    expect(await linha(doStorage.id)).toMatchObject({ reuniao: 'pasta_criada', reuniao_erro: null, pasta_id: pasta.id })
    expect(await pastasDoEvento(doStorage.id)).toHaveLength(1)
    expect((await arquivosDaPasta(pasta.id)).map((a) => a.nome)).toEqual(['documentacao.md', 'transcricao.txt'])
    expect(await historico(cli.daDani)).toHaveLength(historicoAntes + 2)
  })

  it('reunião sem cliente fica fora da rotina; com o cliente escolhido depois, a rotina a pega sozinha', async () => {
    const e = await reuniao(p.ana, { titulo: 'Interna, depois com cliente' })
    conferencia(p.ana, e)
    const antes = google.pedidosPara(e.meet_codigo).length
    await rotina({ proximaBusca: imediata })
    expect(google.pedidosPara(e.meet_codigo)).toHaveLength(antes)
    expect(await linha(e.id)).toMatchObject({ reuniao: 'agendada', reuniao_erro: null })

    conferir(await admin.from('agenda_eventos').update({ cliente_id: cli.daAna }).eq('id', e.id))
    await rotina()
    expect(await linha(e.id)).toMatchObject({ reuniao: 'pasta_criada' })
    expect(await pastasDoEvento(e.id)).toHaveLength(1)
  })

  it('com mais de 2 horas do fim, a reunião olhada só volta daqui a 1 hora (não na rotina seguinte)', async () => {
    const e = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina 3 h', horas: 3 })
    conferencia(p.ana, e, { transcricao: 'STARTED' })
    await rotina()
    expect(await linha(e.id)).toMatchObject({ reuniao: 'aguardando' })
    const pedidos = google.pedidosPara(e.meet_codigo).length
    await rotina()
    expect(google.pedidosPara(e.meet_codigo)).toHaveLength(pedidos)
  })

  it('48 horas sem transcrição: "sem gravação/transcrição" e a rotina para de perguntar ao Google', async () => {
    const velha = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Rotina 48 h', horas: 47 })
    conferencia(p.ana, velha, { transcricao: 'STARTED' })
    await rotina({ proximaBusca: imediata })
    expect(await linha(velha.id)).toMatchObject({ reuniao: 'aguardando', gravacao_url: GRAVACAO })

    // Duas horas depois (o relógio da rotina anda), passou das 48 horas.
    await rotina({ proximaBusca: imediata, agora: () => Date.now() + 2 * HORA })
    expect(await linha(velha.id)).toMatchObject({ reuniao: 'sem_artefatos', gravacao_url: GRAVACAO })
    const pedidos = google.pedidosPara(velha.meet_codigo).length
    await rotina({ proximaBusca: imediata })
    expect(google.pedidosPara(velha.meet_codigo)).toHaveLength(pedidos)
  })

  it('agendada que terminou há mais de 48 horas: a rotina não pega; "Buscar agora" ainda funciona', async () => {
    const velha = await reuniao(p.ana, { cliente_id: cli.daAna, titulo: 'Nunca olhada', horas: 50 })
    conferencia(p.ana, velha)
    const antes = google.pedidosPara(velha.meet_codigo).length
    await rotina({ proximaBusca: imediata })
    expect(google.pedidosPara(velha.meet_codigo)).toHaveLength(antes)
    expect(await linha(velha.id)).toMatchObject({ reuniao: 'agendada' })
    expect((await buscar(p.ana, velha.id)).reuniao.reuniao).toBe('pasta_criada')
  })

  it('o segredo da rotina: só o que está no Vault vale', async () => {
    const segredo = conferir(await admin.rpc('segredo_da_rotina_das_reunioes'))
    expect(segredo).toMatch(/^[0-9a-f]{64}$/)
    expect(await segredoDaRotinaConfere(admin, segredo)).toBe(true)
    expect(await segredoDaRotinaConfere(admin, `${segredo}x`)).toBe(false)
    expect(await segredoDaRotinaConfere(admin, segredo.slice(0, -1))).toBe(false)
    expect(await segredoDaRotinaConfere(admin, '')).toBe(false)
    expect(await segredoDaRotinaConfere(admin, null)).toBe(false)
  })
})

describe('Edge Function reunioes-depois (no ar)', () => {
  const v = {}
  const sessoes = {}

  beforeAll(async () => {
    // A função no ar pega a vez de verdade da rotina sozinha.
    await soltarVez()
    const E = await criarConsultoriaDeTeste()
    v.E = E
    v.luiza = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: E })
    v.marcos = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: E })
    for (const nome of ['luiza', 'marcos']) sessoes[nome] = await entrarComo(v[nome])
    const comeco = Date.now() - 2 * HORA
    v.reuniao = conferir(await admin.from('agenda_eventos').insert({
      consultoria_id: E,
      consultor_id: v.luiza.id,
      cliente_id: await novoCliente(E, v.luiza.id, 'Cliente no ar'),
      titulo: 'Reunião no ar',
      inicio: new Date(comeco).toISOString(),
      fim: new Date(comeco + HORA).toISOString(),
      com_meet: true,
      meet_codigo: 'aaa-bbbb-ccc',
    }).select('id').single())
  })

  const chamar = (cabecalhos, corpo = {}) =>
    fetch(`${status.API_URL}/functions/v1/reunioes-depois`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
    })

  it('sem login e sem segredo: 401; segredo errado: 401; o segredo do Vault roda a rotina (nos testes, com recorte)', async () => {
    expect((await chamar({})).status).toBe(401)
    expect((await chamar({ 'x-rotina-segredo': 'errado' })).status).toBe(401)
    const segredo = conferir(await admin.rpc('segredo_da_rotina_das_reunioes'))
    const recorteInvalido = await chamar({ 'x-rotina-segredo': segredo }, { consultorias: ['nao-e-uuid'] })
    expect(recorteInvalido.status).toBe(400)
    expect(await recorteInvalido.json()).toMatchObject({ codigo: 'dados_invalidos', campo: 'consultorias' })
    const certo = await chamar({ 'x-rotina-segredo': segredo }, { consultorias: [v.E] })
    expect(certo.status).toBe(200)
    const corpo = await certo.json()
    expect(typeof corpo.ocupada).toBe('boolean')
    expect(typeof corpo.processadas).toBe('number')
    // A organizadora não conectou o Google: esta rotina (ou a do pg_cron, se ela estava rodando) marcou a reunião.
    if (!corpo.ocupada) expect(await linha(v.reuniao.id)).toMatchObject({ reuniao: 'erro', reuniao_erro: SEM_GOOGLE })
  })

  it('Buscar agora e Tentar de novo pela tela: organizadora sem Google vê o motivo; colega nem fica sabendo', async () => {
    atual.cliente = sessoes.luiza
    expect(await buscarAgora(v.reuniao.id)).toEqual({
      erro: null,
      reuniao: { reuniao: 'erro', reuniao_erro: SEM_GOOGLE, pasta_id: null, gravacao_url: null },
    })
    expect((await tentarDeNovo(v.reuniao.id)).reuniao).toMatchObject({ reuniao: 'erro', reuniao_erro: SEM_GOOGLE })
    atual.cliente = sessoes.marcos
    expect(await buscarAgora(v.reuniao.id)).toEqual({ erro: 'Este evento não existe mais.' })
    expect(await tentarDeNovo(v.reuniao.id)).toEqual({ erro: 'Este evento não existe mais.' })
    const outra = await chamarFuncao(sessoes.luiza, 'reunioes-depois', { acao: 'outra' })
    expect(outra).toMatchObject({ status: 400, corpo: { codigo: 'dados_invalidos' } })
  })
})
