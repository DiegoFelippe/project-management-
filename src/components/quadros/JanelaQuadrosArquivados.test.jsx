import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { quadroPorId } from '@/data/quadro'
import { apagarQuadro, quadrosArquivados, restaurarQuadro } from '@/data/quadros'
import JanelaQuadrosArquivados from './JanelaQuadrosArquivados'

vi.mock('@/data/quadro', () => ({ quadroPorId: vi.fn() }))
vi.mock('@/data/quadros', () => ({
  QUADROS_ARQUIVADOS_POR_PAGINA: 15, quadrosArquivados: vi.fn(), restaurarQuadro: vi.fn(), apagarQuadro: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const ANA = { id: 'p1', nome: 'Ana Lima', papel: 'pessoa', consultoria_id: 's1' }
const CENTRAL = { id: 'p9', nome: 'Carla', papel: 'central', consultoria_id: null }
const arquivado = (i, extras = {}) => ({
  id: `q${i}`, nome: `Arquivado ${i}`, tipo: 'pessoa', time: null, cartoes: i, favorito: false,
  arquivado_em: '2026-11-15T13:00:00Z', pode_administrar: true, ...extras,
})
const DO_TIME = arquivado(2, { tipo: 'time', time: { id: 't1', nome: 'Comercial' }, pode_administrar: false })

function tela(perfil = ANA) {
  const aoFechar = vi.fn()
  const aoAbrir = vi.fn()
  const aoMudou = vi.fn()
  render(<JanelaQuadrosArquivados perfil={perfil} aoFechar={aoFechar} aoAbrir={aoAbrir} aoMudou={aoMudou} />)
  return { aoFechar, aoAbrir, aoMudou }
}

const tabela = () => screen.findByRole('table', { name: 'Quadros arquivados' })
const linha = async (nome) => within(await tabela()).getByText(nome).closest('tr')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(quadrosArquivados).mockImplementation(async ({ pagina }) => ({
    itens: pagina === 1 ? [arquivado(1), DO_TIME] : [arquivado(16)],
    total: 16,
  }))
  vi.mocked(restaurarQuadro).mockResolvedValue({ erro: null })
  vi.mocked(apagarQuadro).mockResolvedValue({ erro: null })
  vi.mocked(quadroPorId).mockResolvedValue({ ...arquivado(1), colunas: [{ id: 'c1', cartoes: 1, arquivados: 0 }] })
})

describe('JanelaQuadrosArquivados', () => {
  it('a tabela "Quadros arquivados": nome, de quem, cartões e quando arquivou, paginada no banco (15 por página)', async () => {
    const user = userEvent.setup()
    tela()
    const t = await tabela()
    expect(screen.getByRole('dialog', { name: 'Quadros arquivados' })).toBeInTheDocument()
    expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Nome', 'De quem', 'Cartões', 'Arquivado em', 'Ações'])
    expect(quadrosArquivados).toHaveBeenCalledWith({ busca: '', tipo: '', pagina: 1 })
    expect(within(await linha('Arquivado 1')).getByText('Pessoal')).toBeInTheDocument()
    expect(within(await linha('Arquivado 2')).getByText('Comercial')).toBeInTheDocument()
    expect(within(await linha('Arquivado 2')).getByText('2')).toHaveClass('tabular-nums')
    expect(screen.getByText('1–15 de 16')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(quadrosArquivados).toHaveBeenCalledWith({ busca: '', tipo: '', pagina: 2 })
    expect(await within(t).findByText('Arquivado 16')).toBeInTheDocument()
  })

  it('com 15 ou menos, a paginação some', async () => {
    vi.mocked(quadrosArquivados).mockResolvedValue({ itens: [arquivado(1)], total: 15 })
    tela()
    await tabela()
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
  })

  it('busca e abas (Todos · Pessoais · Dos times) no banco, voltando para a página 1', async () => {
    const user = userEvent.setup()
    tela()
    await tabela()
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.click(screen.getByRole('button', { name: 'Dos times' }))
    await waitFor(() => expect(quadrosArquivados).toHaveBeenLastCalledWith({ busca: '', tipo: 'time', pagina: 1 }))
    await user.type(screen.getByRole('searchbox', { name: 'Buscar quadros arquivados' }), 'sprint')
    await waitFor(() => expect(quadrosArquivados).toHaveBeenLastCalledWith({ busca: 'sprint', tipo: 'time', pagina: 1 }))
    await user.click(screen.getByRole('button', { name: 'Pessoais' }))
    await waitFor(() => expect(quadrosArquivados).toHaveBeenLastCalledWith({ busca: 'sprint', tipo: 'pessoa', pagina: 1 }))
  })

  it('central e dono: sem as abas (só têm quadros pessoais)', async () => {
    tela(CENTRAL)
    await tabela()
    expect(screen.queryByRole('group', { name: 'De quem' })).not.toBeInTheDocument()
  })

  it('nada arquivado: lista vazia', async () => {
    vi.mocked(quadrosArquivados).mockResolvedValue({ itens: [], total: 0 })
    tela()
    expect(await screen.findByText('Nenhum quadro arquivado.')).toBeInTheDocument()
  })

  it('Abrir (só para ler) em toda linha; Restaurar e Apagar só em quem administra', async () => {
    const user = userEvent.setup()
    const { aoAbrir } = tela()
    const meu = await linha('Arquivado 1')
    const doTime = await linha('Arquivado 2')
    expect(within(meu).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    expect(within(meu).getByRole('button', { name: 'Apagar' })).toBeInTheDocument()
    expect(within(doTime).queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    expect(within(doTime).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
    await user.click(within(doTime).getByRole('button', { name: 'Abrir' }))
    expect(aoAbrir).toHaveBeenCalledWith('q2')
  })

  it('Restaurar devolve o quadro à lista, relê e avisa quem chama', async () => {
    const user = userEvent.setup()
    const { aoMudou } = tela()
    await user.click(within(await linha('Arquivado 1')).getByRole('button', { name: 'Restaurar' }))
    expect(restaurarQuadro).toHaveBeenCalledWith('q1')
    await waitFor(() => expect(aoMudou).toHaveBeenCalledWith('q1', 'restaurado'))
    expect(toast.success).toHaveBeenCalledWith('Quadro Arquivado 1 restaurado.')
    expect(quadrosArquivados.mock.calls.length).toBeGreaterThan(1)
  })

  it('restaurar com nome repetido: a mensagem de renomear um deles', async () => {
    const mensagem = 'Já existe um quadro aberto com esse nome. Renomeie um deles e tente de novo.'
    vi.mocked(restaurarQuadro).mockResolvedValue({ erro: mensagem })
    const user = userEvent.setup()
    const { aoMudou } = tela()
    await user.click(within(await linha('Arquivado 1')).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensagem))
    expect(aoMudou).not.toHaveBeenCalled()
  })

  it('Apagar abre a confirmação (sem Arquivar: já está arquivado) e apaga', async () => {
    const user = userEvent.setup()
    const { aoMudou } = tela()
    await user.click(within(await linha('Arquivado 1')).getByRole('button', { name: 'Apagar' }))
    const confirmar = await screen.findByRole('dialog', { name: 'Apagar o quadro Arquivado 1?' })
    await within(confirmar).findByText(/1 coluna e 1 cartão/)
    expect(within(confirmar).queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument()
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar quadro' }))
    expect(apagarQuadro).toHaveBeenCalledWith('q1')
    await waitFor(() => expect(aoMudou).toHaveBeenCalledWith('q1', 'apagado'))
  })
})
