// Check-list do cliente (a cópia do modelo de check-in que a gestão aplica e o consultor segue). O banco decide quem vê,
// quem aplica e quem marca (migração 20261117181313_checklists_dos_clientes.sql); aqui só se chama e traduz. Leituras
// devolvem os dados e sobem o erro do banco; escritas devolvem { erro } (o texto para a pessoa, ou null). Tudo vai por
// funções do banco: as tabelas do check-list não aceitam escrita direta.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const traduzir = (error) => traduzirErroBanco(error, { sobre: 'checklist' })

// Recusas que dizem que a tela ficou velha: o check-list foi trocado ou tirado, o consultor do cliente mudou, o cliente
// foi arquivado, a pessoa perdeu o acesso, uma dependência foi reaberta ou a tarefa já estava "não se aplica" (com outro
// motivo). Com elas a resposta traz desatualizado: true, e quem chama relê o check-list.
const DESATUALIZADO = new Set([
  'checklist_encerrado', 'so_o_consultor_marca', 'sem_permissao', 'cliente_arquivado', 'tarefa_bloqueada', 'ja_nao_se_aplica',
])
const recusa = (error) => (DESATUALIZADO.has(error?.message) ? { erro: traduzir(error), desatualizado: true } : { erro: traduzir(error) })

async function ler(funcao, argumentos) {
  const { data, error } = await supabase.rpc(funcao, argumentos)
  if (error) throw error
  return data ?? null
}

async function escrever(funcao, argumentos) {
  const { error } = await supabase.rpc(funcao, argumentos)
  return error ? recusa(error) : { erro: null }
}

// A aba Check-ins do cliente numa leitura: { pode_aplicar, pode_marcar, consultor, checklist (o ativo, ou null), etapas,
// tarefas (com depende_de e na_sessao), resumo (os números, contados no banco), sessao (o check-in aberto neste cliente e
// o que foi marcado nele), ultimo_checkin }. null quando a pessoa não vê o cliente.
export const lerChecklist = (clienteId) => ler('checklist_do_cliente', { p_cliente: clienteId })

// Aba Andamento de Check-ins: uma página (15) dos clientes ativos que a pessoa vê, com o check-list ativo de cada um, do
// mais atrasado ao mais em dia e os sem modelo no fim. situacao: 'todos' | 'com_atraso' | 'sem_modelo'; busca no cliente
// e no nome do modelo (sem acento); consultoriaId só vale para a Central e consultorId para a Central e a gestão (o banco
// ignora o resto). { itens: [{ cliente: { id, nome, cidade, uf }, consultor: { id, nome, foto, cor } | null, consultoria:
// { id, nome } | null (só a Central), pode_aplicar, checklist: null | { id, modelo_nome, tarefas, feitas, pct, atrasadas,
// proxima: { titulo, vence_em } | null } }], total }; página que deixou de existir volta com foraDaFaixa.
export async function listarAndamento({ consultoriaId, consultorId, situacao = 'todos', busca, pagina = 1 } = {}) {
  const data = await ler('andamento_dos_clientes', {
    p_consultoria: consultoriaId || null,
    p_consultor: consultorId || null,
    p_situacao: situacao,
    p_busca: busca?.trim() || null,
    p_pagina: pagina,
  })
  const itens = data?.itens ?? []
  const total = data?.total ?? 0
  if (pagina > 1 && !itens.length) return { itens, total, foraDaFaixa: true }
  return { itens, total }
}

// Os modelos que dá para aplicar no cliente (busca no banco; os do tipo do consultor do cliente primeiro, até 20):
// { itens: [{ id, nome, tipo, da_central, etapas, tarefas, obrigatorias, maior_prazo, do_tipo_do_consultor }], total }.
export async function modelosParaAplicar({ clienteId, busca } = {}) {
  const data = await ler('modelos_para_aplicar', { p_cliente: clienteId, p_busca: busca?.trim() || null })
  return { itens: data?.itens ?? [], total: data?.total ?? 0 }
}

// Aplica (ou troca: o ativo é encerrado e o novo começa do zero) o modelo no cliente. inicio: 'aaaa-mm-dd'.
// { id (do check-list novo), erro }.
export async function aplicarModelo({ clienteId, modeloId, inicio }) {
  const { data, error } = await supabase.rpc('aplicar_modelo', {
    p_cliente: clienteId,
    p_modelo: modeloId,
    p_inicio: inicio,
  })
  if (error) return { id: null, erro: traduzir(error) }
  return { id: data, erro: null }
}

// Muda o início dos prazos (o banco recalcula o vencimento de cada tarefa, sem mexer no que foi feito). { erro }.
export const mudarInicio = (checklistId, inicio) =>
  escrever('mudar_inicio_do_checklist', { p_checklist: checklistId, p_inicio: inicio })

// Tira o modelo do cliente: o check-list se encerra e vira histórico. { erro }.
export const tirarModelo = (checklistId) => escrever('tirar_modelo', { p_checklist: checklistId })

// estado: 'a_fazer' | 'andamento' | 'feita' | 'nao_se_aplica' (este com o motivo, obrigatório: 1 a 500 letras; o banco
// tira os espaços das pontas). { estado, feita_em, liberadas: [{ id, titulo }], na_sessao, erro } — o que ficou livre e
// se a tarefa entrou no check-in aberto; com erro, só { erro } (e desatualizado, se a tela ficou velha; motivo em branco
// ou grande demais não é tela velha).
export async function marcarTarefa(tarefaId, estado, motivo) {
  const argumentos = { p_tarefa: tarefaId, p_estado: estado }
  if (estado === 'nao_se_aplica') argumentos.p_motivo = motivo ?? null
  const { data, error } = await supabase.rpc('marcar_tarefa', argumentos)
  if (error) return recusa(error)
  return { ...data, erro: null }
}

// A nota da tarefa (até 500 letras; o banco tira os espaços das pontas e grava a em branco como nula). { erro } (e
// desatualizado, como em marcarTarefa).
export const anotarTarefa = (tarefaId, nota) => escrever('anotar_tarefa', { p_tarefa: tarefaId, p_nota: nota ?? null })

// Quantos clientes que a pessoa vê usam o modelo (a Central, todos; a gestão, os da consultoria; o consultor, os dele) e
// até 5 nomes deles: { clientes, nomes }; null quando não vê o modelo. Para a confirmação de apagar e arquivar (apagar
// modelo em uso é recusado pelo banco de qualquer jeito, mesmo que o uso seja de quem a pessoa não vê).
export const usoDoModelo = (modeloId) => ler('uso_do_modelo', { p_modelo: modeloId })
