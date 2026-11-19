import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

// Cores vivas (19/11, CLAUDE.md, Padrão Hub): o selo de estado é sólido, o cheio do estado com o "sobre" por cima.
describe('Badge', () => {
  it.each([
    ['notice', 'bg-notice-cheio', 'text-sobre-notice'],
    ['positive', 'bg-positive-cheio', 'text-sobre-positive'],
    ['destructive', 'bg-destructive-cheio', 'text-sobre-destructive'],
    ['default', 'bg-primary-cheio', 'text-primary-foreground'],
  ])('%s: fundo cheio com o texto no sobre', (variant, fundo, texto) => {
    render(<Badge variant={variant}>Selo</Badge>)
    const selo = screen.getByText('Selo')
    expect(selo).toHaveClass(fundo, texto)
    expect(selo.className).not.toMatch(/-soft\b/)
  })
})
