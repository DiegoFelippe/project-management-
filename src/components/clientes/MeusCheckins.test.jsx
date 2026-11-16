import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarCheckin, editarCheckin, listarCheckins } from '@/data/checkins'
import MeusCheckins from './MeusCheckins'

vi.mock('@/data/checkins', () => ({ listarCheckins: vi.fn(), editarCheckin: vi.fn(), apagarCheckin: vi.fn() }))

const ITENS = [
  {
    id: 'c1', inicio: new Date('2026-11-10T09:00').toISOString(), fim: new Date('2026-11-10T10:30').toISOString(),
    descricao: 'Reunião', consultor_id: 'p9', consultoria_id: 's1', consultor: { nome: 'Eu' }, cliente: { id: 'k1', nome: 'Provedor Alfa' },
  },
  {
    id: 'c2', inicio: new Date('2026-11-11T09:00').toISOString(), fim: null,
    descricao: null, consultor_id: 'p9', consultoria_id: 's1', consultor: { nome: 'Eu' }, cliente: { id: 'k2', nome: 'Antigo Cliente' },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarCheckins).mockResolvedValue({ itens: ITENS, total: 2 })
  vi.mocked(editarCheckin).mockResolvedValue({ erro: null })
  vi.mocked(apagarCheckin).mockResolvedValue({ erro: null })
})

describe('MeusCheckins', () => {
  it('lista os meus check-ins com cliente, horas e descrição', async () => {
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={vi.fn()} />)
    const tabela = await screen.findByRole('table', { name: 'Meus check-ins' })
    expect(listarCheckins).toHaveBeenCalledWith({ consultorId: 'p9', pagina: 1 })
    for (const coluna of ['Cliente', 'Data', 'Horário', 'Horas', 'O que foi feito']) {
      expect(within(tabela).getByRole('columnheader', { name: coluna })).toBeInTheDocument()
    }
    const alfa = screen.getByRole('row', { name: /Provedor Alfa/ })
    expect(within(alfa).getByText('1,5 h')).toBeInTheDocument()
    expect(within(alfa).getByText('Reunião')).toBeInTheDocument()
    const antigo = screen.getByRole('row', { name: /Antigo Cliente/ })
    expect(within(antigo).getByText('Em aberto')).toBeInTheDocument()
    expect(within(antigo).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
  })

  it('Editar no check-in aberto abre a janela com o fim para fechá-lo', async () => {
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={vi.fn()} />)
    await userEvent.click(within(await screen.findByRole('row', { name: /Antigo Cliente/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar check-in em Antigo Cliente' })
    expect(within(janela).getByLabelText('Fim')).not.toHaveTextContent('--:--')
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Suporte')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarCheckin).toHaveBeenCalledWith('c2', { fim: expect.any(String), descricao: 'Suporte' })
  })

  it('Editar abre a janela preenchida e Salvar chama editarCheckin e avisa', async () => {
    const aoMudar = vi.fn()
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={aoMudar} />)
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar check-in em Provedor Alfa' })
    expect(within(janela).getByLabelText('Data')).toHaveTextContent('10 de nov de 2026')
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarCheckin).toHaveBeenCalledWith('c1', { descricao: 'Reunião' })
    expect(aoMudar).toHaveBeenCalled()
    expect(listarCheckins).toHaveBeenCalledTimes(2)
  })

  it('Apagar pede confirmação, apaga e recarrega', async () => {
    const aoMudar = vi.fn()
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={aoMudar} />)
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Apagar' }))
    expect(apagarCheckin).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar check-in' }))
    expect(apagarCheckin).toHaveBeenCalledWith('c1')
    expect(aoMudar).toHaveBeenCalled()
    expect(listarCheckins).toHaveBeenCalledTimes(2)
  })

  it('Apagar com erro mantém a confirmação aberta com o motivo', async () => {
    vi.mocked(apagarCheckin).mockResolvedValue({ erro: 'Sem permissão.' })
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={vi.fn()} />)
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar check-in' }))
    expect(await screen.findByText('Sem permissão.')).toBeInTheDocument()
  })

  it('paginação: Próxima pede a página 2 ao banco', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({ itens: ITENS, total: 16 })
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    expect(listarCheckins).toHaveBeenLastCalledWith({ consultorId: 'p9', pagina: 2 })
  })

  it('check-in de uma consultoria em que não estou mais: só vejo, sem Editar nem Apagar', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({
      itens: [{ ...ITENS[0], id: 'c3', consultoria_id: 's0', cliente: { id: 'k3', nome: 'Da Antiga' } }], total: 1,
    })
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={vi.fn()} />)
    const linha = await screen.findByRole('row', { name: /Da Antiga/ })
    expect(within(linha).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(linha).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('sem check-ins mostra a lista vazia', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({ itens: [], total: 0 })
    render(<MeusCheckins consultorId="p9" consultoriaId="s1" aoMudar={vi.fn()} />)
    expect(await screen.findByText('Você ainda não registrou nenhum check-in.')).toBeInTheDocument()
  })
})
