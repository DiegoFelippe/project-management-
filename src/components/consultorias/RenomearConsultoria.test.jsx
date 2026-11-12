import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RenomearConsultoria from './RenomearConsultoria'

describe('RenomearConsultoria', () => {
  it('manda o nome novo e mostra o erro de nome repetido', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: 'Já existe uma consultoria com esse nome.' })
    render(<RenomearConsultoria aberto consultoria={{ id: 'c1', nome: 'Acme' }} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Nome da consultoria'))
    await userEvent.type(screen.getByLabelText('Nome da consultoria'), 'Acme Brasil')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith('Acme Brasil')
    expect(await screen.findByText('Já existe uma consultoria com esse nome.')).toBeInTheDocument()
  })
})
