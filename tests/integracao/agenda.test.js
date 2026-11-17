// A agenda contra o Supabase local de verdade.
// - Leituras: roda as funções de src/data/agenda.js (os mesmos textos de select e chamadas de função que o app usa)
//   como cada tipo de usuário. Pega o que um mock esconde: relação ambígua no PostgREST (PGRST201), coluna que não
//   existe, recorte errado por papel.
// - Criar, editar, apagar e responder: o núcleo da Edge Function `agenda` (_shared/agenda/eventos.ts) com o banco
//   local e o Google falso (permissões por papel, Google primeiro e banco depois, nada pela metade), e a função no ar
//   chamada pelas funções de src/data/agenda.js.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  apagarEvento as apagarNoNucleo,
  responder as responderNoNucleo,
  salvarEvento as salvarNoNucleo,
} from '../../supabase/functions/_shared/agenda/eventos.ts'
import { criarGoogleFalso } from '../../supabase/functions/_shared/agenda/google-falso.ts'
import { ESCOPOS_DA_PESSOA } from '../../supabase/functions/_shared/agenda/google.ts'
import { criarGoogleDe, gravarTokenDaPessoa } from '../../supabase/functions/_shared/agenda/tokens.ts'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', async () => {
  const ambiente = await import('./ambiente.js')
  return {
    supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
    // As ações da agenda passam pela Edge Function de verdade, com o login de quem entrou.
    chamarFuncao: (nome, corpo) => ambiente.chamarFuncao(atual.cliente, nome, corpo),
  }
})

const {
  apagarEvento,
  ausenciasDoPeriodo,
  buscarEvento,
  eventosDoPeriodo,
  feriadosDoPeriodo,
  indicadoresDaAgenda,
  meuGoogle,
  novoIdDeEvento,
  responderConvite,
  salvarEvento,
} = await import('../../src/data/agenda.js')

const admin = clienteAdmin()
const DE = '2026-11-01T00:00:00-03:00'
const ATE = '2026-12-01T00:00:00-03:00'

let A, B
let central, gestorA, pessoaA, pessoaA2, pessoaB
let sessoes = {}
let clienteA
const ev = {}

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}
const titulos = (r) => r.itens.map((e) => e.titulo).sort()

async function novoEvento(chave, consultoria, consultor, dia, extras = {}) {
  const { data, error } = await admin
    .from('agenda_eventos')
    .insert({
      consultoria_id: consultoria,
      consultor_id: consultor,
      titulo: `Integração ${chave}`,
      inicio: `2026-11-${dia}T13:00:00Z`,
      fim: `2026-11-${dia}T14:00:00Z`,
      ...extras,
    })
    .select('id')
    .single()
  if (error) throw error
  ev[chave] = data.id
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  central = await criarPerfilDeTeste({ papel: 'central' })
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaA2 = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: B })
  sessoes = {
    central: await entrarComo(central),
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    pessoaB: await entrarComo(pessoaB),
  }

  const cliente = await admin
    .from('clientes')
    .insert({ nome: 'Cliente agenda integração', horas_mes: 10, consultoria_id: A, consultor_id: pessoaA.id })
    .select('id')
    .single()
  if (cliente.error) throw cliente.error
  clienteA = cliente.data.id
  registrarCliente(clienteA)

  await novoEvento('proprio', A, pessoaA.id, '10', { cliente_id: clienteA, com_meet: true })
  await novoEvento('convidado', A, pessoaA2.id, '11')
  await novoEvento('colega', A, pessoaA2.id, '12')
  await novoEvento('deB', B, pessoaB.id, '13')
  const participantes = await admin.from('agenda_participantes').insert([
    { evento_id: ev.convidado, perfil_id: pessoaA.id },
    { evento_id: ev.convidado, email: 'fora@exemplo.com' },
  ])
  if (participantes.error) throw participantes.error
  const ausencia = await admin
    .from('ausencias')
    .insert({ perfil_id: pessoaA.id, de: '2026-11-16', ate: '2026-11-18', motivo: 'Férias' })
  if (ausencia.error) throw ausencia.error
})

afterAll(limparTudo)

