// Quadro Kanban do cliente. O banco decide quem vê e quem mexe (as regras das tabelas e as funções do quadro, migração
// 20261117112951_quadro.sql); aqui só se chama e traduz. Leituras devolvem os dados ({ itens, total } nas listas) e
// sobem o erro do banco; escritas devolvem { erro } (o texto para a pessoa, ou null) e, quando criam algo, o que foi
// criado.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

// Tamanhos de página das funções do banco: cartões por coluna ("ver mais") e a janela de arquivados (Tabela).
export const CARTOES_POR_PAGINA = 50
export const ARQUIVADOS_POR_PAGINA = 15
export const COMENTARIOS_POR_VEZ = 30

const SEM_PERMISSAO = traduzirErroBanco({ code: '42501' })

const comErro = (error) => ({ erro: traduzirErroBanco(error) })

// Escrita direta pela API com .select(...): nenhuma linha de volta = a regra do banco recusou (ou o item já sumiu).
function resultadoDaEscrita({ data, error }) {
  if (error) return comErro(error)
  if (!data?.length) return { erro: SEM_PERMISSAO }
  return { erro: null }
}

async function ler(funcao, parametros) {
  const { data, error } = await supabase.rpc(funcao, parametros)
  if (error) throw error
  return data
}

// Filtros da barra do quadro, como as funções do banco recebem: busca (título e descrição, sem acento), prioridade
// ('baixa' | 'media' | 'alta'), responsavel ('sem' ou o id da pessoa) e prazo ('atrasados' | 'proximos_7_dias' |
// 'sem_prazo'). Vazio = sem filtro.
function parametrosDosFiltros({ busca, prioridade, responsavel, prazo } = {}) {
  return {
    p_busca: busca?.trim() || null,
    p_prioridade: prioridade || null,
    p_responsavel: responsavel || null,
    p_prazo: prazo || null,
  }
}

// Só os campos que vieram (undefined = não muda); textos sem os espaços das pontas.
function soOsCampos(campos, permitidos) {
  const saida = {}
  for (const nome of permitidos) {
    if (campos?.[nome] === undefined) continue
    const valor = campos[nome]
    saida[nome] = typeof valor === 'string' ? valor.trim() : valor
  }
  return saida
}

// ── Leituras ─────────────────────────────────────────────────────────────────

// O quadro do cliente na consultoria que o atende: { id, cliente_id, consultoria_id, criado_em, pode_mexer, pode_gerir,
// colunas: [{ id, nome, cor, concluidos, posicao, cartoes, arquivados }] }. Na primeira vez, quem mexe cria o quadro
// com "A fazer", "Em andamento" e "Concluído". null quando a pessoa não vê o cliente ou só lê e ainda não há quadro.
export async function quadroDoCliente(clienteId) {
  if (!clienteId) return null
  return (await ler('quadro_do_cliente', { p_cliente: clienteId })) ?? null
}

// Uma página (50) dos cartões não arquivados de uma coluna, com os filtros: { itens, total }. Cada item traz
// responsaveis [{ id, nome, foto, cor }], checklist { total, feitos }, comentarios (quantos), autor { id, nome } e o
// resumo da descrição.
export async function cartoesDoQuadro({ quadroId, colunaId, pagina = 1, ...filtros } = {}) {
  const data = await ler('cartoes_do_quadro', {
    p_quadro: quadroId,
    p_coluna: colunaId,
    p_pagina: pagina,
    ...parametrosDosFiltros(filtros),
  })
  return { itens: data?.itens ?? [], total: data?.total ?? 0 }
}

// Os 4 números do topo com os mesmos filtros: { cartoes, atrasados, vencem_em_7_dias, sem_responsavel }.
export async function indicadoresDoQuadro({ quadroId, ...filtros } = {}) {
  const data = await ler('indicadores_do_quadro', { p_quadro: quadroId, ...parametrosDosFiltros(filtros) })
  return { cartoes: 0, atrasados: 0, vencem_em_7_dias: 0, sem_responsavel: 0, ...data }
}

// Arquivados do quadro (mais recentes primeiro), 15 por página, com busca: { itens, total }. Cada item: { id, titulo,
// prioridade, prazo, arquivado_em, criado_em, coluna: { id, nome } }.
export async function cartoesArquivados({ quadroId, busca, pagina = 1 } = {}) {
  const data = await ler('cartoes_arquivados', { p_quadro: quadroId, p_busca: busca?.trim() || null, p_pagina: pagina })
  return { itens: data?.itens ?? [], total: data?.total ?? 0 }
}

