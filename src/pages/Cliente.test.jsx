import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarCheckin, editarCheckin, listarCheckins, meuCheckinAberto } from '@/data/checkins'
import { buscarCliente, listarEventos } from '@/data/clientes'
import { renderizarTela } from '@/test/renderizar'
import Cliente from './Cliente'

vi.mock('@/data/clientes', () => ({
  buscarCliente: vi.fn(), listarEventos: vi.fn(),
  criarCliente: vi.fn(), editarCliente: vi.fn(), arquivarCliente: vi.fn(), reativarCliente: vi.fn(), apagarCliente: vi.fn(),
  mandarParaConsultoria: vi.fn(), escolherConsultor: vi.fn(), ajustarPrevisao: vi.fn(),
}))
vi.mock('@/data/checkins', () => ({
  meuCheckinAberto: vi.fn(), fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), lancarHoras: vi.fn(),
  listarCheckins: vi.fn(), editarCheckin: vi.fn(), apagarCheckin: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({ consultoriasPorOcupacao: vi.fn(), consultoresPorOcupacao: vi.fn() }))

const CLIENTE = {
  id: 'k1', nome: 'Provedor Alfa', razao_social: 'Alfa Telecom Ltda', cnpj: '11222333000181', cidade: 'Natal', uf: 'RN',
  horas_mes: 40, realizado_no_mes: 41, enviado_em: '2026-11-01T10:00:00Z', consultor_desde: null, arquivado: false,
  consultoria_id: 's1', consultor_id: 'p1', consultoria: { id: 's1', nome: 'STI Consult' }, consultor: { id: 'p1', nome: 'Ana', ativo: true },
  contato_nome: 'Joana', contato_telefone: '84999990000', contato_email: 'joana@alfa.test', observacoes: null,
}
const CHECKINS = [
  {
    id: 'c1', inicio: new Date('2026-11-10T09:00').toISOString(), fim: new Date('2026-11-10T10:30').toISOString(),
    descricao: 'Reunião', consultor_id: 'p1', consultoria_id: 's1', consultor: { nome: 'Ana' }, cliente: { id: 'k1', nome: 'Provedor Alfa' },
  },
  {
    id: 'c2', inicio: new Date('2026-11-11T09:00').toISOString(), fim: new Date('2026-11-11T10:00').toISOString(),
    descricao: 'Ajuste', consultor_id: 'p2', consultoria_id: 's1', consultor: { nome: 'Beto' }, cliente: { id: 'k1', nome: 'Provedor Alfa' },
  },
]
const EVENTOS = [
  { id: 'e2', tipo: 'enviado', em: '2026-11-01T10:00:00Z', para_consultoria: 'STI Consult', autor: 'Central' },
  { id: 'e1', tipo: 'cadastrado', em: '2026-11-01T09:00:00Z', para_horas: 40, autor: 'Central' },
]
const central = { id: 'c0', papel: 'central', consultoria_id: null }
const adminDaSti = { id: 'a1', papel: 'admin', consultoria_id: 's1' }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 's1' }
const outraPessoa = { id: 'p7', papel: 'pessoa', consultoria_id: 's1' }

const tela = (perfil = central, endereco = '/clientes/k1') =>
  renderizarTela(<Cliente />, { perfil, endereco, rota: '/clientes/:id' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buscarCliente).mockResolvedValue(CLIENTE)
  vi.mocked(listarCheckins).mockResolvedValue({ itens: CHECKINS, total: 2 })
  vi.mocked(listarEventos).mockResolvedValue({ itens: EVENTOS, total: 2 })
  vi.mocked(meuCheckinAberto).mockResolvedValue(null)
  vi.mocked(editarCheckin).mockResolvedValue({ erro: null })
  vi.mocked(apagarCheckin).mockResolvedValue({ erro: null })
})

