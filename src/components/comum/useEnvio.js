import { useRef, useState } from 'react'

// O aviso quando a ação nem chega a responder (sem rede, servidor fora). src/lib/erros.js não tem um texto de falha
// de rede para reaproveitar.
export const FALHA_NO_ENVIO = 'Não deu para salvar. Tente de novo.'

// O envio comum das janelas: limpa o erro, marca "enviando" (o rodapé mostra "Salvando…"), espera a ação e, se ela
// devolver { erro }, mostra o erro e deixa a janela aberta; se não, chama `aoConcluir` (em geral, fechar a janela).
// `enviar(acao)` devolve true quando deu certo. A validação da tela fica antes, com `setErro`. Um segundo envio
// enquanto o primeiro roda é ignorado. Se a ação lançar (sem rede), os botões voltam, a janela mostra FALHA_NO_ENVIO e
// `enviar` devolve false (a falha não segue adiante: a pessoa vê o aviso e tenta de novo).
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
    } catch {
      resposta = { erro: FALHA_NO_ENVIO }
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
