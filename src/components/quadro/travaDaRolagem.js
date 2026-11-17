// Rolagem durante o arrasto do quadro.
//
// A biblioteca de arrastar (@hello-pangea/dnd) mede as listas ao levantar e só acompanha a rolagem da área de rolagem de
// cada lista (a lista de cartões da coluna; para colunas, a faixa das colunas). O <main> e a faixa das colunas ficam
// por fora quando o arrastado é um cartão: se rolassem no meio do arrasto, o cartão apareceria num lugar e cairia em
// outro. Por isso, enquanto algo está levantado:
// - a roda rola só a lista de cartões sob o ponteiro (arrastando uma coluna, a roda de lado move a faixa);
// - o <main> (e a faixa, arrastando cartão) fica parado: qualquer rolagem dele volta na hora (teclas, barra de rolagem).
// Perto da borda de uma coluna, a própria biblioteca rola a lista (ela vê essa rolagem).
export const LISTA_QUE_ROLA = '[data-rolagem-da-coluna]'

const LINHA = 16

function emPixels(e, alvo, delta) {
  if (e.deltaMode === 1) return delta * LINHA
  if (e.deltaMode === 2) return delta * alvo.clientHeight
  return delta
}

// A lista de cartões sob o ponteiro. Os cartões e o arrastado não recebem o ponteiro durante o arrasto (a biblioteca
// desliga), então a pilha no ponto chega à lista; sem elementsFromPoint (testes), vale o alvo do evento.
function listaSobOPonteiro(e) {
  const pilha = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target]
  for (const el of pilha) {
    const lista = el?.closest?.(LISTA_QUE_ROLA)
    if (lista) return lista
  }
  return null
}

// Liga a trava; devolve a função que desliga. `faixa`: a área que rola as colunas de lado; `coluna`: o arrastado é uma
// coluna (a faixa é a área de rolagem dela, então só o <main> para).
export function travarRolagem({ faixa, coluna = false }) {
  const pagina = faixa?.closest('main') ?? null
  const paradas = [pagina, coluna ? null : faixa].filter(Boolean)
    .map((el) => ({ el, topo: el.scrollTop, lado: el.scrollLeft }))

  function aoGirar(e) {
    e.preventDefault()
    if (coluna) {
      if (faixa && e.deltaX) faixa.scrollLeft += emPixels(e, faixa, e.deltaX)
      return
    }
    const lista = listaSobOPonteiro(e)
    if (lista && e.deltaY) lista.scrollTop += emPixels(e, lista, e.deltaY)
  }

  function aoRolar(e) {
    const parada = paradas.find((p) => p.el === e.target)
    if (!parada) return
    if (parada.el.scrollTop !== parada.topo) parada.el.scrollTop = parada.topo
    if (parada.el.scrollLeft !== parada.lado) parada.el.scrollLeft = parada.lado
  }

  window.addEventListener('wheel', aoGirar, { capture: true, passive: false })
  document.addEventListener('scroll', aoRolar, true)
  return () => {
    window.removeEventListener('wheel', aoGirar, { capture: true })
    document.removeEventListener('scroll', aoRolar, true)
  }
}
