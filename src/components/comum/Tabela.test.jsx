import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from './Tabela'

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
})
