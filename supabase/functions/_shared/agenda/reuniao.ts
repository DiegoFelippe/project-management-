// Depois da reunião: a pasta no cliente com a transcrição e a documentação (desenho:
// docs/superpowers/specs/2026-11-16-calendario-design.md, "Depois da reunião: a pasta no cliente").
// Sem imports do Deno: recebe o banco (service_role), o Google do organizador (ou null) e a IA da consultoria (ou null);
// os testes passam o banco local, o Google falso e uma IA falsa.
//
// fecharReuniao, para uma reunião com Meet e com cliente que já terminou e ainda espera ("agendada" ou "aguardando"):
// - sem cliente no evento: nada (não há onde criar a pasta; nem pergunta ao Google);
// - organizador desativado → "erro": "O organizador foi desativado…" (a credencial de quem saiu nunca é usada: quem
//   chama nem monta o Google dele);
// - organizador sem Google → "erro": "Conecte o Google para buscar a gravação";
// - lê, com o token do organizador, a gravação e a transcrição das conferências da janela do evento (uma reunião com
//   queda tem mais de uma: as falas são juntadas). O Google recusa: se tentar de novo
//   resolve (fora do ar, limite de pedidos, resposta que não veio), fica "aguardando" com o motivo e a rotina tenta de
//   novo; se não (reconectar, sem permissão, não achou), "erro" com o motivo;
// - transcrição pronta → cria a pasta "Reunião dd/MM/yyyy HH:mm — <título>" no cliente, com transcricao.txt e
//   documentacao.md (o resumo, as decisões e os próximos passos vêm da IA da consultoria, quando conectada; sem ela, ou
//   se ela falhar, a documentação sai sem essa parte), e marca "pasta_criada" com o histórico do cliente; se guardar
//   falha (banco, Storage), fica "aguardando" com o motivo e a próxima tentativa completa a mesma pasta;
// - sem transcrição pronta → "aguardando"; 48 horas depois do fim → "sem_artefatos" (a rotina para de perguntar).
// Cada passo pode ser repetido: a pasta é uma só por reunião (o banco garante), o arquivo que já está nela não é
// gravado de novo e o histórico só entra junto com a troca para "pasta_criada".
import { ErroDoGoogle, type ArtefatosDaReuniao, type Fala, FUSO, type GoogleDaPessoa } from './google.ts'
import type { Ia, ResumoDaReuniao } from './ia.ts'
import type { Banco } from './tokens.ts'

export type BancoDaReuniao = Banco & { storage: { from: (bucket: string) => any } }

export const SEM_GOOGLE = 'Conecte o Google para buscar a gravação'
export const ORGANIZADOR_DESATIVADO = 'O organizador foi desativado. A gravação, se houver, está no Google dele.'
export const GOOGLE_SEM_RESPOSTA = 'O Google não respondeu agora; tentamos de novo em seguida.'
export const FALHOU = 'Não foi possível guardar a pasta da reunião agora; tentamos de novo em seguida.'
const HORA_MS = 3_600_000
export const ESPERA_MAXIMA_MS = 48 * HORA_MS
export const ESPERANDO = ['agendada', 'aguardando']

// Quando olhar de novo uma reunião que ainda espera: até 2 horas depois do fim, na rotina seguinte (daqui a 5 minutos;
// a rotina roda a cada 10); depois, uma vez por hora, até a rotina fechar nas 48 horas.
export function proximaBusca(fim: string, agora: number): Date {
  const desdeOFim = agora - Date.parse(fim)
  return new Date(agora + (desdeOFim < 2 * HORA_MS ? 5 * 60_000 : HORA_MS))
}

// Erro do Google que tentar de novo pode resolver: Google fora do ar (5xx), limite de pedidos (429, ou o 403 de limite,
// que vira "recusado"), resposta que não veio. Reconectar, sem permissão, não achou e o app do Google sem configurar,
// não.
export function erroPassageiro(erro: ErroDoGoogle): boolean {
  if (erro.codigo !== 'recusado') return false
  return erro.semResposta || erro.status === 429 || erro.status === 403 || (erro.status ?? 0) >= 500
}

const MAXIMO_DO_NOME = 120
const NOME_DA_TRANSCRICAO = 'transcricao.txt'
const NOME_DA_DOCUMENTACAO = 'documentacao.md'

export type Situacao = {
  reuniao: string
  reuniao_erro: string | null
  pasta_id: string | null
  gravacao_url: string | null
}

