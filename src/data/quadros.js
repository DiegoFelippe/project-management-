// Quadros pessoais e de time (o menu Quadros). O banco decide quem vê, quem cria e quem administra (migrações
// 20261118013057_quadros_pessoais_e_de_time.sql e 20261118021415_quadros_do_menu.sql); aqui só se chama e traduz.
// Leituras devolvem os dados ({ itens, total } nas listas) e sobem o erro do banco, como as de quadro.js; escritas
// devolvem { erro } (o texto para a pessoa, ou null). Abrir um quadro é o quadroPorId de quadro.js (que traz tipo, nome,
// time, arquivado_em, pode_administrar e favorito nos quadros do menu), e dentro dele tudo é como no quadro do cliente.
// Cada item das listas: { id, nome, tipo: 'pessoa' | 'time', time: { id, nome } | null, cartoes (não arquivados),
// favorito }.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { OBJETOS_FICARAM, tirarDoBalde } from './quadro'

// Tamanho da página da janela de quadros arquivados (a função do banco devolve 15 por vez).
export const QUADROS_ARQUIVADOS_POR_PAGINA = 15

const traduzir = (error) => traduzirErroBanco(error, { sobre: 'quadro' })
const SEM_PERMISSAO = traduzir({ code: '42501' })
const termoOuNulo = (termo) => termo?.trim() || null
const lista = (data) => ({ itens: data?.itens ?? [], total: data?.total ?? 0 })

async function ler(funcao, parametros) {
  const { data, error } = await supabase.rpc(funcao, parametros)
  if (error) throw error
  return data
}

// Update direto em quadros (renomear, arquivar, restaurar): nenhuma linha de volta = a regra do banco recusou (quem não
// administra) ou o quadro sumiu. `nomeEmUso`: o texto do 23505 (nome repetido entre os abertos), quando é outro.
async function atualizarQuadro(id, campos, { nomeEmUso } = {}) {
  const { data, error } = await supabase.from('quadros').update(campos).eq('id', id).select('id')
  if (error?.code === '23505' && nomeEmUso) return { erro: nomeEmUso }
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: SEM_PERMISSAO }
  return { erro: null }
}

// ── Leituras ─────────────────────────────────────────────────────────────────

// O seletor de quadros: { favoritos, meus, dosTimes }, cada um { itens, total }, só com os abertos que a pessoa vê.
// Busca sem acento no banco; `limite` (1 a 50) itens por grupo, e o total de todos os que casam ("20 de 230"). Dos times
// vem pelo nome do time e depois do quadro; central e dono não têm Dos times.
export async function quadrosParaEscolher({ termo = '', limite = 20 } = {}) {
  const data = await ler('quadros_para_escolher', { p_busca: termoOuNulo(termo), p_limite: limite })
  return { favoritos: lista(data?.favoritos), meus: lista(data?.meus), dosTimes: lista(data?.dos_times) }
}

// Os Recentes: os quadros desses ids (guardados no navegador) que a pessoa ainda vê e estão abertos, na ordem dada (até
// 20). O resto some sem erro (a tela tira da memória os que não voltaram).
export async function quadrosPorIds(ids) {
  const pedidos = (ids ?? []).filter(Boolean)
  if (!pedidos.length) return []
  return (await ler('quadros_por_ids', { p_ids: pedidos })) ?? []
}

// Os arquivados que a pessoa vê, mais recentes primeiro, 15 por página: { itens, total }. tipo: 'pessoa' | 'time' |
// vazio (os dois). Cada item também traz arquivado_em e pode_administrar (restaurar e apagar).
export async function quadrosArquivados({ busca, tipo, pagina = 1 } = {}) {
  return lista(await ler('quadros_arquivados', { p_busca: termoOuNulo(busca), p_tipo: tipo || null, p_pagina: pagina }))
}

// Os times em que a pessoa pode criar quadro (o administrador: todos os da consultoria), pelo nome, com busca no banco:
// { itens: [{ id, nome }], total }.
export async function timesParaNovoQuadro({ termo = '', limite = 50 } = {}) {
  return lista(await ler('times_para_novo_quadro', { p_busca: termoOuNulo(termo), p_limite: limite }))
}

// ── Escritas ─────────────────────────────────────────────────────────────────

// Quadro novo (nasce com "A fazer", "Em andamento" e "Concluído"): sem timeId, pessoal; com timeId, do time.
// { id, erro }: id do quadro criado, ou null com o texto da recusa (nome em uso, nome inválido, time indisponível).
export async function criarQuadro({ nome, timeId = null } = {}) {
  const { data, error } = await supabase.rpc('criar_quadro', { p_nome: nome?.trim() ?? null, p_time: timeId || null })
  if (error) return { id: null, erro: traduzir(error) }
  return { id: data.id, erro: null }
}

// Renomear, arquivar e restaurar: só quem administra (no pessoal, a pessoa; no do time, o gestor do time e o
// administrador). Quadro arquivado não se renomeia (restaure antes); a hora do arquivamento é a do banco; restaurar com
// um nome que já está em uso entre os abertos é recusado.
export function renomearQuadro(id, nome) {
  return atualizarQuadro(id, { nome: nome?.trim() ?? null })
}

export function arquivarQuadro(id) {
  return atualizarQuadro(id, { arquivado_em: new Date().toISOString() })
}

// Restaurar com um nome já em uso entre os abertos (23505): o texto do design diz o que fazer.
export const NOME_EM_USO_AO_RESTAURAR = 'Já existe um quadro aberto com esse nome. Renomeie um deles e tente de novo.'

export function restaurarQuadro(id) {
  return atualizarQuadro(id, { arquivado_em: null }, { nomeEmUso: NOME_EM_USO_AO_RESTAURAR })
}

// Acende (favorito = true) ou apaga a estrela do quadro para quem está logado. Já marcado ou já desmarcado não é erro;
// quadro que a pessoa não vê (ou de cliente) é recusado ao marcar.
export async function marcarFavorito(quadroId, favorito) {
  if (favorito) {
    const { error } = await supabase.from('quadro_favoritos').insert({ quadro_id: quadroId })
    if (!error || error.code === '23505') return { erro: null } // 23505: já estava marcado
    return { erro: traduzir(error) }
  }
  const { error } = await supabase.from('quadro_favoritos').delete().eq('quadro_id', quadroId).select('quadro_id')
  return { erro: error ? traduzir(error) : null }
}

// Apaga o quadro (só quem administra) com as colunas, os cartões (checklist, comentários, responsáveis e anexos) e os
// favoritos; depois tira do balde os objetos da pasta dele (o banco devolve os caminhos). { erro } e `aviso` quando
// algum objeto não saiu (o quadro continua apagado).
export async function apagarQuadro(id) {
  const { data, error } = await supabase.rpc('apagar_quadro', { p_quadro: id })
  if (error) return { erro: traduzir(error) }
  if (!(await tirarDoBalde(data?.caminhos ?? []))) return { erro: null, aviso: OBJETOS_FICARAM }
  return { erro: null }
}