describe('agenda: leituras contra o banco de verdade', () => {
  it('consultor: os próprios e o convidado, com participantes, cliente e nomes; o do colega não', async () => {
    entrar('pessoa')
    const r = await eventosDoPeriodo({ de: DE, ate: ATE })
    expect(titulos(r)).toEqual(['Integração convidado', 'Integração proprio'])
    expect(r.haMais).toBe(false)
    const proprio = r.itens.find((e) => e.id === ev.proprio)
    expect(proprio.cliente).toMatchObject({ id: clienteA, nome: 'Cliente agenda integração' })
    const convidado = r.itens.find((e) => e.id === ev.convidado)
    expect(convidado.consultor.id).toBe(pessoaA2.id)
    expect(convidado.consultor.nome).toBeTruthy()
    expect(convidado.participantes).toHaveLength(2)
    expect(convidado.participantes.find((p) => p.email === 'fora@exemplo.com').resposta).toBe('pendente')
    expect(convidado.participantes.find((p) => p.perfil_id === pessoaA.id).nome).toBeTruthy()
  })

  it('filtros de cliente e de consultor rodam no banco', async () => {
    entrar('pessoa')
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE, clienteId: clienteA }))).toEqual(['Integração proprio'])
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE, consultorId: pessoaA2.id }))).toEqual(['Integração convidado'])
  })

  it('gestor vê a consultoria toda; central vê tudo e filtra; outra consultoria não vê a A', async () => {
    entrar('gestor')
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE }))).toEqual([
      'Integração colega',
      'Integração convidado',
      'Integração proprio',
    ])
    entrar('central')
    const tudo = titulos(await eventosDoPeriodo({ de: DE, ate: ATE }))
    expect(tudo).toEqual(expect.arrayContaining(['Integração colega', 'Integração deB', 'Integração proprio']))
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE, consultoriaId: B }))).toEqual(['Integração deB'])
    entrar('pessoaB')
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE }))).toEqual(['Integração deB'])
  })

  it('buscarEvento devolve o evento visível e nulo para o que não se vê', async () => {
    entrar('pessoa')
    expect((await buscarEvento(ev.convidado)).participantes).toHaveLength(2)
    expect(await buscarEvento(ev.colega)).toBeNull()
  })

  it('indicadores, feriados e Google', async () => {
    entrar('pessoa')
    const i = await indicadoresDaAgenda('2026-11-10')
    expect(Object.keys(i).sort()).toEqual(['aguardando', 'mes', 'pastas_no_mes', 'semana'])
    expect(i.mes).toBe(1)
    expect(await feriadosDoPeriodo('2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-15', '2026-11-20'])
    expect(await meuGoogle()).toEqual({ conectado: false, email: null, erro: null })
  })

  it('ausências: com nome, por consultor e por consultoria, mesmo para gestor sem time', async () => {
    const pedir = (extra, de = '2026-11-01', ate = '2026-11-30') => ausenciasDoPeriodo({ de, ate, ...extra })
    entrar('gestor')
    const todas = await pedir()
    expect(todas.haMais).toBe(false)
    const ferias = todas.itens.find((a) => a.motivo === 'Férias')
    expect(ferias.perfil_id).toBe(pessoaA.id)
    // O nome vem da função do banco: não depende de o gestor ler o perfil do consultor.
    expect(ferias.pessoa.nome).toBeTruthy()
    expect((await pedir({ consultorId: pessoaA.id })).itens).toHaveLength(1)
    expect((await pedir({ consultoriaId: A })).itens).toHaveLength(1)
    expect((await pedir({ consultoriaId: B })).itens).toHaveLength(0)
    entrar('pessoa')
    expect((await pedir()).itens.map((a) => a.motivo)).toEqual(['Férias'])
    entrar('central')
    expect((await pedir({ consultoriaId: A })).itens).toHaveLength(1)
    expect((await pedir({ consultoriaId: B })).itens).toHaveLength(0)
    expect((await pedir({ consultoriaId: A }, '2026-12-01', '2026-12-31')).itens).toHaveLength(0)
  })
})

