import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consultoriasPorOcupacao, consultoresPorOcupacao } from '@/data/capacidade'
import {
  ajustarPrevisao, apagarCliente, arquivarCliente, criarCliente, editarCliente, escolherConsultor, listarClientes,
  mandarParaConsultoria, reativarCliente,
} from '@/data/clientes'
import { fazerCheckin, lancarHoras, meuCheckinAberto } from '@/data/checkins'
import { buscarConsultorias } from '@/data/consultorias'
import { indicadoresDeClientes } from '@/data/indicadores'
import { escolherData, escolherHora, escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Clientes from './Clientes'

vi.mock('@/data/clientes', () => ({
  listarClientes: vi.fn(), criarCliente: vi.fn(), editarCliente: vi.fn(),
  arquivarCliente: vi.fn(), reativarCliente: vi.fn(), apagarCliente: vi.fn(),
  mandarParaConsultoria: vi.fn(), escolherConsultor: vi.fn(), ajustarPrevisao: vi.fn(),
}))
vi.mock('@/data/checkins', () => ({
  meuCheckinAberto: vi.fn(), fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), lancarHoras: vi.fn(),
  listarCheckins: vi.fn(), editarCheckin: vi.fn(), apagarCheckin: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({ consultoriasPorOcupacao: vi.fn(), consultoresPorOcupacao: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn() }))
vi.mock('@/data/indicadores', () => ({ indicadoresDeClientes: vi.fn() }))

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
  vi.mocked(consultoriasPorOcupacao).mockResolvedValue({ itens: [
    { id: 's1', nome: 'STI', capacidade: 100, reservado: 50, ocupacao: 0.5 },
    { id: 's2', nome: 'Outra', capacidade: 100, reservado: 70, ocupacao: 0.7 },
  ], total: 2 })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [
    { id: 'p1', nome: 'Ana', capacidade: 100, reservado: 40, ocupacao: 0.4 },
    { id: 'p2', nome: 'Beto', capacidade: 100, reservado: 60, ocupacao: 0.6 },
  ], total: 2 })
  vi.mocked(meuCheckinAberto).mockResolvedValue(null)
  vi.mocked(buscarConsultorias).mockResolvedValue({ itens: [{ id: 's1', nome: 'STI' }], total: 1 })
  vi.mocked(indicadoresDeClientes).mockResolvedValue({ recorte: 'tudo', aguardando_consultoria: 0, aguardando_consultor: 0, em_atendimento: 0, arquivados: 0 })
  vi.mocked(fazerCheckin).mockResolvedValue({ erro: null })
  vi.mocked(lancarHoras).mockResolvedValue({ erro: null })
  for (const f of [criarCliente, editarCliente, arquivarCliente, reativarCliente, apagarCliente, mandarParaConsultoria, escolherConsultor, ajustarPrevisao]) {
    vi.mocked(f).mockResolvedValue({ erro: null })
  }
})
afterEach(() => vi.useRealTimers())

describe('Clientes (link para a página)', () => {
  it('o nome do cliente leva para a página dele', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    expect(await screen.findByRole('link', { name: 'Provedor Alfa' })).toHaveAttribute('href', '/clientes/k1')
  })
})