// Quem pode ser responsável (o consultor do cliente e a gestão da consultoria, ativos), pelo nome (busca no banco):
// { itens: [{ id, nome, foto, cor }], total } (total = os que vieram).
export async function pessoasDoQuadro({ quadroId, termo = '', limite = 50 } = {}) {
  if (!quadroId) return { itens: [], total: 0 }
  const itens = (await ler('pessoas_do_quadro', { p_quadro: quadroId, p_busca: termo?.trim() || null, p_limite: limite })) ?? []
  return { itens, total: itens.length }
}

// O cartão inteiro para a janela: campos, descricao (JSON do editor), coluna, criado_por, responsaveis, checklist,
// comentarios (quantos), pode_mexer e pode_apagar. null quando não existe ou a pessoa não o vê.
export async function buscarCartao(id) {
  if (!id) return null
  return (await ler('cartao_do_quadro', { p_cartao: id })) ?? null
}

// Comentários do cartão, mais recentes primeiro, 30 por vez: { itens, haMais }. "Ver anteriores": antesId = o id do
// mais antigo já mostrado. Cada item: { id, texto, criado_em, editado_em, autor: { id, nome, foto, cor } }.
export async function comentariosDoCartao({ cartaoId, antesId = null, limite = COMENTARIOS_POR_VEZ } = {}) {
  const data = await ler('comentarios_do_cartao', { p_cartao: cartaoId, p_antes: antesId, p_limite: limite })
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
}

// ── Mover e apagar coluna (funções do banco) ─────────────────────────────────

// Põe o cartão na coluna, logo depois de antesId (o cartão de cima) ou logo antes de depoisId (o de baixo); sem os
// dois, no fim. O banco calcula a posição com o que está gravado: { erro, cartao: { id, coluna_id, posicao },
// renumerou } (renumerou: recarregar a coluna, as posições dela mudaram).
export async function moverCartao({ cartaoId, colunaId, antesId = null, depoisId = null }) {
  const { data, error } = await supabase.rpc('mover_cartao', {
    p_cartao: cartaoId,
    p_coluna: colunaId,
    p_antes: antesId,
    p_depois: depoisId,
  })
  if (error) return comErro(error)
  const { renumerou, ...cartao } = data
  return { erro: null, cartao, renumerou: Boolean(renumerou) }
}

// Reordena as colunas: antesId = a coluna à esquerda, depoisId = a da direita. { erro, coluna: { id, posicao },
// renumerou }.
export async function moverColuna({ colunaId, antesId = null, depoisId = null }) {
  const { data, error } = await supabase.rpc('mover_coluna', { p_coluna: colunaId, p_antes: antesId, p_depois: depoisId })
  if (error) return comErro(error)
  const { renumerou, ...coluna } = data
  return { erro: null, coluna, renumerou: Boolean(renumerou) }
}

// Apaga a coluna (só a gestão). Com cartões, a escolha é explícita: destinoId (os cartões, arquivados também, vão
// para o fim dessa coluna) ou apagarCartoes (somem junto, com checklist e comentários); sem nenhum dos dois o banco
// recusa. { erro, movidos, apagados, idsApagados }.
export async function apagarColuna(colunaId, { destinoId = null, apagarCartoes = false } = {}) {
  const { data, error } = await supabase.rpc('apagar_coluna', {
    p_coluna: colunaId,
    p_destino: destinoId,
    p_apagar_cartoes: apagarCartoes,
  })
  if (error) return comErro(error)
  return { erro: null, movidos: data.movidos, apagados: data.apagados, idsApagados: data.ids_apagados ?? [] }
}

// ── Cartões (escrita direta; o banco confere quem pode) ──────────────────────

const CAMPOS_DO_CARTAO = ['titulo', 'descricao', 'prioridade', 'prazo']

// Cartão novo no fim da coluna: { erro, cartao: { id } }. Os responsáveis entram em seguida; se o banco recusar algum,
// o cartão já existe e volta junto com o erro (a janela abre nele para corrigir).
export async function criarCartao({ colunaId, titulo, descricao, prioridade, prazo, responsaveis = [] }) {
  const { data, error } = await supabase
    .from('cartoes')
    .insert({
      coluna_id: colunaId,
      titulo: titulo?.trim(),
      descricao: descricao ?? null,
      prioridade: prioridade || null,
      prazo: prazo || null,
    })
    .select('id')
    .single()
  if (error) return comErro(error)
  const cartao = { id: data.id }
  if (responsaveis.length) {
    const { error: erroResponsaveis } = await supabase
      .from('cartao_responsaveis')
      .insert(responsaveis.map((perfilId) => ({ cartao_id: cartao.id, perfil_id: perfilId })))
    if (erroResponsaveis) return { ...comErro(erroResponsaveis), cartao }
  }
  return { erro: null, cartao }
}

