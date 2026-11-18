import { useState } from 'react'

const SEM_REDE_AO_SALVAR = 'Não foi possível salvar agora. Confira a conexão e tente de novo.'
const SEM_REDE_AO_TESTAR = 'Não foi possível testar agora. Confira a conexão e tente de novo.'
const SEM_ERROS = {}

// Salvar e Testar de um formulário de integração, com a mesma conferência. `montar()` devolve { erros } ({ campo:
// mensagem }, todos de uma vez, cada um embaixo do seu campo: usabilidade, U2) quando o que foi digitado não serve, ou
// { config, segredo, extras? } (extras: o que só vai no teste, como o número do WhatsApp). Salvar grava
// (aoSalvar(config, segredo)); Testar testa sem gravar (aoTestar(config, segredo, extras)) e devolve { erro, mensagem }.
// O resultado do teste fica preso aos dados testados: qualquer campo que mude o esconde. Uma falha da rede vira aviso na
// janela (e o erro vai para o console), e os botões sempre voltam.
export function useEnvioDaIntegracao(montar, aoSalvar, aoTestar) {
  const [erro, setErro] = useState(null)
  const [erros, setErros] = useState(SEM_ERROS)
  const [enviando, setEnviando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState(null) // { dados: o JSON do que foi testado, resultado }
  const resultado = teste && teste.dados === JSON.stringify(montar()) ? teste.resultado : null

  function dados() {
    const montado = montar()
    setErro(null)
    setErros({ ...montado.erros })
    return montado.erros && Object.keys(montado.erros).length ? null : montado
  }

  async function salvar(evento) {
    evento.preventDefault()
    setTeste(null)
    const montado = dados()
    if (!montado) return
    setEnviando(true)
    try {
      const resposta = await aoSalvar(montado.config, montado.segredo)
      if (resposta?.erro) setErro(resposta.erro)
    } catch (e) {
      console.error(e)
      setErro(SEM_REDE_AO_SALVAR)
    } finally {
      setEnviando(false)
    }
  }

  async function testar() {
    setTeste(null)
    const montado = dados()
    if (!montado) return
    const foto = JSON.stringify(montado)
    setTestando(true)
    try {
      setTeste({ dados: foto, resultado: await aoTestar(montado.config, montado.segredo, montado.extras ?? {}) })
    } catch (e) {
      console.error(e)
      setTeste({ dados: foto, resultado: { erro: SEM_REDE_AO_TESTAR } })
    } finally {
      setTestando(false)
    }
  }

  return { erro, erros, enviando, testando, resultado, salvar, testar }
}