export type ParticipanteDaReuniao = { nome: string; deFora?: boolean; resposta?: string | null }

// O que a documentação mostra da reunião.
export type ReuniaoParaDocumentar = {
  titulo: string
  descricao?: string | null
  inicio: string
  fim: string
  dia_inteiro?: boolean
  cliente?: string | null
  organizador: string
  participantes: ParticipanteDaReuniao[]
  meet_link?: string | null
  link_do_evento?: string | null
}

// A reunião como fecharReuniao precisa (lerReuniao).
export type ReuniaoNoBanco = Situacao & {
  id: string
  consultoria_id: string
  consultor_id: string
  cliente_id: string | null
  titulo: string
  descricao: string | null
  inicio: string
  fim: string
  dia_inteiro: boolean
  meet_link: string | null
  meet_codigo: string | null
  google_evento_id: string | null
  organizador: string
  // O acesso do organizador está ativo (quem saiu não tem o Google usado).
  organizador_ativo: boolean
  cliente: string | null
  participantes: ParticipanteDaReuniao[]
}

// ── Textos (funções puras) ──

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

function emSaoPaulo(iso: string) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}`, segundos: `${p.hour}:${p.minute}:${p.second}` }
}

const umaLinha = (texto: string) => String(texto ?? '').replace(/\s+/g, ' ').trim()

// Texto de quem não é o app no Markdown (título, nomes, pauta, o que a IA escreveu): sem virar título, lista, link ou
// negrito por acidente.
function md(texto: string): string {
  return String(texto ?? '')
    .replace(/[\\`*_[\]#<>|]/g, '\\$&')
    .replace(/^(\s*)([-+]|\d+[.)])(?=\s|$)/gm, '$1\\$2')
}