describe('Clientes (central)', () => {
  it('mostra a tabela, o filtro Situação (sem abas), o botão Novo cliente e as colunas', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    const tabela = await screen.findByRole('table', { name: 'Clientes' })
    for (const aba of ['A distribuir', 'Nas consultorias', 'Arquivados']) {
      expect(screen.queryByRole('button', { name: aba })).not.toBeInTheDocument()
    }
    expect(screen.getByLabelText('Situação')).toHaveTextContent('Aguardando consultoria')
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
    expect(within(janela).getByLabelText('Previsão de horas por mês')).toHaveValue('40')
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

  it('Apagar pede confirmação; com horas ou arquivos registrados mostra o erro e mantém a janela', async () => {
    vi.mocked(apagarCliente).mockResolvedValue({ erro: 'Este cliente tem horas, arquivos ou cartões registrados. Arquive em vez de apagar.' })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Beta/ })).getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar cliente' }))
    expect(apagarCliente).toHaveBeenCalledWith('k2')
    expect(await screen.findByText('Este cliente tem horas, arquivos ou cartões registrados. Arquive em vez de apagar.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('Reativar aparece na situação Arquivados', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES.map((c) => ({ ...c, arquivado: true })), total: 2 })
    renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    await escolherNoSeletor(userEvent, 'Situação', 'Arquivados')
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'arquivados', pagina: 1 }))
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Reativar' }))
    expect(reativarCliente).toHaveBeenCalledWith('k1')
  })

  it('mostra Passou da previsão só quando o realizado supera a previsão', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    expect(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByText('Passou da previsão')).toBeInTheDocument()
    expect(within(linha('Provedor Beta')).queryByText('Passou da previsão')).not.toBeInTheDocument()
  })

  it('a central oferece Todas, Aguardando consultoria, Aguardando consultor, Em atendimento e Arquivados', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    await userEvent.click(screen.getByLabelText('Situação'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas', 'Aguardando consultoria', 'Aguardando consultor', 'Em atendimento', 'Arquivados',
    ])
  })

  it('trocar a situação pede a página 1 com o recorte certo', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: CLIENTES, total: 31 })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }))
    for (const [rotulo, aba] of [['Todas', 'todas'], ['Aguardando consultor', 'aguardando'], ['Em atendimento', 'atendimento']]) {
      await escolherNoSeletor(userEvent, 'Situação', rotulo)
      expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba, pagina: 1 }))
    }
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
  it('admin e gestor: Situação com Todas, Aguardando consultor e Em atendimento (padrão), sem abas nem Novo cliente', async () => {
    renderizarTela(<Clientes />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'x' } })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(screen.queryByRole('button', { name: 'Aguardando consultor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Meus clientes' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Situação')).toHaveTextContent('Em atendimento')
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'atendimento' }))
    await userEvent.click(screen.getByLabelText('Situação'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Aguardando consultor', 'Em atendimento'])
    expect(screen.queryByRole('button', { name: 'Novo cliente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('a pessoa vê só os clientes dela, sem filtro de situação', async () => {
    renderizarTela(<Clientes />, { perfil: { id: 'p9', papel: 'pessoa', consultoria_id: 'x' } })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(screen.queryByLabelText('Situação')).not.toBeInTheDocument()
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'meus', consultorId: 'p9' }))
  })
})

