import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { corDe } from './cores'
import { posicaoDaDica } from './useDica'

// A caixa da dica de um gráfico (estado de useDica): fixa na tela (fora do cartão, para nenhum transform nem overflow
// cortá-la), dentro dela com 8 px de margem. O texto é texto do React, nunca HTML montado: um nome com "<b>" aparece
// como está. Cada linha: a chave na cor da série (tracejada para projeção/parcial), o valor em destaque e o rótulo.
export default function Dica({ estado }) {
  const caixa = useRef(null)
  const [posicao, setPosicao] = useState(null)

  useLayoutEffect(() => {
    if (!estado || !caixa.current) return
    setPosicao(posicaoDaDica({
      x: estado.x, y: estado.y, largura: caixa.current.offsetWidth, altura: caixa.current.offsetHeight,
      telaLargura: window.innerWidth, telaAltura: window.innerHeight,
    }))
  }, [estado])

  if (!estado) return null
  return createPortal(
    <div ref={caixa} role="tooltip"
      className="pointer-events-none fixed top-0 left-0 z-[60] max-w-[280px] min-w-[150px] rounded-xl border bg-popover px-2.5 py-2 text-rotulo text-popover-foreground shadow-[var(--shadow-overlay)]"
      style={{ transform: posicao ? `translate(${posicao.left}px, ${posicao.top}px)` : undefined, visibility: posicao ? 'visible' : 'hidden' }}>
      <p className="mb-1 text-legenda text-muted-foreground">{estado.titulo}</p>
      {estado.linhas.map((linha, i) => (
        <p key={i} className="flex items-center gap-2">
          {linha.cor && (
            <span data-chave="" aria-hidden="true" className="h-0 w-3 shrink-0 border-t-2"
              style={{ borderTopColor: corDe(linha.cor), borderTopStyle: linha.tracejado ? 'dashed' : 'solid' }} />
          )}
          <span className="font-semibold whitespace-nowrap tabular-nums">{linha.valor}</span>
          {linha.rotulo && <span className="text-muted-foreground">{linha.rotulo}</span>}
        </p>
      ))}
    </div>,
    document.body,
  )
}
