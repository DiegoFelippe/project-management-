import { useRef, useState } from 'react'

// O envio comum das janelas: limpa o erro, marca "enviando" (o rodapé mostra "Salvando…"), espera a ação e, se ela
// devolver { erro }, mostra o erro e deixa a janela aberta; se não, chama `aoConcluir` (em geral, fechar a janela).
// `enviar(acao)` devolve true quando deu certo. A validação da tela fica antes, com `setErro`. Um segundo envio
// enquanto o primeiro roda é ignorado; se a ação falhar (sem rede), os botões voltam e a falha segue para quem chamou.
export function useEnvio(aoConcluir) {
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const emCurso = useRef(false)

  async function enviar(acao) {
    if (emCurso.current) return false
    emCurso.current = true
    setErro(null)
    setEnviando(true)
    let resposta
    try {
      resposta = await acao()
    } finally {
      emCurso.current = false
      setEnviando(false)
    }
    if (resposta?.erro) {
      setErro(resposta.erro)
      return false
    }
    aoConcluir?.()
    return true
  }

  return { erro, setErro, enviando, enviar }
}
