import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import EditarConsultoria from './EditarConsultoria'

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

describe('EditarConsultoria', () => {
  it('manda o nome novo e mostra o erro de nome repetido', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: 'Já existe uma consultoria com esse nome.' })
    render(<EditarConsultoria aberto consultoria={{ id: 'c1', nome: 'Acme' }} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Nome da consultoria'))
    await userEvent.type(screen.getByLabelText('Nome da consultoria'), 'Acme Brasil')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Acme Brasil', logo: null })
    expect(await screen.findByText('Já existe uma consultoria com esse nome.')).toBeInTheDocument()
  })

  it('coloca a logo da empresa', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    render(<EditarConsultoria aberto consultoria={{ id: 'c1', nome: 'Acme' }} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    const arquivo = new File(['x'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher logo'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ nome: 'Acme', logo: { arquivo } })
  })
})
