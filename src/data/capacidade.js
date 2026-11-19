// Capacidade: ocupação dos consultores e das consultorias, carga semanal e ausências.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

const semPermissao = () => traduzirErroBanco({ code: '42501' }, { sobre: 'cliente' })

function resultadoDaEscrita({ data, error }) {
  if (error) return { erro: traduzirErroBanco(error, { sobre: 'cliente' }) }
  if (!data?.length) return { erro: semPermissao() }
  return { erro: null }
}

async function ocupacao(funcao, argumentos) {
  const { data, error } = await supabase.rpc(funcao, argumentos)
  if (error) throw error
  const itens = data ?? []
  return { itens, total: Number(itens[0]?.total ?? 0) }
}

export function consultoresPorOcupacao({ consultoriaId, busca, limite = 8, deslocamento = 0, mes } = {}) {
  return ocupacao('consultores_por_ocupacao', {
    p_consultoria: consultoriaId ?? null,
    p_busca: busca ?? null,
    p_limite: limite,
    p_deslocamento: deslocamento,
    p_mes: mes ?? null,
  })
}

// Ocupação de uma página de pessoas (até 100 ids) numa chamada só: { [id]: { capacidade, reservado, realizado,
// ocupacao, clientes } }. Quem a pessoa que chama não pode ver não aparece.
export async function ocupacaoDasPessoas({ ids, mes } = {}) {
  if (!ids?.length) return {}
  const { data, error } = await supabase.rpc('ocupacao_das_pessoas', { p_ids: ids, p_mes: mes ?? null })
  if (error) throw error
  return Object.fromEntries(
    (data ?? []).map(({ id, ...resto }) => [id, resto]),
  )
}

export function consultoriasPorOcupacao({ busca, limite = 8, deslocamento = 0, mes } = {}) {
  return ocupacao('consultorias_por_ocupacao', {
    p_busca: busca ?? null,
    p_limite: limite,
    p_deslocamento: deslocamento,
    p_mes: mes ?? null,
  })
}

export async function definirCarga(perfilId, horas) {
  const { error } = await supabase.rpc('definir_carga', { p_perfil: perfilId, p_horas: horas })
  return { erro: error ? traduzirErroBanco(error, { sobre: 'cliente' }) : null }
}

export async function listarAusencias(perfilId, { pagina = 1 } = {}) {
  const consulta = supabase
    .from('ausencias')
    .select('id, perfil_id, de, ate, motivo', { count: 'exact' })
    .eq('perfil_id', perfilId)
    .order('de', { ascending: false })
    .order('id')
  return buscarPagina(consulta, pagina)
}

export async function criarAusencia({ perfilId, de, ate, motivo }) {
  const { error } = await supabase.from('ausencias').insert({ perfil_id: perfilId, de, ate, motivo: motivo?.trim() })
  return { erro: error ? traduzirErroBanco(error, { sobre: 'cliente' }) : null }
}

export async function editarAusencia(id, { de, ate, motivo }) {
  return resultadoDaEscrita(
    await supabase.from('ausencias').update({ de, ate, motivo: motivo?.trim() }).eq('id', id).select('id'),
  )
}

export async function apagarAusencia(id) {
  return resultadoDaEscrita(await supabase.from('ausencias').delete().eq('id', id).select('id'))
}
