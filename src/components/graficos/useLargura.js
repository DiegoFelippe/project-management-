import { useLayoutEffect, useState } from 'react'

// Sem ResizeObserver (o jsdom dos testes) o gráfico fica com esta largura.
export const LARGURA_PADRAO = 640

// Largura real do contêiner do gráfico, em px inteiros: o SVG é desenhado nela (sem viewBox que estica), e assim o
// texto fica sempre no tamanho da escala em qualquer tela. Mede antes de pintar e de novo a cada mudança de tamanho;
// escondido (largura 0, ex.: na visão em tabela) fica com a última medida.
export function useLargura(ref) {
  const [largura, setLargura] = useState(LARGURA_PADRAO)
  useLayoutEffect(() => {
    const elemento = ref.current
    if (!elemento || typeof ResizeObserver === 'undefined') return undefined
    const medir = (valor) => {
      const inteiro = Math.floor(valor)
      if (inteiro > 0) setLargura(inteiro)
    }
    medir(elemento.getBoundingClientRect().width)
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas.find((e) => e.target === elemento) ?? entradas[0]
      medir(entrada?.contentRect?.width ?? elemento.getBoundingClientRect().width)
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [ref])
  return largura
}
