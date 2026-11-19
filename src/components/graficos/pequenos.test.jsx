import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarraSegmentada from './BarraSegmentada'
import DiasComCheckin from './DiasComCheckin'
import Medidor from './Medidor'
import MiniBarra from './MiniBarra'

describe('MiniBarra (risco)', () => {
  it('marca do limite na posição certa; o valor em texto', () => {
    const { container } = render(<MiniBarra valor={12} limite={30} maximo={60} texto="12 d" rotulo="Último check-in" />)
    expect(container.querySelector('[data-limite]').style.left).toBe('50%')
    expect(container.querySelector('[data-preenchido]').style.width).toBe('20%')
    expect(container.querySelector('[data-preenchido]')).toHaveClass('bg-grafico-serie')
    expect(screen.getByText('12 d')).not.toHaveClass('text-destructive')
    expect(screen.getByText('Último check-in')).toBeInTheDocument()
  })

  it('acima do limite: vermelho, com ícone; nunca passa da trilha', () => {
    const { container } = render(<MiniBarra valor={90} limite={30} maximo={60} texto="90 d" acima />)
    expect(container.querySelector('[data-preenchido]')).toHaveClass('bg-grafico-acima')
    expect(container.querySelector('[data-preenchido]').style.width).toBe('100%')
    expect(screen.getByText('90 d').closest('span')).toHaveClass('text-destructive', 'font-semibold')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('sem valor: trilha vazia e "—"', () => {
    const { container } = render(<MiniBarra valor={null} limite={1.2} maximo={1.8} texto="—" />)
    expect(container.querySelector('[data-preenchido]')).toBeNull()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('Medidor (previsão do mês)', () => {
  it('marca de hoje na posição certa e o preenchido pela fração', () => {
    const { container } = render(<Medidor fracao={0.6} hoje={0.57} />)
    expect(container.querySelector('[data-hoje]').style.left).toBe('57%')
    expect(container.querySelector('[data-preenchido]').style.width).toBe('60%')
    expect(container.querySelector('[data-preenchido]')).toHaveClass('bg-grafico-serie')
    expect(screen.getByText('hoje')).toBeInTheDocument()
  })

  it('acima da previsão: vermelho e cheio (sem passar da trilha)', () => {
    const { container } = render(<Medidor fracao={1.3} hoje={0.9} acima />)
    expect(container.querySelector('[data-preenchido]')).toHaveClass('bg-grafico-acima')
    expect(container.querySelector('[data-preenchido]').style.width).toBe('100%')
  })
})

describe('BarraSegmentada (quadro, check-list)', () => {
  it('uma parte por valor, na ordem dada; parte zero não desenha', () => {
    const { container } = render(<BarraSegmentada partes={[{ valor: 2, tom: 'atrasada' }, { valor: 0, tom: 'neutro' }, { valor: 10, tom: 'feita' }]} />)
    const partes = [...container.querySelectorAll('[data-parte]')]
    expect(partes.map((p) => p.dataset.parte)).toEqual(['atrasada', 'feita'])
    expect(partes.map((p) => p.style.flexGrow)).toEqual(['2', '10'])
    // As cores de estado de todo gráfico (COR): atrasada no vermelho cheio, feita no verde (nunca o azul da série).
    expect(partes.map((p) => p.style.background)).toEqual(['var(--destructive-cheio)', 'var(--positive-cheio)'])
  })

  it('a cor de qualquer nome de COR (não se aplica, série)', () => {
    const { container } = render(<BarraSegmentada partes={[{ valor: 1, tom: 'nsa' }, { valor: 3, tom: 'serie' }]} />)
    expect([...container.querySelectorAll('[data-parte]')].map((p) => p.style.background)).toEqual(['var(--cor-grafite-forte)', 'var(--grafico-serie)'])
  })

  it('tudo zero: só a trilha', () => {
    const { container } = render(<BarraSegmentada partes={[{ valor: 0, tom: 'feita' }]} />)
    expect(container.querySelector('[data-parte]')).toBeNull()
    expect(container.firstChild).toHaveClass('bg-grafico-trilha')
  })
})

describe('DiasComCheckin (últimos 30 dias)', () => {
  const dias = Array.from({ length: 30 }, (_, i) => {
    const dia = new Date(Date.UTC(2026, 9, 19 + i))
    const semana = dia.getUTCDay()
    return { dia: dia.toISOString().slice(0, 10), com: i % 3 === 0, fimDeSemana: semana === 0 || semana === 6 }
  })

  it('30 traços, cheios com check-in, os de fim de semana mais finos; nome com a contagem', () => {
    const { container } = render(<DiasComCheckin dias={dias} />)
    const tracos = [...container.querySelectorAll('[data-dia]')]
    expect(tracos).toHaveLength(30)
    const fimDeSemana = tracos.filter((t) => t.hasAttribute('data-fim-de-semana'))
    expect(fimDeSemana).toHaveLength(8)
    for (const t of fimDeSemana) expect(Number(t.style.flexGrow)).toBeLessThan(1)
    for (const t of tracos.filter((t) => !t.hasAttribute('data-fim-de-semana'))) expect(t.style.flexGrow).toBe('1')
    expect(tracos[0]).toHaveClass('bg-grafico-serie')
    expect(tracos[1]).toHaveClass('bg-grafico-trilha')
    expect(screen.getByRole('img', { name: 'Dias com check-in nos últimos 30 dias: 10' })).toBeInTheDocument()
    expect(screen.getByText('19/10')).toBeInTheDocument()
    expect(screen.getByText('hoje')).toBeInTheDocument()
  })
})