describe('Clientes: distribuir e escolher consultor', () => {
  const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 's1' }
  const NA_CONSULTORIA = CLIENTES.map((c) => ({ ...c, consultoria_id: 's1', consultoria: { id: 's1', nome: 'STI' } }))

  // Padrão Hub: nas linhas da tabela as ações continuam ghost sm (cheio e outline são só do cabeçalho da página).
  const ehGhostSm = (botao) => {
    expect(botao).toHaveClass('text-muted-foreground', 'h-8')
    expect(botao).not.toHaveClass('bg-primary')
    expect(botao).not.toHaveClass('border')
  }

  it('as ações das linhas continuam ghost sm (central, gestor e consultor)', async () => {
    const { unmount } = renderizarTela(<Clientes />, { perfil: central })
    const linha = await screen.findByRole('row', { name: /Provedor Alfa/ })
    ehGhostSm(within(linha).getByRole('button', { name: 'Mandar para consultoria' }))
    ehGhostSm(within(linha).getByRole('button', { name: 'Editar' }))
    unmount()
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA.map((c) => ({ ...c, consultor_id: 'p9', consultor: { id: 'p9', nome: 'Zé', ativo: true } })), total: 2 })
    const gestao = renderizarTela(<Clientes />, { perfil: gestor })
    await screen.findByRole('table', { name: 'Clientes' })
    const alfa = await screen.findByRole('row', { name: /Provedor Alfa/ })
    ehGhostSm(within(alfa).getByRole('button', { name: 'Trocar consultor' }))
    ehGhostSm(within(alfa).getByRole('button', { name: 'Ajustar previsão' }))
    gestao.unmount()
    renderizarTela(<Clientes />, { perfil: { id: 'p9', papel: 'pessoa', consultoria_id: 's1' } })
    const minha = await screen.findByRole('row', { name: /Provedor Alfa/ })
    ehGhostSm(within(minha).getByRole('button', { name: 'Fazer check-in' }))
    ehGhostSm(within(minha).getByRole('button', { name: 'Lançar horas' }))
  })

  it('central: Mandar para consultoria abre a janela com a sugestão e confirma', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Mandar para consultoria' }))
    const janela = await screen.findByRole('dialog', { name: 'Mandar Provedor Alfa para uma consultoria' })
    await userEvent.click(within(janela).getByRole('radio', { name: /Outra/ }))
    await userEvent.click(within(janela).getByRole('button', { name: 'Mandar para Outra' }))
    expect(mandarParaConsultoria).toHaveBeenCalledWith('k1', 's2')
  })

  it('central: Mover aparece nos clientes que já estão numa consultoria, com a consultoria atual marcada', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA, total: 2 })
    renderizarTela(<Clientes />, { perfil: central })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Mover' }))
    const janela = await screen.findByRole('dialog', { name: 'Mover Provedor Alfa para outra consultoria' })
    expect(await within(janela).findByText('Atual')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Mover para Outra' }))
    expect(mandarParaConsultoria).toHaveBeenCalledWith('k1', 's2')
  })

  it('gestor: Aguardando mostra Novo e Escolher consultor chama escolherConsultor', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA, total: 2 })
    renderizarTela(<Clientes />, { perfil: gestor })
    const alfa = await screen.findByRole('row', { name: /Provedor Alfa/ })
    expect(within(alfa).getByText('Novo')).toBeInTheDocument()
    await userEvent.click(within(alfa).getByRole('button', { name: 'Escolher consultor' }))
    const janela = await screen.findByRole('dialog', { name: 'Escolher o consultor de Provedor Alfa' })
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1' }))
    await userEvent.click(await within(janela).findByRole('button', { name: 'Escolher Ana' }))
    expect(escolherConsultor).toHaveBeenCalledWith('k1', 'p1')
  })

  it('gestor: Em atendimento tem Trocar consultor e Ajustar previsão, sem Novo', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA.map((c) => ({ ...c, consultor_id: 'p9', consultor: { id: 'p9', nome: 'Zé', ativo: true } })), total: 2 })
    renderizarTela(<Clientes />, { perfil: gestor })
    await screen.findByRole('table', { name: 'Clientes' })
    const alfa = await screen.findByRole('row', { name: /Provedor Alfa/ })
    expect(within(alfa).queryByText('Novo')).not.toBeInTheDocument()
    expect(within(alfa).getByRole('button', { name: 'Trocar consultor' })).toBeInTheDocument()
    await userEvent.click(within(alfa).getByRole('button', { name: 'Ajustar previsão' }))
    const janela = screen.getByRole('dialog', { name: /previsão/i })
    const campo = within(janela).getByLabelText('Previsão de horas por mês')
    expect(campo).toHaveValue('40')
    await userEvent.clear(campo)
    await userEvent.type(campo, '0')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(ajustarPrevisao).not.toHaveBeenCalled()
    expect(within(janela).getByText(/maior que zero/)).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, '800')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(ajustarPrevisao).not.toHaveBeenCalled()
    await userEvent.clear(campo)
    await userEvent.type(campo, '40,5')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(ajustarPrevisao).toHaveBeenCalledWith('k1', 40.5)
  })

  it('pessoa não tem ações de distribuir, consultor ou previsão', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA, total: 2 })
    renderizarTela(<Clientes />, { perfil: { id: 'p9', papel: 'pessoa', consultoria_id: 's1' } })
    await screen.findByRole('table', { name: 'Clientes' })
    for (const nome of ['Mandar para consultoria', 'Mover', 'Escolher consultor', 'Trocar consultor', 'Ajustar previsão']) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument()
    }
    expect(screen.queryByLabelText('Consultor')).not.toBeInTheDocument()
  })

  it('filtro Consultor: Sem consultor pede consultorId sem e volta para a página 1', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA, total: 31 })
    renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    await escolherNoSeletor(userEvent, 'Situação', 'Todas')
    await userEvent.click(await screen.findByRole('button', { name: /Próxima/ }))
    await escolherNoSeletor(userEvent, 'Consultor', 'Sem consultor')
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ consultorId: 'sem', pagina: 1 }))
  })

  it('filtro Consultor: Em atendimento não oferece Sem consultor (sempre daria lista vazia)', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA, total: 2 })
    renderizarTela(<Clientes />, { perfil: gestor })
    await screen.findByRole('table', { name: 'Clientes' })
    await userEvent.click(await screen.findByLabelText('Consultor'))
    expect(await screen.findByRole('option', { name: /Beto/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Sem consultor' })).not.toBeInTheDocument()
  })

  it('filtro Consultor: em Todas oferece Sem consultor', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    await escolherNoSeletor(userEvent, 'Situação', 'Todas')
    await userEvent.click(await screen.findByLabelText('Consultor'))
    expect(await screen.findByRole('option', { name: 'Sem consultor' })).toBeInTheDocument()
  })

  it('filtro Consultor: escolher uma pessoa na busca filtra por ela (consultoria do gestor)', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: NA_CONSULTORIA, total: 2 })
    renderizarTela(<Clientes />, { perfil: gestor })
    await screen.findByRole('table', { name: 'Clientes' })
    await userEvent.click(await screen.findByLabelText('Consultor'))
    await screen.findByRole('option', { name: /Beto/ })
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1' }))
    await userEvent.click(screen.getByRole('option', { name: /Beto/ }))
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ consultorId: 'p2', pagina: 1 }))
  })
})

