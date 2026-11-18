import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('a tabela é só de leitura: sem coluna de ações e com a rolagem alcançável pelo teclado (auditoria, R13)', async () => {
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    const tabela = await screen.findByRole('table', { name: 'Histórico' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Quando', 'O quê', 'Quem'])
    const rolagem = screen.getByRole('region', { name: 'Tabela Histórico' })
    await userEvent.tab()
    expect(rolagem).toHaveFocus()
  })
})