// Edita título, descrição (JSON do editor), prioridade e prazo; só o que vier. A coluna muda por moverCartao.
export async function editarCartao(id, campos) {
  return resultadoDaEscrita(
    await supabase.from('cartoes').update(soOsCampos(campos, CAMPOS_DO_CARTAO)).eq('id', id).select('id'),
  )
}

// Arquivar some do quadro (a hora gravada é a do banco); restaurar volta ao mesmo lugar.
export async function arquivarCartao(id) {
  return resultadoDaEscrita(
    await supabase.from('cartoes').update({ arquivado_em: new Date().toISOString() }).eq('id', id).select('id'),
  )
}

export async function restaurarCartao(id) {
  return resultadoDaEscrita(await supabase.from('cartoes').update({ arquivado_em: null }).eq('id', id).select('id'))
}

// Apagar: quem criou ou a gestão. Checklist, comentários e responsáveis somem junto.
export async function apagarCartao(id) {
  return resultadoDaEscrita(await supabase.from('cartoes').delete().eq('id', id).select('id'))
}

export async function adicionarResponsavel(cartaoId, perfilId) {
  const { error } = await supabase.from('cartao_responsaveis').insert({ cartao_id: cartaoId, perfil_id: perfilId })
  return error ? comErro(error) : { erro: null }
}

export async function tirarResponsavel(cartaoId, perfilId) {
  return resultadoDaEscrita(
    await supabase
      .from('cartao_responsaveis')
      .delete()
      .eq('cartao_id', cartaoId)
      .eq('perfil_id', perfilId)
      .select('cartao_id'),
  )
}

// ── Colunas ──────────────────────────────────────────────────────────────────

const CAMPOS_DA_COLUNA = ['nome', 'cor', 'concluidos']

// Coluna nova no fim do quadro: { erro, coluna: { id, nome, cor, concluidos, posicao } }. cor: 0 a 9 ou null
// (automática).
export async function criarColuna({ quadroId, nome, cor = null, concluidos = false }) {
  const { data, error } = await supabase
    .from('quadro_colunas')
    .insert({ quadro_id: quadroId, nome: nome?.trim(), cor, concluidos })
    .select('id, nome, cor, concluidos, posicao')
    .single()
  return error ? comErro(error) : { erro: null, coluna: data }
}

// Renomeia, pinta ou marca/desmarca como coluna de concluídos; só o que vier. A ordem muda por moverColuna.
export async function editarColuna(id, campos) {
  return resultadoDaEscrita(
    await supabase.from('quadro_colunas').update(soOsCampos(campos, CAMPOS_DA_COLUNA)).eq('id', id).select('id'),
  )
}

// ── Checklist ────────────────────────────────────────────────────────────────

// Item novo no fim do checklist: { erro, item: { id, texto, feito, posicao } }.
export async function criarItemDoChecklist(cartaoId, texto) {
  const { data, error } = await supabase
    .from('cartao_checklist')
    .insert({ cartao_id: cartaoId, texto: texto?.trim() })
    .select('id, texto, feito, posicao')
    .single()
  return error ? comErro(error) : { erro: null, item: data }
}

export async function editarItemDoChecklist(id, campos) {
  return resultadoDaEscrita(
    await supabase.from('cartao_checklist').update(soOsCampos(campos, ['texto', 'feito'])).eq('id', id).select('id'),
  )
}

export async function apagarItemDoChecklist(id) {
  return resultadoDaEscrita(await supabase.from('cartao_checklist').delete().eq('id', id).select('id'))
}

// ── Comentários ──────────────────────────────────────────────────────────────

// Comenta (texto simples, até 2000): { erro, comentario: { id, texto, criado_em, editado_em, autor_id } }.
export async function comentar(cartaoId, texto) {
  const { data, error } = await supabase
    .from('cartao_comentarios')
    .insert({ cartao_id: cartaoId, texto: texto?.trim() })
    .select('id, texto, criado_em, editado_em, autor_id')
    .single()
  return error ? comErro(error) : { erro: null, comentario: data }
}

// Só o próprio comentário (o banco marca "editado").
export async function editarComentario(id, texto) {
  return resultadoDaEscrita(
    await supabase.from('cartao_comentarios').update({ texto: texto?.trim() }).eq('id', id).select('id'),
  )
}

// O próprio, ou qualquer um pela gestão.
export async function apagarComentario(id) {
  return resultadoDaEscrita(await supabase.from('cartao_comentarios').delete().eq('id', id).select('id'))
}
