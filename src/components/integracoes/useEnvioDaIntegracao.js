import { useState } from 'react'

// Salvar e Testar de um formulário de integração, com a mesma validação. `montar()` devolve { erro } quando o que foi
// digitado não serve, ou { config, segredo, extras? } (extras: o que só vai no teste, como o número do WhatsApp).
// Salvar grava (aoSalvar(config, segredo)); Testar testa sem gravar (aoTestar(config, segredo, extras)) e devolve o
// resultado para a janela, ou null quando a validação recusou (o aviso fica em `erro`).
export function useEnvioDaIntegracao(montar, aoSalvar, aoTestar) {
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function dados() {
    const montado = montar()
    setErro(montado.erro ?? null)
    return montado.erro ? null : montado
  }

  async function salvar(evento) {
    evento.preventDefault()
    const montado = dados()
    if (!montado) return
    setEnviando(true)
    const resposta = await aoSalvar(montado.config, montado.segredo)
    setEnviando(false)
    if (resposta?.erro) setErro(resposta.erro)
  }

  async function testar() {
    const montado = dados()
    return montado ? aoTestar(montado.config, montado.segredo, montado.extras ?? {}) : null
  }

  return { erro, enviando, salvar, testar }
}
