import { act } from '@testing-library/react'
import { vi } from 'vitest'

// O jsdom não tem ResizeObserver (os gráficos ficam com a largura padrão). Este falso guarda quem observa e deixa o
// teste "redimensionar" o contêiner. Depois do teste: vi.unstubAllGlobals().
export function simularResizeObserver() {
  const observadores = new Set()
  class ResizeObserverFalso {
    constructor(aviso) {
      this.aviso = aviso
      this.alvos = new Set()
      observadores.add(this)
    }
    observe(alvo) { this.alvos.add(alvo) }
    unobserve(alvo) { this.alvos.delete(alvo) }
    disconnect() { this.alvos.clear() }
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverFalso)
  return {
    redimensionar(largura) {
      act(() => {
        for (const o of observadores) {
          if (o.alvos.size) o.aviso([...o.alvos].map((alvo) => ({ target: alvo, contentRect: { width: largura } })), o)
        }
      })
    },
  }
}
