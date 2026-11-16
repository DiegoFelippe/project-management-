// Clientes. O banco (RLS e gatilhos) decide quem vê e quem muda o quê; aqui só montamos as consultas.
import { traduzirErroBanco } from '@/lib/erros'
import { normalizarCnpj } from '@/lib/cnpj'
import { supabase } from '@/lib/supabase'
import { padraoDeBusca } from '@/lib/busca'
import { buscarPagina, POR_PAGINA } from './paginar'

const CAMPOS_DA_LISTA =
  'id, nome, razao_social, cnpj, cidade, uf, horas_mes, enviado_em, consultor_desde, arquivado, ' +
  'consultoria_id, consultor_id, consultoria:consultorias(id, nome), consultor(id, nome, foto, ativo), ' +
  'realizado_no_mes'
const CAMPOS_DO_CLIENTE =
  `${CAMPOS_DA_LISTA}, contato_nome, contato_telefone, contato_email, observacoes, criado_em, atualizado_em`

const erroSemPermissao = () => traduzirErroBanco({ code: '42501' }, { sobre: 'cliente' })

// Resultado de uma escrita: { erro } traduzido; nenhuma linha afetada = sem permissão (o RLS esconde a linha).
function resultadoDaEscrita({ data, error }) {
  if (error) return { erro: traduzirErroBanco(error, { sobre: 'cliente' }) }
  if (!data?.length) return { erro: erroSemPermissao() }
  return { erro: null }
}

const texto = (valor) => {
  const limpo = String(valor ?? '').trim()
  return limpo === '' ? null : limpo
}

function paraColunas(dados) {
  return {
    nome: texto(dados.nome),
    razao_social: texto(dados.razaoSocial),
    cnpj: texto(normalizarCnpj(dados.cnpj)),
    cidade: texto(dados.cidade),
    uf: texto(dados.uf),
    contato_nome: texto(dados.contatoNome),
    contato_telefone: texto(dados.contatoTelefone),
    contato_email: texto(dados.contatoEmail),
    observacoes: texto(dados.observacoes),
    horas_mes: dados.horasMes,
  }
}

// Uma página de clientes, filtrada e paginada no banco.
export async function listarClientes({ aba, consultoriaId, consultorId, busca, pagina = 1 } = {}) {
  let consulta = supabase.from('clientes').select(CAMPOS_DA_LISTA, { count: 'exact' }).order('nome').order('id')
  // Só a aba Arquivados mostra arquivados; todas as outras ficam com os ativos.
  consulta = consulta.eq('arquivado', aba === 'arquivados')
  if (aba === 'distribuir') consulta = consulta.is('consultoria_id', null)
  else if (aba === 'nas_consultorias') consulta = consulta.not('consultoria_id', 'is', null)
  else if (aba === 'aguardando') consulta = consulta.not('consultoria_id', 'is', null).is('consultor_id', null)
  else if (aba === 'atendimento') consulta = consulta.not('consultor_id', 'is', null)
  // O id de quem olha vem de quem chama (perfil.id); sem ele, não há o que listar.
  else if (aba === 'meus' && !consultorId) return { itens: [], total: 0 }
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  if (consultorId === 'sem') consulta = consulta.is('consultor_id', null)
  else if (consultorId) consulta = consulta.eq('consultor_id', consultorId)
  const padrao = padraoDeBusca(busca)
  if (padrao) consulta = consulta.ilike('busca', padrao)
  return buscarPagina(consulta, pagina)
}

export async function buscarCliente(id) {
  const { data, error } = await supabase.from('clientes').select(CAMPOS_DO_CLIENTE).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function criarCliente(dados) {
  const { data, error } = await supabase.from('clientes').insert(paraColunas(dados)).select('id').single()
  if (error) return { erro: traduzirErroBanco(error, { sobre: 'cliente' }) }
  return { id: data.id }
}

async function mudar(id, colunas) {
  return resultadoDaEscrita(await supabase.from('clientes').update(colunas).eq('id', id).select('id'))
}

export function editarCliente(id, dados) {
  return mudar(id, paraColunas(dados))
}

export function mandarParaConsultoria(id, consultoriaId) {
  return mudar(id, { consultoria_id: consultoriaId })
}

export function escolherConsultor(id, consultorId) {
  return mudar(id, { consultor_id: consultorId })
}

export function ajustarPrevisao(id, horasMes) {
  return mudar(id, { horas_mes: horasMes })
}

export function arquivarCliente(id) {
  return mudar(id, { arquivado_em: new Date().toISOString() })
}

export function reativarCliente(id) {
  return mudar(id, { arquivado_em: null })
}

export async function apagarCliente(id) {
  return resultadoDaEscrita(await supabase.from('clientes').delete().eq('id', id).select('id'))
}

// Histórico do cliente, do mais novo para o mais antigo. Os nomes vêm resolvidos pelo banco, que esconde
// (devolve null) o que é de outra consultoria. Devolve { itens, total }.
export async function listarEventos(clienteId, { pagina = 1 } = {}) {
  const { data, error } = await supabase.rpc('historico_do_cliente', {
    p_cliente: clienteId,
    p_limite: POR_PAGINA,
    p_deslocamento: (pagina - 1) * POR_PAGINA,
  })
  if (error) throw error
  return { itens: data, total: data.length > 0 ? Number(data[0].total) : 0 }
}
