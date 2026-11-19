import { useEffect, useState } from 'react'

const DURACAO = 900
const NENHUMA = Symbol('nenhuma')
const semMovimento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

// Número que corre de 0 até o valor (900 ms, easeOutCubic, por requestAnimationFrame) na primeira vez que chega com uma
// `chave` (o período): uma releitura com a mesma chave mostra o número novo direto, sem contar de novo; chave nova conta
// de novo. Nulo (carregando) fica nulo: passe nulo enquanto o número do período novo não chegou. `atraso` (ms) espera
// antes de começar (cartões vizinhos com 120 ms de diferença). "Reduzir movimento": o número direto. Pedido do Diego, 19/11.
export function useContagem(numero, { chave, atraso = 0 } = {}) {
  const [contada, setContada] = useState(NENHUMA)
  const [fator, setFator] = useState(0)
  const contando = numero != null && chave !== contada && !semMovimento()

  useEffect(() => {
    if (!contando) return undefined
    let quadro
    let inicio
    const passo = (agora) => {
      inicio ??= agora + atraso
      const t = Math.max(0, (agora - inicio) / DURACAO)
      if (t >= 1) return setContada(chave)
      setFator(1 - (1 - t) ** 3)
      quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    // Interrompida (ou terminada), a próxima contagem começa do zero.
    return () => {
      cancelAnimationFrame(quadro)
      setFator(0)
    }
  }, [contando, chave, atraso])

  if (numero == null) return null
  return contando ? numero * fator : numero
}
