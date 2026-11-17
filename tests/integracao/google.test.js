// Cliente do Google de cada pessoa (Agenda e Meet) contra o Google falso, e o token da pessoa no Vault do
// Supabase local. Nenhum pedido sai para o Google de verdade.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarGoogleFalso } from '../../supabase/functions/_shared/agenda/google-falso.ts'
import { criarGoogle, ErroDoGoogle, ESCOPOS_DA_PESSOA } from '../../supabase/functions/_shared/agenda/google.ts'
import {
  criarGoogleDe,
  gravarTokenDaPessoa,
  lerTokenDaPessoa,
  tokensDaPessoa,
} from '../../supabase/functions/_shared/agenda/tokens.ts'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo } from './ambiente.js'

const admin = clienteAdmin()
const EMAIL = 'consultora@empresa.test'
const FUSO = 'America/Sao_Paulo'
const EVENTOS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

// Cliente com um token de renovação válido no Google falso, sem banco: obterToken troca o de renovação por um de
// acesso (como tokens.ts) e guarda cada chamada; aoReconectar guarda os avisos.
function clienteDireto(google, { escopos = ESCOPOS_DA_PESSOA } = {}) {
  const renovacao = google.concederRenovacao(EMAIL, escopos)
  const chamadas = []
  const reconexoes = []
  let acesso = null
  const obterToken = async (opcoes = {}) => {
    chamadas.push(opcoes)
    if (acesso && !opcoes.renovar) return acesso
    const resposta = await google.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: google.cliente.id, client_secret: google.cliente.segredo, refresh_token: renovacao, grant_type: 'refresh_token',
      }),
    })
    acesso = (await resposta.json()).access_token
    return acesso
  }
  const cliente = criarGoogle({ fetch: google.fetch, obterToken, aoReconectar: (mensagem) => reconexoes.push(mensagem) })
  return { cliente, chamadas, reconexoes }
}

const REUNIAO = {
  titulo: 'Kickoff com o cliente',
  descricao: 'Pauta: escopo e prazos',
  inicio: '2026-11-20T17:00:00.000Z', // 14:00 em São Paulo
  fim: '2026-11-20T18:30:00.000Z',
}

