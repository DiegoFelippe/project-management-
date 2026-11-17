// Check-list do cliente (a cópia do modelo de check-in que a gestão aplica e o consultor segue). O banco decide quem vê,
// quem aplica e quem marca (migração 20261117181313_checklists_dos_clientes.sql); aqui só se chama e traduz. Leituras
// devolvem os dados e sobem o erro do banco; escritas devolvem { erro } (o texto para a pessoa, ou null). Tudo vai por
// funções do banco: as tabelas do check-list não aceitam escrita direta.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const traduzir = (error) => traduzirErroBanco(error, { sobre: 'checklist' })

async function ler(funcao, argumentos) {
  const { data, error } = await supabase.rpc(funcao, argumentos)
  if (error) throw error
  return data ?? null
}

async function escrever(funcao, argumentos) {
  const { error } = await supabase.rpc(funcao, argumentos)
  return { erro: error ? traduzir(error) : null }
}

// A aba Check-ins do cliente numa leitura: { pode_aplicar, pode_marcar, consultor, checklist (o ativo, ou null), etapas,
// tarefas (com depende_de e na_sessao), resumo (os números, contados no banco), sessao (o check-in aberto neste cliente e
// o que foi marcado nele), ultimo_checkin }. null quando a pessoa não vê o cliente.
export const lerChecklist = (clienteId) => ler('checklist_do_cliente', { p_cliente: clienteId })

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

// estado: 'a_fazer' | 'andamento' | 'feita'. { estado, feita_em, liberadas: [{ id, titulo }], na_sessao, erro } — o que
// ficou livre e se a tarefa entrou no check-in aberto; com erro, só { erro }.
export async function marcarTarefa(tarefaId, estado) {
  const { data, error } = await supabase.rpc('marcar_tarefa', { p_tarefa: tarefaId, p_estado: estado })
  if (error) return { erro: traduzir(error) }
  return { ...data, erro: null }
}

// A nota da tarefa (até 500 letras; o banco tira os espaços das pontas e grava a em branco como nula). { erro }.
export const anotarTarefa = (tarefaId, nota) => escrever('anotar_tarefa', { p_tarefa: tarefaId, p_nota: nota ?? null })

// Quantos clientes usam o modelo (todos) e até 5 nomes que a pessoa vê: { clientes, nomes }; null quando não vê o
// modelo. Para a confirmação de apagar e arquivar.
export const usoDoModelo = (modeloId) => ler('uso_do_modelo', { p_modelo: modeloId })
