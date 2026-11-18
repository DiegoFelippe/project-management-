import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { simularResizeObserver } from '@/test/resizeObserver'
import { LARGURA_PADRAO, useLargura } from './useLargura'

function Medido() {
  const ref = useRef(null)
  const largura = useLargura(ref)
  return <div ref={ref}><span data-testid="largura">{largura}</span></div>
}

afterEach(() => vi.unstubAllGlobals())

describe('useLargura', () => {
  it('sem ResizeObserver (jsdom) devolve 640', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Medido />)
    expect(LARGURA_PADRAO).toBe(640)
    expect(screen.getByTestId('largura')).toHaveTextContent('640')
  })

  it('com ele, devolve a largura medida e atualiza quando o contêiner muda', () => {
    const { redimensionar } = simularResizeObserver()
    render(<Medido />)
    redimensionar(360.6)
    expect(screen.getByTestId('largura')).toHaveTextContent('360')
    redimensionar(912)
    expect(screen.getByTestId('largura')).toHaveTextContent('912')
    // Escondido (largura 0): fica com a última medida.
    redimensionar(0)
    expect(screen.getByTestId('largura')).toHaveTextContent('912')
  })
})