describe('Google Agenda', () => {
  it('criar com Meet manda o fuso de São Paulo, os convidados, sendUpdates=all e conferenceData; devolve o Meet', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const r = await cliente.criarEvento(REUNIAO, { meet: true, convidados: ['ana@cliente.test', 'BRUNO@cliente.test', 'ana@cliente.test'] })

    const [pedido] = google.pedidosPara(EVENTOS)
    expect(pedido.metodo).toBe('POST')
    expect(pedido.busca).toEqual({ conferenceDataVersion: '1', sendUpdates: 'all' })
    expect(pedido.token).toMatch(/^ya29\./)
    expect(pedido.corpo).toMatchObject({
      summary: 'Kickoff com o cliente',
      description: 'Pauta: escopo e prazos',
      start: { dateTime: '2026-11-20T14:00:00-03:00', timeZone: FUSO },
      end: { dateTime: '2026-11-20T15:30:00-03:00', timeZone: FUSO },
      attendees: [{ email: 'ana@cliente.test' }, { email: 'bruno@cliente.test' }],
    })
    expect(pedido.corpo.conferenceData.createRequest.conferenceSolutionKey).toEqual({ type: 'hangoutsMeet' })
    expect(pedido.corpo.conferenceData.createRequest.requestId).toBeTruthy()

    expect(r.meetCodigo).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
    expect(r.meetLink).toBe(`https://meet.google.com/${r.meetCodigo}`)
    expect(google.evento(EMAIL, r.googleEventoId).summary).toBe('Kickoff com o cliente')
  })

  it('sem Meet não pede conferência; dia inteiro vai como data, com o fim exclusivo', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    // dia 20 inteiro em São Paulo: 00:00 do 20 até 00:00 do 21
    const r = await cliente.criarEvento(
      { titulo: 'Folga', inicio: '2026-11-20T03:00:00.000Z', fim: '2026-11-21T03:00:00.000Z', dia_inteiro: true },
      { meet: false },
    )
    const [pedido] = google.pedidosPara(EVENTOS)
    expect(pedido.corpo.start).toEqual({ date: '2026-11-20', timeZone: FUSO })
    expect(pedido.corpo.end).toEqual({ date: '2026-11-21', timeZone: FUSO })
    expect(pedido.corpo.conferenceData).toBeUndefined()
    expect(pedido.busca.sendUpdates).toBe('all')
    expect(r).toEqual({ googleEventoId: expect.any(String), meetLink: null, meetCodigo: null })

    // fim guardado como 23:59 do mesmo dia também fecha no dia seguinte (exclusivo), e dois dias seguidos ficam inteiros
    await cliente.criarEvento({ titulo: 'Viagem', inicio: '2026-11-20T03:00:00.000Z', fim: '2026-11-22T02:59:00.000Z', dia_inteiro: true })
    const segundo = google.pedidosPara(EVENTOS).at(-1)
    expect(segundo.corpo.start.date).toBe('2026-11-20')
    expect(segundo.corpo.end.date).toBe('2026-11-22')
  })

  it('evento que atravessa a meia-noite leva as horas de São Paulo dos dois dias', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    await cliente.criarEvento({ titulo: 'Virada', inicio: '2026-11-21T01:30:00.000Z', fim: '2026-11-21T04:00:00.000Z' })
    const [pedido] = google.pedidosPara(EVENTOS)
    expect(pedido.corpo.start.dateTime).toBe('2026-11-20T22:30:00-03:00')
    expect(pedido.corpo.end.dateTime).toBe('2026-11-21T01:00:00-03:00')
  })

  it('editar faz PATCH com fuso e sendUpdates=all; convidados novos trocam a lista, sem convidados ela fica', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { googleEventoId } = await cliente.criarEvento(REUNIAO, { meet: true, convidados: ['ana@cliente.test'] })

    await cliente.editarEvento(googleEventoId, { ...REUNIAO, titulo: 'Kickoff (novo horário)', inicio: '2026-11-20T18:00:00.000Z', fim: '2026-11-20T19:00:00.000Z' },
      { convidados: ['carla@cliente.test'] })
    const edicao = google.pedidosPara(`${EVENTOS}/${googleEventoId}`).at(-1)
    expect(edicao.metodo).toBe('PATCH')
    expect(edicao.busca).toMatchObject({ sendUpdates: 'all', conferenceDataVersion: '1' })
    expect(edicao.corpo).toMatchObject({
      summary: 'Kickoff (novo horário)',
      start: { dateTime: '2026-11-20T15:00:00-03:00', timeZone: FUSO },
      end: { dateTime: '2026-11-20T16:00:00-03:00', timeZone: FUSO },
      attendees: [{ email: 'carla@cliente.test' }],
    })
    expect(google.evento(EMAIL, googleEventoId).attendees.map((a) => a.email)).toEqual(['carla@cliente.test'])

    await cliente.editarEvento(googleEventoId, { ...REUNIAO, titulo: 'Só o título' })
    const semConvidados = google.pedidosPara(`${EVENTOS}/${googleEventoId}`).at(-1)
    expect(semConvidados.corpo).not.toHaveProperty('attendees')
    expect(google.evento(EMAIL, googleEventoId).attendees.map((a) => a.email)).toEqual(['carla@cliente.test'])
  })

  it('apagar cancela no Google avisando os convidados; evento que já não existe não é erro', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { googleEventoId } = await cliente.criarEvento(REUNIAO, { convidados: ['ana@cliente.test'] })
    await cliente.apagarEvento(googleEventoId)
    const pedido = google.pedidosPara(`${EVENTOS}/${googleEventoId}`).at(-1)
    expect(pedido.metodo).toBe('DELETE')
    expect(pedido.busca.sendUpdates).toBe('all')
    expect(google.evento(EMAIL, googleEventoId).status).toBe('cancelled')

    await expect(cliente.apagarEvento(googleEventoId)).resolves.toBeUndefined() // 410 do Google
    await expect(cliente.apagarEvento('naoexiste123')).resolves.toBeUndefined() // 404 do Google
  })

  it('criar com o id escolhido pelo app: repetir não duplica (o 409 vira o mesmo evento, atualizado)', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const id = '0f8e2c4a9b7d4e1f8a3c5b6d7e8f9a0b'
    const r = await cliente.criarEvento(REUNIAO, { id, meet: true, convidados: ['ana@cliente.test'] })
    expect(r.googleEventoId).toBe(id)
    expect(google.pedidosPara(EVENTOS).at(-1).corpo.id).toBe(id)

    const outra = await cliente.criarEvento({ ...REUNIAO, titulo: 'Kickoff (de novo)' }, { id, meet: true, convidados: ['ana@cliente.test'] })
    expect(outra).toEqual(r)
    expect(google.eventos(EMAIL).filter((e) => e.id === id)).toHaveLength(1)
    expect(google.evento(EMAIL, id).summary).toBe('Kickoff (de novo)')
    expect(google.pedidosPara(`${EVENTOS}/${id}`).map((p) => p.metodo)).toEqual(['GET', 'PATCH'])

    // Uma tentativa anterior foi desfeita (o evento foi apagado no Google, que guarda o id): criar de novo com o mesmo
    // id restaura aquele evento, com os dados de agora, sem criar outro.
    await cliente.apagarEvento(id)
    const restaurado = await cliente.criarEvento({ ...REUNIAO, titulo: 'Kickoff (outra tentativa)' }, { id, convidados: ['bia@cliente.test'] })
    expect(restaurado.googleEventoId).toBe(id)
    expect(google.evento(EMAIL, id)).toMatchObject({ status: 'confirmed', summary: 'Kickoff (outra tentativa)' })
    expect(google.evento(EMAIL, id).attendees.map((a) => a.email)).toEqual(['bia@cliente.test'])
    expect(google.eventos(EMAIL)).toHaveLength(1)

    // id fora do formato do Google não chega a sair
    await expect(cliente.criarEvento(REUNIAO, { id: 'Com-Hifen' })).rejects.toMatchObject({ codigo: 'recusado' })
  })

  it('resposta perdida depois de o Google criar: lê o evento pelo id e segue, sem duplicar', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const id = '1a2b3c4d5e6f40718293a4b5c6d7e8f9'
    google.falhar({ url: EVENTOS, metodo: 'POST', rede: true, depois: true })
    const r = await cliente.criarEvento(REUNIAO, { id, meet: true })
    expect(r.googleEventoId).toBe(id)
    expect(r.meetCodigo).toBeTruthy()
    expect(google.eventos(EMAIL)).toHaveLength(1)

    // sem o id escolhido, a queda de rede é erro (não há como saber se criou)
    google.falhar({ url: EVENTOS, metodo: 'POST', rede: true })
    await expect(cliente.criarEvento(REUNIAO)).rejects.toMatchObject({ codigo: 'recusado' })
  })

  it('tempo esgotado cancela o pedido ao Google (AbortController)', async () => {
    let sinal = null
    const nuncaResponde = (_url, init) => {
      sinal = init.signal
      return new Promise(() => {})
    }
    const cliente = criarGoogle({ fetch: nuncaResponde, obterToken: async () => 'ya29.qualquer', limiteMs: 20 })
    await expect(cliente.criarEvento(REUNIAO)).rejects.toMatchObject({ codigo: 'recusado' })
    expect(sinal).toBeInstanceOf(AbortSignal)
    expect(sinal.aborted).toBe(true)
  })
})

