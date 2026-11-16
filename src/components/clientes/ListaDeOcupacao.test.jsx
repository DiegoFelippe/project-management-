import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ListaDeOcupacao from './ListaDeOcupacao'

const itens = [
  { id: 'a', nome: 'Alfa', ocupacao: 0.2 },
  { id: 'b', nome: 'Beta', ocupacao: 0.5 },
  { id: 'c', nome: 'Gama', ocupacao: null },
]

describe('ListaDeOcupacao', () => {
  it('marca a sugestão no primeiro com ocupação, mostra o total e escolhe com o rádio', async () => {
    const aoEscolher = vi.fn()
    render(<ListaDeOcupacao itens={itens} total={211} escolhido="a" aoEscolher={aoEscolher} aoMostrarMais={() => {}} />)
    expect(screen.getAllByText('Sugestão: menor ocupação')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /Alfa/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Alfa.*Sugestão/ })).toBeInTheDocument()
    expect(screen.getByText('Mostrando 3 de 211')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Beta/ }))
    expect(aoEscolher).toHaveBeenCalledWith(itens[1])
  })

  it('sem ocupação não há sugestão; o atual aparece marcado e desabilitado', () => {
    render(<ListaDeOcupacao itens={[itens[2], { ...itens[0] }]} total={2} atualId="a" aoEscolher={() => {}} aoMostrarMais={() => {}} />)
    expect(screen.queryByText('Sugestão: menor ocupação')).not.toBeInTheDocument()
    expect(screen.getByText('Atual')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Alfa/ })).toBeDisabled()
  })

  it('Mostrar mais só aparece quando há mais e chama aoMostrarMais', async () => {
    const aoMostrarMais = vi.fn()
    const { rerender } = render(<ListaDeOcupacao itens={itens} total={10} aoEscolher={() => {}} aoMostrarMais={aoMostrarMais} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais' }))
    expect(aoMostrarMais).toHaveBeenCalled()
    rerender(<ListaDeOcupacao itens={itens} total={3} aoEscolher={() => {}} aoMostrarMais={aoMostrarMais} />)
    expect(screen.queryByRole('button', { name: 'Mostrar mais' })).not.toBeInTheDocument()
  })
})
