// Agenda (leituras). O banco (RLS) decide quem vê cada evento; quem grava é a Edge Function, que mexe no Google junto.
import { supabase } from '@/lib/supabase'

// A tela pede só o período visível; este teto protege contra um período enorme (mês cheio da central).
const LIMITE_DO_PERIODO = 2000

// Participantes (da casa e de fora) e cliente vêm na mesma consulta. O nome de quem não é visível ao colega vem nulo.
const CAMPOS_DO_EVENTO =
  'id, consultoria_id, consultor_id, cliente_id, titulo, descricao, inicio, fim, dia_inteiro, cor, com_meet, ' +
  'gravar, meet_link, meet_codigo, google_evento_id, reuniao, reuniao_erro, gravacao_url, pasta_id, criado_por, ' +
  'criado_em, atualizado_em, ' +
  'consultor:perfis!consultor_id(id, nome, cor), cliente:clientes(id, nome), ' +
  'participantes:agenda_participantes(id, perfil_id, email, resposta, perfil:perfis(id, nome))'

// Eventos que tocam o período [de, ate) (ISO): começam antes do fim dele e terminam depois do começo.
// consultorId, consultoriaId e clienteId são filtros opcionais, rodados no banco.
export async function eventosDoPeriodo({ de, ate, consultorId, consultoriaId, clienteId } = {}) {
  let consulta = supabase
    .from('agenda_eventos')
    .select(CAMPOS_DO_EVENTO)
    .lt('inicio', ate)
    .gt('fim', de)
    .order('inicio', { ascending: true })
    .limit(LIMITE_DO_PERIODO)
  if (consultorId) consulta = consulta.eq('consultor_id', consultorId)
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  if (clienteId) consulta = consulta.eq('cliente_id', clienteId)
  const { data, error } = await consulta
  if (error) throw error
  return data ?? []
}

// Um evento com participantes e cliente; null quando não existe ou a pessoa não pode vê-lo.
export async function buscarEvento(id) {
  const { data, error } = await supabase.from('agenda_eventos').select(CAMPOS_DO_EVENTO).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// { semana, mes, aguardando, pastas_no_mes } no recorte de quem chama; dia: 'AAAA-MM-DD'.
export async function indicadoresDaAgenda(dia) {
  const { data, error } = await supabase.rpc('indicadores_da_agenda', { p_dia: dia })
  if (error) throw error
  return data
}

// Ausências (dias inteiros) que tocam o período; de e ate: 'AAAA-MM-DD' (inclusive).
export async function ausenciasDoPeriodo({ de, ate, consultorId, consultoriaId } = {}) {
  let consulta = supabase
    .from('ausencias')
    .select(
      consultoriaId
        ? 'id, perfil_id, de, ate, motivo, perfil:perfis!inner(id, nome, cor, consultoria_id)'
        : 'id, perfil_id, de, ate, motivo, perfil:perfis(id, nome, cor)',
    )
    .lte('de', ate)
    .gte('ate', de)
    .order('de', { ascending: true })
    .limit(LIMITE_DO_PERIODO)
  if (consultorId) consulta = consulta.eq('perfil_id', consultorId)
  if (consultoriaId) consulta = consulta.eq('perfil.consultoria_id', consultoriaId)
  const { data, error } = await consulta
  if (error) throw error
  return data ?? []
}

// Feriados nacionais entre duas datas ('AAAA-MM-DD', inclusive): lista de datas.
export async function feriadosDoPeriodo(de, ate) {
  const { data, error } = await supabase.rpc('feriados_do_periodo', { p_de: de, p_ate: ate })
  if (error) throw error
  return data ?? []
}

// O Google que eu conectei: { conectado, email, erro }. O banco só devolve e-mail, quando conectou e o erro
// (nunca o token), e só da minha linha.
export async function meuGoogle() {
  const { data, error } = await supabase.from('google_pessoas').select('email, conectado_em, erro').maybeSingle()
  if (error) throw error
  return { conectado: Boolean(data), email: data?.email ?? null, erro: data?.erro ?? null }
}
