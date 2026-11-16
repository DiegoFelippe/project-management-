import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EditarCarga from './EditarCarga'

function abrir() {
  const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
  const aoFechar = vi.fn()
  render(<EditarCarga aberto pessoa={{ id: 'p1', nome: 'Ana', carga_semanal: 40 }} aoFechar={aoFechar} aoSalvar={aoSalvar} />)
  return { aoSalvar, aoFechar }
}

describe('EditarCarga', () => {
  it('abre com a carga da linha e salva o valor novo (aceita vírgula)', async () => {
    const { aoSalvar, aoFechar } = abrir()
    const campo = screen.getByLabelText('Carga semanal (horas)')
    expect(campo).toHaveValue('40')
    await userEvent.clear(campo)
    await userEvent.type(campo, '32,5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith(32.5)
    expect(aoFechar).toHaveBeenCalled()
  })

  it('recusa mais de 60 horas e avisa que 0 tira a pessoa da sugestão', async () => {
    const { aoSalvar } = abrir()
    expect(screen.getByText(/Com 0, ela sai da sugestão/)).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '61')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use de 0 a 60 horas.')
    expect(aoSalvar).not.toHaveBeenCalled()
  })
})