describe('Cliente (página)', () => {
  it('mostra os dados do cliente pedido pela rota', async () => {
    tela()
    expect(await screen.findByRole('heading', { name: 'Provedor Alfa' })).toBeInTheDocument()
    expect(buscarCliente).toHaveBeenCalledWith('k1')
    expect(screen.getByText('Alfa Telecom Ltda')).toBeInTheDocument()
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument()
    expect(screen.getByText('Natal/RN')).toBeInTheDocument()
    expect(screen.getByText('Joana')).toBeInTheDocument()
    const resumo = within(screen.getByRole('region', { name: 'Resumo' }))
    expect(resumo.getByText('STI Consult')).toBeInTheDocument()
    expect(resumo.getByText('Ana')).toBeInTheDocument()
    expect(resumo.getByText('Em atendimento')).toBeInTheDocument()
    expect(screen.getByText('41 h de 40 h')).toBeInTheDocument()
  })

  it('avisa que passou da previsão quando o realizado é maior', async () => {
    tela()
    expect(await screen.findByText('Passou da previsão')).toBeInTheDocument()
  })

  it('sem passar da previsão não mostra o aviso', async () => {
    vi.mocked(buscarCliente).mockResolvedValue({ ...CLIENTE, realizado_no_mes: 40 })
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    expect(screen.queryByText('Passou da previsão')).not.toBeInTheDocument()
  })

  it('cliente inexistente ou invisível mostra Cliente não encontrado.', async () => {
    vi.mocked(buscarCliente).mockResolvedValue(null)
    tela()
    expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument()
  })

  it('o histórico mostra o que aconteceu, com quem fez', async () => {
    tela()
    const tabela = await screen.findByRole('table', { name: 'Histórico' })
    expect(listarEventos).toHaveBeenCalledWith('k1', { pagina: 1 })
    expect(within(tabela).getByText('Mandado para STI Consult')).toBeInTheDocument()
    expect(within(tabela).getByText('Cadastrado')).toBeInTheDocument()
    expect(within(tabela).getAllByText('Central')).toHaveLength(2)
  })

  it('evento com nome escondido aparece como outra consultoria', async () => {
    vi.mocked(listarEventos).mockResolvedValue({
      itens: [{ id: 'e3', tipo: 'movido', em: '2026-11-02T10:00:00Z', de_consultoria: null, para_consultoria: 'STI Consult', de_consultor: null, autor: 'Central' }],
      total: 1,
    })
    tela()
    expect(await screen.findByText('Movido para STI Consult')).toBeInTheDocument()
  })

  it('lista os check-ins do cliente com consultor e horas', async () => {
    tela()
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(listarCheckins).toHaveBeenCalledWith({ clienteId: 'k1', pagina: 1 })
    const linha = within(tabela).getByRole('row', { name: /Reunião/ })
    expect(within(linha).getByText('Ana')).toBeInTheDocument()
    expect(within(linha).getByText('1,5 h')).toBeInTheDocument()
  })

  it('o gestor sem times vê o nome de quem fez cada check-in', async () => {
    tela({ id: 'g1', papel: 'gestor', consultoria_id: 's1' })
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(within(within(tabela).getByRole('row', { name: /Reunião/ })).getByText('Ana')).toBeInTheDocument()
    expect(within(within(tabela).getByRole('row', { name: /Ajuste/ })).getByText('Beto')).toBeInTheDocument()
    expect(within(tabela).queryByText('—')).not.toBeInTheDocument()
  })

  it('a central só vê os check-ins, sem Editar nem Apagar', async () => {
    tela()
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(within(tabela).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(tabela).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('o consultor edita e apaga só os próprios check-ins', async () => {
    tela(consultor)
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    const dele = within(tabela).getByRole('row', { name: /Reunião/ })
    const de_outro = within(tabela).getByRole('row', { name: /Ajuste/ })
    expect(within(dele).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(de_outro).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(de_outro).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('Editar check-in abre preenchido e salva com editarCheckin', async () => {
    tela(adminDaSti)
    const dele = within(await screen.findByRole('table', { name: 'Check-ins' })).getByRole('row', { name: /Reunião/ })
    await userEvent.click(within(dele).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar check-in em Provedor Alfa' })
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarCheckin).toHaveBeenCalledWith('c1', { inicio: CHECKINS[0].inicio, fim: CHECKINS[0].fim, descricao: 'Reunião' })
    expect(buscarCliente).toHaveBeenCalledTimes(2)
  })

  it('Apagar check-in pede confirmação antes', async () => {
    tela(adminDaSti)
    const dele = within(await screen.findByRole('table', { name: 'Check-ins' })).getByRole('row', { name: /Reunião/ })
    await userEvent.click(within(dele).getByRole('button', { name: 'Apagar' }))
    expect(apagarCheckin).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar check-in' }))
    expect(apagarCheckin).toHaveBeenCalledWith('c1')
  })

  it('as ações da lista seguem o papel: a central edita e arquiva', async () => {
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mover' })).toBeInTheDocument()
  })

  it('o administrador troca o consultor e ajusta a previsão', async () => {
    tela(adminDaSti)
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    expect(screen.getByRole('button', { name: 'Trocar consultor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajustar previsão' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument()
  })

  it('o consultor do cliente faz check-in e lança horas; outra pessoa não tem ações', async () => {
    const { unmount } = tela(consultor)
    expect(await screen.findByRole('button', { name: 'Fazer check-in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lançar horas' })).toBeInTheDocument()
    unmount()
    tela(outraPessoa)
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    expect(screen.queryByRole('button', { name: 'Fazer check-in' })).not.toBeInTheDocument()
  })
})
