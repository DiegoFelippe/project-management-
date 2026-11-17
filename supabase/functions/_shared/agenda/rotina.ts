// Núcleo da Edge Function reunioes-depois: a rotina do pg_cron (a cada 10 minutos) e as ações da tela ("Buscar agora"
// e "Tentar de novo"). Sem imports do Deno: recebe o banco (service_role), `googleDe(perfilId)` (o Google do
// organizador) e `iaDa(consultoriaId)` (a IA conectada da consultoria); os testes passam o banco local, o Google falso
// e uma IA falsa.
//
// Uma rotina por vez (reunioes_comecar_rotina: a vez fica com quem pegou, por até 9 minutos) e uma busca por reunião
// (reunioes_reservar: a reunião fica reservada por 5 minutos para quem a pegou, com "for update skip locked"). A rotina
// pega as reuniões terminadas que esperam ("agendada" ou "aguardando", com Meet), as que há mais tempo não são
// olhadas primeiro, de 3 em 3, até acabar o tempo dela; a reunião olhada há menos de 5 minutos fica para a próxima.
// O erro de uma reunião não para as outras. Quem chama pela tela segue a permissão de editar o evento.
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
import type { Ia } from './ia.ts'
import {
  type BancoDaReuniao,
  ESPERANDO,
  fecharReuniao,
  lerReuniao,
  marcarFalha,
  type Situacao,
  situacaoAtual,
  situacaoDe,
} from './reuniao.ts'
import type { Banco } from './tokens.ts'

export type IaDa = (consultoriaId: string) => Promise<Ia | null>

type Contexto = { db: BancoDaReuniao; googleDe: GoogleDe; iaDa: IaDa; agora?: () => number }

const POR_VEZ = 3
const TEMPO_DA_ROTINA_MS = 60_000
const VEZ_DA_ROTINA_MIN = 9
const RESERVA_MIN = 5
const PODE_TENTAR_DE_NOVO = ['erro', 'sem_artefatos']

async function chamar<T>(db: Banco, funcao: string, argumentos: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(funcao, argumentos)
  if (error) throw error
  return data as T
}

// A IA da consultoria só é procurada quando uma transcrição fica pronta (uma vez por consultoria, na rotina). Sem IA
// conectada: o resumo fica de fora.
function iaPreguicosa(iaDa: IaDa, consultoriaId: string, guardadas: Map<string, Promise<Ia | null>>): Ia {
  return async (pedido) => {
    if (!guardadas.has(consultoriaId)) guardadas.set(consultoriaId, iaDa(consultoriaId))
    const ia = await guardadas.get(consultoriaId)!
    return ia ? ia(pedido) : null
  }
}

// Uma reunião reservada: lê, pega o Google do organizador e fecha. Erro inesperado: a reunião fica com "erro" (e o
// "Tentar de novo").
async function processar(ctx: Contexto, id: string, guardadas: Map<string, Promise<Ia | null>>): Promise<Situacao | null> {
  const evento = await lerReuniao(ctx.db, id)
  if (!evento) return null
  try {
    const google = await ctx.googleDe(evento.consultor_id)
    const ia = iaPreguicosa(ctx.iaDa, evento.consultoria_id, guardadas)
    return await fecharReuniao(ctx.db, google, ia, evento, { agora: ctx.agora })
  } catch (erro) {
    console.error(`reunioes-depois: não foi possível buscar a gravação da reunião ${id}`, erro)
    return marcarFalha(ctx.db, evento)
  }
}

async function liberar(db: Banco, id: string, dono: string) {
  try {
    await chamar(db, 'reunioes_liberar', { p_evento: id, p_dono: dono })
  } catch (erro) {
    // a reserva vence sozinha em 5 minutos
    console.error(`reunioes-depois: não foi possível liberar a reunião ${id}`, erro)
  }
}

// A rotina do pg_cron. { ocupada: true } quando outra rotina está rodando.
export async function rodarRotina({
  db,
  googleDe,
  iaDa,
  agora = Date.now,
  tempoMs = TEMPO_DA_ROTINA_MS,
}: Contexto & { tempoMs?: number }) {
  const dono = await chamar<string | null>(db, 'reunioes_comecar_rotina', { p_minutos: VEZ_DA_ROTINA_MIN })
  if (!dono) return { ocupada: true, processadas: 0 }
  const ctx = { db, googleDe, iaDa, agora }
  const guardadas = new Map<string, Promise<Ia | null>>()
  const comeco = agora()
  let processadas = 0
  try {
    while (agora() - comeco < tempoMs) {
      const ids = await chamar<string[] | null>(db, 'reunioes_reservar', {
        p_dono: dono,
        p_evento: null,
        p_limite: POR_VEZ,
        p_minutos: RESERVA_MIN,
      })
      if (!ids?.length) break
      await Promise.all(ids.map(async (id) => {
        try {
          await processar(ctx, id, guardadas)
        } catch (erro) {
          console.error(`reunioes-depois: a reunião ${id} ficou para a próxima rotina`, erro)
        } finally {
          processadas += 1
          await liberar(db, id, dono)
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
// reunião com Meet que já terminou. Buscar agora só mexe na reunião que ainda espera; Tentar de novo também volta a
// buscar a que ficou com erro ou sem gravação/transcrição. Reunião já fechada volta como está.
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
    const fechada = await processar(ctx, eventoId, new Map())
    return { reuniao: fechada ?? (await situacaoAtual(ctx.db, { ...situacao, id: eventoId })) }
  } finally {
    await liberar(ctx.db, eventoId, dono)
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
