// Núcleo da Edge Function reunioes-depois: a rotina do pg_cron (a cada 10 minutos) e as ações da tela ("Buscar agora"
// e "Tentar de novo"). Sem imports do Deno: recebe o banco (service_role), `googleDe(perfilId)` (o Google do
// organizador) e `iaDa(consultoriaId)` (a IA conectada da consultoria); os testes passam o banco local, o Google falso
// e uma IA falsa.
//
// Uma rotina por vez (reunioes_comecar_rotina: a vez fica com quem pegou, por até 9 minutos) e uma busca por reunião
// (reunioes_reservar: a reunião fica reservada por 5 minutos para quem a pegou, com "for update skip locked"). A rotina
// pega as reuniões terminadas, com Meet e com cliente, que esperam ("agendada" ou "aguardando") e já deram a hora de
// olhar (proximaBusca: a cada rotina até 2 horas depois do fim; depois, de hora em hora), de 5 em 5, até acabar o tempo
// dela; usa um Google por organizador na rodada. O erro de uma reunião não para as outras. Quem chama pela tela segue
// a permissão de editar o evento. `consultorias` (só os testes): a rotina só olha as reuniões dessas consultorias.
import { Falha } from '../http.ts'
import {
  conferirQuem,
  cuidaDoEvento,
  type GoogleDe,
  lerEvento,
  lerParticipantes,
  NAO_EXISTE,
  type Quem,
  recusa,
  semPermissaoNoEvento,
  uuid,
} from './eventos.ts'
import type { GoogleDaPessoa } from './google.ts'
import type { Ia } from './ia.ts'
import {
  type BancoDaReuniao,
  ESPERANDO,
  fecharReuniao,
  lerReuniao,
  marcarFalha,
  proximaBusca as proximaBuscaPadrao,
  type Situacao,
  situacaoAtual,
  situacaoDe,
} from './reuniao.ts'
import type { Banco } from './tokens.ts'

export type IaDa = (consultoriaId: string) => Promise<Ia | null>
type ProximaBusca = (fim: string, agora: number) => Date

type Contexto = {
  db: BancoDaReuniao
  googleDe: GoogleDe
  iaDa: IaDa
  agora?: () => number
  proximaBusca?: ProximaBusca
}

// O que a rodada guarda para não repetir: o Google de cada organizador e a IA de cada consultoria.
type Guardados = { googles: Map<string, Promise<GoogleDaPessoa | null>>; ias: Map<string, Promise<Ia | null>> }
const novosGuardados = (): Guardados => ({ googles: new Map(), ias: new Map() })

const POR_VEZ = 5
const TEMPO_DA_ROTINA_MS = 80_000
const VEZ_DA_ROTINA_MIN = 9
const RESERVA_MIN = 5
const MAXIMO_DE_CONSULTORIAS = 100
const PODE_TENTAR_DE_NOVO = ['erro', 'sem_artefatos']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function chamar<T>(db: Banco, funcao: string, argumentos: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(funcao, argumentos)
  if (error) throw error
  return data as T
}

function guardado<T>(mapa: Map<string, Promise<T>>, chave: string, criar: () => Promise<T>): Promise<T> {
  if (!mapa.has(chave)) mapa.set(chave, criar())
  return mapa.get(chave)!
}

// A IA da consultoria só é procurada quando uma transcrição fica pronta (uma vez por consultoria na rodada). Sem IA
// conectada: o resumo fica de fora.
function iaPreguicosa(iaDa: IaDa, consultoriaId: string, ias: Guardados['ias']): Ia {
  return async (pedido) => {
    const ia = await guardado(ias, consultoriaId, () => iaDa(consultoriaId))
    return ia ? ia(pedido) : null
  }
}

