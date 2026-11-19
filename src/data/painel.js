// Painel do Início e os gráficos dele: os números do mês ou de um período, já no recorte de quem chama (tudo,
// consultoria ou pessoa). Cada função chama uma função do banco e devolve o JSON dela como está (a tela não recalcula
// nada); o Início chama todas em paralelo e cada bloco carrega e falha sozinho.
import { supabase } from '@/lib/supabase'

// periodo: o mês 'AAAA-MM-01' (ou nulo para o mês atual) ou { de, ate } ('AAAA-MM-DD', dias de São Paulo, inclusive).
export function argumentosDoPeriodo(periodo) {
  return periodo?.de ? { p_de: periodo.de, p_ate: periodo.ate } : { p_mes: periodo ?? null }
}

// Campos que são sempre texto (nomes, ids, datas e rótulos): um nome "123" continua nome.
const TEXTO = new Set(['id', 'nome', 'sub', 'consultor_nome', 'consultoria_nome', 'situacao', 'recorte', 'forma', 'mes',
  'de', 'ate', 'ate_efetivo', 'capacidade_ate', 'semana', 'ultimo_checkin', 'cidade', 'uf'])
const NUMERO = /^-?\d+(\.\d+)?$/

// O JSON vem do banco com números de verdade; se algum vier como texto, vira Number (os gráficos fazem conta com eles).
function comNumeros(valor, chave) {
  if (Array.isArray(valor)) return valor.map((item) => comNumeros(item, chave))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, comNumeros(v, k)]))
  }
  if (typeof valor === 'string' && !TEXTO.has(chave) && NUMERO.test(valor)) return Number(valor)
  return valor
}

async function chamar(nome, argumentos) {
  const { data, error } = await supabase.rpc(nome, argumentos)
  if (error) throw error
  return temTexto(data) ? comNumeros(data) : data
}

// Sem nenhum número em texto, o objeto do banco volta como veio (o mesmo objeto).
function temTexto(valor, chave) {
  if (Array.isArray(valor)) return valor.some((item) => temTexto(item, chave))
  if (valor && typeof valor === 'object') return Object.entries(valor).some(([k, v]) => temTexto(v, k))
  return typeof valor === 'string' && !TEXTO.has(chave) && NUMERO.test(valor)
}

// { recorte, mes, intervalo, de, ate, ate_efetivo, passado, capacidade_ate, indicadores, horas_por_mes, ranking,
// ranking_resumo }.
export const painelDoInicio = (periodo) => chamar('painel_do_inicio', argumentosDoPeriodo(periodo))

// Os números do período anterior ao efetivo: { de, ate, forma, indicadores } (tudo nulo com o período efetivo vazio).
export const comparacaoDoInicio = (periodo) => chamar('comparacao_do_inicio', argumentosDoPeriodo(periodo))

// A fila de hoje e o que aconteceu no período (central e gestão; o consultor recebe sem_recorte, 42501).
export const filaDeClientes = (periodo) => chamar('fila_de_clientes', argumentosDoPeriodo(periodo))

// Clientes em risco hoje (não depende do período): { itens, total, sem_checkin, acima_do_ritmo }, 15 por página.
export const clientesEmRisco = (pagina = 1) => chamar('clientes_em_risco', { p_pagina: pagina })

// Sem página: os 10 maiores, o resto e as participações; com página: { itens (15), total }.
export const horasPorCliente = (periodo, pagina = null) =>
  chamar('horas_por_cliente', { ...argumentosDoPeriodo(periodo), p_pagina: pagina })

// { semanas, media, pico }.
export const checkinsPorSemana = (periodo) => chamar('checkins_por_semana', argumentosDoPeriodo(periodo))

// O burn-up: { dias: [{ dia, horas }] (todos os dias do período), capacidade (do período inteiro), hoje }.
export const horasDoPainelPorDia = (periodo) => chamar('horas_do_painel_por_dia', argumentosDoPeriodo(periodo))

// Central (por consultoria) e gestão (por consultor): { recorte, semanas: ['AAAA-MM-DD'], series: [{ id, nome, horas: [] }] },
// as 8 maiores e { id: null, nome: 'Outros' }. O consultor recebe sem_recorte (42501).
export const horasPorUnidadePorSemana = (periodo) => chamar('horas_por_unidade_por_semana', argumentosDoPeriodo(periodo))

// O calor das últimas 8 semanas do período (o período inteiro, se for mais curto): { de, ate (a janela usada), celulas:
// [{ dia_semana (domingo = 0), hora (7 a 20), checkins }] }, as 98 células.
export const checkinsPorDiaEHora = (periodo) => chamar('checkins_por_dia_e_hora', argumentosDoPeriodo(periodo))

// A rosca, hoje (não depende do período): { feitas, nao_se_aplica, andamento, pausadas, a_fazer, atrasadas, checklists }.
export const tarefasPorSituacao = () => chamar('tarefas_por_situacao', {})

// Central e gestão, hoje: { cidades: [{ cidade, uf, clientes }] (as 6 maiores e, no fim, "Sem cidade" com cidade nula),
// outras, total }. O consultor recebe sem_recorte (42501).
export const clientesPorCidade = () => chamar('clientes_por_cidade', {})
