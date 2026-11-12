import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EditarTime from './EditarTime'

const time = { id: 't1', nome: 'Implantação', descricao: '', gestor_id: 'g1' }
const GESTORES = [{ id: 'g1', nome: 'Gabriel' }, { id: 'g2', nome: 'Bruna' }]

describe('EditarTime', () => {
  it('admin troca o gestor', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarTime aberto time={time} papelDeQuemEdita="admin" gestores={GESTORES} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText('Gestor do time'), 'g2')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação', descricao: '', gestorId: 'g2' })
  })

  it('gestor não troca o gestor', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarTime aberto time={time} papelDeQuemEdita="gestor" gestores={GESTORES} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    expect(screen.queryByLabelText('Gestor do time')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Nome do time'))
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação 2')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação 2', descricao: '' })
  })
})
