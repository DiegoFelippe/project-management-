import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consultoriasPorOcupacao, consultoresPorOcupacao, definirCarga, listarAusencias } from '@/data/capacidade'
import { renderizarTela } from '@/test/renderizar'
import Capacidade from './Capacidade'

vi.mock('@/data/capacidade', () => ({
  consultoriasPorOcupacao: vi.fn(), consultoresPorOcupacao: vi.fn(), definirCarga: vi.fn(),
  listarAusencias: vi.fn(), criarAusencia: vi.fn(), editarAusencia: vi.fn(), apagarAusencia: vi.fn(),
}))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn().mockResolvedValue({ itens: [], total: 0 }) }))

const ANA = {
  id: 'p1', nome: 'Ana', email: 'ana@x.test', consultoria_id: 's1', consultoria_nome: 'STI', carga_semanal: 40,
  capacidade: 160, reservado: 80, realizado: 50, ocupacao: 0.5, clientes: 3, total: 1,
}
const central = { id: 'c0', papel: 'central', consultoria_id: null }
const admin = { id: 'a0', papel: 'admin', consultoria_id: 's1' }
const MES_ATUAL = '2026-11-01'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T15:00:00Z') })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [ANA], total: 1 })
  vi.mocked(consultoriasPorOcupacao).mockResolvedValue({
    itens: [{ id: 's1', nome: 'STI', consultores: 2, clientes: 5, aguardando: 1, capacidade: 320, reservado: 100, realizado: 60, ocupacao: 0.31 }], total: 1,
  })
  vi.mocked(definirCarga).mockResolvedValue({ erro: null })
  vi.mocked(listarAusencias).mockResolvedValue({ itens: [], total: 0 })
})
afterEach(() => vi.useRealTimers())

describe('Capacidade', () => {
  it('central vê a tabela de consultores com a consultoria e o mês atual', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    const tabela = await screen.findByRole('table', { name: 'Capacidade' })
    expect(within(tabela).getByText('Ana')).toBeInTheDocument()
    expect(within(tabela).getByRole('columnheader', { name: 'Consultoria' })).toBeInTheDocument()
    expect(within(tabela).getByRole('columnheader', { name: 'Reservado' })).toBeInTheDocument()
    expect(within(tabela).getByText('50%')).toBeInTheDocument()
    // Só a primeira letra maiúscula ("Novembro de 2026", não "Novembro De 2026" do capitalize).
    expect(screen.getByText('Novembro de 2026')).not.toHaveClass('capitalize')
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ mes: MES_ATUAL, limite: 15, deslocamento: 0 }))
  })

  it('admin só vê os consultores da própria consultoria, sem aba Consultorias', async () => {
    renderizarTela(<Capacidade />, { perfil: admin })
    await screen.findByRole('table', { name: 'Capacidade' })
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1' }))
    expect(screen.queryByRole('button', { name: 'Consultorias' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Consultoria' })).toBeNull()
  })

  it('a central troca para a aba Consultorias', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    await screen.findByRole('table', { name: 'Capacidade' })
    await userEvent.click(screen.getByRole('button', { name: 'Consultorias' }))
    expect(await screen.findByRole('columnheader', { name: 'Aguardando' })).toBeInTheDocument()
    expect(screen.getByText('320 h')).toBeInTheDocument()
    expect(consultoriasPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ limite: 15, deslocamento: 0, mes: MES_ATUAL }))
  })

  it('a busca por nome espera 300 ms e volta para o começo', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    await screen.findByRole('table', { name: 'Capacidade' })
    await userEvent.type(screen.getByLabelText('Buscar consultores'), 'Ana')
    expect(consultoresPorOcupacao).not.toHaveBeenCalledWith(expect.objectContaining({ busca: expect.any(String) }))
    await vi.waitFor(() => expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'Ana' })), { timeout: 1000 })
    expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'Ana', deslocamento: 0 }))
  })

  it('Próximo avança o mês', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    await screen.findByRole('table', { name: 'Capacidade' })
    await userEvent.click(screen.getByRole('button', { name: /Próximo/ }))
    expect(await screen.findByText('Dezembro de 2026')).toBeInTheDocument()
    expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ mes: '2026-12-01' }))
  })

  it('Editar carga abre com a carga da linha e salva', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Editar carga/ }))
    expect(screen.getByLabelText('Carga semanal (horas)')).toHaveValue('40')
    await userEvent.clear(screen.getByLabelText('Carga semanal (horas)'))
    await userEvent.type(screen.getByLabelText('Carga semanal (horas)'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(definirCarga).toHaveBeenCalledWith('p1', 30)
  })

  it('Ausências abre a lista da pessoa', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Ausências/ }))
    expect(screen.getByRole('dialog', { name: 'Ausências de Ana' })).toBeInTheDocument()
    expect(listarAusencias).toHaveBeenCalledWith('p1', { pagina: 1 })
  })

  it('mês anterior esconde Reservado e a ocupação vira Utilização', async () => {
    renderizarTela(<Capacidade />, { perfil: central })
    await screen.findByRole('table', { name: 'Capacidade' })
    await userEvent.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(await screen.findByText('Outubro de 2026')).toBeInTheDocument()
    expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ mes: '2026-10-01' }))
    const tabela = await screen.findByRole('table', { name: 'Capacidade' })
    expect(within(tabela).queryByRole('columnheader', { name: 'Reservado' })).toBeNull()
    expect(within(tabela).getByRole('columnheader', { name: 'Utilização' })).toBeInTheDocument()
  })

  it('página que ficou vazia (fora da faixa) volta para a página 1', async () => {
    vi.mocked(consultoresPorOcupacao).mockImplementation(async ({ deslocamento }) =>
      deslocamento === 0 ? { itens: [ANA], total: 40 } : { itens: [], total: 0 })
    renderizarTela(<Capacidade />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    await vi.waitFor(() => expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ deslocamento: 15 })))
    await vi.waitFor(() => expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ deslocamento: 0 })))
    expect(await screen.findByRole('table', { name: 'Capacidade' })).toBeInTheDocument()
    expect(screen.getByText('1–15 de 40')).toBeInTheDocument()
  })

  it('a paginação pede o deslocamento 15 na página 2', async () => {
    vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [ANA], total: 40 })
    renderizarTela(<Capacidade />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    await act(async () => {})
    expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ limite: 15, deslocamento: 15 }))
  })
})
