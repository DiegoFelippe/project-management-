import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mudarInicio } from '@/data/checklists'
import { escolherData } from '@/test/campos'
import JanelaInicioDosPrazos from './JanelaInicioDosPrazos'

vi.mock('@/data/checklists', () => ({ mudarInicio: vi.fn() }))

const TAREFAS = [
  { id: 't1', titulo: 'Reunião', prazo_dias: 2, estado: 'feita' },
  { id: 't2', titulo: 'Análise do DRE', prazo_dias: 10, estado: 'a_fazer' },
  { id: 't3', titulo: 'Plano de ação', prazo_dias: 60, estado: 'a_fazer' },
]
const CHECKLIST = { id: 'cl1', inicio: '2026-11-10' }

function abrir({ aoSalvar = vi.fn(), aoFechar = vi.fn() } = {}) {
  render(<JanelaInicioDosPrazos checklist={CHECKLIST} tarefas={TAREFAS} proximaId="t2" aoFechar={aoFechar} aoSalvar={aoSalvar} />)
  return { aoSalvar, aoFechar, janela: screen.getByRole('dialog', { name: 'Mudar o início dos prazos' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(mudarInicio).mockResolvedValue({ erro: null })
})

describe('JanelaInicioDosPrazos', () => {
  it('abre com o início atual e a prévia das datas; mudar a data muda a prévia; Salvar grava e avisa', async () => {
    const { janela, aoSalvar, aoFechar } = abrir()
    expect(within(janela).getByLabelText('Início dos prazos')).toHaveTextContent('10 de nov de 2026')
    expect(janela).toHaveTextContent('As tarefas vencem de 12/11/2026 (dia 2) a 09/01/2027 (dia 60).')
    expect(janela).toHaveTextContent('A próxima, "Análise do DRE", vence em 20/11/2026.')
    expect(janela).toHaveTextContent('O que já foi feito continua feito.')
    await escolherData(userEvent, 'Início dos prazos', '2026-11-20')
    expect(janela).toHaveTextContent('As tarefas vencem de 22/11/2026 (dia 2) a 19/01/2027 (dia 60).')
    expect(janela).toHaveTextContent('A próxima, "Análise do DRE", vence em 30/11/2026.')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(mudarInicio).toHaveBeenCalledWith('cl1', '2026-11-20')
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith('2026-11-20'))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('a mesma data fecha sem gravar', async () => {
    const { janela, aoSalvar, aoFechar } = abrir()
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(mudarInicio).not.toHaveBeenCalled()
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(aoFechar).toHaveBeenCalled()
  })

  it('enquanto grava, "Salvando…"; o erro do banco fica na janela', async () => {
    let responder
    vi.mocked(mudarInicio).mockImplementation(() => new Promise((r) => { responder = r }))
    const { janela, aoSalvar } = abrir()
    await escolherData(userEvent, 'Início dos prazos', '2026-11-20')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(within(janela).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    responder({ erro: 'O início dos prazos precisa estar entre 2 anos atrás e 1 ano à frente.' })
    expect(await within(janela).findByText('O início dos prazos precisa estar entre 2 anos atrás e 1 ano à frente.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })
})