describe('Google Meet', () => {
  it('ligar a gravação acha o espaço pelo código e liga gravação e transcrição automáticas', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { meetCodigo } = await cliente.criarEvento(REUNIAO, { meet: true })
    const espaco = google.espaco(EMAIL, meetCodigo)

    await cliente.ligarGravacao(meetCodigo)
    const [busca, mudanca] = google.pedidosPara('meet.googleapis.com')
    expect(busca.metodo).toBe('GET')
    expect(busca.caminho).toBe(`/v2/spaces/${meetCodigo}`)
    expect(mudanca.metodo).toBe('PATCH')
    expect(mudanca.caminho).toBe(`/v2/${espaco.name}`)
    expect(mudanca.busca.updateMask.split(',').sort()).toEqual([
      'config.artifactConfig.recordingConfig.autoRecordingGeneration',
      'config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration',
    ])
    expect(espaco.config.artifactConfig).toEqual({
      recordingConfig: { autoRecordingGeneration: 'ON' },
      transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
    })

    // desligar (o evento foi editado sem "Gravar e transcrever")
    await cliente.ligarGravacao(meetCodigo, { ligar: false })
    expect(espaco.config.artifactConfig).toEqual({
      recordingConfig: { autoRecordingGeneration: 'OFF' },
      transcriptionConfig: { autoTranscriptionGeneration: 'OFF' },
    })
  })

  it('sem conferência ainda: não terminou e não há transcrição', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { meetCodigo } = await cliente.criarEvento(REUNIAO, { meet: true })
    const r = await cliente.artefatosDaReuniao(meetCodigo)
    expect(r).toMatchObject({ terminou: false, fim: null, gravacaoUrl: null, transcricao: 'nenhuma', falas: [] })
    const [lista] = google.pedidosPara('/v2/conferenceRecords')
    expect(lista.busca.filter).toBe(`space.meeting_code = "${meetCodigo}"`)
  })

  it('em andamento ou com a transcrição sendo gerada: processando, sem falas', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { meetCodigo } = await cliente.criarEvento(REUNIAO, { meet: true })
    google.registrarConferencia(EMAIL, meetCodigo, { inicio: '2026-11-20T17:01:00Z', transcricoes: [{ estado: 'STARTED' }] })
    expect(await cliente.artefatosDaReuniao(meetCodigo)).toMatchObject({ terminou: false, transcricao: 'processando', falas: [] })

    const outro = await cliente.criarEvento(REUNIAO, { meet: true })
    google.registrarConferencia(EMAIL, outro.meetCodigo, {
      inicio: '2026-11-20T17:01:00Z', fim: '2026-11-20T18:20:00Z', transcricoes: [{ estado: 'ENDED' }],
      gravacoes: [{ estado: 'ENDED' }],
    })
    expect(await cliente.artefatosDaReuniao(outro.meetCodigo)).toMatchObject({
      terminou: true, fim: '2026-11-20T18:20:00Z', transcricao: 'processando', gravacaoUrl: null, falas: [],
    })
  })

  it('transcrição pronta: falas em ordem de hora, com o nome de cada pessoa, e o link da gravação', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { meetCodigo } = await cliente.criarEvento(REUNIAO, { meet: true })
    // 120 falas na primeira transcrição (mais de uma página) e uma segunda transcrição intercalada no tempo
    const muitas = Array.from({ length: 120 }, (_, i) => ({
      participante: 'p1', inicio: new Date(Date.parse('2026-11-20T17:30:00Z') + i * 10_000).toISOString(), texto: `Fala ${i}`,
    }))
    google.registrarConferencia(EMAIL, meetCodigo, {
      inicio: '2026-11-20T17:00:00Z',
      fim: '2026-11-20T18:25:00Z',
      participantes: [
        { id: 'p1', nome: 'Ana Consultora' },
        { id: 'p2', nome: 'Visitante', tipo: 'anonymousUser' },
        { id: 'p3', nome: '+55 11 9****-1234', tipo: 'phoneUser' },
      ],
      gravacoes: [{ estado: 'FILE_GENERATED', link: 'https://drive.google.com/file/d/gravacao/view' }],
      transcricoes: [
        {
          estado: 'FILE_GENERATED',
          falas: [
            { participante: 'p2', inicio: '2026-11-20T17:05:00Z', texto: 'Segunda fala' },
            { participante: 'p1', inicio: '2026-11-20T17:02:00Z', texto: 'Bom dia a todos' },
            ...muitas,
          ],
        },
        { estado: 'FILE_GENERATED', inicio: '2026-11-20T17:03:00Z', falas: [{ participante: 'p3', inicio: '2026-11-20T17:03:30Z', texto: 'Pelo telefone' }] },
      ],
    })

    const r = await cliente.artefatosDaReuniao(meetCodigo)
    expect(r.terminou).toBe(true)
    expect(r.fim).toBe('2026-11-20T18:25:00Z')
    expect(r.transcricao).toBe('pronta')
    expect(r.gravacaoUrl).toBe('https://drive.google.com/file/d/gravacao/view')
    expect(r.falas).toHaveLength(123)
    expect(r.falas.slice(0, 3)).toEqual([
      { hora: '2026-11-20T17:02:00Z', nome: 'Ana Consultora', texto: 'Bom dia a todos' },
      { hora: '2026-11-20T17:03:30Z', nome: '+55 11 9****-1234', texto: 'Pelo telefone' },
      { hora: '2026-11-20T17:05:00Z', nome: 'Visitante', texto: 'Segunda fala' },
    ])
    expect(r.falas.at(-1).texto).toBe('Fala 119')
    const horas = r.falas.map((f) => Date.parse(f.hora))
    expect(horas).toEqual([...horas].sort((a, b) => a - b))
    // as páginas foram pedidas (nada de ler só a primeira)
    expect(google.pedidosPara(/transcripts\/t0\/entries/).length).toBeGreaterThan(1)
  })

  it('ninguém gravou nem transcreveu: transcrição nenhuma e sem link', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { meetCodigo } = await cliente.criarEvento(REUNIAO, { meet: true })
    google.registrarConferencia(EMAIL, meetCodigo, { inicio: '2026-11-20T17:00:00Z', fim: '2026-11-20T17:40:00Z' })
    expect(await cliente.artefatosDaReuniao(meetCodigo)).toMatchObject({
      terminou: true, transcricao: 'nenhuma', gravacaoUrl: null, falas: [],
    })
  })
})

