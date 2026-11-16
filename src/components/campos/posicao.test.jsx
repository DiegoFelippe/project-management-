import { afterEach, describe, expect, it, vi } from 'vitest'
import { calcular } from './posicao'

const caixa = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const elemento = (r) => ({ getBoundingClientRect: () => r })

describe('calcular (posição da lista)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('numa janela com transform: coordenadas relativas à janela, mas vira e limita pela tela', () => {
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ transform: 'matrix(1,0,0,1,0,0)', translate: 'none', scale: 'none', filter: 'none' })
    const janela = elemento(caixa(300, 300, 400, 200)) // janela curta, no meio da tela
    // campo perto do fim da janela, com muito espaço na tela abaixo dele
    const baixo = calcular(elemento(caixa(320, 440, 200, 36)), janela, 296, 250)
    expect(baixo.top).toBe(440 + 36 + 4 - 300)
    expect(baixo.bottom).toBeUndefined()
    expect(baixo.left).toBe(320 - 300)
    expect(baixo.maxHeight).toBe(800 - 476 - 8)
    // campo perto do fim da tela: vira para cima, pelo espaço da tela
    const cima = calcular(elemento(caixa(320, 740, 200, 36)), janela, 296, 250)
    expect(cima.top).toBeUndefined()
    expect(cima.bottom).toBe(500 - 740 + 4)
    expect(cima.maxHeight).toBe(740 - 8)
  })

  it('sem transform: relativo à tela', () => {
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    const r = calcular(elemento(caixa(100, 100, 200, 36)), null, 296, 370)
    expect(r).toMatchObject({ left: 100, top: 140, width: 296 })
  })
})
