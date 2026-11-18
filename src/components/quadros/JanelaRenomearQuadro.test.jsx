import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renomearQuadro } from '@/data/quadros'
import JanelaRenomearQuadro from './JanelaRenomearQuadro'

vi.mock('@/data/quadros', () => ({ renomearQuadro: vi.fn() }))

const QUADRO = { id: 'q1', nome: 'Sprint', tipo: 'time', pode_administrar: true }

function tela() {
  const aoFechar = vi.fn()
  const aoSalvo = vi.fn()
  render(<JanelaRenomearQuadro quadro={QUADRO} aoFechar={aoFechar} aoSalvo={aoSalvo} />)
  return { aoFechar, aoSalvo, janela: screen.getByRole('dialog', { name: 'Renomear quadro' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(renomearQuadro).mockResolvedValue({ erro: null })
})

describe('JanelaRenomearQuadro (o Editar do quadro)', () => {
  it('abre com o nome do quadro preenchido e salva o nome novo', async () => {
    const user = userEvent.setup()
    const { aoSalvo, janela } = tela()
    const nome = within(janela).getByLabelText('Nome')
    expect(nome).toHaveValue('Sprint')
    expect(nome).toHaveAttribute('maxLength', '80')
    await user.clear(nome)
    await user.type(nome, 'Sprint 12')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(renomearQuadro).toHaveBeenCalledWith('q1', 'Sprint 12')
    await waitFor(() => expect(aoSalvo).toHaveBeenCalledWith('Sprint 12'))
  })

  it('nome vazio não envia; recusa do banco aparece e a janela fica', async () => {
    vi.mocked(renomearQuadro).mockResolvedValue({ erro: 'Já existe um quadro aberto com esse nome.' })
    const user = userEvent.setup()
    const { aoSalvo, janela } = tela()
    const nome = within(janela).getByLabelText('Nome')
    await user.clear(nome)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Dê um nome ao quadro.')
    expect(renomearQuadro).not.toHaveBeenCalled()
    await user.type(nome, 'Outro')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await within(janela).findByText('Já existe um quadro aberto com esse nome.')).toBeInTheDocument()
    expect(aoSalvo).not.toHaveBeenCalled()
  })

  it('enquanto salva, "Salvando…"', async () => {
    let terminar
    vi.mocked(renomearQuadro).mockImplementation(() => new Promise((r) => { terminar = r }))
    const user = userEvent.setup()
    const { janela } = tela()
    await user.type(within(janela).getByLabelText('Nome'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    terminar({ erro: null })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvando…' })).not.toBeInTheDocument())
  })

  it('o mesmo nome fecha sem gravar', async () => {
    const user = userEvent.setup()
    const { aoFechar } = tela()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(renomearQuadro).not.toHaveBeenCalled()
    expect(aoFechar).toHaveBeenCalled()
  })
})