describe('agenda: criar, editar, apagar e responder (núcleo da Edge Function, Google falso)', () => {
  const google = criarGoogleFalso()
  const APP = { id: google.cliente.id, segredo: google.cliente.segredo, volta: 'http://localhost:5173/calendario' }
  const googleDe = criarGoogleDe({ banco: admin, app: APP, fetch: google.fetch, agora: google.agora })
  const EVENTOS = 'www.googleapis.com/calendar/v3/calendars/primary/events'
  const p = {}
  const cli = {}
  let C, D

  // Perfil inteiro (como quemChama entrega à função); com Google, um token de renovação válido no Google falso.
  async function pessoa(papel, consultoriaId, { comGoogle = false } = {}) {
    const { id } = await criarPerfilDeTeste({ papel, consultoriaId })
    const { data, error } = await admin.from('perfis').select('*').eq('id', id).single()
    if (error) throw error
    if (!comGoogle) return data
    const googleEmail = `g-${crypto.randomUUID()}@gmail.test`
    const renovacao = google.concederRenovacao(googleEmail, [...ESCOPOS_DA_PESSOA])
    await gravarTokenDaPessoa(admin, id, { refresh_token: renovacao }, { email: googleEmail, escopos: [...ESCOPOS_DA_PESSOA] })
    return { ...data, googleEmail }
  }

  async function novoCliente(consultoriaId, consultorId, extras = {}) {
    const { data, error } = await admin
      .from('clientes')
      .insert({
        nome: `Cliente ${crypto.randomUUID().slice(0, 8)}`,
        horas_mes: 10,
        consultoria_id: consultoriaId,
        consultor_id: consultorId,
        ...extras,
      })
      .select('id')
      .single()
    if (error) throw error
    registrarCliente(data.id)
    return data.id
  }

  // Um evento novo como a janela manda (o id nasce na janela e vale para todas as tentativas).
  const evento = (extras = {}) => ({
    novo: true,
    id: crypto.randomUUID(),
    titulo: 'Kickoff com o cliente',
    descricao: 'Pauta: escopo e prazos',
    inicio: '2026-11-20T17:00:00.000Z',
    fim: '2026-11-20T18:00:00.000Z',
    ...extras,
  })
  const salvar = (quem, dados) => salvarNoNucleo(admin, googleDe, quem, dados)
  const apagar = (quem, id) => apagarNoNucleo(admin, googleDe, quem, id)
  const linha = async (id) => (await admin.from('agenda_eventos').select('*').eq('id', id).maybeSingle()).data
  const participantes = async (id) =>
    (await admin.from('agenda_participantes').select('perfil_id, email, resposta').eq('evento_id', id)).data
  const quemParticipa = (lista) => lista.map((x) => x.perfil_id ?? x.email).sort()
  const idNoGoogle = (id) => id.replaceAll('-', '')
  // A promessa precisa ser recusada; devolve o erro (uma Falha: status, codigo e extra.erro em português).
  const recusa = (promessa) =>
    promessa.then(
      () => {
        throw new Error('devia ter sido recusado')
      },
      (erro) => erro,
    )

  beforeAll(async () => {
    C = await criarConsultoriaDeTeste()
    D = await criarConsultoriaDeTeste()
    p.gestora = await pessoa('gestor', C)
    p.ana = await pessoa('pessoa', C, { comGoogle: true })
    p.beto = await pessoa('pessoa', C)
    p.caio = await pessoa('pessoa', C, { comGoogle: true })
    p.edu = await pessoa('pessoa', C)
    p.dani = await pessoa('pessoa', D, { comGoogle: true })
    p.central = await pessoa('central', null)
    cli.daAna = await novoCliente(C, p.ana.id)
    cli.doBeto = await novoCliente(C, p.beto.id)
    cli.arquivado = await novoCliente(C, p.ana.id, { arquivado_em: new Date().toISOString() })
    cli.deD = await novoCliente(D, p.dani.id)
  })

  it('consultor cria na própria agenda e não na de colega', async () => {
    const dados = evento({
      cliente_id: cli.daAna,
      com_meet: true,
      gravar: true,
      participantes: [p.beto.id],
      convidados: ['Contato@Cliente.test'],
    })
    const r = await salvar(p.ana, dados)
    expect(r.aviso).toBeUndefined()
    expect(r.evento).toMatchObject({
      id: dados.id,
      consultoria_id: C,
      consultor_id: p.ana.id,
      cliente_id: cli.daAna,
      criado_por: p.ana.id,
      com_meet: true,
      gravar: true,
      reuniao: 'agendada',
      google_evento_id: idNoGoogle(dados.id),
    })
    expect(r.evento.meet_link).toBe(`https://meet.google.com/${r.evento.meet_codigo}`)
    expect(r.evento.cliente.id).toBe(cli.daAna)
    expect(quemParticipa(r.evento.participantes)).toEqual([p.beto.id, 'contato@cliente.test'].sort())

    // No Google da Ana (a organizadora): o colega e o de fora convidados, o Meet e a gravação ligada.
    const noGoogle = google.evento(p.ana.googleEmail, idNoGoogle(dados.id))
    expect(noGoogle.summary).toBe('Kickoff com o cliente')
    expect(noGoogle.attendees.map((a) => a.email).sort()).toEqual([p.beto.email, 'contato@cliente.test'].sort())
    expect(google.espaco(p.ana.googleEmail, r.evento.meet_codigo).config.artifactConfig.recordingConfig).toEqual({
      autoRecordingGeneration: 'ON',
    })

    // Na agenda de um colega: recusado antes do Google, sem linha no banco.
    const antes = google.pedidos.length
    const doColega = evento({ consultor_id: p.beto.id })
    const erro = await recusa(salvar(p.ana, doColega))
    expect(erro).toMatchObject({ status: 403, codigo: 'sem_permissao' })
    expect(erro.extra.erro).toBe('Você só cria eventos na sua própria agenda.')
    expect(google.pedidos.length).toBe(antes)
    expect(await linha(doColega.id)).toBeNull()
  })

  it('gestora cria para consultor conectado (vai ao Google dele) e para não conectado (só no app, com aviso)', async () => {
    const r = await salvar(p.gestora, evento({ consultor_id: p.ana.id, cliente_id: cli.daAna, com_meet: true }))
    expect(r.aviso).toBeUndefined()
    expect(r.evento).toMatchObject({ consultor_id: p.ana.id, consultoria_id: C, criado_por: p.gestora.id, com_meet: true })
    expect(r.evento.meet_codigo).toBeTruthy()
    expect(google.evento(p.ana.googleEmail, r.evento.google_evento_id).organizer.email).toBe(p.ana.googleEmail)

    const antes = google.pedidos.length
    const s = await salvar(
      p.gestora,
      evento({ consultor_id: p.beto.id, cliente_id: cli.doBeto, com_meet: true, gravar: true, convidados: ['x@cliente.test'] }),
    )
    expect(s.aviso).toBe(`Fica só no app: ${p.beto.nome} não conectou o Google.`)
    expect(s.evento).toMatchObject({
      consultor_id: p.beto.id,
      criado_por: p.gestora.id,
      com_meet: false,
      gravar: false,
      meet_link: null,
      meet_codigo: null,
      google_evento_id: null,
      reuniao: 'agendada',
    })
    expect(quemParticipa(s.evento.participantes)).toEqual(['x@cliente.test'])
    expect(google.pedidos.length).toBe(antes)
  })

  it('central cria e edita na agenda de qualquer consultoria; consultoria arquivada não grava', async () => {
    const r = await salvar(p.central, evento({ consultor_id: p.dani.id, cliente_id: cli.deD }))
    expect(r.evento).toMatchObject({ consultoria_id: D, consultor_id: p.dani.id, criado_por: p.central.id })
    expect(google.evento(p.dani.googleEmail, r.evento.google_evento_id)).toBeTruthy()
    expect((await salvar(p.central, { id: r.evento.id, titulo: 'Pela central' })).evento.titulo).toBe('Pela central')

    // Consultoria arquivada: a central recebe o motivo; quem é dela não age.
    const F = await criarConsultoriaDeTeste()
    const daArquivada = await pessoa('pessoa', F)
    const { evento: antigo } = await salvar(p.central, evento({ consultor_id: daArquivada.id }))
    const arquivar = await admin.from('consultorias').update({ arquivada_em: new Date().toISOString() }).eq('id', F)
    if (arquivar.error) throw arquivar.error
    expect(await recusa(salvar(p.central, evento({ consultor_id: daArquivada.id })))).toMatchObject({
      status: 409,
      codigo: 'consultoria_arquivada',
    })
    expect(await recusa(salvar(p.central, { id: antigo.id, titulo: 'Depois de arquivar' }))).toMatchObject({
      status: 409,
      codigo: 'consultoria_arquivada',
    })
    expect(await recusa(salvar(daArquivada, evento()))).toMatchObject({ status: 403, codigo: 'sem_permissao' })
    expect(await recusa(apagar(daArquivada, antigo.id))).toMatchObject({ status: 403, codigo: 'sem_permissao' })
  })

  it('evento que ficou só no app vai para o Google quando o organizador conecta e alguém edita', async () => {
    const semGoogle = await pessoa('pessoa', C)
    const { evento: e, aviso } = await salvar(p.gestora, evento({ consultor_id: semGoogle.id, com_meet: true }))
    expect(aviso).toBe(`Fica só no app: ${semGoogle.nome} não conectou o Google.`)
    expect(e).toMatchObject({ com_meet: false, google_evento_id: null })

    // Sem Google, editar também fica só no app (e o Meet continua desligado).
    const ainda = await salvar(p.gestora, { id: e.id, titulo: 'Ainda sem Google', com_meet: true })
    expect(ainda.aviso).toBe(`Fica só no app: ${semGoogle.nome} não conectou o Google.`)
    expect(ainda.evento).toMatchObject({ titulo: 'Ainda sem Google', com_meet: false })

    // Ele conecta o Google; a próxima edição cria o evento no Google dele, com o id que sai do id do app.
    const googleEmail = `g-${crypto.randomUUID()}@gmail.test`
    await gravarTokenDaPessoa(admin, semGoogle.id, {
      refresh_token: google.concederRenovacao(googleEmail, [...ESCOPOS_DA_PESSOA]),
    }, { email: googleEmail, escopos: [...ESCOPOS_DA_PESSOA] })
    const r = await salvar(p.gestora, { id: e.id, titulo: 'Agora no Google', com_meet: true })
    expect(r.aviso).toBeUndefined()
    expect(r.evento).toMatchObject({ titulo: 'Agora no Google', com_meet: true, google_evento_id: idNoGoogle(e.id) })
    expect(r.evento.meet_codigo).toBeTruthy()
    expect(google.evento(googleEmail, idNoGoogle(e.id))).toMatchObject({ summary: 'Agora no Google', status: 'confirmed' })

    // Apagar evento do Google de quem desconectou: sai só do app, com aviso.
    await admin.from('google_pessoas').delete().eq('perfil_id', semGoogle.id)
    expect(await apagar(p.gestora, e.id)).toEqual({
      ok: true,
      aviso: `Saiu só do app: ${semGoogle.nome} não conectou o Google. ` +
        `O evento pode continuar no Google Agenda de ${semGoogle.nome}.`,
    })
    expect(await linha(e.id)).toBeNull()
  })

  it('colega da mesma consultoria, sem convite, não edita nem apaga o evento (nem mandando novo: true)', async () => {
    const { evento: e } = await salvar(p.ana, evento({ participantes: [p.beto.id], convidados: ['contato@cliente.test'] }))
    const antes = google.pedidos.length
    const tentativas = [
      () => salvar(p.edu, { id: e.id, titulo: 'Do colega' }),
      // novo: true com o id do evento dela cai na edição, e a edição recusa
      () => salvar(p.edu, { ...evento({ titulo: 'Do colega', convidados: [] }), id: e.id }),
      () => apagar(p.edu, e.id),
    ]
    for (const tentar of tentativas) {
      expect(await recusa(tentar())).toMatchObject({ status: 404, codigo: 'evento_nao_encontrado' })
    }
    expect(google.pedidos.length).toBe(antes)
    expect(await linha(e.id)).toMatchObject({ titulo: 'Kickoff com o cliente', consultor_id: p.ana.id, criado_por: p.ana.id })
    expect(quemParticipa(await participantes(e.id))).toEqual([p.beto.id, 'contato@cliente.test'].sort())
    expect(google.evento(p.ana.googleEmail, e.google_evento_id)).toMatchObject({
      summary: 'Kickoff com o cliente',
      status: 'confirmed',
    })
  })

  it('apagar com o Google do organizador quebrado ou com o acesso desativado: sai só do app; outra recusa do Google não apaga', async () => {
    const saiu = await pessoa('pessoa', C, { comGoogle: true })
    const criar = async () => (await salvar(p.gestora, evento({ consultor_id: saiu.id, convidados: ['contato@cliente.test'] }))).evento
    const e1 = await criar()
    const e2 = await criar()
    const quebrado = `Saiu só do app: o Google de ${saiu.nome} não aceita mais a conexão. ` +
      `O evento pode continuar no Google Agenda de ${saiu.nome}.`

    // Google fora do ar (5xx): continua recusando (dá para tentar de novo), e nada muda.
    google.falhar({ url: `${EVENTOS}/${e1.google_evento_id}`, metodo: 'DELETE', status: 503 })
    expect(await recusa(apagar(p.gestora, e1.id))).toMatchObject({
      status: 502,
      codigo: 'google_recusou',
      extra: { motivo: 'recusado' },
    })
    expect(await linha(e1.id)).not.toBeNull()

    // A conta do Google dele foi suspensa (invalid_grant): a gestão apaga, sai só do app, com aviso.
    google.revogarConta(saiu.googleEmail)
    expect(await apagar(p.gestora, e1.id)).toEqual({ ok: true, aviso: quebrado })
    expect(await linha(e1.id)).toBeNull()
    expect(await participantes(e1.id)).toEqual([])
    expect(google.evento(saiu.googleEmail, e1.google_evento_id).status).toBe('confirmed')
    const conexao = await admin.from('google_pessoas').select('erro').eq('perfil_id', saiu.id).single()
    expect(conexao.data.erro).toMatch(/Reconecte o Google/)

    // Com a conexão já marcada como quebrada, nem tenta o Google.
    const antes = google.pedidos.length
    expect(await apagar(p.gestora, e2.id)).toEqual({ ok: true, aviso: quebrado })
    expect(await linha(e2.id)).toBeNull()
    expect(google.pedidos.length).toBe(antes)

    // Organizador com o acesso desativado (saiu da consultoria), mesmo com o Google ainda valendo: sai só do app, sem
    // mexer no Google dele.
    const desativado = await pessoa('pessoa', C, { comGoogle: true })
    const { evento: e3 } = await salvar(p.gestora, evento({ consultor_id: desativado.id }))
    const desativar = await admin.from('perfis')
      .update({ ativo: false, desativado_em: new Date().toISOString() }).eq('id', desativado.id)
    if (desativar.error) throw desativar.error
    const antesDoDesativado = google.pedidos.length
    expect(await apagar(p.gestora, e3.id)).toEqual({
      ok: true,
      aviso: `Saiu só do app: o acesso de ${desativado.nome} está desativado. ` +
        `O evento pode continuar no Google Agenda de ${desativado.nome}.`,
    })
    expect(await linha(e3.id)).toBeNull()
    expect(google.pedidos.length).toBe(antesDoDesativado)
    expect(google.evento(desativado.googleEmail, e3.google_evento_id).status).toBe('confirmed')
  })

  it('outra consultoria recusada', async () => {
    const { evento: deD } = await salvar(p.dani, evento({ titulo: 'Reunião da D' }))
    const antes = google.pedidos.length

    const naAgendaDeD = evento({ consultor_id: p.dani.id })
    const erro = await recusa(salvar(p.gestora, naAgendaDeD))
    expect(erro).toMatchObject({ status: 403, codigo: 'sem_permissao' })
    expect(erro.extra.erro).toBe('Você só cria eventos na agenda dos consultores da sua consultoria.')
    expect(await linha(naAgendaDeD.id)).toBeNull()

    // O evento de D: a gestora de C não edita nem apaga (nem fica sabendo que existe).
    for (const tentativa of [salvar(p.gestora, { id: deD.id, titulo: 'Invadido' }), apagar(p.gestora, deD.id)]) {
      expect(await recusa(tentativa)).toMatchObject({ status: 404, codigo: 'evento_nao_encontrado' })
    }
    expect((await linha(deD.id)).titulo).toBe('Reunião da D')

    // Cliente e participante de D num evento de C: as regras do banco recusam antes do Google.
    const clienteDeD = await recusa(salvar(p.central, evento({ consultor_id: p.ana.id, cliente_id: cli.deD })))
    expect(clienteDeD).toMatchObject({ status: 400, codigo: 'cliente_invalido' })
    const participanteDeD = await recusa(salvar(p.ana, evento({ participantes: [p.dani.id] })))
    expect(participanteDeD).toMatchObject({ status: 400, codigo: 'participante_invalido' })
    expect(participanteDeD.extra.erro).toBe('Convide só consultores da consultoria do evento.')
    expect(google.pedidos.length).toBe(antes)
  })

  it('cliente: só um que quem cria vê, e não arquivado', async () => {
    const antes = google.pedidos.length
    const deColega = await recusa(salvar(p.ana, evento({ cliente_id: cli.doBeto })))
    expect(deColega).toMatchObject({ status: 400, codigo: 'cliente_invalido' })
    expect(deColega.extra.erro).toBe('Escolha um cliente que você vê, da consultoria do consultor.')
    const arquivado = await recusa(salvar(p.ana, evento({ cliente_id: cli.arquivado })))
    expect(arquivado).toMatchObject({ status: 400, codigo: 'cliente_arquivado' })
    expect(arquivado.extra.erro).toBe('Cliente arquivado não aceita evento novo.')
    expect(google.pedidos.length).toBe(antes)

    // A gestora vê os clientes de todos os consultores da consultoria.
    const r = await salvar(p.gestora, evento({ consultor_id: p.ana.id, cliente_id: cli.doBeto }))
    expect(r.evento.cliente_id).toBe(cli.doBeto)
  })

  it('Google recusando não deixa linha', async () => {
    // A Agenda recusa (403): nada no banco, e a tela recebe o motivo.
    google.falhar({ url: EVENTOS, metodo: 'POST', status: 403 })
    const recusado = evento({ convidados: ['contato@cliente.test'] })
    const erro = await recusa(salvar(p.caio, recusado))
    expect(erro).toMatchObject({ status: 502, codigo: 'google_recusou' })
    expect(erro.extra).toMatchObject({
      motivo: 'sem_permissao',
      erro: 'O Google não deu permissão para criar o evento no Google Agenda nesta conta.',
    })
    expect(await linha(recusado.id)).toBeNull()

    // O Meet recusa ligar a gravação (403): o evento criado no Google é desfeito, e ninguém chegou a ser convidado.
    google.falhar({ url: 'meet.googleapis.com', status: 403 })
    const comGravacao = evento({ com_meet: true, gravar: true, participantes: [p.beto.id], convidados: ['contato@cliente.test'] })
    const erroDoMeet = await recusa(salvar(p.caio, comGravacao))
    expect(erroDoMeet.extra).toMatchObject({
      motivo: 'sem_permissao',
      erro: 'O Google não deu permissão para ligar a gravação e a transcrição do Meet nesta conta.',
    })
    expect(await linha(comGravacao.id)).toBeNull()
    const desfeito = google.evento(p.caio.googleEmail, idNoGoogle(comGravacao.id))
    expect(desfeito.status).toBe('cancelled')
    expect(desfeito.attendees).toEqual([])

    // Ele desmarca "Gravar e transcrever" e tenta de novo na mesma janela: o mesmo evento do Google volta, com os convites.
    const semGravacao = await salvar(p.caio, { ...comGravacao, gravar: false })
    expect(semGravacao.evento).toMatchObject({ google_evento_id: idNoGoogle(comGravacao.id), com_meet: true, gravar: false })
    const deVolta = google.evento(p.caio.googleEmail, idNoGoogle(comGravacao.id))
    expect(deVolta.status).toBe('confirmed')
    expect(deVolta.attendees.map((a) => a.email).sort()).toEqual([p.beto.email, 'contato@cliente.test'].sort())

    // Token revogado no Google: "Reconecte o Google", a conexão fica marcada e nada muda.
    google.revogarConta(p.caio.googleEmail)
    const revogado = evento()
    const erroDoToken = await recusa(salvar(p.caio, revogado))
    expect(erroDoToken.extra).toMatchObject({
      motivo: 'reconectar',
      erro: 'O Google não aceita mais esta conexão. Reconecte o Google.',
    })
    expect(await linha(revogado.id)).toBeNull()
    const conexao = await admin.from('google_pessoas').select('erro').eq('perfil_id', p.caio.id).single()
    expect(conexao.data.erro).toMatch(/Reconecte o Google/)
    // A gestora, criando na agenda dele, fica sabendo de quem é a conexão.
    const daGestora = await recusa(salvar(p.gestora, evento({ consultor_id: p.caio.id })))
    expect(daGestora.extra.erro).toBe(
      `O Google de ${p.caio.nome} não aceita mais a conexão: ${p.caio.nome} precisa reconectar o Google.`,
    )
  })

  it('21 convidados de fora recusado', async () => {
    const convidados = Array.from({ length: 21 }, (_, i) => `pessoa${i}@cliente.test`)
    const antes = google.pedidos.length
    const demais = evento({ convidados })
    const erro = await recusa(salvar(p.ana, demais))
    expect(erro).toMatchObject({ status: 400, codigo: 'convidados_demais' })
    expect(erro.extra.erro).toBe('No máximo 20 convidados de fora por evento.')
    expect(await linha(demais.id)).toBeNull()

    // E-mail repetido (sem diferenciar maiúsculas) e e-mail inválido também param antes do Google.
    const repetido = await recusa(salvar(p.ana, evento({ convidados: ['ana@cliente.test', 'ANA@cliente.test'] })))
    expect(repetido).toMatchObject({ status: 400, codigo: 'convidado_repetido' })
    const invalido = await recusa(salvar(p.ana, evento({ convidados: ['sem-arroba.cliente.test'] })))
    expect(invalido).toMatchObject({ status: 400, codigo: 'email_invalido' })
    expect(google.pedidos.length).toBe(antes)

    const vinte = await salvar(p.ana, evento({ convidados: convidados.slice(0, 20) }))
    expect(vinte.evento.participantes).toHaveLength(20)
    expect(google.evento(p.ana.googleEmail, vinte.evento.google_evento_id).attendees).toHaveLength(20)
  })

  it('participante responde e não edita', async () => {
    const { evento: e } = await salvar(p.ana, evento({ participantes: [p.beto.id] }))
    expect(await responderNoNucleo(admin, p.beto, e.id, 'confirmou')).toEqual({ ok: true, resposta: 'confirmou' })
    expect(await participantes(e.id)).toEqual([{ perfil_id: p.beto.id, email: null, resposta: 'confirmou' }])

    const antes = google.pedidos.length
    const editar = await recusa(salvar(p.beto, { id: e.id, titulo: 'Mudei o título' }))
    expect(editar).toMatchObject({ status: 403, codigo: 'sem_permissao' })
    expect(editar.extra.erro).toBe('Só quem organiza e a gestão da consultoria editam.')
    expect(await recusa(apagar(p.beto, e.id))).toMatchObject({ status: 403, codigo: 'sem_permissao' })
    expect(google.pedidos.length).toBe(antes)
    expect((await linha(e.id)).titulo).toBe('Kickoff com o cliente')

    // Quem não foi convidado não responde; resposta fora da lista é recusada.
    expect(await recusa(responderNoNucleo(admin, p.edu, e.id, 'confirmou'))).toMatchObject({
      status: 404,
      codigo: 'convite_nao_encontrado',
    })
    expect(await recusa(responderNoNucleo(admin, p.beto, e.id, 'talvez'))).toMatchObject({
      status: 400,
      codigo: 'dados_invalidos',
    })
    expect(await responderNoNucleo(admin, p.beto, e.id, 'recusou')).toEqual({ ok: true, resposta: 'recusou' })

    // A organizadora muda a lista: quem continua guarda a resposta.
    await salvar(p.ana, { id: e.id, participantes: [p.beto.id, p.edu.id] })
    expect((await participantes(e.id)).sort((a, b) => a.resposta.localeCompare(b.resposta))).toEqual([
      { perfil_id: p.edu.id, email: null, resposta: 'pendente' },
      { perfil_id: p.beto.id, email: null, resposta: 'recusou' },
    ])
  })

  it('editar: a gestora muda horário e convidados no Google da organizadora e liga Meet e gravação', async () => {
    const { evento: e } = await salvar(p.ana, evento({ participantes: [p.beto.id], convidados: ['um@cliente.test'] }))
    const r = await salvar(p.gestora, {
      id: e.id,
      titulo: 'Kickoff (novo horário)',
      inicio: '2026-11-20T18:00:00.000Z',
      fim: '2026-11-20T19:30:00.000Z',
      convidados: ['dois@cliente.test'],
      com_meet: true,
      gravar: true,
    })
    expect(r.evento).toMatchObject({
      id: e.id,
      titulo: 'Kickoff (novo horário)',
      consultor_id: p.ana.id,
      criado_por: p.ana.id,
      com_meet: true,
      gravar: true,
      google_evento_id: e.google_evento_id,
    })
    // O que não veio fica: a descrição e os participantes da casa.
    expect(r.evento.descricao).toBe('Pauta: escopo e prazos')
    expect(quemParticipa(r.evento.participantes)).toEqual([p.beto.id, 'dois@cliente.test'].sort())
    const noGoogle = google.evento(p.ana.googleEmail, e.google_evento_id)
    expect(noGoogle.summary).toBe('Kickoff (novo horário)')
    expect(noGoogle.start.dateTime).toBe('2026-11-20T15:00:00-03:00')
    expect(noGoogle.attendees.map((a) => a.email).sort()).toEqual([p.beto.email, 'dois@cliente.test'].sort())
    expect(noGoogle.conferenceData.conferenceId).toBe(r.evento.meet_codigo)
    const espaco = google.espaco(p.ana.googleEmail, r.evento.meet_codigo)
    expect(espaco.config.artifactConfig.recordingConfig.autoRecordingGeneration).toBe('ON')

    // Desligar a gravação desliga no Meet; o Meet não sai pelo app; o consultor do evento não muda.
    expect((await salvar(p.ana, { id: e.id, gravar: false })).evento.gravar).toBe(false)
    expect(espaco.config.artifactConfig.recordingConfig.autoRecordingGeneration).toBe('OFF')
    expect(await recusa(salvar(p.ana, { id: e.id, com_meet: false }))).toMatchObject({ status: 409, codigo: 'meet_fixo' })
    expect(await recusa(salvar(p.gestora, { id: e.id, consultor_id: p.beto.id }))).toMatchObject({
      status: 409,
      codigo: 'consultor_fixo',
    })

    // A gestora apaga: sai do Google da organizadora.
    expect(await apagar(p.gestora, e.id)).toEqual({ ok: true })
    expect(google.evento(p.ana.googleEmail, e.google_evento_id).status).toBe('cancelled')
    expect(await linha(e.id)).toBeNull()
  })

  it('editar com o Google recusando: nada muda no banco nem no Google', async () => {
    const { evento: e } = await salvar(p.ana, evento({ com_meet: true, convidados: ['um@cliente.test'] }))
    const gid = e.google_evento_id
    const espaco = google.espaco(p.ana.googleEmail, e.meet_codigo)

    // Liga a gravação (no Meet, primeiro) e o Google recusa a edição do evento: a gravação volta a ficar desligada.
    google.falhar({ url: `${EVENTOS}/${gid}`, metodo: 'PATCH', status: 503 })
    const erro = await recusa(
      salvar(p.ana, { id: e.id, titulo: 'Outro título', convidados: ['dois@cliente.test'], gravar: true }),
    )
    expect(erro).toMatchObject({ status: 502, codigo: 'google_recusou', extra: { motivo: 'recusado' } })
    expect(await linha(e.id)).toMatchObject({ titulo: 'Kickoff com o cliente', gravar: false })
    expect(quemParticipa(await participantes(e.id))).toEqual(['um@cliente.test'])
    expect(google.evento(p.ana.googleEmail, gid).summary).toBe('Kickoff com o cliente')
    expect(google.evento(p.ana.googleEmail, gid).attendees.map((a) => a.email)).toEqual(['um@cliente.test'])
    expect(espaco.config.artifactConfig.recordingConfig.autoRecordingGeneration).toBe('OFF')
  })

  it('repetir depois de perder a resposta do Google não duplica o evento', async () => {
    const dados = evento({ com_meet: true, convidados: ['contato@cliente.test'] })
    const gid = idNoGoogle(dados.id)
    const eventosAntes = google.eventos(p.ana.googleEmail).length

    // O Google cria, mas a resposta se perde e a leitura pelo id também: a tela recebe o erro, e nada fica no banco.
    google.falhar({ url: EVENTOS, metodo: 'POST', rede: true, depois: true })
    google.falhar({ url: `${EVENTOS}/${gid}`, metodo: 'GET', rede: true })
    const erro = await recusa(salvar(p.ana, dados))
    expect(erro).toMatchObject({ status: 502, codigo: 'google_recusou', extra: { motivo: 'recusado' } })
    expect(await linha(dados.id)).toBeNull()

    // A pessoa tenta de novo (mesma janela, mesmo id): o evento do Google é o mesmo, e agora fica no banco.
    const r = await salvar(p.ana, dados)
    expect(r.evento.google_evento_id).toBe(gid)
    expect(r.evento.meet_codigo).toBe(google.evento(p.ana.googleEmail, gid).conferenceData.conferenceId)
    // E de novo (a resposta da segunda também se perdeu, digamos): só atualiza.
    const outra = await salvar(p.ana, dados)
    expect(outra.evento).toMatchObject({ id: dados.id, google_evento_id: gid, criado_por: p.ana.id })
    expect(google.eventos(p.ana.googleEmail).length).toBe(eventosAntes + 1)
    expect(await participantes(dados.id)).toEqual([{ perfil_id: null, email: 'contato@cliente.test', resposta: 'pendente' }])
  })

  it('apagar cancela no Google e mantém a pasta', async () => {
    const { evento: e } = await salvar(
      p.ana,
      evento({ cliente_id: cli.daAna, com_meet: true, participantes: [p.beto.id], convidados: ['contato@cliente.test'] }),
    )
    const { data: pasta, error } = await admin
      .from('cliente_pastas')
      .insert({ cliente_id: cli.daAna, nome: `Reunião 20/11/2026 14:00 — ${crypto.randomUUID().slice(0, 8)}`, evento_id: e.id })
      .select('id')
      .single()
    if (error) throw error
    const ligada = await admin.from('agenda_eventos').update({ pasta_id: pasta.id }).eq('id', e.id)
    if (ligada.error) throw ligada.error

    expect(await apagar(p.ana, e.id)).toEqual({ ok: true })
    const cancelamento = google.pedidosPara(`${EVENTOS}/${e.google_evento_id}`).at(-1)
    expect(cancelamento).toMatchObject({ metodo: 'DELETE', busca: { sendUpdates: 'all' } })
    expect(google.evento(p.ana.googleEmail, e.google_evento_id).status).toBe('cancelled')
    expect(await linha(e.id)).toBeNull()
    expect(await participantes(e.id)).toEqual([])
    const ficou = await admin.from('cliente_pastas').select('id, evento_id').eq('id', pasta.id).single()
    expect(ficou.data).toEqual({ id: pasta.id, evento_id: null })

    // Evento que ficou só no app sai só do app; o que não existe mais é 404.
    const { evento: soNoApp } = await salvar(p.gestora, evento({ consultor_id: p.beto.id }))
    expect(await apagar(p.gestora, soNoApp.id)).toEqual({ ok: true })
    expect(await recusa(apagar(p.gestora, soNoApp.id))).toMatchObject({ status: 404, codigo: 'evento_nao_encontrado' })
  })

  it('dados inválidos e regras do banco, com a mensagem em português', async () => {
    const antes = google.pedidos.length
    const casos = [
      [evento({ titulo: '   ' }), 'dados_invalidos', { campo: 'titulo' }],
      [evento({ inicio: 'ontem' }), 'dados_invalidos', { campo: 'inicio' }],
      [evento({ cor: 9 }), 'dados_invalidos', { campo: 'cor' }],
      [evento({ participantes: ['nao-e-uuid'] }), 'dados_invalidos', { campo: 'participantes' }],
      [evento({ fim: '2026-11-20T16:00:00.000Z' }), 'fim_antes_do_inicio', { erro: 'O fim precisa ser depois do início.' }],
      [evento({ fim: '2026-12-25T18:00:00.000Z' }), 'evento_longo_demais', { erro: 'Um evento dura no máximo 31 dias.' }],
      [{ id: crypto.randomUUID(), titulo: 'Sem o novo' }, 'evento_nao_encontrado', { erro: 'Este evento não existe mais.' }],
    ]
    for (const [dados, codigo, extra] of casos) {
      const erro = await recusa(salvar(p.ana, dados))
      expect(erro, codigo).toMatchObject({ codigo, extra })
      expect(erro.extra.erro, codigo).toBeTruthy()
    }
    expect(google.pedidos.length).toBe(antes)
  })
})

