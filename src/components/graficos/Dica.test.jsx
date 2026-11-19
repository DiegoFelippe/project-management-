import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dica from './Dica'
import { posicaoDaDica } from './useDica'

const TELA = { telaLargura: 400, telaAltura: 300 }

describe('posicaoDaDica', () => {
  it('ao lado do ponteiro (14 px), e do outro lado perto da borda, sempre com 8 px de margem', () => {
    expect(posicaoDaDica({ x: 100, y: 100, largura: 150, altura: 60, ...TELA })).toEqual({ left: 114, top: 114 })
    expect(posicaoDaDica({ x: 390, y: 290, largura: 150, altura: 60, ...TELA })).toEqual({ left: 226, top: 216 })
    // Caixa mais larga que o espaço dos dois lados: encosta na margem da esquerda.
    expect(posicaoDaDica({ x: 120, y: 10, largura: 280, altura: 60, ...TELA })).toEqual({ left: 8, top: 24 })
    expect(posicaoDaDica({ x: 5, y: 5, largura: 150, altura: 400, ...TELA })).toMatchObject({ top: 8 })
  })
})

describe('Dica', () => {
  let tela
  beforeEach(() => {
    tela = { largura: window.innerWidth, altura: window.innerHeight }
    window.innerWidth = 400
    window.innerHeight = 300
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(150)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(60)
  })
  afterEach(() => {
    window.innerWidth = tela.largura
    window.innerHeight = tela.altura
    vi.restoreAllMocks()
  })

  it('sem estado, nada aparece', () => {
    render(<Dica estado={null} />)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('título, valor em destaque e o rótulo depois; a chave na cor da série (tracejada quando pedido)', () => {
    render(<Dica estado={{ titulo: 'nov/26', x: 50, y: 50, linhas: [
      { valor: '1.020 h', rotulo: 'realizado', cor: 'serie' },
      { valor: '≈ 34 h', rotulo: 'projeção', cor: 'var(--grafico-ref)', tracejado: true },
      { valor: '69%', rotulo: 'ocupação' },
    ] }} />)
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('nov/26')).toBeInTheDocument()
    expect(within(dica).getByText('1.020 h')).toHaveClass('font-semibold', 'tabular-nums')
    expect(within(dica).getByText('realizado')).toHaveClass('text-muted-foreground')
    const chaves = dica.querySelectorAll('[data-chave]')
    expect(chaves).toHaveLength(2)
    expect(chaves[0].style.borderTopColor).toBe('var(--grafico-serie)')
    expect(chaves[0].style.borderTopStyle).toBe('solid')
    expect(chaves[1].style.borderTopStyle).toBe('dashed')
  })

  it('um nome com <b> aparece como texto (nunca HTML montado)', () => {
    render(<Dica estado={{ titulo: '<b>Conecta</b>', x: 50, y: 50, linhas: [{ valor: '<img src=x onerror=alert(1)>' }] }} />)
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('<b>Conecta</b>')).toBeInTheDocument()
    expect(within(dica).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(dica.querySelector('b, img')).toBeNull()
  })

  it('fixa na tela e, perto da borda, a caixa fica dentro dela', () => {
    render(<Dica estado={{ titulo: 'Semana de 06/10', x: 390, y: 290, linhas: [{ valor: '48 check-ins' }] }} />)
    const dica = screen.getByRole('tooltip')
    expect(dica).toHaveClass('fixed', 'pointer-events-none')
    expect(dica.style.transform).toBe('translate(226px, 216px)')
    expect(dica.style.visibility).toBe('visible')
  })
})
