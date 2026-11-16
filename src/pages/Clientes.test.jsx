import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarCliente, arquivarCliente, criarCliente, editarCliente, listarClientes, reativarCliente } from '@/data/clientes'
import { renderizarTela } from '@/test/renderizar'
import Clientes from './Clientes'

vi.mock('@/data/clientes', () => ({
  listarClientes: vi.fn(), criarCliente: vi.fn(), editarCliente: vi.fn(),
  arquivarCliente: vi.fn(), reativarCliente: vi.fn(), apagarCliente: vi.fn(),
}))
vi.mock('@/data/consultorias', () => ({ listarNomesDeConsultorias: vi.fn().mockResolvedValue([]) }))

const base = {
  razao_social: null, cidade: 'Natal', uf: 'RN', enviado_em: null, consultor_desde: null, arquivado: false,
  consultoria_id: null, consultor_id: null, consultoria: null, consultor: null, realizado_no_mes: 0,
}
const CLIENTES = [
  { ...base, id: 'k1', nome: 'Provedor Alfa', cnpj: '11222333000181', horas_mes: 40, realizado_no_mes: 41 },
  { ...base, id: 'k2', nome: 'Provedor Beta', cnpj: null, horas_mes: 20 },
]
const central = { id: 'c0', papel: 'central', consultoria_id: null }
const linha = (nome) => screen.getByRole('row', { name: new RegExp(nome) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES, total: 2 })
  for (const f of [criarCliente, editarCliente, arquivarCliente, reativarCliente, apagarCliente]) {
    vi.mocked(f).mockResolvedValue({ erro: null })
  }
})
afterEach(() => vi.useRealTimers())

describe('Clientes (central)', () => {
  it('mostra a tabela, as abas, o botão Novo cliente e as colunas', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    const tabela = await screen.findByRole('table', { name: 'Clientes' })
    for (const aba of ['A distribuir', 'Nas consultorias', 'Arquivados']) {
      expect(screen.getByRole('button', { name: aba })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Novo cliente' })).toBeInTheDocument()
    for (const coluna of ['Cliente', 'CNPJ', 'Cidade', 'Previsão', 'Consultoria', 'Consultor']) {
      expect(within(tabela).getByRole('columnheader', { name: coluna })).toBeInTheDocument()
    }
    expect(within(linha('Provedor Alfa')).getByText('11.222.333/0001-81')).toBeInTheDocument()
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'distribuir', pagina: 1 }))
  })

  it('Editar abre o formulário preenchido e Salvar chama editarCliente', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar cliente' })
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Provedor Alfa')
    expect(within(janela).getByLabelText('CNPJ')).toHaveValue('11.222.333/0001-81')
    expect(within(janela).getByLabelText('Previsão de horas por mês')).toHaveValue(40)
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarCliente).toHaveBeenCalledWith('k1', expect.objectContaining({ nome: 'Provedor Alfa', horasMes: 40 }))
  })

  it('Novo cliente cria e recarrega', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: 'Novo cliente' }))
    const janela = screen.getByRole('dialog', { name: 'Novo cliente' })
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Gama Net')
    await userEvent.type(within(janela).getByLabelText('Previsão de horas por mês'), '30')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(criarCliente).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Gama Net', horasMes: 30 }))
  })

  it('Arquivar pede confirmação e arquiva', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Arquivar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Arquivar cliente' }))
    expect(arquivarCliente).toHaveBeenCalledWith('k1')
  })

  it('Apagar pede confirmação; com horas registradas mostra o erro e mantém a janela', async () => {
    vi.mocked(apagarCliente).mockResolvedValue({ erro: 'Este cliente tem horas registradas. Arquive em vez de apagar.' })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Beta/ })).getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar cliente' }))
    expect(apagarCliente).toHaveBeenCalledWith('k2')
    expect(await screen.findByText('Este cliente tem horas registradas. Arquive em vez de apagar.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('Reativar aparece na aba Arquivados', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES.map((c) => ({ ...c, arquivado: true })), total: 2 })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: 'Arquivados' }))
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Reativar' }))
    expect(reativarCliente).toHaveBeenCalledWith('k1')
  })

  it('mostra Passou da previsão só quando o realizado supera a previsão', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    expect(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByText('Passou da previsão')).toBeInTheDocument()
    expect(within(linha('Provedor Beta')).queryByText('Passou da previsão')).not.toBeInTheDocument()
  })

  it('trocar de aba pede a página 1', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES, total: 31 })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }))
    await userEvent.click(screen.getByRole('button', { name: 'Nas consultorias' }))
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'nas_consultorias', pagina: 1 }))
  })

  it('a busca espera 300 ms e volta para a página 1', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES, total: 31 })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    vi.useFakeTimers()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alfa' } })
    const chamadas = vi.mocked(listarClientes).mock.calls.length
    await act(async () => { vi.advanceTimersByTime(299) })
    expect(listarClientes).toHaveBeenCalledTimes(chamadas)
    await act(async () => { vi.advanceTimersByTime(2) })
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'alfa', pagina: 1 }))
  })

  it('paginação: some com 15, aparece com 16, Próxima pede a página 2', async () => {
    const { unmount } = renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES, total: 16 })
    renderizarTela(<Clientes />, { perfil: central })
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }))
  })

  it('foraDaFaixa na página 2 volta para a 1', async () => {
    vi.mocked(listarClientes).mockImplementation(async ({ pagina }) =>
      pagina === 2 ? { itens: [], total: 16, foraDaFaixa: true } : { itens: CLIENTES, total: 16 })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 1 }))
  })
})

describe('Clientes (outros papéis)', () => {
  it('admin e gestor usam as abas Aguardando consultor e Em atendimento, sem Novo cliente', async () => {
    renderizarTela(<Clientes />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'x' } })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(screen.getByRole('button', { name: 'Aguardando consultor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Em atendimento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo cliente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'aguardando' }))
  })

  it('a pessoa vê Meus clientes com o id dela', async () => {
    renderizarTela(<Clientes />, { perfil: { id: 'p9', papel: 'pessoa', consultoria_id: 'x' } })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'meus', consultorId: 'p9' }))
  })
})
