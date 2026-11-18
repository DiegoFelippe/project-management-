import { useCallback, useEffect, useState } from 'react'

// Dica (tooltip) de um gráfico: { titulo, linhas: [{ valor, rotulo?, cor?, tracejado? }] } mais a posição na tela.
// Uma por gráfico; aparece no mouse, no toque e no foco do teclado, e some com Esc, ao rolar a página ou ao tocar fora
// de um alvo (os alvos têm data-alvo-da-dica).
export function useDica() {
  const [dica, setDica] = useState(null)
  const mostrar = useCallback((conteudo, x, y) => {
    if (conteudo) setDica({ ...conteudo, x, y })
  }, [])
  const esconder = useCallback(() => setDica(null), [])
  const aberta = dica !== null

  useEffect(() => {
    if (!aberta) return undefined
    const tecla = (e) => {
      if (e.key === 'Escape') setDica(null)
    }
    const toque = (e) => {
      if (!e.target.closest?.('[data-alvo-da-dica]')) setDica(null)
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('pointerdown', toque)
    window.addEventListener('scroll', esconder, { capture: true, passive: true })
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('pointerdown', toque)
      window.removeEventListener('scroll', esconder, { capture: true })
    }
  }, [aberta, esconder])

  return { dica, mostrar, esconder }
}

const MARGEM = 8
const AFASTAMENTO = 14

// Onde a caixa da dica fica (position: fixed): 14 px ao lado do ponteiro, do outro lado quando não cabe, e sempre
// dentro da tela com 8 px de margem.
export function posicaoDaDica({ x, y, largura, altura, telaLargura, telaAltura }) {
  let left = x + AFASTAMENTO
  let top = y + AFASTAMENTO
  if (left + largura > telaLargura - MARGEM) left = x - largura - AFASTAMENTO
  if (left < MARGEM) left = MARGEM
  if (top + altura > telaAltura - MARGEM) top = y - altura - AFASTAMENTO
  if (top < MARGEM) top = MARGEM
  return { left: Math.round(left), top: Math.round(top) }
}

// Ponto de onde a dica sai quando o alvo recebe o foco pelo teclado (não há ponteiro): o meio do alvo, no máximo
// 120 px da borda esquerda dele (barras largas).
export function pontoDoFoco(elemento) {
  const r = elemento.getBoundingClientRect()
  return [r.left + Math.min(r.width / 2, 120), r.top + r.height / 2]
}
