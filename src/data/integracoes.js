// Integrações da consultoria (IA, e-mail SMTP, Google, Slack e WhatsApp). O navegador só lê a tabela (sem segredo);
// salvar, testar, desconectar e conectar o Google passam pela Edge Function `integracoes`.
import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'

const CAMPOS = 'id, consultoria_id, tipo, config, situacao, ultimo_teste_em, ultimo_erro, conectada_em, atualizada_em'

export async function listarIntegracoes({ consultoriaId }) {
  const { data, error } = await supabase.from('integracoes').select(CAMPOS).eq('consultoria_id', consultoriaId)
  if (error) throw error
  return data
}

// A recusa pode trazer a mensagem pronta do servidor (ex.: digitar o segredo de novo para outro destino).
const erroDaRecusa = (resposta) => resposta.mensagem ?? traduzirErroFuncao(resposta.codigo)

async function acao(corpo) {
  const { status, corpo: resposta } = await chamarFuncao('integracoes', corpo)
  if (status === 200) return { erro: null, integracao: resposta, url: resposta.url }
  return { erro: erroDaRecusa(resposta), campo: resposta.campo }
}

// segredo null (ou em branco) mantém o guardado. Salvar já testa a conexão.
export const salvarIntegracao = (tipo, config, segredo) => acao({ acao: 'salvar', tipo, config, segredo: segredo || null })
export const testarIntegracao = (id) => acao({ acao: 'testar', id })
export const desconectarIntegracao = (id) => acao({ acao: 'desconectar', id })
export const iniciarGoogle = (volta) => acao({ acao: 'google_iniciar', volta })

// "Testar" dentro da janela: testa o que foi digitado, sem gravar nada (segredo em branco usa o guardado).
// extras: o que só serve ao teste, como o número que recebe o modelo do WhatsApp ({ numero_teste }).
// Devolve { erro, mensagem }: a mensagem diz o que funcionou; o erro, o que o serviço respondeu.
export async function testarRascunho(tipo, config, segredo, extras = {}) {
  const { status, corpo } = await chamarFuncao('integracoes', { acao: 'testar_rascunho', tipo, config, segredo: segredo || null, ...extras })
  if (status !== 200) return { erro: erroDaRecusa(corpo), mensagem: null }
  if (!corpo.funcionou) return { erro: corpo.erro ?? traduzirErroFuncao(), mensagem: null }
  return { erro: null, mensagem: corpo.mensagem }
}
