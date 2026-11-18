import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { listarEventos } from '@/data/clientes'
import HistoricoDoCliente from './HistoricoDoCliente'

vi.mock('@/data/clientes', () => ({ listarEventos: vi.fn() }))

beforeEach(() => {
  vi.mocked(listarEventos).mockResolvedValue({
    itens: [{ id: 'e1', tipo: 'cadastrado', em: '2026-11-17T10:00:00Z', autor: 'Central' }],
    total: 1,
  })
})

describe('HistoricoDoCliente', () => {
  it('a tabela é só de leitura: sem coluna de ações e, quando rola para o lado (celular), alcançável pelo teclado (auditoria, R13)', async () => {
    // O jsdom não mede: a tabela "rola" com 520 px de conteúdo em 340 px.
    const antes = ['scrollWidth', 'clientWidth'].map((nome) => [nome, Object.getOwnPropertyDescriptor(HTMLElement.prototype, nome)])
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 520 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 340 })
    onTestFinished(() => antes.forEach(([nome, d]) => (d ? Object.defineProperty(HTMLElement.prototype, nome, d) : delete HTMLElement.prototype[nome])))
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    const tabela = await screen.findByRole('table', { name: 'Histórico' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Quando', 'O quê', 'Quem'])
    const rolagem = screen.getByRole('region', { name: 'Tabela Histórico' })
    await userEvent.tab()
    expect(rolagem).toHaveFocus()
  })

  it('"não se aplica": a tarefa e o motivo (quem marcou na coluna Quem); escondidos pelo banco, só o fato', async () => {
    vi.mocked(listarEventos).mockResolvedValue({
      itens: [
        { id: 'e2', tipo: 'tarefa_nao_se_aplica', em: '2026-11-18T10:00:00Z', tarefa: 'Inventário', motivo: 'O cliente não tem estoque', autor: 'Ana Lima' },
        { id: 'e1', tipo: 'tarefa_nao_se_aplica', em: '2026-11-17T10:00:00Z', tarefa: null, motivo: null, autor: null },
      ],
      total: 2,
    })
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    const tabela = await screen.findByRole('table', { name: 'Histórico' })
    const linhas = within(tabela).getAllByRole('row').slice(1).map((l) => within(l).getAllByRole('cell').slice(1).map((c) => c.textContent))
    expect(linhas).toEqual([
      ['Tarefa não se aplica: Inventário (O cliente não tem estoque)', 'Ana Lima'],
      ['Tarefa do check-list marcada como não se aplica', '—'],
    ])
  })
})
