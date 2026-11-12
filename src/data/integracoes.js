// Integrações da consultoria (IA, e-mail SMTP e Google). O navegador só lê a tabela (sem segredo);
// salvar, testar, desconectar e conectar o Google passam pela Edge Function `integracoes`.
import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'

const CAMPOS = 'id, consultoria_id, tipo, config, situacao, ultimo_teste_em, ultimo_erro, conectada_em, atualizada_em'

export async function listarIntegracoes({ consultoriaId }) {
  const { data, error } = await supabase.from('integracoes').select(CAMPOS).eq('consultoria_id', consultoriaId)
  if (error) throw error
  return data
}

async function acao(corpo) {
  const { status, corpo: resposta } = await chamarFuncao('integracoes', corpo)
  if (status === 200) return { erro: null, integracao: resposta, url: resposta.url }
  return { erro: traduzirErroFuncao(resposta.codigo), campo: resposta.campo }
}

// segredo null (ou em branco) mantém o guardado. Salvar já testa a conexão.
export const salvarIntegracao = (tipo, config, segredo) => acao({ acao: 'salvar', tipo, config, segredo: segredo || null })
export const testarIntegracao = (id) => acao({ acao: 'testar', id })
export const desconectarIntegracao = (id) => acao({ acao: 'desconectar', id })
export const iniciarGoogle = (volta) => acao({ acao: 'google_iniciar', volta })
