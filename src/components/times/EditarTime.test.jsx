import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { escolherNoSeletor } from '@/test/campos'
import EditarTime from './EditarTime'

const time = { id: 't1', nome: 'Implantação', descricao: '', gestor_id: 'g1', gestor: { id: 'g1', nome: 'Gabriel' } }
const buscarGestores = vi.fn().mockResolvedValue({ itens: [{ id: 'g1', nome: 'Gabriel' }, { id: 'g2', nome: 'Bruna' }], total: 2 })

describe('EditarTime', () => {
  it('admin troca o gestor', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarTime aberto time={time} papelDeQuemEdita="admin" buscarGestores={buscarGestores} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    expect(screen.getByLabelText('Gestor do time')).toHaveTextContent('Gabriel')
    await escolherNoSeletor(userEvent, 'Gestor do time', 'Bruna')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação', descricao: '', gestorId: 'g2' })
  })

  it('gestor não troca o gestor', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarTime aberto time={time} papelDeQuemEdita="gestor" buscarGestores={buscarGestores} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    expect(screen.queryByLabelText('Gestor do time')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Nome do time'))
    await userEvent.type(screen.getByLabelText('Nome do time'), 'Implantação 2')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Implantação 2', descricao: '' })
  })
})
