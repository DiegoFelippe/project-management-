import { useEffect, useState } from 'react'

// Uma leitura por chave (os parâmetros): muda a chave, lê de novo; parametros null = não lê. Resposta de uma chave
// velha é descartada. Devolve { dados } da chave atual, { erro } ou { carregando }. `ler` precisa ser estável (uma
// função do módulo, não criada a cada render).
export function useLeitura(ler, parametros) {
  const chave = parametros ? JSON.stringify(parametros) : null
  const [estado, setEstado] = useState({ chave: null })
  useEffect(() => {
    if (!chave) return undefined
    let ativo = true
    ler(JSON.parse(chave)).then(
      (dados) => ativo && setEstado({ chave, dados }),
      () => ativo && setEstado({ chave, erro: true }),
    )
    return () => {
      ativo = false
    }
  }, [ler, chave])
  return estado.chave === chave ? estado : { carregando: Boolean(chave) }
}