describe('Clientes: filtro Consultor ao trocar de situação', () => {
  it('a pessoa escolhida continua no campo, com o nome, ao sair da situação e voltar', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    await escolherNoSeletor(userEvent, 'Situação', 'Todas')
    await escolherNoSeletor(userEvent, 'Consultor', 'Beto')
    await escolherNoSeletor(userEvent, 'Situação', 'Aguardando consultoria')
    expect(screen.queryByLabelText('Consultor')).not.toBeInTheDocument()
    await escolherNoSeletor(userEvent, 'Situação', 'Todas')
    expect(await screen.findByLabelText('Consultor')).toHaveTextContent('Beto')
    expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ consultorId: 'p2' }))
  })
})

describe('Clientes: check-in do consultor', () => {
  const pessoa = { id: 'p9', papel: 'pessoa', consultoria_id: 's1' }
  const MEUS = CLIENTES.map((c) => ({ ...c, consultoria_id: 's1', consultor_id: 'p9', consultor: { id: 'p9', nome: 'Eu', ativo: true } }))

  beforeEach(() => vi.mocked(listarClientes).mockResolvedValue({ itens: MEUS, total: 2 }))

  it('a pessoa vê os clientes dela, sem abas, com previsão e realizado', async () => {
    renderizarTela(<Clientes />, { perfil: pessoa })
    const alfa = await screen.findByRole('row', { name: /Provedor Alfa/ })
    expect(screen.queryByRole('button', { name: 'Meus clientes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Meus check-ins' })).not.toBeInTheDocument()
    expect(within(alfa).getByText('41 h de 40 h')).toBeInTheDocument()
    expect(within(linha('Provedor Beta')).getByText('0 h de 20 h')).toBeInTheDocument()
    expect(meuCheckinAberto).toHaveBeenCalledWith('p9')
  })

  it('Fazer check-in chama fazerCheckin e recarrega a lista e o check-in aberto', async () => {
    renderizarTela(<Clientes />, { perfil: pessoa })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Fazer check-in' }))
    expect(fazerCheckin).toHaveBeenCalledWith('k1')
    await vi.waitFor(() => expect(meuCheckinAberto).toHaveBeenCalledTimes(2))
    expect(listarClientes).toHaveBeenCalledTimes(2)
  })

  it('com check-in aberto, a linha dele vira check-out e as outras ficam desabilitadas', async () => {
    vi.mocked(meuCheckinAberto).mockResolvedValue({
      id: 'a1', cliente_id: 'k1', inicio: new Date(Date.now() - 3_900_000).toISOString(), cliente: { nome: 'Provedor Alfa' },
    })
    renderizarTela(<Clientes />, { perfil: pessoa })
    const alfa = await screen.findByRole('row', { name: /Provedor Alfa/ })
    expect(await within(alfa).findByRole('button', { name: /Fazer check-out · 1 h 05/ })).toBeInTheDocument()
    const beta = within(linha('Provedor Beta')).getByRole('button', { name: 'Fazer check-in' })
    expect(beta).toBeDisabled()
    const aviso = /Você está com check-in aberto em Provedor Alfa desde \d{2}:\d{2}\. Faça o check-out para começar outro\./
    expect(screen.getAllByText(aviso)).toHaveLength(1)
    expect(beta).toHaveAccessibleDescription(screen.getByText(aviso).textContent)
  })

  it('admin e gestor com check-in aberto em outro cliente: aviso visível e botão descrito por ele', async () => {
    vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [{ id: 'g1', nome: 'Gui', capacidade: 100, reservado: 40, ocupacao: 0.4 }], total: 1 })
    vi.mocked(meuCheckinAberto).mockResolvedValue({
      id: 'a1', cliente_id: 'k1', inicio: new Date(Date.now() - 3_900_000).toISOString(), cliente: { nome: 'Provedor Alfa' },
    })
    for (const papel of ['admin', 'gestor']) {
      vi.mocked(listarClientes).mockResolvedValue({ itens: MEUS.map((c) => ({ ...c, consultor_id: 'g1', consultor: { id: 'g1', nome: 'Gui', ativo: true } })), total: 2 })
      const { unmount } = renderizarTela(<Clientes />, { perfil: { id: 'g1', papel, consultoria_id: 's1' } })
      await screen.findByRole('table', { name: 'Clientes' })
      const aviso = /Você está com check-in aberto em Provedor Alfa desde \d{2}:\d{2}\. Faça o check-out para começar outro\./
      const beta = await within(linha('Provedor Beta')).findByRole('button', { name: 'Fazer check-in' })
      expect(beta).toBeDisabled()
      expect(await screen.findByText(aviso)).toBeInTheDocument()
      expect(beta).toHaveAccessibleDescription(screen.getByText(aviso).textContent)
      unmount()
    }
  })

  it('com o check-in aberto no único cliente da lista não há botão desabilitado a explicar: sem aviso', async () => {
    vi.mocked(listarClientes).mockResolvedValue({ itens: [MEUS[0]], total: 1 })
    vi.mocked(meuCheckinAberto).mockResolvedValue({
      id: 'a1', cliente_id: 'k1', inicio: new Date(Date.now() - 600_000).toISOString(), cliente: { nome: 'Provedor Alfa' },
    })
    renderizarTela(<Clientes />, { perfil: pessoa })
    const alfa = await screen.findByRole('row', { name: /Provedor Alfa/ })
    expect(await within(alfa).findByRole('button', { name: /Fazer check-out/ })).toBeInTheDocument()
    expect(screen.queryByText(/Você está com check-in aberto/)).not.toBeInTheDocument()
  })

  it('sem check-in aberto não mostra o aviso', async () => {
    renderizarTela(<Clientes />, { perfil: pessoa })
    await screen.findByRole('row', { name: /Provedor Alfa/ })
    expect(screen.queryByText(/Você está com check-in aberto/)).not.toBeInTheDocument()
  })

  it('Lançar horas abre a janela e chama lancarHoras com o cliente', async () => {
    renderizarTela(<Clientes />, { perfil: pessoa })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Lançar horas' }))
    const janela = screen.getByRole('dialog', { name: 'Lançar horas em Provedor Alfa' })
    await escolherData(userEvent, 'Data', '2026-11-10')
    await escolherHora(userEvent, 'Início', '10:00')
    await escolherHora(userEvent, 'Fim', '09:00')
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Lançar horas' }))
    expect(within(janela).getByText('O fim precisa ser depois do início.')).toBeInTheDocument()
    await escolherHora(userEvent, 'Fim', '11:00')
    await userEvent.click(within(janela).getByRole('button', { name: 'Lançar horas' }))
    expect(lancarHoras).toHaveBeenCalledWith({
      clienteId: 'k1', inicio: new Date('2026-11-10T10:00').toISOString(), fim: new Date('2026-11-10T11:00').toISOString(),
      descricao: 'Reunião',
    })
  })

  it('erro de sobreposição do banco aparece na janela', async () => {
    vi.mocked(lancarHoras).mockResolvedValue({ erro: 'Esse horário se sobrepõe a outro check-in seu.' })
    renderizarTela(<Clientes />, { perfil: pessoa })
    await userEvent.click(within(await screen.findByRole('row', { name: /Provedor Alfa/ })).getByRole('button', { name: 'Lançar horas' }))
    const janela = screen.getByRole('dialog')
    await escolherData(userEvent, 'Data', '2026-11-10')
    await escolherHora(userEvent, 'Início', '09:00')
    await escolherHora(userEvent, 'Fim', '11:00')
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Lançar horas' }))
    expect(await within(janela).findByText('Esse horário se sobrepõe a outro check-in seu.')).toBeInTheDocument()
  })

  it('admin e gestor: escolher o próprio nome no filtro Consultor mostra os clientes deles, com check-in', async () => {
    vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [{ id: 'g1', nome: 'Gui', capacidade: 100, reservado: 40, ocupacao: 0.4 }], total: 1 })
    vi.mocked(listarClientes).mockResolvedValue({ itens: MEUS.map((c) => ({ ...c, consultor_id: 'g1', consultor: { id: 'g1', nome: 'Gui', ativo: true } })), total: 2 })
    for (const papel of ['admin', 'gestor']) {
      const { unmount } = renderizarTela(<Clientes />, { perfil: { id: 'g1', papel, consultoria_id: 's1' } })
      await screen.findByRole('table', { name: 'Clientes' })
      await escolherNoSeletor(userEvent, 'Consultor', 'Gui')
      expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'atendimento', consultorId: 'g1', pagina: 1 }))
      expect(await screen.findAllByRole('button', { name: 'Fazer check-in' })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Meus check-ins' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('a central não faz check-in: sem ações de check-in nem busca de check-in aberto', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(screen.queryByRole('button', { name: 'Fazer check-in' })).not.toBeInTheDocument()
    expect(meuCheckinAberto).not.toHaveBeenCalled()
  })

  it('Meus check-ins não aparece nesta tela (fica dentro de cada cliente)', async () => {
    renderizarTela(<Clientes />, { perfil: pessoa })
    await screen.findByRole('table', { name: 'Clientes' })
    expect(screen.queryByText('Meus check-ins')).not.toBeInTheDocument()
  })
})

