import { render, screen, within } from '@testing-library/react'
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

  it('nome curto: o erro fica embaixo do campo e nada vai ao banco (usabilidade, U2)', async () => {
    const aoSalvar = vi.fn()
    render(<EditarConsultoria aberto consultoria={{ id: 'c1', nome: 'Acme' }} aoSalvar={aoSalvar} aoFechar={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Nome da consultoria'))
    await userEvent.type(screen.getByLabelText('Nome da consultoria'), 'A')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByLabelText('Nome da consultoria')).toHaveAccessibleDescription('Use pelo menos 2 caracteres.')
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('fechar com o nome mudado pergunta antes de descartar (usabilidade, U4)', async () => {
    const aoFechar = vi.fn()
    render(<EditarConsultoria aberto consultoria={{ id: 'c1', nome: 'Acme' }} aoSalvar={vi.fn()} aoFechar={aoFechar} />)
    await userEvent.type(screen.getByLabelText('Nome da consultoria'), ' Brasil')
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.getByLabelText('Nome da consultoria')).toHaveValue('Acme Brasil')
  })
})
