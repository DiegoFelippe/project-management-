import { useCallback, useEffect, useRef, useState } from 'react'

const SEM_REDE = 'Não foi possível salvar. Confira a conexão e tente de novo.'

// A janela do cartão grava campo a campo (sem botão Salvar; exceção registrada ao rodapé do JanelaFormulario), como no
// Mochi: cada campo mostra "Salvando…", "Salvo" (some depois de 2 s) ou "Erro ao salvar". `gravar(campo, fazer)` roda
// `fazer()` (que devolve { erro }) e devolve a resposta; a resposta velha de um campo que já foi gravado de novo não muda
// o estado dele.
export function useGravacao() {
  const [estados, setEstados] = useState({})
  const relogios = useRef({})
  const versoes = useRef({})

  useEffect(() => {
    const ativos = relogios.current
    return () => Object.values(ativos).forEach(clearTimeout)
  }, [])

  const mudar = (campo, estado) => setEstados((atuais) => ({ ...atuais, [campo]: estado }))

  const gravar = useCallback(async (campo, fazer) => {
    clearTimeout(relogios.current[campo])
    const versao = (versoes.current[campo] ?? 0) + 1
    versoes.current[campo] = versao
    mudar(campo, 'salvando')
    let resposta
    try {
      resposta = (await fazer()) ?? { erro: null }
    } catch {
      resposta = { erro: SEM_REDE }
    }
    if (versoes.current[campo] !== versao) return resposta
    if (resposta.erro) {
      mudar(campo, 'erro')
    } else {
      mudar(campo, 'salvo')
      relogios.current[campo] = setTimeout(() => mudar(campo, null), 2000)
    }
    return resposta
  }, [])

  return { estados, gravar }
}
