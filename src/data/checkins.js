// Check-ins (horas atendidas). O banco confere quem pode, sobreposição, futuro e tamanho.
import { avisarQueOCheckinMudou } from '@/lib/checkinMudou'
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

// consultor e cliente vêm das relações calculadas do banco: o gestor vê os check-ins da consultoria toda,
// mas em perfis só enxerga quem criou e as pessoas dos times dele. As tarefas do check-list marcadas em cada check-in:
// só as 3 primeiras e o total, contado no banco. A ordem das tarefas de um check-in é a mesma em todo lugar (aqui, em
// tarefasDoCheckin e na sessão do checklist_do_cliente): marcada_em, titulo, tarefa_id.
const CAMPOS_DA_LISTA =
  'id, inicio, fim, descricao, consultor_id, consultoria_id, consultor:consultor_do_checkin(nome), ' +
  'cliente:cliente_do_checkin(id, nome), tarefas:checkin_tarefas(titulo, estado, motivo), total_tarefas:checkin_tarefas(count)'
const TAREFAS_NA_LISTA = 3

const traduzir = (erro) => traduzirErroBanco(erro, { sobre: 'checkin' })

// O banco cancela o que passa do tempo (statement_timeout, 57014) e desfaz tudo: o check-in não entrou (usabilidade, U11).
export const CHECKIN_DEMOROU = 'O sistema demorou para responder. O check-in não foi feito; tente de novo.'

// Toda escrita que deu certo avisa o selo da barra de cima e as telas com o botão de check-in, que relêem (auditoria, G2).
function avisando(resultado) {
  if (!resultado.erro) avisarQueOCheckinMudou()
  return resultado
}

function resultadoDaEscrita({ data, error }) {
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: traduzirErroBanco({ code: '42501' }, { sobre: 'checkin' }) }
  return avisando({ erro: null })
}

// O check-in que eu deixei aberto (no máximo um), com o nome do cliente; ou null.
export async function meuCheckinAberto(perfilId) {
  if (!perfilId) return null
  const { data, error } = await supabase
    .from('checkins')
    .select('id, cliente_id, inicio, cliente:cliente_do_checkin(nome)')
    .eq('consultor_id', perfilId)
    .is('fim', null)
    .maybeSingle()
  if (error) throw error
  return data
}

// Devolve { erro, id } (o id serve ao "Desfazer" do aviso) e, no tempo esgotado, tempoEsgotado: true.
export async function fazerCheckin(clienteId) {
  const { data, error } = await supabase.from('checkins').insert({ cliente_id: clienteId }).select('id').single()
  if (error?.code === '57014') return { erro: CHECKIN_DEMOROU, tempoEsgotado: true }
  if (error) return { erro: traduzir(error) }
  return avisando({ erro: null, id: data.id })
}

// Fecha o check-in aberto com o fim escolhido na janela (ISO) e o que foi feito.
export async function fazerCheckout(id, { fim, descricao }) {
  return resultadoDaEscrita(
    await supabase.from('checkins').update({ fim, descricao: descricao?.trim() }).eq('id', id).select('id'),
  )
}

// Horas lançadas depois de feitas (início e fim informados).
export async function lancarHoras({ clienteId, inicio, fim, descricao }) {
  const { error } = await supabase
    .from('checkins')
    .insert({ cliente_id: clienteId, inicio, fim, descricao: descricao?.trim() })
  return avisando({ erro: error ? traduzir(error) : null })
}

// Só manda início e fim quando vieram (a janela manda só o que a pessoa mudou, para não cortar os segundos).
export async function editarCheckin(id, { inicio, fim, descricao }) {
  const colunas = { descricao: descricao?.trim() }
  if (inicio !== undefined) colunas.inicio = inicio
  if (fim !== undefined) colunas.fim = fim
  return resultadoDaEscrita(await supabase.from('checkins').update(colunas).eq('id', id).select('id'))
}

export async function apagarCheckin(id) {
  return resultadoDaEscrita(await supabase.from('checkins').delete().eq('id', id).select('id'))
}

// Uma página de check-ins. Cada um traz tarefas ([{ titulo, estado ('feita' | 'nao_se_aplica'), motivo }], até 3) e
// total_tarefas (número).
export async function listarCheckins({ clienteId, consultorId, pagina = 1 } = {}) {
  let consulta = supabase
    .from('checkins')
    .select(CAMPOS_DA_LISTA, { count: 'exact' })
    .order('inicio', { ascending: false })
    .order('id')
    .order('marcada_em', { referencedTable: 'tarefas' })
    .order('titulo', { referencedTable: 'tarefas' })
    .order('tarefa_id', { referencedTable: 'tarefas' })
    .limit(TAREFAS_NA_LISTA, { referencedTable: 'tarefas' })
  if (clienteId) consulta = consulta.eq('cliente_id', clienteId)
  if (consultorId) consulta = consulta.eq('consultor_id', consultorId)
  const resultado = await buscarPagina(consulta, pagina)
  const itens = resultado.itens.map(({ total_tarefas: total, ...checkin }) => ({
    ...checkin,
    tarefas: checkin.tarefas ?? [],
    total_tarefas: total?.[0]?.count ?? 0,
  }))
  return { ...resultado, itens }
}

// As tarefas do check-list fechadas num check-in (feitas ou "não se aplica", com o título e o motivo guardados nele), na
// ordem em que foram marcadas (desempate pelo título e pelo id): [{ tarefa_id, titulo, estado, motivo }]. Para o
// check-out e para editar o check-in.
export async function tarefasDoCheckin(checkinId) {
  const { data, error } = await supabase
    .from('checkin_tarefas')
    .select('tarefa_id, titulo, estado, motivo')
    .eq('checkin_id', checkinId)
    .order('marcada_em')
    .order('titulo')
    .order('tarefa_id')
  if (error) throw error
  return data ?? []
}
