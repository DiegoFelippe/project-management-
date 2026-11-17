import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import Extremos from './Extremos'

const item = { id: 'p', nome: 'Ana', ocupacao: 1.2, capacidade: 100, consultoria_nome: 'Consultoria Exemplo' }
const ver = (props) => render(<MemoryRouter><Extremos passado={false} {...props} /></MemoryRouter>)

describe('Extremos', () => {
  it('mostra a consultoria só para a central', () => {
    const { unmount } = ver({ recorte: 'tudo', extremos: { acima: [item], folga: [] } })
    expect(screen.getByText(/Consultoria Exemplo/)).toBeInTheDocument()
    unmount()
    ver({ recorte: 'consultoria', extremos: { acima: [item], folga: [] } })
    expect(screen.queryByText(/Consultoria Exemplo/)).not.toBeInTheDocument()
  })
  it('o nome abre a pessoa no mês só quando ela é visível', () => {
    const outro = { ...item, id: 'q', nome: 'Beto', visivel: false }
    ver({ recorte: 'consultoria', mes: '2026-09-01', extremos: { acima: [{ ...item, visivel: true }], folga: [outro] } })
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/usuarios?pessoa=p&mes=2026-09-01')
    expect(screen.queryByRole('link', { name: /Beto/ })).not.toBeInTheDocument()
    expect(screen.getByText('Beto')).toBeInTheDocument()
  })
  it('vazio: frases curtas', () => {
    ver({ recorte: 'consultoria', extremos: { acima: [], folga: [] } })
    expect(screen.getByText('Ninguém acima da capacidade.')).toBeInTheDocument()
    expect(screen.getByText('Ninguém com folga.')).toBeInTheDocument()
  })
})
