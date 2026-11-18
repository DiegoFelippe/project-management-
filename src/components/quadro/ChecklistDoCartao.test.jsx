import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarItemDoChecklist, criarItemDoChecklist, editarItemDoChecklist } from '@/data/quadro'
import ChecklistDoCartao from './ChecklistDoCartao'

vi.mock('@/data/quadro', () => ({ criarItemDoChecklist: vi.fn(), editarItemDoChecklist: vi.fn(), apagarItemDoChecklist: vi.fn() }))

const ITENS = [
  { id: 'i1', texto: 'Levantar boletos', feito: true, posicao: 1024 },
  { id: 'i2', texto: 'Ligar para o financeiro', feito: false, posicao: 2048 },
]
const SEM_PERMISSAO = 'Você não tem permissão para isso.'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(criarItemDoChecklist).mockImplementation(async (_cartao, texto) => ({ erro: null, item: { id: `novo-${texto}`, texto, feito: false, posicao: 4096 } }))
  vi.mocked(editarItemDoChecklist).mockResolvedValue({ erro: null })
  vi.mocked(apagarItemDoChecklist).mockResolvedValue({ erro: null })
})

function tela(props = {}) {
  const aoMexer = vi.fn()
  const aoRecusar = vi.fn()
  render(<ChecklistDoCartao cartaoId="c1" itensIniciais={ITENS} podeMexer aoMexer={aoMexer} aoRecusar={aoRecusar} {...props} />)
  return { aoMexer, aoRecusar, lista: screen.getByRole('list', { name: 'Itens do checklist' }) }
}

const progresso = () => screen.getByRole('progressbar', { name: 'Progresso do checklist' })

describe('checklist do cartão', () => {
  it('no toque, cada linha tem 44 px (12 px em cima e embaixo): o alvo de 44 px de uma caixa não cobre o da vizinha', () => {
    const { lista } = tela()
    const linhas = within(lista).getAllByRole('listitem')
    for (const linha of linhas) expect(linha).toHaveClass('py-1', 'pointer-coarse:py-3')
    // O alvo da Caixa sem texto cresce 13 px para cada lado do quadrado de 18 px: 44 px, a altura da linha no toque.
    expect(within(linhas[1]).getByRole('checkbox').parentElement).toHaveClass('pointer-coarse:before:-inset-[13px]')
  })

  it('mostra os itens e a barra de progresso (1 de 2 feitos)', () => {
    const { lista } = tela()
    expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Levantar boletos', 'Ligar para o financeiro'])
    expect(progresso()).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Levantar boletos' })).toBeChecked()
  })

  it('marcar grava sozinho e a barra anda', async () => {
    const user = userEvent.setup()
    const { aoMexer } = tela()
    await user.click(screen.getByRole('checkbox', { name: 'Ligar para o financeiro' }))
    expect(editarItemDoChecklist).toHaveBeenCalledWith('i2', { feito: true })
    expect(progresso()).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('2/2')).toBeInTheDocument()
    await waitFor(() => expect(aoMexer).toHaveBeenCalled())
  })

  it('adicionar com Enter: o item entra no fim e a caixa continua aberta para o próximo', async () => {
    const user = userEvent.setup()
    const { lista, aoMexer } = tela()
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const novo = screen.getByRole('textbox', { name: 'Novo item do checklist' })
    await user.type(novo, '  Enviar contrato  {Enter}')
    expect(criarItemDoChecklist).toHaveBeenCalledWith('c1', 'Enviar contrato')
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(3))
    expect(within(lista).getAllByRole('listitem')[2]).toHaveTextContent('Enviar contrato')
    expect(screen.getByRole('textbox', { name: 'Novo item do checklist' })).toHaveValue('')
    expect(progresso()).toHaveAttribute('aria-valuenow', '33')
    expect(aoMexer).toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Novo item do checklist' })).not.toBeInTheDocument()
  })

  it('editar o texto no lugar (Enter grava; Esc desiste sem gravar)', async () => {
    const user = userEvent.setup()
    tela()
    await user.click(screen.getByRole('button', { name: 'Editar o item Levantar boletos' }))
    const campo = screen.getByRole('textbox', { name: 'Texto do item' })
    expect(campo).toHaveValue('Levantar boletos')
    await user.clear(campo)
    await user.type(campo, 'Levantar boletos de outubro{Enter}')
    expect(editarItemDoChecklist).toHaveBeenCalledWith('i1', { texto: 'Levantar boletos de outubro' })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Levantar boletos de outubro' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Editar o item Ligar para o financeiro' }))
    await user.type(screen.getByRole('textbox', { name: 'Texto do item' }), ' agora{Escape}')
    expect(screen.getByRole('checkbox', { name: 'Ligar para o financeiro' })).toBeInTheDocument()
    expect(editarItemDoChecklist).toHaveBeenCalledTimes(1)
  })

  it('apagar pede confirmação dizendo o que sai', async () => {
    const user = userEvent.setup()
    const { lista, aoMexer } = tela()
    await user.click(screen.getByRole('button', { name: 'Apagar o item Ligar para o financeiro' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Apagar o item do checklist?')
    expect(confirmar).toHaveTextContent('“Ligar para o financeiro” sai do checklist.')
    expect(apagarItemDoChecklist).not.toHaveBeenCalled()
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar item' }))
    expect(apagarItemDoChecklist).toHaveBeenCalledWith('i2')
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(1))
    expect(aoMexer).toHaveBeenCalled()
  })

  it('recusado: volta como estava e quem chama é avisado (ele confere o acesso)', async () => {
    vi.mocked(editarItemDoChecklist).mockResolvedValue({ erro: SEM_PERMISSAO })
    const user = userEvent.setup()
    const { aoRecusar, aoMexer } = tela()
    await user.click(screen.getByRole('checkbox', { name: 'Ligar para o financeiro' }))
    await waitFor(() => expect(aoRecusar).toHaveBeenCalledWith(SEM_PERMISSAO))
    expect(screen.getByRole('checkbox', { name: 'Ligar para o financeiro' })).not.toBeChecked()
    expect(progresso()).toHaveAttribute('aria-valuenow', '50')
    expect(aoMexer).not.toHaveBeenCalled()
  })

  it('só leitura: mostra o que está feito, sem marcar, adicionar, editar nem apagar', () => {
    tela({ podeMexer: false })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Feito' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'A fazer' })).toBeInTheDocument()
  })

  it('sem itens: o convite para começar (quem mexe) ou o aviso (quem só lê)', () => {
    const { unmount } = render(<ChecklistDoCartao cartaoId="c1" itensIniciais={[]} podeMexer aoMexer={vi.fn()} aoRecusar={vi.fn()} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeInTheDocument()
    unmount()
    render(<ChecklistDoCartao cartaoId="c1" itensIniciais={[]} podeMexer={false} aoMexer={vi.fn()} aoRecusar={vi.fn()} />)
    expect(screen.getByText('Nenhum item no checklist.')).toBeInTheDocument()
  })
})
