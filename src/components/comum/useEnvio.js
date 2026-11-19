import { useRef, useState } from 'react'

// O aviso quando a ação nem chega a responder (sem rede, servidor fora). src/lib/erros.js não tem um texto de falha
// de rede para reaproveitar.
export const FALHA_NO_ENVIO = 'Não deu para salvar. Tente de novo.'

const SEM_ERROS = {}
const SEM_RECUSA = { erros: SEM_ERROS, valores: undefined }
const temErros = (erros) => Boolean(erros) && Object.keys(erros).length > 0

// O envio comum das janelas: limpa os avisos, marca "enviando" (o rodapé mostra "Salvando…"), espera a ação e, se ela
// devolver { erro } (o aviso do servidor) ou { erros } ({ campo: mensagem }, o campo recusado), mostra e deixa a janela
// aberta; se não, chama `aoConcluir` (em geral, fechar a janela). `enviar(acao)` devolve true quando deu certo.
// Conferência da tela (usabilidade, U2): `validar()` devolve todos os erros de uma vez ({ campo: mensagem }, cada um
// embaixo do seu campo) e `conferir()` diz se pode enviar. Depois do primeiro Salvar, os erros acompanham o que está na
// tela: corrigiu, a marca some (como no modelo de check-in). `conferir(achados)` também aceita os erros prontos.
// `tentativa` sobe a cada Salvar com erro (da tela ou do servidor): a JanelaFormulario leva o foco ao primeiro campo
// marcado só nessa hora, nunca enquanto a pessoa digita. `erro` fica para o servidor e o resumo; `limpar()` zera tudo.
// `valores` ({ campo: valor }, o que está na tela): o campo que o servidor recusou volta ao normal quando o valor dele
// muda (o aviso `erro` fica); sem `valores`, a marca do servidor fica até o próximo envio.
// Um segundo envio enquanto o primeiro roda é ignorado. Se a ação lançar (sem rede), os botões voltam, a janela mostra
// FALHA_NO_ENVIO, o erro vai para o console (um defeito do código deixa rastro) e `enviar` devolve false.
export function useEnvio(aoConcluir, { validar, valores } = {}) {
  const [erro, setErro] = useState(null)
  const [errosDaTela, setErrosDaTela] = useState(SEM_ERROS)
  const [recusa, setRecusa] = useState(SEM_RECUSA) // os campos que o servidor recusou e os valores que foram
  const [tentou, setTentou] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const emCurso = useRef(false)
  const daTela = tentou && validar ? validar() : errosDaTela
  const errosDoServidor = valores
    ? Object.fromEntries(Object.entries(recusa.erros).filter(([campo]) => Object.is(valores[campo], recusa.valores?.[campo])))
    : recusa.erros
  const erros = temErros(errosDoServidor) ? { ...daTela, ...errosDoServidor } : daTela

  function conferir(achados = validar?.() ?? SEM_ERROS) {
    setErro(null)
    setRecusa(SEM_RECUSA)
    setErrosDaTela({ ...achados })
    setTentou(true)
    const pode = !temErros(achados)
    if (!pode) setTentativa((t) => t + 1)
    return pode
  }

  function limpar() {
    setErro(null)
    setErrosDaTela(SEM_ERROS)
    setRecusa(SEM_RECUSA)
    setTentou(false)
  }

  async function enviar(acao) {
    if (emCurso.current) return false
    emCurso.current = true
    const enviados = valores
    setErro(null)
    setRecusa(SEM_RECUSA)
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
      if (temErros(resposta.erros)) {
        setRecusa({ erros: { ...resposta.erros }, valores: enviados })
        setTentativa((t) => t + 1)
      }
      return false
    }
    aoConcluir?.()
    return true
  }

  return { erro, setErro, erros, tentativa, conferir, limpar, enviando, enviar }
}
