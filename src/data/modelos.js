// Modelos de check-in. O banco decide quem vê e quem mexe (migração 20261117170204_modelos_de_checkin.sql); aqui só se
// chama e traduz. Leituras devolvem os dados ({ itens, total } na lista) e sobem o erro do banco; escritas devolvem
// { erro } (o texto para a pessoa, ou null) e, ao salvar, o id. Criar e editar vão inteiros numa chamada
// (salvar_modelo regrava etapas, tarefas e dependências); arquivar, reativar e apagar vão direto, pela regra do banco.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const SEM_PERMISSAO = traduzirErroBanco({ code: '42501' })
const traduzir = (error) => traduzirErroBanco(error, { sobre: 'modelo' })

// Escrita direta pela API com .select(...): nenhuma linha de volta = a regra do banco recusou (ou o modelo já sumiu).
function resultadoDaEscrita({ data, error }) {
  if (error) return { erro: traduzir(error) }
  if (!data?.length) return { erro: SEM_PERMISSAO }
  return { erro: null }
}

// Uma página (15, em ordem de nome) dos modelos que a pessoa vê: aba 'ativos' | 'arquivados', busca no nome e na
// descrição (sem acento), tipo de consultoria e, só para a Central, a consultoria (os modelos que ela vê).
// { itens, total }; página que deixou de existir (apagou o último item dela) volta com foraDaFaixa.
export async function listarModelos({ aba = 'ativos', busca, tipo, consultoriaId, pagina = 1 } = {}) {
  const { data, error } = await supabase.rpc('modelos_da_lista', {
    p_aba: aba,
    p_busca: busca?.trim() || null,
    p_tipo: tipo || null,
    p_consultoria: consultoriaId || null,
    p_pagina: pagina,
  })
  if (error) throw error
  const itens = data?.itens ?? []
  const total = data?.total ?? 0
  if (pagina > 1 && !itens.length) return { itens, total, foraDaFaixa: true }
  return { itens, total }
}

// O modelo inteiro (etapas e tarefas em ordem, "depende de" com os ids, pode_editar e pode_duplicar); null quando a
// pessoa não vê.
export async function lerModelo(id) {
  const { data, error } = await supabase.rpc('modelo_completo', { p_modelo: id })
  if (error) throw error
  return data ?? null
}

// Cria (id nulo) ou regrava o modelo. dados = { nome, descricao, tipo, para: 'todas' | <consultoria_id>, etapas: [{
// nome, tarefas: [{ chave, titulo, descricao, obrigatoria, prazo_dias, depende_de: [chave] }] }] }. { id, erro }.
export async function salvarModelo(id, dados) {
  const { data, error } = await supabase.rpc('salvar_modelo', { p_id: id ?? null, p_dados: dados })
  if (error) return { id: null, erro: traduzir(error) }
  return { id: data, erro: null }
}

// Arquivar: sai da lista para aplicar; o banco grava a hora dele. Reativar: volta.
export async function arquivarModelo(id) {
  return resultadoDaEscrita(
    await supabase.from('modelos').update({ arquivado_em: new Date().toISOString() }).eq('id', id).select('id'),
  )
}

export async function reativarModelo(id) {
  return resultadoDaEscrita(await supabase.from('modelos').update({ arquivado_em: null }).eq('id', id).select('id'))
}

// Apagar: etapas, tarefas e dependências do modelo saem junto.
export async function apagarModelo(id) {
  return resultadoDaEscrita(await supabase.from('modelos').delete().eq('id', id).select('id'))
}
