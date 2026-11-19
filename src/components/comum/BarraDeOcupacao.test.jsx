import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarraDeOcupacao from './BarraDeOcupacao'

describe('BarraDeOcupacao', () => {
  it('acima de 100% a barra enche no vermelho cheio (o tom de texto fica claro demais no escuro)', () => {
    const { container } = render(<BarraDeOcupacao ocupacao={1.2} />)
    const barra = container.firstChild.firstChild
    expect(barra).toHaveClass('bg-destructive-cheio')
    expect(barra.style.width).toBe('100%')
  })
})
