import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consultoresPorOcupacao } from '@/data/capacidade'
import JanelaConsultor from './JanelaConsultor'

vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))

const ana = { id: 'p1', nome: 'Ana', foto: null, capacidade: 100, reservado: 40, ocupacao: 0.4, clientes: 3 }
const beto = { id: 'p2', nome: 'Beto', foto: null, capacidade: 100, reservado: 60, ocupacao: 0.6, clientes: 4 }
const cliente = { id: 'k1', nome: 'Alfa Net', horas_mes: 24, consultoria_id: 's1', consultoria: { id: 's1', nome: 'STI' }, consultor: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [ana, beto], total: 2 })
})

describe('JanelaConsultor', () => {
  it('lista os consultores da consultoria do cliente, sugere o menos ocupado e escolhe', async () => {
    const aoEscolher = vi.fn().mockResolvedValue({ erro: null })
    render(<JanelaConsultor aberto cliente={cliente} aoFechar={() => {}} aoEscolher={aoEscolher} />)
    const janela = await screen.findByRole('dialog', { name: 'Escolher o consultor de Alfa Net' })
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1', limite: 8, deslocamento: 0 }))
    expect(await within(janela).findByRole('radio', { name: /Ana.*Sugestão/ })).toBeChecked()
    expect(within(janela).getByText('Ana passa de 40% para 64%.')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('radio', { name: /Beto/ }))
    await userEvent.click(within(janela).getByRole('button', { name: 'Escolher Beto' }))
    expect(aoEscolher).toHaveBeenCalledWith('p2', expect.objectContaining({ id: 'p2' }))
  })

  it('trocar: título próprio, atual marcado e sem a sugestão', async () => {
    render(<JanelaConsultor aberto cliente={{ ...cliente, consultor: { id: 'p1', nome: 'Ana' } }} aoFechar={() => {}} aoEscolher={vi.fn()} />)
    const janela = await screen.findByRole('dialog', { name: 'Trocar o consultor de Alfa Net' })
    expect(await within(janela).findByRole('radio', { name: /Beto.*Sugestão/ })).toBeChecked()
    expect(within(janela).getByText('Atual')).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Trocar para Beto' })).toBeInTheDocument()
  })

  it('consultor com ocupação nula não recebe a sugestão', async () => {
    vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [{ ...ana, capacidade: 0, ocupacao: null }], total: 1 })
    render(<JanelaConsultor aberto cliente={cliente} aoFechar={() => {}} aoEscolher={vi.fn()} />)
    await screen.findByRole('radio', { name: /Ana/ })
    expect(screen.queryByText('Sugestão: menor ocupação')).not.toBeInTheDocument()
  })
})
