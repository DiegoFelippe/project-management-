import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Celula, CelulaAcoes, Linha, ListaVazia, Paginacao, Tabela } from './Tabela'

describe('Tabela (padrão das listas)', () => {
  it('tem nome, as colunas, a coluna de ações e uma linha por item', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time', 'Gestor']}>
        {['Implantação', 'Suporte'].map((nome) => (
          <Linha key={nome}>
            <Celula>{nome}</Celula>
            <Celula>Gil</Celula>
            <CelulaAcoes><button type="button" className="botao-animado">Editar</button></CelulaAcoes>
          </Linha>
        ))}
      </Tabela>,
    )
    const tabela = screen.getByRole('table', { name: 'Times' })
    const cabecalhos = within(tabela).getAllByRole('columnheader').map((c) => c.textContent)
    expect(cabecalhos).toEqual(['Time', 'Gestor', 'Ações'])
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
  })

  it('lista vazia mostra o aviso', () => {
    render(<ListaVazia>Nenhum time ainda.</ListaVazia>)
    expect(screen.getByText('Nenhum time ainda.')).toBeInTheDocument()
  })

  it('paginação só aparece acima de 15 registros', () => {
    const { rerender } = render(<Paginacao pagina={1} total={15} aoMudar={vi.fn()} />)
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    rerender(<Paginacao pagina={1} total={16} aoMudar={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('1–15 de 16')
  })

  it('mostra a faixa da página e anda para os lados', async () => {
    const aoMudar = vi.fn()
    const { rerender } = render(<Paginacao pagina={2} total={40} aoMudar={aoMudar} />)
    expect(screen.getByText('16–30 de 40')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(aoMudar).toHaveBeenLastCalledWith(3)
    await userEvent.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(aoMudar).toHaveBeenLastCalledWith(1)
    rerender(<Paginacao pagina={3} total={40} aoMudar={aoMudar} />)
    expect(screen.getByText('31–40 de 40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
  })

  it('a tabela leva a paginação junto quando recebe paginacao', () => {
    render(
      <Tabela rotulo="Times" colunas={['Time']} paginacao={{ pagina: 1, total: 20, aoMudar: vi.fn() }}>
        <Linha><Celula>Implantação</Celula><CelulaAcoes /></Linha>
      </Tabela>,
    )
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('1–15 de 20')
  })
})
