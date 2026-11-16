// Check-ins (horas atendidas). O banco confere quem pode, sobreposição, futuro e tamanho.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

const CAMPOS_DA_LISTA =
  'id, inicio, fim, descricao, consultor_id, consultoria_id, consultor:perfis(nome), ' +
  'cliente:cliente_do_checkin(id, nome)'

const traduzir = (erro) => traduzirErroBanco(erro, { sobre: 'checkin' })

function resultadoDaEscrita({ data, error }) {
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: traduzirErroBanco({ code: '42501' }, { sobre: 'checkin' }) }
  return { erro: null }
}

// O check-in que eu deixei aberto (no máximo um), com o nome do cliente; ou null.
export async function meuCheckinAberto() {
  const { data: sessao } = await supabase.auth.getUser()
  const eu = sessao?.user?.id
  if (!eu) return null
  const { data, error } = await supabase
    .from('checkins')
    .select('id, cliente_id, inicio, cliente:cliente_do_checkin(nome)')
    .eq('consultor_id', eu)
    .is('fim', null)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fazerCheckin(clienteId) {
  const { error } = await supabase.from('checkins').insert({ cliente_id: clienteId })
  return { erro: error ? traduzir(error) : null }
}

export async function fazerCheckout(id, descricao) {
  return resultadoDaEscrita(
    await supabase.from('checkins').update({ fim: new Date().toISOString(), descricao: descricao?.trim() }).eq('id', id).select('id'),
  )
}

// Horas lançadas depois de feitas (início e fim informados).
export async function lancarHoras({ clienteId, inicio, fim, descricao }) {
  const { error } = await supabase
    .from('checkins')
    .insert({ cliente_id: clienteId, inicio, fim, descricao: descricao?.trim() })
  return { erro: error ? traduzir(error) : null }
}

export async function editarCheckin(id, { inicio, fim, descricao }) {
  return resultadoDaEscrita(
    await supabase.from('checkins').update({ inicio, fim, descricao: descricao?.trim() }).eq('id', id).select('id'),
  )
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
