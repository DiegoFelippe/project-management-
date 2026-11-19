import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { horasPorCliente } from '@/data/painel'
import { renderizarTela } from '@/test/renderizar'
import HorasPorCliente from './HorasPorCliente'

vi.mock('@/data/painel', () => ({ horasPorCliente: vi.fn() }))
vi.mock('@/data/checkins', () => ({ fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), tarefasDoCheckin: vi.fn() }))

const MES = { tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' }
const cliente = (i, extra = {}) => ({ id: `c${i}`, nome: `Cliente ${i}`, sub: 'Ana Lima', horas: 100 - i * 5, previsto: 40, ...extra })
const DEZ = {
  itens: Array.from({ length: 10 }, (_, i) => cliente(i)), resto: { clientes: 238, horas: 1204 },
  total_horas: 1954, total_clientes: 248, participacao_3: 0.15, participacao_10: 0.38,
}

beforeEach(() => vi.clearAllMocks())

describe('HorasPorCliente', () => {
  it('10 barras e "+ 238 outros clientes · 1.204 h"; acima da previsão em vermelho; leitura dos 10 maiores', async () => {
    vi.mocked(horasPorCliente).mockResolvedValue(DEZ)
    renderizarTela(<HorasPorCliente periodo={MES} recorte="consultoria" />, { perfil: {} })
    const lista = await screen.findByRole('list', { name: 'Horas por cliente (10 maiores)' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('+ 238 outros clientes · 1.204 h')).toBeInTheDocument()
    expect(within(lista).getByRole('img', { name: 'Cliente 0: 100 h de 40 h previstas' })).toBeInTheDocument()
    expect(lista.querySelector('[data-trecho="acima"]')).not.toBeNull()
    expect(screen.getByText(/maiores somam/).textContent).toBe('Os 10 maiores somam 38% das horas no mês')
    expect(horasPorCliente).toHaveBeenCalledWith('2026-11-01')
    expect(screen.queryByRole('button', { name: /Fazer check-in/ })).toBeNull()
  })

  it('consultor: botão de check-in por linha; desabilitado com check-in aberto em outro cliente, ligado ao aviso', async () => {
    vi.mocked(horasPorCliente).mockResolvedValue({
      itens: [cliente(1, { nome: 'Cliente Meu', sub: null, horas: 0 }), cliente(2, { nome: 'Outro Meu', sub: null })],
      resto: { clientes: 0, horas: 0 }, total_horas: 90, total_clientes: 2, participacao_3: 1, participacao_10: 1,
    })
    const aberto = { id: 'a1', cliente_id: 'c2', inicio: new Date().toISOString(), cliente: { nome: 'Outro Meu' } }
    renderizarTela(<HorasPorCliente periodo={MES} recorte="pessoa" aberto={aberto} aoMudar={() => {}} />, { perfil: {} })
    expect(await screen.findByRole('heading', { name: 'Horas nos meus clientes' })).toBeInTheDocument()
    const entrar = screen.getByRole('button', { name: 'Fazer check-in em Cliente Meu' })
    expect(entrar).toBeDisabled()
    expect(entrar).toHaveAccessibleDescription(/Você está com check-in aberto em Outro Meu desde/)
    expect(screen.getByRole('button', { name: /Fazer check-out de Outro Meu · / })).toBeEnabled()
  })

  it('tabela paginada pede a página 2 ao banco (e o consultor tem o check-in completo na última coluna)', async () => {
    vi.mocked(horasPorCliente).mockImplementation(async (_periodo, pagina) => {
      if (pagina == null) return DEZ
      return { itens: pagina === 2 ? [cliente(30, { nome: 'Da Página 2' })] : Array.from({ length: 15 }, (_, i) => cliente(i)), total: 248 }
    })
    renderizarTela(<HorasPorCliente periodo={{ tipo: 'ultimos-30', de: '2026-10-19', ate: '2026-11-17' }} recorte="pessoa" aberto={null} aoMudar={() => {}} />, { perfil: {} })
    await userEvent.click(await screen.findByRole('button', { name: 'Ver em tabela' }))
    const tabela = await screen.findByRole('table', { name: 'Horas por cliente' })
    await waitFor(() => expect(tabela.querySelectorAll('tbody tr')).toHaveLength(15))
    expect(horasPorCliente).toHaveBeenLastCalledWith({ de: '2026-10-19', ate: '2026-11-17' }, 1)
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Cliente', 'Realizado', 'Previsão no período', '% das horas', 'Ações'])
    expect(within(tabela.querySelector('tbody tr')).getByRole('button', { name: 'Fazer check-in' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(horasPorCliente).toHaveBeenLastCalledWith({ de: '2026-10-19', ate: '2026-11-17' }, 2))
    expect(await within(tabela).findByRole('link', { name: 'Da Página 2' })).toBeInTheDocument()
  })

  it('vazio: "Nenhuma hora no período." (gestão) e "Nenhum cliente seu ainda." (consultor)', async () => {
    vi.mocked(horasPorCliente).mockResolvedValue({ itens: [], resto: { clientes: 0, horas: 0 }, total_horas: 0, total_clientes: 0, participacao_3: null, participacao_10: null })
    const { unmount } = renderizarTela(<HorasPorCliente periodo={{ tipo: 'ultimos-90', de: '2026-08-20', ate: '2026-11-17' }} recorte="tudo" />, { perfil: {} })
    expect(await screen.findByText('Nenhuma hora no período.')).toBeInTheDocument()
    unmount()
    renderizarTela(<HorasPorCliente periodo={MES} recorte="pessoa" aoMudar={() => {}} />, { perfil: {} })
    expect(await screen.findByText('Nenhum cliente seu ainda.')).toBeInTheDocument()
  })
})
