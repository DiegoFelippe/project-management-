import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consultoriasPorOcupacao } from '@/data/capacidade'
import JanelaMandar from './JanelaMandar'

vi.mock('@/data/capacidade', () => ({ consultoriasPorOcupacao: vi.fn() }))

const sti = { id: 's1', nome: 'STI', consultores: 3, clientes: 5, aguardando: 0, capacidade: 100, reservado: 52, realizado: 0, ocupacao: 0.52 }
const outra = { id: 's2', nome: 'Outra', consultores: 2, clientes: 1, aguardando: 0, capacidade: 50, reservado: 25, realizado: 0, ocupacao: 0.5 }
const cliente = { id: 'k1', nome: 'Alfa Net', horas_mes: 6, consultoria: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(consultoriasPorOcupacao).mockResolvedValue({ itens: [sti, outra], total: 20 })
})
afterEach(() => vi.useRealTimers())

describe('JanelaMandar', () => {
  it('começa com a sugestão escolhida, mostra a prévia e manda', async () => {
    const aoMandar = vi.fn().mockResolvedValue({ erro: null })
    render(<JanelaMandar aberto cliente={cliente} aoFechar={() => {}} aoMandar={aoMandar} />)
    const janela = await screen.findByRole('dialog', { name: 'Mandar Alfa Net para uma consultoria' })
    expect(await within(janela).findByRole('radio', { name: /STI/ })).toBeChecked()
    expect(within(janela).getByText('A ocupação da STI passa de 52% para 58%.')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('radio', { name: /Outra/ }))
    expect(within(janela).getByText('A ocupação da Outra passa de 50% para 62%.')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Mandar para Outra' }))
    expect(aoMandar).toHaveBeenCalledWith('s2', expect.objectContaining({ id: 's2' }))
  })

  it('confirmar de novo limpa o erro da tentativa anterior enquanto envia', async () => {
    const aoMandar = vi.fn()
      .mockResolvedValueOnce({ erro: 'A consultoria está arquivada.' })
      .mockImplementationOnce(() => new Promise(() => {}))
    render(<JanelaMandar aberto cliente={cliente} aoFechar={() => {}} aoMandar={aoMandar} />)
    const janela = await screen.findByRole('dialog', { name: 'Mandar Alfa Net para uma consultoria' })
    await within(janela).findByRole('radio', { name: /STI/ })
    await userEvent.click(within(janela).getByRole('button', { name: 'Mandar para STI' }))
    expect(await within(janela).findByText('A consultoria está arquivada.')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Mandar para STI' }))
    expect(aoMandar).toHaveBeenCalledTimes(2)
    expect(within(janela).queryByText('A consultoria está arquivada.')).toBeNull()
    expect(within(janela).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  })

  it('a busca espera 300 ms', async () => {
    render(<JanelaMandar aberto cliente={cliente} aoFechar={() => {}} aoMandar={vi.fn()} />)
    await screen.findByRole('radio', { name: /STI/ })
    vi.useFakeTimers()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sti' } })
    const chamadas = vi.mocked(consultoriasPorOcupacao).mock.calls.length
    await act(async () => { vi.advanceTimersByTime(299) })
    expect(consultoriasPorOcupacao).toHaveBeenCalledTimes(chamadas)
    await act(async () => { vi.advanceTimersByTime(2) })
    expect(consultoriasPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'sti', deslocamento: 0 }))
  })

  it('Mostrar mais com a primeira página cheia pede deslocamento 8', async () => {
    const oito = Array.from({ length: 8 }, (_, i) => ({ ...sti, id: `x${i}`, nome: `C${i}` }))
    vi.mocked(consultoriasPorOcupacao).mockResolvedValue({ itens: oito, total: 20 })
    render(<JanelaMandar aberto cliente={cliente} aoFechar={() => {}} aoMandar={vi.fn()} />)
    await screen.findByRole('radio', { name: /C0/ })
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais' }))
    expect(consultoriasPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ deslocamento: 8 }))
  })

  it('mover: título próprio, consultoria atual marcada e fora da sugestão', async () => {
    const aoMandar = vi.fn().mockResolvedValue({ erro: null })
    render(<JanelaMandar aberto cliente={{ ...cliente, consultoria: { id: 's1', nome: 'STI' } }} aoFechar={() => {}} aoMandar={aoMandar} />)
    const janela = await screen.findByRole('dialog', { name: 'Mover Alfa Net para outra consultoria' })
    expect(await within(janela).findByRole('radio', { name: /Outra.*Sugestão/ })).toBeChecked()
    expect(within(janela).getByText('Atual')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Mover para Outra' }))
    expect(aoMandar).toHaveBeenCalledWith('s2', expect.anything())
  })

  it('sem capacidade cadastrada, a prévia avisa em vez de mostrar porcentagem', async () => {
    vi.mocked(consultoriasPorOcupacao).mockResolvedValue({ itens: [{ ...sti, capacidade: 0, ocupacao: null }], total: 1 })
    render(<JanelaMandar aberto cliente={cliente} aoFechar={() => {}} aoMandar={vi.fn()} />)
    expect(await screen.findByText('A STI está sem capacidade cadastrada.')).toBeInTheDocument()
  })

  it('mostra o erro e mantém a janela quando mandar falha', async () => {
    const aoMandar = vi.fn().mockResolvedValue({ erro: 'Sem permissão.' })
    render(<JanelaMandar aberto cliente={cliente} aoFechar={() => {}} aoMandar={aoMandar} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Mandar para STI' }))
    expect(await screen.findByText('Sem permissão.')).toBeInTheDocument()
  })
})
