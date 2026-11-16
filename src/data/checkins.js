// Check-ins (horas atendidas). O banco confere quem pode, sobreposição, futuro e tamanho.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

// consultor e cliente vêm das relações calculadas do banco: o gestor vê os check-ins da consultoria toda,
// mas em perfis só enxerga quem criou e as pessoas dos times dele.
const CAMPOS_DA_LISTA =
  'id, inicio, fim, descricao, consultor_id, consultoria_id, consultor:consultor_do_checkin(nome), ' +
  'cliente:cliente_do_checkin(id, nome)'

const traduzir = (erro) => traduzirErroBanco(erro, { sobre: 'checkin' })

function resultadoDaEscrita({ data, error }) {
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: traduzirErroBanco({ code: '42501' }, { sobre: 'checkin' }) }
  return { erro: null }
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

export async function fazerCheckin(clienteId) {
  const { error } = await supabase.from('checkins').insert({ cliente_id: clienteId })
  return { erro: error ? traduzir(error) : null }
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
  return { erro: error ? traduzir(error) : null }
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

export async function listarCheckins({ clienteId, consultorId, pagina = 1 } = {}) {
  let consulta = supabase
    .from('checkins')
    .select(CAMPOS_DA_LISTA, { count: 'exact' })
    .order('inicio', { ascending: false })
    .order('id')
  if (clienteId) consulta = consulta.eq('cliente_id', clienteId)
  if (consultorId) consulta = consulta.eq('consultor_id', consultorId)
  return buscarPagina(consulta, pagina)
}
