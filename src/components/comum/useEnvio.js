import { useRef, useState } from 'react'

// O aviso quando a ação nem chega a responder (sem rede, servidor fora). src/lib/erros.js não tem um texto de falha
// de rede para reaproveitar.
export const FALHA_NO_ENVIO = 'Não deu para salvar. Tente de novo.'

const SEM_ERROS = {}
const temErros = (erros) => Boolean(erros) && Object.keys(erros).length > 0

// O envio comum das janelas: limpa os erros, marca "enviando" (o rodapé mostra "Salvando…"), espera a ação e, se ela
// devolver { erro } (o aviso do servidor) ou { erros } ({ campo: mensagem }, o campo recusado), mostra e deixa a janela
// aberta; se não, chama `aoConcluir` (em geral, fechar a janela). `enviar(acao)` devolve true quando deu certo.
// A conferência da tela fica antes, com `conferir(achados)` (usabilidade, U2): todos os erros de uma vez, cada um no seu
// campo ({ campo: mensagem }); devolve true quando não há nenhum. Cada `conferir` cria um objeto novo, e a
// JanelaFormulario (prop `erros`) leva o foco ao primeiro campo marcado. `erro` fica para o servidor e o resumo.
// Um segundo envio enquanto o primeiro roda é ignorado. Se a ação lançar (sem rede), os botões voltam, a janela mostra
// FALHA_NO_ENVIO, o erro vai para o console (um defeito do código deixa rastro) e `enviar` devolve false.
export function useEnvio(aoConcluir) {
  const [erro, setErro] = useState(null)
  const [erros, setErros] = useState(SEM_ERROS)
  const [enviando, setEnviando] = useState(false)
  const emCurso = useRef(false)

  function conferir(achados) {
    setErro(null)
    setErros({ ...achados })
    return !temErros(achados)
  }

  async function enviar(acao) {
    if (emCurso.current) return false
    emCurso.current = true
    setErro(null)
    setErros(SEM_ERROS)
    setEnviando(true)
    let resposta
    try {
      resposta = await acao()
    } catch (e) {
      console.error(e)
      resposta = { erro: FALHA_NO_ENVIO }
    } finally {
      emCurso.current = false
      setEnviando(false)
    }
    if (resposta?.erro || temErros(resposta?.erros)) {
      if (resposta.erro) setErro(resposta.erro)
      if (temErros(resposta.erros)) setErros({ ...resposta.erros })
      return false
    }
    aoConcluir?.()
    return true
  }

  return { erro, setErro, erros, setErros, conferir, enviando, enviar }
}