// Só endereço https entra na documentação, com os caracteres que quebram o link do Markdown trocados.
function linkSeguro(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  try {
    if (new URL(url).protocol !== 'https:') return null
  } catch {
    return null
  }
  return url.replace(/[()<> ]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

// Uma linha por fala: "[HH:mm:ss] Nome: texto", na hora de São Paulo, na ordem em que vieram.
export function transcricaoEmTexto(falas: Fala[]): string {
  if (!falas.length) return 'A transcrição do Meet veio sem falas.\n'
  return falas.map((f) => `[${emSaoPaulo(f.hora).segundos}] ${umaLinha(f.nome)}: ${umaLinha(f.texto)}\n`).join('')
}

// "Reunião dd/MM/yyyy HH:mm — <título>" (início no horário de São Paulo), com até 120 caracteres.
export function nomeDaPasta(evento: { titulo: string; inicio: string }): string {
  const { data, hora } = emSaoPaulo(evento.inicio)
  const comeco = `Reunião ${data} ${hora} — `
  const titulo = umaLinha(evento.titulo)
  if (comeco.length + titulo.length <= MAXIMO_DO_NOME) return comeco + titulo
  return comeco + titulo.slice(0, MAXIMO_DO_NOME - comeco.length - 1).trimEnd() + '…'
}

export function duracaoEmTexto(ms: number): string {
  const minutos = Math.round(ms / 60_000)
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto ? `${horas} h ${String(resto).padStart(2, '0')} min` : `${horas} h`
}

// "20/11/2026, das 14:00 às 15:00" (ou com as duas datas, quando atravessa a meia-noite; ou o dia inteiro).
export function dataEHora(evento: Pick<ReuniaoParaDocumentar, 'inicio' | 'fim' | 'dia_inteiro'>): string {
  const inicio = emSaoPaulo(evento.inicio)
  if (evento.dia_inteiro) {
    const ultimo = emSaoPaulo(new Date(Date.parse(evento.fim) - 1).toISOString())
    return ultimo.data === inicio.data ? `${inicio.data}, dia inteiro` : `${inicio.data} a ${ultimo.data}, dia inteiro`
  }
  const fim = emSaoPaulo(evento.fim)
  const quando = fim.data === inicio.data
    ? `${inicio.data}, das ${inicio.hora} às ${fim.hora}`
    : `${inicio.data} ${inicio.hora} até ${fim.data} ${fim.hora}`
  return `${quando} (horário de Brasília)`
}

// A duração de verdade (a conferência do Meet) quando o Google informa; senão, a do convite.
function duracaoDa(evento: ReuniaoParaDocumentar, artefatos: Pick<ArtefatosDaReuniao, 'inicio' | 'fim'>): string {
  const [de, ate] = artefatos.inicio && artefatos.fim ? [artefatos.inicio, artefatos.fim] : [evento.inicio, evento.fim]
  return duracaoEmTexto(Date.parse(ate) - Date.parse(de))
}

const RESPOSTAS: Record<string, string> = { confirmou: 'confirmou', recusou: 'recusou', pendente: 'não respondeu' }

function participantesEmTexto(lista: ParticipanteDaReuniao[]): string {
  if (!lista.length) return 'só o organizador'
  return lista
    .map((p) => `${md(umaLinha(p.nome))} (${p.deFora ? 'convidado de fora' : RESPOSTAS[p.resposta ?? 'pendente'] ?? 'não respondeu'})`)
    .join(', ')
}

const secao = (titulo: string, corpo: string) => `## ${titulo}\n\n${corpo}\n`
const itens = (lista: string[], vazio: string) => (lista.length ? lista.map((i) => `- ${md(umaLinha(i))}`).join('\n') : vazio)

// documentacao.md: título, data e hora, duração, cliente, organizador, participantes, quem falou, links da gravação,
// do evento e do Meet, a pauta e, com a IA, resumo, decisões e próximos passos.
export function documentacaoDaReuniao(
  evento: ReuniaoParaDocumentar,
  artefatos: Pick<ArtefatosDaReuniao, 'inicio' | 'fim' | 'gravacaoUrl' | 'falas'>,
  resumo: ResumoDaReuniao | null,
): string {
  const gravacao = linkSeguro(artefatos.gravacaoUrl)
  const linkDoEvento = linkSeguro(evento.link_do_evento)
  const meet = linkSeguro(evento.meet_link)
  const falaram = [...new Set(artefatos.falas.map((f) => umaLinha(f.nome)).filter(Boolean))]
  const dados = [
    `- **Data e hora:** ${dataEHora(evento)}`,
    `- **Duração:** ${duracaoDa(evento, artefatos)}`,
    evento.cliente ? `- **Cliente:** ${md(umaLinha(evento.cliente))}` : null,
    `- **Organizador:** ${md(umaLinha(evento.organizador))}`,
    `- **Participantes:** ${participantesEmTexto(evento.participantes)}`,
    falaram.length ? `- **Falaram na reunião:** ${falaram.map(md).join(', ')}` : null,
    `- **Gravação:** ${gravacao ? `[Abrir a gravação](${gravacao})` : 'a reunião não foi gravada'}`,
    linkDoEvento ? `- **Evento:** [Abrir no Google Agenda](${linkDoEvento})` : null,
    meet ? `- **Meet:** [${md(meet)}](${meet})` : null,
  ].filter(Boolean).join('\n')

  const partes = [`# ${md(umaLinha(evento.titulo))}\n`, `${dados}\n`]
  const pauta = (evento.descricao ?? '').trim()
  if (pauta) partes.push(secao('Pauta', md(pauta)))
  if (resumo) {
    partes.push(secao('Resumo', md(resumo.resumo.trim())))
    partes.push(secao('Decisões', itens(resumo.decisoes, 'Nenhuma decisão registrada.')))
    partes.push(secao('Próximos passos', itens(resumo.proximosPassos, 'Nenhum próximo passo registrado.')))
  }
  const rodape = [
    'Documentação gerada pelo IXC Consult depois da reunião.',
    resumo ? 'O resumo, as decisões e os próximos passos foram escritos pela IA da consultoria a partir da transcrição: confira antes de usar.' : null,
    `A transcrição completa está em \`${NOME_DA_TRANSCRICAO}\`, nesta pasta.`,
  ].filter(Boolean).join(' ')
  partes.push(`---\n\n${rodape}\n`)
  return partes.join('\n')
}

// ── Banco ──

const COLUNAS_DA_SITUACAO = 'reuniao, reuniao_erro, pasta_id, gravacao_url'

export const situacaoDe = (e: Situacao): Situacao => ({
  reuniao: e.reuniao,
  reuniao_erro: e.reuniao_erro ?? null,
  pasta_id: e.pasta_id ?? null,
  gravacao_url: e.gravacao_url ?? null,
})

function conferir<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

// A reunião com o nome do organizador, o do cliente e os participantes (da casa pelo nome, de fora pelo e-mail), numa
// leitura só. null quando não existe mais.
export async function lerReuniao(db: Banco, id: string): Promise<ReuniaoNoBanco | null> {
  const linha = conferir(await db
    .from('agenda_eventos')
    .select(`id, consultoria_id, consultor_id, cliente_id, titulo, descricao, inicio, fim, dia_inteiro, meet_link,
      meet_codigo, google_evento_id, ${COLUNAS_DA_SITUACAO},
      organizador:perfis!agenda_eventos_consultor_id_fkey(nome, ativo), cliente:clientes(nome),
      participantes:agenda_participantes(email, resposta, perfil:perfis(nome))`)
    .eq('id', id)
    .maybeSingle())
  if (!linha) return null
  const lista = (linha.participantes ?? []) as { email: string | null; resposta: string; perfil: { nome: string } | null }[]
  return {
    ...linha,
    organizador: linha.organizador?.nome ?? 'Organizador',
    organizador_ativo: linha.organizador?.ativo === true,
    cliente: linha.cliente?.nome ?? null,
    participantes: [
      ...lista.filter((p) => p.perfil).map((p) => ({ nome: p.perfil!.nome, resposta: p.resposta }))
        .sort((a, b) => porNome(a.nome, b.nome)),
      ...lista.filter((p) => p.email).map((p) => ({ nome: p.email!, deFora: true })).sort((a, b) => porNome(a.nome, b.nome)),
    ],
  }
}

export async function situacaoAtual(db: Banco, evento: Situacao & { id: string }): Promise<Situacao> {
  const linha = conferir(await db.from('agenda_eventos').select(COLUNAS_DA_SITUACAO).eq('id', evento.id).maybeSingle())
  return situacaoDe(linha ?? evento)
}

// Muda a situação de uma reunião que ainda espera (de outra, quem mudou foi outra pessoa: devolve como ela está).
async function marcar(db: Banco, evento: Situacao & { id: string }, campos: Partial<Situacao>): Promise<Situacao> {
  const linha = conferir(await db
    .from('agenda_eventos')
    .update(campos)
    .eq('id', evento.id)
    .in('reuniao', ESPERANDO)
    .select(COLUNAS_DA_SITUACAO)
    .maybeSingle())
  return linha ? situacaoDe(linha) : situacaoAtual(db, evento)
}

// Fica para a próxima busca, com o motivo; 48 horas depois do fim, "sem_artefatos" (a rotina para).
function aguardar(
  db: Banco,
  evento: Situacao & { id: string; fim: string },
  motivo: string | null,
  gravacao_url: string | null,
  agora: () => number,
): Promise<Situacao> {
  const esgotou = agora() - Date.parse(evento.fim) >= ESPERA_MAXIMA_MS
  return marcar(db, evento, { reuniao: esgotou ? 'sem_artefatos' : 'aguardando', reuniao_erro: motivo, gravacao_url })
}

// A reunião não pôde ser fechada por um erro do app (banco, Storage): fica aguardando, com o motivo, e a próxima busca
// tenta de novo.
export function marcarFalha(
  db: Banco,
  evento: Situacao & { id: string; fim: string },
  agora: () => number = Date.now,
): Promise<Situacao> {
  return aguardar(db, evento, FALHOU, evento.gravacao_url ?? null, agora)
}

// Os arquivos na pasta da reunião (bucket "arquivos", caminho <cliente_id>/<uuid>-<nome>). O que já está na pasta (de
// uma tentativa que parou no meio) fica como está.
async function guardarNaPasta(
  db: BancoDaReuniao,
  clienteId: string,
  pastaId: string,
  arquivos: { nome: string; tipo: string; texto: string }[],
) {
  const ja = conferir(await db.from('cliente_arquivos').select('nome').eq('pasta_id', pastaId)
    .in('nome', arquivos.map((a) => a.nome))) as { nome: string }[]
  const bucket = db.storage.from('arquivos')
  for (const arquivo of arquivos.filter((a) => !ja.some((j) => j.nome === a.nome))) {
    const bytes = new TextEncoder().encode(arquivo.texto)
    const caminho = `${clienteId}/${crypto.randomUUID()}-${arquivo.nome}`
    const envio = await bucket.upload(caminho, bytes, { contentType: `${arquivo.tipo}; charset=utf-8`, upsert: false })
    if (envio.error) throw envio.error
    const { error } = await db.from('cliente_arquivos').insert({
      cliente_id: clienteId,
      pasta_id: pastaId,
      caminho,
      nome: arquivo.nome,
      tamanho: bytes.length,
      tipo: arquivo.tipo,
    })
    if (error) {
      try {
        await bucket.remove([caminho])
      } catch {
        // o objeto sem linha fica para a limpeza da pasta do cliente
      }
      throw error
    }
  }
}

async function criarPasta(
  db: BancoDaReuniao,
  google: GoogleDaPessoa,
  ia: Ia | null,
  evento: ReuniaoNoBanco,
  artefatos: ArtefatosDaReuniao,
): Promise<Situacao> {
  const transcricao = transcricaoEmTexto(artefatos.falas)
  let resumo: ResumoDaReuniao | null = null
  if (ia) {
    try {
      resumo = await ia({
        titulo: umaLinha(evento.titulo),
        quando: dataEHora(evento),
        duracao: duracaoDa(evento, artefatos),
        transcricao,
      })
    } catch (erro) {
      console.warn(`reunioes-depois: a IA não fez o resumo da reunião ${evento.id}: ${erro instanceof Error ? erro.message : erro}`)
    }
  }
  let linkDoEvento: string | null = null
  if (evento.google_evento_id) {
    try {
      linkDoEvento = await google.linkDoEvento(evento.google_evento_id)
    } catch {
      // a documentação sai sem o link do evento
    }
  }
  const documentacao = documentacaoDaReuniao({ ...evento, link_do_evento: linkDoEvento }, artefatos, resumo)

  const pastaId = conferir(await db.rpc('pasta_da_reuniao', { p_evento: evento.id, p_nome: nomeDaPasta(evento) })) as string
  await guardarNaPasta(db, evento.cliente_id!, pastaId, [
    { nome: NOME_DA_TRANSCRICAO, tipo: 'text/plain', texto: transcricao },
    { nome: NOME_DA_DOCUMENTACAO, tipo: 'text/markdown', texto: documentacao },
  ])
  conferir(await db.rpc('concluir_reuniao', {
    p_evento: evento.id,
    p_pasta: pastaId,
    p_gravacao: artefatos.gravacaoUrl ?? evento.gravacao_url,
  }))
  return situacaoAtual(db, evento)
}

// Fecha (ou avança) uma reunião; devolve a situação dela. Reunião que não espera mais, sem Meet, sem cliente ou que
// ainda não terminou fica como está. Só um erro inesperado ao ler o Google sobe (quem chama marca a falha).
export async function fecharReuniao(
  db: BancoDaReuniao,
  google: GoogleDaPessoa | null,
  ia: Ia | null,
  evento: ReuniaoNoBanco,
  { agora = Date.now }: { agora?: () => number } = {},
): Promise<Situacao> {
  const espera = ESPERANDO.includes(evento.reuniao)
  if (!espera || !evento.meet_codigo || !evento.cliente_id || Date.parse(evento.fim) > agora()) return situacaoDe(evento)
  if (!evento.organizador_ativo) return marcar(db, evento, { reuniao: 'erro', reuniao_erro: ORGANIZADOR_DESATIVADO })
  if (!google) return marcar(db, evento, { reuniao: 'erro', reuniao_erro: SEM_GOOGLE })

  let artefatos: ArtefatosDaReuniao
  try {
    // Só os registros de conferência da janela deste evento (o espaço do Meet pode ter outras reuniões).
    artefatos = await google.artefatosDaReuniao(evento.meet_codigo, { inicio: evento.inicio, fim: evento.fim })
  } catch (erro) {
    if (!(erro instanceof ErroDoGoogle)) throw erro
    if (erroPassageiro(erro)) return aguardar(db, evento, GOOGLE_SEM_RESPOSTA, evento.gravacao_url, agora)
    return marcar(db, evento, { reuniao: 'erro', reuniao_erro: erro.message })
  }
  const gravacao_url = artefatos.gravacaoUrl ?? evento.gravacao_url

  if (artefatos.transcricao === 'pronta') {
    try {
      return await criarPasta(db, google, ia, evento, artefatos)
    } catch (erro) {
      console.error(`reunioes-depois: não foi possível guardar a pasta da reunião ${evento.id}`, erro)
      return aguardar(db, evento, FALHOU, gravacao_url, agora)
    }
  }
  return aguardar(db, evento, null, gravacao_url, agora)
}