// Uma reunião reservada: lê, pega o Google do organizador e fecha. Organizador desativado: o Google dele nem é montado
// (a credencial de quem saiu nunca é lida) e fecharReuniao marca o motivo. Erro inesperado: a reunião fica aguardando,
// com o motivo, para a próxima busca. Devolve a situação e o fim (para saber quando olhar de novo).
async function processar(ctx: Contexto, id: string, guardados: Guardados) {
  const agora = ctx.agora ?? Date.now
  const evento = await lerReuniao(ctx.db, id)
  if (!evento) return null
  try {
    // O Google que falhou ao ser criado não fica guardado para as outras reuniões do organizador.
    const google = !evento.organizador_ativo ? null : await guardado(guardados.googles, evento.consultor_id,
      () => ctx.googleDe(evento.consultor_id))
      .catch((erro) => {
        guardados.googles.delete(evento.consultor_id)
        throw erro
      })
    const ia = iaPreguicosa(ctx.iaDa, evento.consultoria_id, guardados.ias)
    return { situacao: await fecharReuniao(ctx.db, google, ia, evento, { agora }), fim: evento.fim }
  } catch (erro) {
    console.error(`reunioes-depois: não foi possível buscar a gravação da reunião ${id}`, erro)
    return { situacao: await marcarFalha(ctx.db, evento, agora), fim: evento.fim }
  }
}

// Solta a reunião e diz quando olhar de novo (o banco ignora a hora quando ela não espera mais).
async function liberar(ctx: Contexto, id: string, dono: string, fim: string | null) {
  const agora = (ctx.agora ?? Date.now)()
  const proxima = fim ? (ctx.proximaBusca ?? proximaBuscaPadrao)(fim, agora) : null
  try {
    await chamar(ctx.db, 'reunioes_liberar', { p_evento: id, p_dono: dono, p_proxima_em: proxima?.toISOString() ?? null })
  } catch (erro) {
    // a reserva vence sozinha em 5 minutos
    console.error(`reunioes-depois: não foi possível liberar a reunião ${id}`, erro)
  }
}

// O recorte por consultorias que chega no corpo da chamada da rotina (só os testes mandam): nada → todas.
export function recorteDaRotina(valor: unknown): string[] | null {
  if (valor === undefined || valor === null) return null
  if (!Array.isArray(valor) || !valor.length || valor.length > MAXIMO_DE_CONSULTORIAS ||
    !valor.every((id) => typeof id === 'string' && UUID.test(id))) {
    throw new Falha(400, 'dados_invalidos', { campo: 'consultorias' })
  }
  return [...new Set(valor.map((id: string) => id.toLowerCase()))]
}

// A rotina do pg_cron. { ocupada: true } quando outra rotina está rodando.
export async function rodarRotina({
  db,
  googleDe,
  iaDa,
  agora = Date.now,
  proximaBusca,
  tempoMs = TEMPO_DA_ROTINA_MS,
  consultorias = null,
}: Contexto & { tempoMs?: number; consultorias?: string[] | null }) {
  const dono = await chamar<string | null>(db, 'reunioes_comecar_rotina', { p_minutos: VEZ_DA_ROTINA_MIN })
  if (!dono) return { ocupada: true, processadas: 0 }
  const ctx: Contexto = { db, googleDe, iaDa, agora, proximaBusca }
  const guardados = novosGuardados()
  const comeco = agora()
  let processadas = 0
  try {
    while (agora() - comeco < tempoMs) {
      const ids = await chamar<string[] | null>(db, 'reunioes_reservar', {
        p_dono: dono,
        p_evento: null,
        p_limite: POR_VEZ,
        p_minutos: RESERVA_MIN,
        ...(consultorias ? { p_consultorias: consultorias } : {}),
      })
      if (!ids?.length) break
      await Promise.all(ids.map(async (id) => {
        let fim: string | null = null
        try {
          fim = (await processar(ctx, id, guardados))?.fim ?? null
        } catch (erro) {
          console.error(`reunioes-depois: a reunião ${id} ficou para a próxima rotina`, erro)
        } finally {
          processadas += 1
          await liberar(ctx, id, dono, fim)
        }
      }))
    }
  } finally {
    try {
      await chamar(db, 'reunioes_terminar_rotina', { p_dono: dono })
    } catch (erro) {
      // a vez vence sozinha em 9 minutos
      console.error('reunioes-depois: não foi possível devolver a vez da rotina', erro)
    }
  }
  return { ocupada: false, processadas }
}

