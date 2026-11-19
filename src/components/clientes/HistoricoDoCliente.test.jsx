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

  it('"não se aplica" e "motivo trocado": a tarefa e o motivo (quem na coluna Quem); escondidos pelo banco, só o fato', async () => {
    vi.mocked(listarEventos).mockResolvedValue({
      itens: [
        { id: 'e2', tipo: 'tarefa_nao_se_aplica', em: '2026-11-18T10:00:00Z', tarefa: 'Inventário', motivo: 'O cliente não tem estoque', autor: 'Ana Lima' },
        { id: 'e1', tipo: 'tarefa_nao_se_aplica', em: '2026-11-17T10:00:00Z', tarefa: null, motivo: null, autor: null },
        { id: 'e0', tipo: 'tarefa_reaberta', em: '2026-11-16T10:00:00Z', tarefa: 'Inventário', motivo: null, autor: 'Ana Lima' },
        { id: 'e9', tipo: 'tarefa_reaberta', em: '2026-11-15T10:00:00Z', tarefa: null, motivo: null, autor: null },
        { id: 'e8', tipo: 'motivo_trocado', em: '2026-11-14T10:00:00Z', tarefa: 'Inventário', motivo: 'Sem estoque físico', autor: 'Ana Lima' },
        { id: 'e7', tipo: 'motivo_trocado', em: '2026-11-13T10:00:00Z', tarefa: null, motivo: null, autor: null },
      ],
      total: 6,
    })
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    const tabela = await screen.findByRole('table', { name: 'Histórico' })
    const linhas = within(tabela).getAllByRole('row').slice(1).map((l) => within(l).getAllByRole('cell').slice(1).map((c) => c.textContent))
    expect(linhas).toEqual([
      ['Tarefa não se aplica: Inventário (O cliente não tem estoque)', 'Ana Lima'],
      ['Tarefa do check-list marcada como não se aplica', '—'],
      ['Tarefa reaberta: Inventário (desfeito o "não se aplica")', 'Ana Lima'],
      ['Tarefa do check-list reaberta (desfeito o "não se aplica")', '—'],
      ['Motivo trocado: Inventário (Sem estoque físico)', 'Ana Lima'],
      ['Motivo do "não se aplica" trocado numa tarefa do check-list', '—'],
    ])
  })

  it('pagina no banco: some com 15, aparece com 16 e Próxima pede a página 2 (useListaPaginada)', async () => {
    const evento = (i) => ({ id: `e${i}`, tipo: 'editado', em: '2026-11-17T10:00:00Z', autor: 'Central' })
    vi.mocked(listarEventos).mockResolvedValue({ itens: Array.from({ length: 15 }, (_, i) => evento(i)), total: 15 })
    const { unmount } = render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    await screen.findByRole('table', { name: 'Histórico' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarEventos).mockResolvedValue({ itens: Array.from({ length: 15 }, (_, i) => evento(i)), total: 16 })
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarEventos).toHaveBeenLastCalledWith('k1', { pagina: 2 })
  })

  it('a página que ficou vazia (o histórico encolheu) volta para a 1', async () => {
    vi.mocked(listarEventos).mockImplementation(async (_cliente, { pagina }) => (pagina > 1
      ? { itens: [], total: 15 }
      : { itens: [{ id: 'e1', tipo: 'cadastrado', em: '2026-11-17T10:00:00Z', autor: 'Central' }], total: 16 }))
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    await vi.waitFor(() => expect(listarEventos).toHaveBeenLastCalledWith('k1', { pagina: 1 }))
    expect(await screen.findByText('Cadastrado')).toBeInTheDocument()
  })

  it('erro na leitura: o aviso no lugar do carregando', async () => {
    vi.mocked(listarEventos).mockRejectedValue(new Error('rede'))
    render(<HistoricoDoCliente clienteId="k1" versao={0} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o histórico.')
    expect(screen.queryByText('Carregando o histórico…')).not.toBeInTheDocument()
  })
})