describe('Clientes: cartões de números abaixo dos filtros', () => {
  const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 's1' }

  it('central: Aguardando consultoria, Aguardando consultor, Em atendimento e Arquivados, do banco', async () => {
    vi.mocked(indicadoresDeClientes).mockResolvedValue({
      recorte: 'tudo', aguardando_consultoria: 3, aguardando_consultor: 4, em_atendimento: 1200, arquivados: 9,
    })
    renderizarTela(<Clientes />, { perfil: central })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos clientes')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Aguardando consultoria')).toBe('3'))
    expect(numeroDoCartao(cartoes, 'Aguardando consultor')).toBe('4')
    expect(numeroDoCartao(cartoes, 'Em atendimento')).toBe('1.200')
    expect(numeroDoCartao(cartoes, 'Arquivados')).toBe('9')
    expect(indicadoresDeClientes).toHaveBeenCalledWith({ consultoriaId: undefined, consultorId: undefined })
  })

  it('administrador e gestor: Aguardando consultor, Em atendimento, Passaram da previsão no mês e Sem check-in há 30 dias', async () => {
    vi.mocked(indicadoresDeClientes).mockResolvedValue({
      recorte: 'consultoria', aguardando_consultor: 2, em_atendimento: 15, passaram_da_previsao: 1, sem_checkin_30_dias: 4,
    })
    renderizarTela(<Clientes />, { perfil: gestor })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos clientes')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Aguardando consultor')).toBe('2'))
    expect(numeroDoCartao(cartoes, 'Em atendimento')).toBe('15')
    expect(numeroDoCartao(cartoes, 'Passaram da previsão no mês')).toBe('1')
    expect(numeroDoCartao(cartoes, 'Sem check-in há 30 dias')).toBe('4')
    expect(within(cartoes).queryByText('Arquivados')).not.toBeInTheDocument()
  })

  it('consultor: Meus clientes, Passaram da previsão no mês, Horas no mês e Sem check-in há 30 dias', async () => {
    vi.mocked(indicadoresDeClientes).mockResolvedValue({
      recorte: 'pessoa', meus_clientes: 7, passaram_da_previsao: 0, horas_no_mes: 12.5, sem_checkin_30_dias: 1,
    })
    renderizarTela(<Clientes />, { perfil: { id: 'p9', papel: 'pessoa', consultoria_id: 's1' } })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos clientes')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Meus clientes')).toBe('7'))
    expect(numeroDoCartao(cartoes, 'Passaram da previsão no mês')).toBe('0')
    expect(numeroDoCartao(cartoes, 'Horas no mês')).toBe('12,5 h')
    expect(numeroDoCartao(cartoes, 'Sem check-in há 30 dias')).toBe('1')
  })

  it('os números seguem a consultoria e o consultor do filtro; a situação e a busca não mudam os cartões', async () => {
    renderizarTela(<Clientes />, { perfil: central })
    await cartoesAbaixoDaBarra('Indicadores dos clientes')
    await escolherNoSeletor(userEvent, 'Situação', 'Todas')
    expect(indicadoresDeClientes).toHaveBeenCalledTimes(1)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar clientes' }), 'Alfa')
    await waitFor(() => expect(listarClientes).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'Alfa' })))
    expect(indicadoresDeClientes).toHaveBeenCalledTimes(1)
    await escolherNoSeletor(userEvent, 'Consultoria', 'STI')
    await waitFor(() => expect(indicadoresDeClientes).toHaveBeenLastCalledWith({ consultoriaId: 's1', consultorId: undefined }))
    await escolherNoSeletor(userEvent, 'Consultor', 'Sem consultor')
    await waitFor(() => expect(indicadoresDeClientes).toHaveBeenLastCalledWith({ consultoriaId: 's1', consultorId: 'sem' }))
  })

  it('carregando ou sem resposta: "—" nos cartões e a lista continua', async () => {
    vi.mocked(indicadoresDeClientes).mockRejectedValue(new Error('x'))
    renderizarTela(<Clientes />, { perfil: central })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores dos clientes')
    expect(numeroDoCartao(cartoes, 'Em atendimento')).toBe('—')
    expect(await screen.findByRole('table', { name: 'Clientes' })).toBeInTheDocument()
  })
})
