import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import FaixaDeGrupos from './FaixaDeGrupos'
import { COR_OUTROS, corDaPaleta } from './cores'

const GRUPOS = [
  { nome: 'Aguardando consultoria', n: 4, cor: COR_OUTROS },
  { nome: 'Aguardando consultor', n: 0, cor: corDaPaleta('mostarda') },
  { nome: 'Em atendimento', n: 42, cor: corDaPaleta('azul') },
]

describe('FaixaDeGrupos', () => {
  it('uma faixa só, cada parte do tamanho do número e na cor do grupo, focável com o nome; a parte zero não desenha', () => {
    render(<FaixaDeGrupos rotulo="Fila de clientes" grupos={GRUPOS} />)
    const faixa = screen.getByRole('group', { name: 'Fila de clientes' })
    const partes = within(faixa).getAllByRole('img')
    expect(partes.map((p) => p.getAttribute('aria-label'))).toEqual(['Aguardando consultoria: 4 (9%)', 'Em atendimento: 42 (91%)'])
    for (const p of partes) expect(p).toHaveAttribute('tabindex', '0')
    expect(partes.map((p) => p.style.flexGrow)).toEqual(['4', '42'])
    expect(partes[1].style.background).toBe('var(--cor-azul-forte)')
    // Crescem da esquerda, uma depois da outra.
    expect(partes[1]).toHaveClass('grafico-onda-deitada')
    expect(partes[1].style.getPropertyValue('--i')).toBe('1')
  })

  it('a legenda com o número de cada grupo (o zero também); nome longo corta com o title', () => {
    render(<FaixaDeGrupos rotulo="Fila de clientes" grupos={GRUPOS} />)
    const linhas = within(screen.getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(linhas.map((l) => l.textContent)).toEqual(['Aguardando consultoria4', 'Aguardando consultor0', 'Em atendimento42'])
    expect(screen.getByText('Em atendimento')).toHaveAttribute('title', 'Em atendimento')
    expect(screen.getByText('Em atendimento')).toHaveClass('truncate')
  })

  it('dica no foco do teclado (nome, número e %), no mouse e no toque; Esc fecha', async () => {
    render(<FaixaDeGrupos rotulo="Fila de clientes" grupos={GRUPOS} />)
    await userEvent.tab()
    expect(screen.getByRole('img', { name: /^Aguardando consultoria/ })).toHaveFocus()
    expect(within(screen.getByRole('tooltip')).getByText('Aguardando consultoria')).toBeInTheDocument()
    expect(within(screen.getByRole('tooltip')).getByText('4 (9%)')).toBeInTheDocument()
    await userEvent.tab()
    expect(within(screen.getByRole('tooltip')).getByText('Em atendimento')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    const atendimento = screen.getByRole('img', { name: /^Em atendimento/ })
    await userEvent.hover(atendimento)
    expect(within(screen.getByRole('tooltip')).getByText('42 (91%)')).toBeInTheDocument()
    await userEvent.unhover(atendimento)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.pointerDown(screen.getByRole('img', { name: /^Aguardando consultoria/ }), { pointerType: 'touch' })
    expect(within(screen.getByRole('tooltip')).getByText('Aguardando consultoria')).toBeInTheDocument()
  })

  it('total 0 não desenha nada (o cartão mostra o vazio)', () => {
    const { container } = render(<FaixaDeGrupos rotulo="Quadro" grupos={GRUPOS.map((g) => ({ ...g, n: 0 }))} />)
    expect(container).toBeEmptyDOMElement()
  })
})
