// Agenda (leituras). O banco (RLS) decide quem vê cada evento; quem grava é a Edge Function, que mexe no Google junto.
import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'

// Eventos que tocam o período [de, ate) (ISO), com consultor, cliente e participantes (com nome) numa chamada só:
// { itens, haMais }. O banco decide quem vê o quê e usa índice por papel; consultorId, consultoriaId e clienteId são
// filtros opcionais rodados lá. haMais avisa que o período tem mais eventos do que o teto da chamada (1.000).
export async function eventosDoPeriodo({ de, ate, consultorId, consultoriaId, clienteId } = {}) {
  const { data, error } = await supabase.rpc('eventos_do_periodo', {
    p_de: de,
    p_ate: ate,
    p_consultor: consultorId ?? null,
    p_consultoria: consultoriaId ?? null,
    p_cliente: clienteId ?? null,
  })
  if (error) throw error
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
}

// Um evento no mesmo formato dos itens acima; null quando não existe ou a pessoa não pode vê-lo.
export async function buscarEvento(id) {
  const { data, error } = await supabase.rpc('evento_da_agenda', { p_id: id })
  if (error) throw error
  return data
}

// { semana, mes, aguardando, pastas_no_mes } no recorte de quem chama; dia: 'AAAA-MM-DD'.
export async function indicadoresDaAgenda(dia) {
  const { data, error } = await supabase.rpc('indicadores_da_agenda', { p_dia: dia })
  if (error) throw error
  return data
}

// Ausências (dias inteiras) que tocam o período, com o nome de quem se ausenta: { itens, haMais }; de e ate:
// 'AAAA-MM-DD' (inclusive). Vem de uma função do banco (o gestor lê as ausências da consultoria sem precisar ler o
// perfil de cada consultor); cada item: { id, perfil_id, de, ate, motivo, pessoa: { id, nome, cor } }.
export async function ausenciasDoPeriodo({ de, ate, consultorId, consultoriaId } = {}) {
  const { data, error } = await supabase.rpc('ausencias_do_periodo', {
    p_de: de,
    p_ate: ate,
    p_consultor: consultorId ?? null,
    p_consultoria: consultoriaId ?? null,
  })
  if (error) throw error
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
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

// ── Conectar o meu Google (Edge Function google-pessoa; o token nunca chega ao navegador) ──

async function googlePessoa(corpo) {
  const { status, corpo: resposta } = await chamarFuncao('google-pessoa', corpo)
  if (status === 200) return { erro: null, ...resposta }
  return { erro: traduzirErroFuncao(resposta.codigo) }
}

// "Conectar Google": { erro, url }. A tela leva a pessoa para a url (window.location.assign); o Google volta para
// /calendario com ?code=…&state=… (ou ?error=…), e a tela chama concluirGoogle com o que voltaDoGoogle leu.
export async function conectarGoogle() {
  const { erro, url } = await googlePessoa({ acao: 'conectar' })
  return erro ? { erro } : { erro: null, url }
}

// O que o Google devolveu na volta para /calendario: { estado, codigo, recusou } ou null quando a página não veio
// do Google. busca: location.search (texto) ou URLSearchParams.
export function voltaDoGoogle(busca) {
  const parametros = busca instanceof URLSearchParams ? busca : new URLSearchParams(busca ?? '')
  const estado = parametros.get('state')
  if (!estado) return null
  const codigo = parametros.get('code')
  if (codigo) return { estado, codigo, recusou: false }
  return parametros.get('error') ? { estado, codigo: null, recusou: true } : null
}

// Termina a conexão: { erro, email } (o e-mail da conta do Google conectada).
export async function concluirGoogle({ estado, codigo }) {
  const { erro, email } = await googlePessoa({ acao: 'concluir', estado, codigo })
  return erro ? { erro } : { erro: null, email }
}

// Desconectar: revoga no Google e apaga a conexão. revogado false = apagou aqui, mas o Google não confirmou.
export async function desconectarGoogle() {
  const { erro, revogado } = await googlePessoa({ acao: 'desconectar' })
  return erro ? { erro } : { erro: null, revogado }
}
