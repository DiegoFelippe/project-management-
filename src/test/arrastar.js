import { act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

// Arrastar do @hello-pangea/dnd pelo teclado, como a pessoa faria (espaço levanta, setas movem, espaço solta).
//
// A biblioteca mede a tela para saber para onde a seta leva. O jsdom não tem layout: simularGeometria() põe cada lista
// de cartões (data-rfd-droppable-id, menos a de colunas) lado a lado, 300 px de largura e 20 px entre elas, e cada cartão
// numa linha de 100 px, na ordem em que aparecem; a tela "tem" 4000 × 4000 px. Chame antes de renderizar.
const LISTA_DE_COLUNAS = 'colunas'

const retangulo = (x, y, largura, altura) => ({
  x, y, left: x, top: y, width: largura, height: altura, right: x + largura, bottom: y + altura, toJSON() {},
})

export function simularGeometria() {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(4000)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(4000)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function medir() {
    const listas = [...document.querySelectorAll('[data-rfd-droppable-id]')]
      .filter((l) => l.getAttribute('data-rfd-droppable-id') !== LISTA_DE_COLUNAS)
    const lista = this.closest('[data-rfd-droppable-id]')
    if (!lista) return retangulo(0, 0, 0, 0)
    if (lista.getAttribute('data-rfd-droppable-id') === LISTA_DE_COLUNAS) {
      const coluna = this.closest('[data-rfd-draggable-id]')
      if (!coluna) return retangulo(0, 0, 320 * listas.length, 2000)
      const colunas = [...lista.querySelectorAll(':scope > [data-rfd-draggable-id]')]
      return retangulo(colunas.indexOf(coluna) * 320, 0, 300, 2000)
    }
    const x = listas.indexOf(lista) * 320
    const cartao = this.closest('[data-rfd-draggable-id]')
    if (!cartao || !lista.contains(cartao)) return retangulo(x, 0, 300, 2000)
    const cartoes = [...lista.querySelectorAll('[data-rfd-draggable-id]')]
    return retangulo(x, 100 + cartoes.indexOf(cartao) * 100, 300, 90)
  })
}

const TECLAS = {
  espaco: { key: ' ', keyCode: 32 },
  baixo: { key: 'ArrowDown', keyCode: 40 },
  cima: { key: 'ArrowUp', keyCode: 38 },
  direita: { key: 'ArrowRight', keyCode: 39 },
  esquerda: { key: 'ArrowLeft', keyCode: 37 },
}

const esperar = (ms) => act(() => new Promise((pronto) => setTimeout(pronto, ms)))

// Levanta `alca` (o elemento com as dragHandleProps), aperta as setas (['baixo', 'direita'...]) e solta. `soltar: false`
// deixa o item levantado (para conferir o que acontece no meio do arrasto); depois, soltarArrasto(alca).
export async function arrastarComTeclado(alca, setas, { soltar = true } = {}) {
  alca.focus()
  fireEvent.keyDown(alca, TECLAS.espaco)
  await esperar(20)
  for (const seta of setas) {
    fireEvent.keyDown(alca, TECLAS[seta])
    await esperar(20)
  }
  if (soltar) await soltarArrasto(alca)
}

export async function soltarArrasto(alca) {
  fireEvent.keyDown(alca, TECLAS.espaco)
  await esperar(20)
  // A animação de soltar espera o fim da transição (o jsdom não anima).
  fireEvent.transitionEnd(alca, { propertyName: 'transform' })
  await esperar(20)
}