describe('Erros do Google', () => {
  it('401 renova o token uma vez e repete o pedido', async () => {
    const google = criarGoogleFalso()
    const { cliente, chamadas, reconexoes } = clienteDireto(google)
    google.falhar({ url: '/calendar/v3/', status: 401 })
    const r = await cliente.criarEvento(REUNIAO)
    expect(r.googleEventoId).toBeTruthy()
    expect(chamadas).toContainEqual({ renovar: true })
    expect(google.pedidosPara(EVENTOS).filter((p) => p.metodo === 'POST')).toHaveLength(2)
    expect(reconexoes).toEqual([])
  })

  it('401 de novo depois de renovar vira "reconectar" e avisa', async () => {
    const google = criarGoogleFalso()
    const { cliente, reconexoes } = clienteDireto(google)
    google.falhar({ url: '/calendar/v3/', status: 401, vezes: 2 })
    const erro = await cliente.criarEvento(REUNIAO).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroDoGoogle)
    expect(erro.codigo).toBe('reconectar')
    expect(erro.message).toMatch(/Reconecte o Google/)
    expect(reconexoes).toHaveLength(1)
  })

  it('403 vira "sem_permissao" com a mensagem em português; escopo faltando no token também', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    const { meetCodigo } = await cliente.criarEvento(REUNIAO, { meet: true })
    google.falhar({ url: 'meet.googleapis.com', status: 403 })
    const erro = await cliente.ligarGravacao(meetCodigo).catch((e) => e)
    expect(erro).toMatchObject({ codigo: 'sem_permissao' })
    expect(erro.message).toMatch(/permissão/)

    const semMeet = clienteDireto(google, { escopos: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'] })
    await expect(semMeet.cliente.artefatosDaReuniao(meetCodigo)).rejects.toMatchObject({ codigo: 'sem_permissao' })
  })

  it('Google fora do ar, limite de pedidos ou rede caída viram "recusado"', async () => {
    const google = criarGoogleFalso()
    const { cliente } = clienteDireto(google)
    google.falhar({ url: '/calendar/v3/', status: 503 })
    await expect(cliente.criarEvento(REUNIAO)).rejects.toMatchObject({ codigo: 'recusado', message: expect.stringMatching(/Google/) })
    google.falhar({ url: '/calendar/v3/', status: 429 })
    await expect(cliente.criarEvento(REUNIAO)).rejects.toMatchObject({ codigo: 'recusado' })
    google.falhar({ url: '/calendar/v3/', status: 403, erro: 'rateLimitExceeded' })
    await expect(cliente.criarEvento(REUNIAO)).rejects.toMatchObject({ codigo: 'recusado' })
    google.falhar({ url: '/calendar/v3/', rede: true })
    await expect(cliente.criarEvento(REUNIAO)).rejects.toMatchObject({ codigo: 'recusado' })
  })
})

