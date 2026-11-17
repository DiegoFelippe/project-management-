// Cliente do Google de uma pessoa: Agenda (Calendar API v3, agenda "primary") e Meet (Meet REST API v2).
// Sem imports do Deno: recebe o `fetch` e um `obterToken()` (tokens.ts lê e renova o token da pessoa no Vault;
// os testes passam o Google falso de google-falso.ts). Todo erro do Google vira ErroDoGoogle, com a mensagem em
// português para a tela.
import { type Buscar, comLimite } from '../google-oauth.ts'

// Escopos que a pessoa autoriza no "Conectar Google" (desenho do Calendário, "Google — conta de cada consultor").
export const ESCOPOS_DA_PESSOA = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://www.googleapis.com/auth/meetings.space.readonly',
]

export const FUSO = 'America/Sao_Paulo'

// O Google devolve alguns escopos pelo nome longo.
const NOME_CURTO: Record<string, string> = {
  'https://www.googleapis.com/auth/userinfo.email': 'email',
  'https://www.googleapis.com/auth/userinfo.profile': 'profile',
}

// Escopos concedidos (o campo `scope` da resposta de token, separado por espaço), com os nomes curtos.
export function escoposConcedidos(scope: unknown): string[] {
  if (typeof scope !== 'string') return []
  return [...new Set(scope.split(/\s+/).filter(Boolean).map((e) => NOME_CURTO[e] ?? e))]
}

export function escoposQueFaltam(concedidos: string[]): string[] {
  return ESCOPOS_DA_PESSOA.filter((e) => !concedidos.includes(e))
}

export type CodigoDoErro = 'reconectar' | 'sem_permissao' | 'recusado'

// reconectar: o Google não aceita mais a conexão (a pessoa precisa conectar de novo);
// sem_permissao: a conta não deixa (escopo, Workspace sem gravação, agenda de outro);
// recusado: o resto (Google fora do ar, limite de pedidos, rede, pedido recusado).
export class ErroDoGoogle extends Error {
  codigo: CodigoDoErro
  status: number | null

  constructor(codigo: CodigoDoErro, mensagem: string, status: number | null = null) {
    super(mensagem)
    this.name = 'ErroDoGoogle'
    this.codigo = codigo
    this.status = status
  }
}

export const MENSAGEM_RECONECTAR = 'O Google não aceita mais esta conexão. Reconecte o Google.'

// O evento como o app guarda (agenda_eventos): instantes ISO; dia inteiro vai como data no fuso de São Paulo.
export type EventoParaOGoogle = {
  titulo: string
  descricao?: string | null
  inicio: string
  fim: string
  dia_inteiro?: boolean
}

export type ObterToken = (opcoes?: { renovar?: boolean }) => Promise<string>

export type OpcoesDoGoogle = {
  fetch: Buscar
  obterToken: ObterToken
  // Chamado quando o Google recusa até o token recém-renovado (401): tokens.ts marca google_pessoas.erro.
  aoReconectar?: (mensagem: string) => unknown
}

export type MeetDoEvento = { meetLink: string | null; meetCodigo: string | null }
export type Fala = { hora: string; nome: string; texto: string }
export type ArtefatosDaReuniao = {
  terminou: boolean
  inicio: string | null
  fim: string | null
  gravacaoUrl: string | null
  transcricao: 'pronta' | 'processando' | 'nenhuma'
  falas: Fala[]
}

const CALENDARIO = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const MEET = 'https://meet.googleapis.com/v2'
const LIMITE_MS = 15_000
const MAXIMO_DE_PAGINAS = 100
const ATUALIZAR_GRAVACAO = [
  'config.artifactConfig.recordingConfig.autoRecordingGeneration',
  'config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration',
].join(',')

// ── Datas no fuso de São Paulo ──

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function partesEmSaoPaulo(instante: Date) {
  const p = Object.fromEntries(PARTES.formatToParts(instante).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}`, p }
}

function instante(valor: string, campo: string): Date {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) throw new ErroDoGoogle('recusado', `Data inválida em ${campo}.`)
  return data
}

// '2026-11-20T14:00:00-03:00' (hora de São Paulo com o deslocamento do dia).
function dataHoraEmSaoPaulo(valor: string, campo: string): string {
  const quando = instante(valor, campo)
  quando.setUTCMilliseconds(0)
  const { data, hora, p } = partesEmSaoPaulo(quando)
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  const minutos = Math.round((local - quando.getTime()) / 60_000)
  const sinal = minutos < 0 ? '-' : '+'
  const abs = Math.abs(minutos)
  return `${data}T${hora}${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

function diaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10)
}

