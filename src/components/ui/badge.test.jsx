import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

// Modelo atual com as cores Tropical (19/11, CLAUDE.md): o selo de estado é suave (fundo suave, texto do estado); só o `default` e o
// `destructive` do botão/selo de ação ficam cheios.
describe('Badge', () => {
  it.each([
    ['notice', 'bg-notice-soft', 'text-notice'],
    ['positive', 'bg-positive-soft', 'text-positive'],
    ['destructive', 'bg-destructive-cheio', 'text-sobre-destructive'],
    ['default', 'bg-primary-cheio', 'text-primary-foreground'],
  ])('%s: fundo e texto', (variant, fundo, texto) => {
    render(<Badge variant={variant}>Selo</Badge>)
    const selo = screen.getByText('Selo')
    expect(selo).toHaveClass(fundo, texto)
  })

  it('os selos de estado (notice e positive) não são cheios', () => {
    for (const variant of ['notice', 'positive']) {
      render(<Badge variant={variant}>{variant}</Badge>)
      expect(screen.getByText(variant).className).not.toMatch(/-cheio|sobre/)
    }
  })
})