// A função de verdade no Supabase local, chamada pelas funções de src/data/agenda.js. No local o app do Google não está
// configurado: quem conectou o Google recebe a recusa do Google, e nada fica no banco. Se a função não estiver no
// runtime ("Function not found", 404), recrie-o com npx supabase stop && npx supabase start (os dados ficam):
// `npm run functions:reiniciar` só recarrega o código.
describe('Edge Function agenda (no ar)', () => {
  const v = {}
  const sessoesVivas = {}
  const quando = { inicio: '2026-11-24T13:00:00.000Z', fim: '2026-11-24T14:00:00.000Z' }
  const como = (nome) => {
    atual.cliente = sessoesVivas[nome]
  }

  beforeAll(async () => {
    const E = await criarConsultoriaDeTeste()
    v.luiza = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: E })
    v.marcos = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: E })
    v.nina = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: E })
    v.gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: E })
    // A Nina conectou o Google (token falso no Vault); sem o app do Google na plataforma, a função não consegue usá-lo.
    await gravarTokenDaPessoa(admin, v.nina.id, { refresh_token: '1//falso-nao-vale' }, {
      email: `nina-${crypto.randomUUID()}@gmail.test`,
      escopos: [...ESCOPOS_DA_PESSOA],
    })
    for (const nome of Object.keys(v)) sessoesVivas[nome] = await entrarComo(v[nome])
  })

  it('sem login: 401', async () => {
    expect((await chamarFuncao(null, 'agenda', { acao: 'salvar', evento: {} })).status).toBe(401)
  })

  it('consultor cria na própria agenda (sem Google: só no app, com aviso) e não na de colega', async () => {
    como('luiza')
    const id = novoIdDeEvento()
    const r = await salvarEvento({
      id,
      novo: true,
      titulo: 'Alinhamento',
      ...quando,
      com_meet: true,
      participantes: [v.marcos.id],
      convidados: ['contato@cliente.test'],
    })
    expect(r.erro).toBeNull()
    expect(r.aviso).toBe('Fica só no app: Teste pessoa não conectou o Google.')
    expect(r.evento).toMatchObject({ id, consultor_id: v.luiza.id, com_meet: false, google_evento_id: null })
    expect(r.evento.participantes).toHaveLength(2)

    const naDoColega = await salvarEvento({ id: novoIdDeEvento(), novo: true, consultor_id: v.marcos.id, titulo: 'X', ...quando })
    expect(naDoColega).toEqual({ erro: 'Você só cria eventos na sua própria agenda.', campo: null })
  })

  it('participante responde e não edita; quem organiza edita e apaga', async () => {
    como('luiza')
    const { evento: e } = await salvarEvento({ id: novoIdDeEvento(), novo: true, titulo: 'Revisão', ...quando, participantes: [v.marcos.id] })
    como('marcos')
    expect(await responderConvite(e.id, 'confirmou')).toEqual({ erro: null, resposta: 'confirmou' })
    expect((await buscarEvento(e.id)).participantes[0].resposta).toBe('confirmou')
    expect((await salvarEvento({ id: e.id, titulo: 'Mudei' })).erro).toBe('Só quem organiza e a gestão da consultoria editam.')
    expect((await apagarEvento(e.id)).erro).toBe('Só quem organiza e a gestão da consultoria editam.')
    como('luiza')
    expect((await salvarEvento({ id: e.id, titulo: 'Revisão (nova)' })).evento.titulo).toBe('Revisão (nova)')
    expect(await apagarEvento(e.id)).toEqual({ erro: null, aviso: null })
    expect(await buscarEvento(e.id)).toBeNull()
  })

  it('gestor cria na agenda de quem conectou o Google, e o Google recusa: nada fica no banco', async () => {
    como('gestor')
    const id = novoIdDeEvento()
    const r = await salvarEvento({ id, novo: true, consultor_id: v.nina.id, titulo: 'Com o Google da Nina', ...quando })
    expect(r.erro).toBe('Falta configurar o app do Google na plataforma (veja o README).')
    expect((await admin.from('agenda_eventos').select('id').eq('id', id)).data).toEqual([])
  })

  it('dados inválidos, regra do banco e ação desconhecida: 400', async () => {
    como('luiza')
    const semTitulo = await salvarEvento({ id: novoIdDeEvento(), novo: true, titulo: '  ', ...quando })
    expect(semTitulo.campo).toBe('titulo')
    expect(semTitulo.erro).toBeTruthy()
    const fimAntes = await salvarEvento({ id: novoIdDeEvento(), novo: true, titulo: 'X', inicio: quando.fim, fim: quando.inicio })
    expect(fimAntes.erro).toBe('O fim precisa ser depois do início.')
    const outra = await chamarFuncao(sessoesVivas.luiza, 'agenda', { acao: 'outra' })
    expect(outra.status).toBe(400)
    expect(outra.corpo.codigo).toBe('dados_invalidos')
  })
})
