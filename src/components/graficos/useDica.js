import { useCallback, useEffect, useState } from 'react'

// Dica (tooltip) de um gráfico: { titulo, linhas: [{ valor, rotulo?, cor?, tracejado? }] } mais a posição na tela.
// Uma por gráfico; aparece no mouse, no toque e no foco do teclado, e some com Esc, ao rolar a página ou ao tocar fora
// dos alvos (data-alvo-da-dica) do próprio gráfico: `contem` é o contêiner dele, então tocar numa marca de outro
// gráfico fecha esta dica (lá abre a dele).
export function useDica(contem) {
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
      const alvo = e.target.closest?.('[data-alvo-da-dica]')
      if (!alvo || (contem?.current && !contem.current.contains(alvo))) setDica(null)
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('pointerdown', toque)
    window.addEventListener('scroll', esconder, { capture: true, passive: true })
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('pointerdown', toque)
      window.removeEventListener('scroll', esconder, { capture: true })
    }
  }, [aberta, esconder, contem])

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

// Props de um alvo da dica (coluna, arco): o mouse e o toque mostram onde está o ponteiro e o foco do teclado no meio do
// alvo; sair com o mouse e perder o foco escondem (no toque, a dica fica até tocar fora).
export function alvoDaDica(conteudo, mostrar, esconder) {
  return {
    'data-alvo-da-dica': '',
    onPointerMove: (e) => mostrar(conteudo, e.clientX, e.clientY),
    onPointerDown: (e) => mostrar(conteudo, e.clientX, e.clientY),
    onPointerLeave: (e) => {
      if (e.pointerType !== 'touch') esconder()
    },
    onFocus: (e) => mostrar(conteudo, ...pontoDoFoco(e.currentTarget)),
    onBlur: esconder,
  }
}
