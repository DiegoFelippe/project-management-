import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import RankingDeOcupacao from './RankingDeOcupacao'

const ver = (props) => render(<MemoryRouter><RankingDeOcupacao passado={false} {...props} /></MemoryRouter>)
const RANK = [{ id: 'a', nome: 'Alfa', ocupacao: 1.3, capacidade: 100 }, { id: 'b', nome: 'Beta', ocupacao: 0.5, capacidade: 80 }]

describe('RankingDeOcupacao', () => {
  it('central: "Ver todas" abre a aba Ocupação do mês; barra cheia e vermelha acima de 100%', () => {
    ver({ recorte: 'tudo', ranking: RANK })
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/consultorias?aba=ocupacao')
    expect(screen.getByRole('img', { name: 'Alfa: 130% de ocupação' }).firstChild).toHaveStyle({ width: '100%' })
    expect(screen.getByRole('img', { name: 'Alfa: 130% de ocupação' }).firstChild).toHaveClass('bg-destructive')
    expect(screen.getByRole('img', { name: 'Beta: 50% de ocupação' }).firstChild).toHaveStyle({ width: '50%' })
    expect(screen.getByRole('img', { name: 'Beta: 50% de ocupação' }).firstChild).toHaveClass('bg-primary')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
  it('administrador: vai a Usuários', () => {
    ver({ recorte: 'consultoria', ranking: RANK })
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/usuarios')
  })
  it('vazio: frase curta', () => {
    ver({ recorte: 'consultoria', ranking: [] })
    expect(screen.getByText('Nenhum consultor com capacidade neste mês.')).toBeInTheDocument()
  })
})
