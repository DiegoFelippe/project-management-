import { useEffect, useState } from 'react'

// Lista paginada no banco (regra "Escala" do CLAUDE.md), ao lado do useLeitura: lê uma página por vez com
// `ler({ ...parametros, pagina })`, que devolve { itens, total, foraDaFaixa? }. Mudou um parâmetro (filtro, busca),
// volta para a página 1; a página que deixou de existir (apagou o último item dela) também volta. Resposta velha é
// descartada. Enquanto a leitura nova não chega, a lista de antes continua na tela; os parâmetros em `limparAoMudar`
// mudam o que a lista é (outra aba, outras colunas): ao mudarem, ela some até chegar a nova.
// `versao` (de fora) e `recarregar()` releem a mesma página. `ler` precisa ser estável (uma função do módulo);
// parametros null = não lê. `erro` é true quando a última leitura falhou: a tela diz o que não carregou.
export function useListaPaginada(ler, parametros, { versao = 0, limparAoMudar = [] } = {}) {
  const chave = parametros ? JSON.stringify(parametros) : null
  const [pagina, setPagina] = useState(1)
  const [chaveDaPagina, setChaveDaPagina] = useState(chave)
  if (chave !== chaveDaPagina) {
    setChaveDaPagina(chave)
    setPagina(1)
  }
  const [versaoPropria, setVersaoPropria] = useState(0)
  const [estado, setEstado] = useState({ resultado: null, de: null, erro: false })

  useEffect(() => {
    if (!chave) return undefined
    let ativo = true
    const pedido = JSON.parse(chave)
    ler({ ...pedido, pagina }).then(
      (r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setEstado({ resultado: r, de: pedido, erro: false })
      },
      () => ativo && setEstado((e) => ({ ...e, erro: true })),
    )
    return () => {
      ativo = false
    }
  }, [ler, chave, pagina, versao, versaoPropria])

  const mesmaLista = estado.de && limparAoMudar.every((k) => estado.de[k] === parametros?.[k])
  const resultado = mesmaLista ? estado.resultado : null
  const total = resultado?.total ?? 0
  return {
    resultado,
    itens: resultado?.itens ?? null,
    total,
    erro: estado.erro,
    pagina,
    recarregar: () => setVersaoPropria((v) => v + 1),
    paginacao: { pagina, total, aoMudar: setPagina },
  }
}