describe('Token da pessoa no Vault', () => {
  let consultoria
  const google = criarGoogleFalso()
  const APP = { id: google.cliente.id, segredo: google.cliente.segredo, volta: 'http://localhost:5173/calendario' }

  // Pessoa nova com o Google conectado (token de renovação válido no Google falso).
  async function pessoaConectada(email = `consultor-${crypto.randomUUID()}@gmail.test`) {
    const pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
    const renovacao = google.concederRenovacao(email, [...ESCOPOS_DA_PESSOA])
    await gravarTokenDaPessoa(admin, pessoa.id, { refresh_token: renovacao }, { email, escopos: [...ESCOPOS_DA_PESSOA] })
    return { ...pessoa, googleEmail: email, renovacao }
  }
  const linha = async (id) => (await admin.from('google_pessoas').select('email, erro').eq('perfil_id', id).maybeSingle()).data
  const renovacoes = () => google.pedidosPara('oauth2.googleapis.com/token').length

  beforeAll(async () => {
    consultoria = await criarConsultoriaDeTeste()
  })
  afterAll(limparTudo)

  it('renova uma vez e reaproveita o token de acesso (guardado no Vault) até perto de vencer', async () => {
    const pessoa = await pessoaConectada()
    const antes = renovacoes()
    const tokens = tokensDaPessoa({ banco: admin, perfilId: pessoa.id, app: APP, fetch: google.fetch, agora: google.agora })
    const primeiro = await tokens.obterToken()
    expect(await tokens.obterToken()).toBe(primeiro)
    expect(renovacoes() - antes).toBe(1)
    expect(await lerTokenDaPessoa(admin, pessoa.id)).toMatchObject({ refresh_token: pessoa.renovacao, access_token: primeiro })

    // outra execução da função lê o do Vault, sem renovar
    const outra = tokensDaPessoa({ banco: admin, perfilId: pessoa.id, app: APP, fetch: google.fetch, agora: google.agora })
    expect(await outra.obterToken()).toBe(primeiro)
    expect(renovacoes() - antes).toBe(1)

    google.avancar(60 * 60_000)
    const depois = await outra.obterToken()
    expect(depois).not.toBe(primeiro)
    expect(renovacoes() - antes).toBe(2)
    expect((await lerTokenDaPessoa(admin, pessoa.id)).access_token).toBe(depois)
  })

  it('token revogado no Google (invalid_grant) vira "reconectar" e marca google_pessoas.erro', async () => {
    const pessoa = await pessoaConectada()
    google.revogarConta(pessoa.googleEmail)
    const tokens = tokensDaPessoa({ banco: admin, perfilId: pessoa.id, app: APP, fetch: google.fetch, agora: google.agora })
    const erro = await tokens.obterToken().catch((e) => e)
    expect(erro).toBeInstanceOf(ErroDoGoogle)
    expect(erro.codigo).toBe('reconectar')
    expect((await linha(pessoa.id)).erro).toMatch(/Reconecte o Google/)
  })

  it('o cliente do organizador: null para quem não conectou; 401 depois de renovar marca o erro', async () => {
    const googleDe = criarGoogleDe({ banco: admin, app: APP, fetch: google.fetch, agora: google.agora })
    const semGoogle = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
    expect(await googleDe(semGoogle.id)).toBeNull()

    const pessoa = await pessoaConectada()
    const cliente = await googleDe(pessoa.id)
    const { googleEventoId } = await cliente.criarEvento(REUNIAO, { meet: true })
    expect(google.evento(pessoa.googleEmail, googleEventoId)).toBeTruthy()
    expect((await linha(pessoa.id)).erro).toBeNull()

    google.falhar({ url: '/calendar/v3/', status: 401, vezes: 2 })
    await expect(cliente.apagarEvento(googleEventoId)).rejects.toMatchObject({ codigo: 'reconectar' })
    expect((await linha(pessoa.id)).erro).toMatch(/Reconecte o Google/)
  })

  it('sem o app do Google configurado: "recusado", sem marcar a conexão da pessoa', async () => {
    const pessoa = await pessoaConectada()
    const tokens = tokensDaPessoa({ banco: admin, perfilId: pessoa.id, app: null, fetch: google.fetch, agora: google.agora })
    await expect(tokens.obterToken()).rejects.toMatchObject({ codigo: 'recusado' })
    expect((await linha(pessoa.id)).erro).toBeNull()
  })

  it('o navegador não lê nem grava o token pelas funções do Vault', async () => {
    const pessoa = await pessoaConectada()
    const comoPessoa = await entrarComo(pessoa)
    const ler = await comoPessoa.rpc('ler_token_da_pessoa', { p_perfil: pessoa.id })
    expect(ler.error).not.toBeNull()
    expect(JSON.stringify(ler.data ?? '')).not.toContain(pessoa.renovacao)
    const gravar = await comoPessoa.rpc('gravar_token_da_pessoa', {
      p_perfil: pessoa.id, p_segredo: '{"refresh_token":"x"}', p_email: null, p_escopos: null,
    })
    expect(gravar.error).not.toBeNull()
    expect((await lerTokenDaPessoa(admin, pessoa.id)).refresh_token).toBe(pessoa.renovacao)
  })
})