// "Buscar agora" e "Tentar de novo": quem edita o evento (o organizador, a gestão da consultoria, a central), numa
// reunião com Meet e com cliente que já terminou. Buscar agora só mexe na reunião que ainda espera; Tentar de novo
// também volta a buscar a que ficou com erro ou sem gravação/transcrição. Reunião já fechada volta como está.
async function pelaTela(ctx: Contexto, quem: Quem, id: unknown, tentar: boolean): Promise<{ reuniao: Situacao }> {
  const eventoId = uuid(id, 'id')
  const agora = ctx.agora ?? Date.now
  await conferirQuem(ctx.db, quem)
  const atual = await lerEvento(ctx.db, eventoId)
  if (!atual) throw recusa(404, 'evento_nao_encontrado', NAO_EXISTE)
  if (!cuidaDoEvento(quem, atual)) {
    throw semPermissaoNoEvento(quem, atual, (await lerParticipantes(ctx.db, eventoId)).perfis.includes(quem.id))
  }
  if (!atual.meet_codigo) {
    throw recusa(409, 'sem_meet', 'Esta reunião não tem Meet: não há gravação nem transcrição para buscar.')
  }
  if (!atual.cliente_id) {
    throw recusa(409, 'sem_cliente', 'Escolha o cliente do evento: a pasta da reunião fica nos arquivos dele.')
  }
  if (Date.parse(atual.fim) > agora()) throw recusa(409, 'reuniao_nao_terminou', 'A reunião ainda não terminou.')

  const situacao = situacaoDe(atual as unknown as Situacao)
  const volta = tentar && PODE_TENTAR_DE_NOVO.includes(situacao.reuniao)
  if (!volta && !ESPERANDO.includes(situacao.reuniao)) return { reuniao: situacao }

  const dono = crypto.randomUUID()
  const reservadas = await chamar<string[] | null>(ctx.db, 'reunioes_reservar', {
    p_dono: dono,
    p_evento: eventoId,
    p_minutos: RESERVA_MIN,
  })
  if (!reservadas?.includes(eventoId)) {
    throw recusa(409, 'reuniao_em_busca', 'A gravação desta reunião já está sendo buscada. Confira de novo em alguns minutos.')
  }
  try {
    if (volta) {
      const { error } = await ctx.db.from('agenda_eventos').update({ reuniao: 'aguardando', reuniao_erro: null })
        .eq('id', eventoId).in('reuniao', PODE_TENTAR_DE_NOVO)
      if (error) throw error
    }
    const fechada = await processar(ctx, eventoId, novosGuardados())
    return { reuniao: fechada?.situacao ?? (await situacaoAtual(ctx.db, { ...situacao, id: eventoId })) }
  } finally {
    await liberar(ctx, eventoId, dono, atual.fim)
  }
}

export function buscarAgora(db: BancoDaReuniao, googleDe: GoogleDe, iaDa: IaDa, quem: Quem, id: unknown) {
  return pelaTela({ db, googleDe, iaDa }, quem, id, false)
}

export function tentarDeNovo(db: BancoDaReuniao, googleDe: GoogleDe, iaDa: IaDa, quem: Quem, id: unknown) {
  return pelaTela({ db, googleDe, iaDa }, quem, id, true)
}

// Compara sem deixar o tempo da comparação dizer quanto do texto bate: os dois resumos SHA-256, byte a byte.
async function mesmoTexto(a: string, b: string): Promise<boolean> {
  const resumo = async (texto: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))
  const [x, y] = await Promise.all([resumo(a), resumo(b)])
  let diferenca = 0
  for (let i = 0; i < x.length; i += 1) diferenca |= x[i] ^ y[i]
  return diferenca === 0
}

// O pg_cron chama a função com o segredo guardado no Vault (reunioes_depois_segredo) no cabeçalho x-rotina-segredo.
export async function segredoDaRotinaConfere(db: Banco, recebido: unknown): Promise<boolean> {
  if (typeof recebido !== 'string' || !recebido || recebido.length > 200) return false
  const segredo = await chamar<string | null>(db, 'segredo_da_rotina_das_reunioes', {})
  if (typeof segredo !== 'string' || segredo.length < 32) return false
  return mesmoTexto(recebido, segredo)
}
