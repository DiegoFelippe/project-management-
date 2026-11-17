import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import MeusClientes from './MeusClientes'

const ver = (props) => render(<MemoryRouter><MeusClientes {...props} /></MemoryRouter>)

describe('MeusClientes', () => {
  it('previsto e realizado, sem coluna de ações', () => {
    ver({ passado: false, clientes: [{ id: 'c', nome: 'Cli', previsto: 10, realizado: 4 }] })
    const t = screen.getByRole('table', { name: 'Meus clientes' })
    expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Cliente', 'Previsto', 'Realizado'])
  })
  it('vazio: frase curta', () => {
    ver({ passado: false, clientes: [] })
    expect(screen.getByText('Nenhum cliente seu neste mês.')).toBeInTheDocument()
  })
})
