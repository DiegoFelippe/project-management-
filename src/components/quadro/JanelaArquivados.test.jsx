import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarCartao, cartoesArquivados, restaurarCartao } from '@/data/quadro'
import { renderizarTela } from '@/test/renderizar'
import JanelaArquivados from './JanelaArquivados'

vi.mock('@/data/quadro', () => ({
  ARQUIVADOS_POR_PAGINA: 15, cartoesArquivados: vi.fn(), restaurarCartao: vi.fn(), apagarCartao: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }
const arquivado = (i, extras = {}) => ({
  id: `a${i}`, titulo: `Arquivado ${i}`, prioridade: null, prazo: null, arquivado_em: '2026-11-15T13:00:00Z',
  criado_em: '2026-11-01T10:00:00Z', criado_por: 'p1', coluna: { id: 'col1', nome: 'A fazer' }, ...extras,
})

const abrir = (quadro = { id: 'q1', pode_mexer: true, pode_gerir: false }, perfil = consultor) => {
  const aoMudar = vi.fn()
  const aoFechar = vi.fn()
  renderizarTela(<JanelaArquivados quadro={quadro} perfil={perfil} aoFechar={aoFechar} aoMudar={aoMudar} />, { perfil })
  return { aoMudar, aoFechar }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cartoesArquivados).mockImplementation(async ({ pagina }) => ({
    itens: pagina === 1 ? [arquivado(1), arquivado(2, { criado_por: 'g1', prazo: '2026-11-20' })] : [arquivado(16)],
    total: 16,
  }))
  vi.mocked(restaurarCartao).mockResolvedValue({ erro: null })
  vi.mocked(apagarCartao).mockResolvedValue({ erro: null })
})

describe('JanelaArquivados', () => {
  it('lista os arquivados numa tabela paginada no banco (15 por página)', async () => {
    const user = userEvent.setup()
    abrir()
    const tabela = await screen.findByRole('table', { name: 'Cartões arquivados' })
    expect(cartoesArquivados).toHaveBeenCalledWith({ quadroId: 'q1', busca: '', pagina: 1 })
    expect(within(tabela).getByText('Arquivado 1')).toBeInTheDocument()
    expect(within(tabela).getAllByText('A fazer')).toHaveLength(2)
    expect(screen.getByText('1–15 de 16')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(cartoesArquivados).toHaveBeenCalledWith({ quadroId: 'q1', busca: '', pagina: 2 })
    expect(await within(tabela).findByText('Arquivado 16')).toBeInTheDocument()
  })

  it('busca no banco e volta para a página 1', async () => {
    const user = userEvent.setup()
    abrir()
    await screen.findByRole('table', { name: 'Cartões arquivados' })
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Buscar arquivados' }), 'boleto')
    await waitFor(() => expect(cartoesArquivados).toHaveBeenLastCalledWith({ quadroId: 'q1', busca: 'boleto', pagina: 1 }))
  })

  it('nada arquivado: lista vazia', async () => {
    vi.mocked(cartoesArquivados).mockResolvedValue({ itens: [], total: 0 })
    abrir()
    expect(await screen.findByText('Nenhum cartão arquivado.')).toBeInTheDocument()
  })

  it('Restaurar volta o cartão ao lugar e avisa o quadro', async () => {
    const user = userEvent.setup()
    const { aoMudar } = abrir()
    const tabela = await screen.findByRole('table', { name: 'Cartões arquivados' })
    const linha = within(tabela).getByText('Arquivado 1').closest('tr')
    await user.click(within(linha).getByRole('button', { name: 'Restaurar' }))
    expect(restaurarCartao).toHaveBeenCalledWith('a1')
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Arquivado 1 voltou para A fazer.')
  })

  it('Restaurar recusado (sem permissão, cartão que já saiu): avisa e relê a lista e o quadro', async () => {
    vi.mocked(restaurarCartao).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    const user = userEvent.setup()
    const { aoMudar } = abrir()
    const tabela = await screen.findByRole('table', { name: 'Cartões arquivados' })
    await user.click(within(within(tabela).getByText('Arquivado 1').closest('tr')).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para isso.'))
    expect(aoMudar).toHaveBeenCalled()
    await waitFor(() => expect(cartoesArquivados).toHaveBeenCalledTimes(2))
  })

  it('Apagar (quem criou ou a gestão) pede confirmação dizendo o que some junto', async () => {
    const user = userEvent.setup()
    const { aoMudar } = abrir()
    const tabela = await screen.findByRole('table', { name: 'Cartões arquivados' })
    // O consultor só apaga o que criou.
    expect(within(within(tabela).getByText('Arquivado 2').closest('tr')).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
    await user.click(within(within(tabela).getByText('Arquivado 1').closest('tr')).getByRole('button', { name: 'Apagar' }))
    const confirmar = screen.getByRole('alertdialog', { name: 'Apagar o cartão Arquivado 1?' })
    expect(confirmar).toHaveTextContent('O cartão some de vez, com checklist, comentários e anexos.')
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar cartão' }))
    expect(apagarCartao).toHaveBeenCalledWith('a1')
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
  })

  it('a gestão apaga qualquer um', async () => {
    abrir({ id: 'q1', pode_mexer: true, pode_gerir: true }, { id: 'g9', papel: 'gestor', consultoria_id: 's1' })
    const tabela = await screen.findByRole('table', { name: 'Cartões arquivados' })
    expect(within(tabela).getAllByRole('button', { name: 'Apagar' })).toHaveLength(2)
  })

  it('quem só lê (central, cliente arquivado) vê a lista sem Restaurar nem Apagar', async () => {
    abrir({ id: 'q1', pode_mexer: false, pode_gerir: false }, { id: 'c0', papel: 'central', consultoria_id: null })
    const tabela = await screen.findByRole('table', { name: 'Cartões arquivados' })
    expect(within(tabela).queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    expect(within(tabela).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })
})