// Dia inteiro: o Google quer a data de início e a do fim exclusiva. Fim às 00:00 de São Paulo já é exclusivo;
// qualquer outra hora (ex.: 23:59) fecha no dia seguinte.
function datasDoDiaInteiro(evento: EventoParaOGoogle) {
  const inicio = partesEmSaoPaulo(instante(evento.inicio, 'inicio')).data
  const fim = partesEmSaoPaulo(instante(evento.fim, 'fim'))
  let ate = fim.hora === '00:00:00' ? fim.data : diaSeguinte(fim.data)
  if (ate <= inicio) ate = diaSeguinte(inicio)
  return { start: { date: inicio, timeZone: FUSO }, end: { date: ate, timeZone: FUSO } }
}

function corpoDoEvento(evento: EventoParaOGoogle, convidados?: string[]) {
  const quando = evento.dia_inteiro
    ? datasDoDiaInteiro(evento)
    : {
      start: { dateTime: dataHoraEmSaoPaulo(evento.inicio, 'inicio'), timeZone: FUSO },
      end: { dateTime: dataHoraEmSaoPaulo(evento.fim, 'fim'), timeZone: FUSO },
    }
  const corpo: Record<string, unknown> = { summary: evento.titulo, description: evento.descricao ?? '', ...quando }
  if (convidados) {
    const emails = [...new Set(convidados.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    corpo.attendees = emails.map((email) => ({ email }))
  }
  return corpo
}

function pedidoDeMeet() {
  return { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
}

function meetDoEvento(evento: any): MeetDoEvento {
  const conferencia = evento?.conferenceData
  const tipo = conferencia?.conferenceSolution?.key?.type
  if (!conferencia || (tipo && tipo !== 'hangoutsMeet')) {
    return { meetLink: null, meetCodigo: null }
  }
  const video = (conferencia.entryPoints ?? []).find((p: any) => p?.entryPointType === 'video')?.uri
  return {
    meetLink: typeof evento.hangoutLink === 'string' ? evento.hangoutLink : typeof video === 'string' ? video : null,
    meetCodigo: typeof conferencia.conferenceId === 'string' ? conferencia.conferenceId : null,
  }
}

const IDENTIFICADOR = /^[A-Za-z0-9_-]{1,1024}$/
const CODIGO_DO_MEET = /^[a-z0-9-]{3,64}$/i

function conferir(valor: string, formato: RegExp, oQue: string): string {
  if (typeof valor !== 'string' || !formato.test(valor)) throw new ErroDoGoogle('recusado', `${oQue} inválido.`)
  return valor
}

// ── Erros ──

const LIMITE_DE_PEDIDOS = ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'RESOURCE_EXHAUSTED']

function motivos(dados: any): string[] {
  const erro = dados?.error
  return [
    ...(Array.isArray(erro?.errors) ? erro.errors.map((e: any) => e?.reason) : []),
    ...(Array.isArray(erro?.details) ? erro.details.map((d: any) => d?.reason) : []),
    erro?.status,
  ].filter((m): m is string => typeof m === 'string')
}

function erroDaResposta(acao: string, status: number, dados: unknown): ErroDoGoogle {
  if (status === 403 && motivos(dados).some((m) => LIMITE_DE_PEDIDOS.includes(m))) {
    return new ErroDoGoogle('recusado', `O Google pediu para esperar antes de ${acao}. Tente de novo em alguns minutos.`, status)
  }
  if (status === 403) {
    return new ErroDoGoogle('sem_permissao', `O Google não deu permissão para ${acao} nesta conta.`, status)
  }
  if (status === 429) {
    return new ErroDoGoogle('recusado', `O Google pediu para esperar antes de ${acao}. Tente de novo em alguns minutos.`, status)
  }
  if (status === 404 || status === 410) {
    return new ErroDoGoogle('recusado', `O Google não achou o que era preciso para ${acao} (foi apagado no Google?).`, status)
  }
  if (status >= 500) {
    return new ErroDoGoogle('recusado', `O Google está com problemas para ${acao}. Tente de novo em alguns minutos.`, status)
  }
  return new ErroDoGoogle('recusado', `O Google recusou ${acao}.`, status)
}

function nomeDoParticipante(participante: any): string {
  const nome = participante?.signedinUser?.displayName ?? participante?.anonymousUser?.displayName ??
    participante?.phoneUser?.displayName
  return typeof nome === 'string' && nome.trim() ? nome.trim() : 'Participante'
}

const porHora = (a: { hora: string }, b: { hora: string }) => Date.parse(a.hora) - Date.parse(b.hora)

export function criarGoogle({ fetch: buscar, obterToken, aoReconectar }: OpcoesDoGoogle) {
  // Um pedido ao Google com o token da pessoa. 401 com o token guardado: renova uma vez e repete; 401 de novo:
  // a conexão não vale mais ("reconectar", e tokens.ts marca a pessoa).
  async function pedir(acao: string, metodo: string, url: string, corpo?: unknown, { faltaEhOk = false } = {}): Promise<any> {
    let renovado = false
    while (true) {
      const token = await obterToken(renovado ? { renovar: true } : undefined)
      let resposta: Response
      try {
        resposta = await comLimite(buscar(url, {
          method: metodo,
          headers: {
            authorization: `Bearer ${token}`,
            ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        }), undefined, LIMITE_MS)
      } catch {
        throw new ErroDoGoogle('recusado', `Não foi possível falar com o Google para ${acao}. Tente de novo.`)
      }
      if (resposta.status === 401) {
        await resposta.body?.cancel()
        if (!renovado) {
          renovado = true
          continue
        }
        try {
          await aoReconectar?.(MENSAGEM_RECONECTAR)
        } catch {
          // marcar a pessoa é um extra: o erro que sobe é o do Google
        }
        throw new ErroDoGoogle('reconectar', MENSAGEM_RECONECTAR, 401)
      }
      if (faltaEhOk && (resposta.status === 404 || resposta.status === 410)) {
        await resposta.body?.cancel()
        return null
      }
      const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null)
      if (!resposta.ok) throw erroDaResposta(acao, resposta.status, dados)
      return dados
    }
  }

  // Todas as páginas de uma lista do Meet (pageToken), até um teto de segurança.
  async function todas(acao: string, url: string, chave: string, tamanho = 100): Promise<any[]> {
    const itens: any[] = []
    let pagina: string | undefined
    for (let i = 0; i < MAXIMO_DE_PAGINAS; i += 1) {
      const busca = new URLSearchParams({ pageSize: String(tamanho), ...(pagina ? { pageToken: pagina } : {}) })
      const dados = await pedir(acao, 'GET', `${url}?${busca}`)
      itens.push(...(Array.isArray(dados?.[chave]) ? dados[chave] : []))
      pagina = typeof dados?.nextPageToken === 'string' && dados.nextPageToken ? dados.nextPageToken : undefined
      if (!pagina) break
    }
    return itens
  }

  const comAvisos = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' }).toString()

  return {
    // Cria na agenda principal do organizador, avisando os convidados; com `meet`, pede a sala do Meet junto.
    async criarEvento(evento: EventoParaOGoogle, { meet = false, convidados = [] as string[] } = {}) {
      const corpo = corpoDoEvento(evento, convidados)
      if (meet) corpo.conferenceData = pedidoDeMeet()
      let criado = await pedir('criar o evento no Google Agenda', 'POST', `${CALENDARIO}?${comAvisos}`, corpo)
      if (typeof criado?.id !== 'string') throw new ErroDoGoogle('recusado', 'O Google não devolveu o evento criado.')
      // A sala do Meet às vezes fica "pending" na resposta: uma leitura depois costuma trazê-la. Melhor esforço: o
      // evento já existe no Google, e um erro aqui não pode fazer o app achar que nada foi criado.
      if (meet && !meetDoEvento(criado).meetCodigo && criado.conferenceData?.createRequest?.status?.statusCode === 'pending') {
        try {
          criado = await pedir('ler o evento no Google Agenda', 'GET', `${CALENDARIO}/${encodeURIComponent(criado.id)}`) ?? criado
        } catch {
          // fica sem o Meet por enquanto
        }
      }
      return { googleEventoId: criado.id as string, ...meetDoEvento(criado) }
    },

    // Edita no Google avisando os convidados. `convidados` troca a lista inteira; sem ele, a lista fica como está.
    // `meet: true` cria a sala quando o evento ainda não tem.
    async editarEvento(id: string, evento: EventoParaOGoogle, { convidados, meet = false }: { convidados?: string[]; meet?: boolean } = {}) {
      const corpo = corpoDoEvento(evento, convidados)
      if (meet) corpo.conferenceData = pedidoDeMeet()
      const url = `${CALENDARIO}/${encodeURIComponent(conferir(id, IDENTIFICADOR, 'Evento do Google'))}?${comAvisos}`
      const editado = await pedir('editar o evento no Google Agenda', 'PATCH', url, corpo)
      return { googleEventoId: id, ...meetDoEvento(editado) }
    },

    // Cancela no Google avisando os convidados. Evento que já não existe no Google não é erro.
    async apagarEvento(id: string): Promise<void> {
      const url = `${CALENDARIO}/${encodeURIComponent(conferir(id, IDENTIFICADOR, 'Evento do Google'))}?sendUpdates=all`
      await pedir('apagar o evento no Google Agenda', 'DELETE', url, undefined, { faltaEhOk: true })
    },

    // Liga a gravação e a transcrição automáticas no espaço do Meet da reunião (o espaço é achado pelo código).
    async ligarGravacao(meetCodigo: string): Promise<void> {
      const codigo = conferir(meetCodigo, CODIGO_DO_MEET, 'Código do Meet')
      const acao = 'ligar a gravação e a transcrição do Meet'
      const espaco = await pedir(acao, 'GET', `${MEET}/spaces/${encodeURIComponent(codigo)}`)
      const nome = conferir(espaco?.name, /^spaces\/[A-Za-z0-9_-]+$/, 'Espaço do Meet')
      await pedir(acao, 'PATCH', `${MEET}/${nome}?${new URLSearchParams({ updateMask: ATUALIZAR_GRAVACAO })}`, {
        config: {
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: 'ON' },
            transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
          },
        },
      })
    },

    // O que a reunião deixou: se terminou, o link da gravação e a transcrição (falas em ordem de hora, com o nome de
    // quem falou). Usa a conferência mais recente do espaço. 'pronta' só quando todas as transcrições têm arquivo.
    async artefatosDaReuniao(meetCodigo: string): Promise<ArtefatosDaReuniao> {
      const codigo = conferir(meetCodigo, CODIGO_DO_MEET, 'Código do Meet')
      const acao = 'ler a gravação e a transcrição do Meet'
      const filtro = new URLSearchParams({ filter: `space.meeting_code = "${codigo}"`, pageSize: '10' })
      const lista = await pedir(acao, 'GET', `${MEET}/conferenceRecords?${filtro}`)
      const registros = (Array.isArray(lista?.conferenceRecords) ? lista.conferenceRecords : [])
        .filter((r: any) => typeof r?.name === 'string' && /^conferenceRecords\/[A-Za-z0-9_-]+$/.test(r.name))
        .sort((a: any, b: any) => Date.parse(b.startTime ?? '') - Date.parse(a.startTime ?? ''))
      const registro = registros[0]
      if (!registro) {
        return { terminou: false, inicio: null, fim: null, gravacaoUrl: null, transcricao: 'nenhuma', falas: [] }
      }

      const terminou = typeof registro.endTime === 'string'
      const [gravacoes, transcricoes] = await Promise.all([
        todas(acao, `${MEET}/${registro.name}/recordings`, 'recordings'),
        todas(acao, `${MEET}/${registro.name}/transcripts`, 'transcripts'),
      ])
      const gravacao = gravacoes
        .filter((g) => g?.state === 'FILE_GENERATED' && typeof g.driveDestination?.exportUri === 'string')
        .sort((a, b) => Date.parse(a.startTime ?? '') - Date.parse(b.startTime ?? ''))[0]
      const prontas = transcricoes.filter((t) => t?.state === 'FILE_GENERATED')
      const transcricao = !transcricoes.length
        ? 'nenhuma'
        : terminou && prontas.length === transcricoes.length ? 'pronta' : 'processando'

      let falas: Fala[] = []
      if (transcricao === 'pronta') {
        const nomes = new Map(
          (await todas(acao, `${MEET}/${registro.name}/participants`, 'participants'))
            .map((p) => [p?.name, nomeDoParticipante(p)]),
        )
        const entradas = (await Promise.all(prontas.map((t) => {
          const nome = conferir(t.name, /^conferenceRecords\/[A-Za-z0-9_-]+\/transcripts\/[A-Za-z0-9_-]+$/, 'Transcrição do Meet')
          return todas(acao, `${MEET}/${nome}/entries`, 'transcriptEntries')
        }))).flat()
        falas = entradas
          .filter((e) => typeof e?.text === 'string' && e.text.trim() && typeof e.startTime === 'string')
          .map((e) => ({ hora: e.startTime, nome: nomes.get(e.participant) ?? 'Participante', texto: e.text.trim() }))
          .sort(porHora)
      }

      return {
        terminou,
        inicio: typeof registro.startTime === 'string' ? registro.startTime : null,
        fim: terminou ? registro.endTime : null,
        gravacaoUrl: gravacao?.driveDestination.exportUri ?? null,
        transcricao,
        falas,
      }
    },
  }
}

export type GoogleDaPessoa = ReturnType<typeof criarGoogle>
