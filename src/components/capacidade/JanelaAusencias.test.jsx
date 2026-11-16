import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { escolherData } from '@/test/campos'
import { apagarAusencia, criarAusencia, editarAusencia, listarAusencias } from '@/data/capacidade'
import JanelaAusencias from './JanelaAusencias'

vi.mock('@/data/capacidade', () => ({
  listarAusencias: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))

const AUSENCIA = { id: 'a1', perfil_id: 'p1', de: '2026-12-20', ate: '2027-01-05', motivo: 'Férias' }

let aoMudar

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarAusencias).mockResolvedValue({ itens: [AUSENCIA], total: 1 })
  for (const f of [criarAusencia, editarAusencia, apagarAusencia]) vi.mocked(f).mockResolvedValue({ erro: null })
  aoMudar = vi.fn()
  render(<JanelaAusencias aberto pessoa={{ id: 'p1', nome: 'Ana' }} aoFechar={() => {}} aoMudar={aoMudar} />)
})

describe('JanelaAusencias', () => {
  it('lista as ausências da pessoa', async () => {
    const tabela = await screen.findByRole('table', { name: 'Ausências' })
    expect(listarAusencias).toHaveBeenCalledWith('p1', { pagina: 1 })
    expect(within(tabela).getByText('20/12/2026')).toBeInTheDocument()
    expect(within(tabela).getByText('Férias')).toBeInTheDocument()
  })

  it('cria uma ausência com de, até e motivo', async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Nova ausência/ }))
    await escolherData(userEvent, 'De', '2026-12-01')
    await escolherData(userEvent, 'Até', '2026-12-03')
    await userEvent.type(screen.getByLabelText('Motivo'), 'Licença')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ausência' }))
    expect(criarAusencia).toHaveBeenCalledWith({ perfilId: 'p1', de: '2026-12-01', ate: '2026-12-03', motivo: 'Licença' })
    await vi.waitFor(() => expect(listarAusencias).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('recusa motivo de 1 caractere', async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Nova ausência/ }))
    await escolherData(userEvent, 'De', '2026-12-01')
    await escolherData(userEvent, 'Até', '2026-12-03')
    await userEvent.type(screen.getByLabelText('Motivo'), 'F')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ausência' }))
    expect(screen.getByRole('alert')).toHaveTextContent('O motivo precisa ter de 2 a 120 caracteres.')
    expect(criarAusencia).not.toHaveBeenCalled()
  })

  it('recusa data final antes da inicial', async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Nova ausência/ }))
    await escolherData(userEvent, 'De', '2026-12-10')
    await escolherData(userEvent, 'Até', '2026-12-03')
    await userEvent.type(screen.getByLabelText('Motivo'), 'Licença')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ausência' }))
    expect(screen.getByRole('alert')).toHaveTextContent('A data final não pode ser antes da inicial.')
    expect(criarAusencia).not.toHaveBeenCalled()
  })

  it('Editar abre o formulário preenchido e salva', async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Editar/ }))
    expect(screen.getByLabelText('De')).toHaveTextContent('20 de dez de 2026')
    expect(screen.getByLabelText('Motivo')).toHaveValue('Férias')
    await userEvent.clear(screen.getByLabelText('Motivo'))
    await userEvent.type(screen.getByLabelText('Motivo'), 'Recesso')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ausência' }))
    expect(editarAusencia).toHaveBeenCalledWith('a1', { de: '2026-12-20', ate: '2027-01-05', motivo: 'Recesso' })
    await vi.waitFor(() => expect(listarAusencias).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('Apagar pede confirmação', async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Apagar/ }))
    expect(apagarAusencia).not.toHaveBeenCalled()
    const confirmacao = screen.getByRole('alertdialog')
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Apagar' }))
    expect(apagarAusencia).toHaveBeenCalledWith('a1')
    await vi.waitFor(() => expect(listarAusencias).toHaveBeenCalledTimes(2))
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })
})
