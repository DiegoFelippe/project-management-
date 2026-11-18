import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarCheckin, editarCheckin, listarCheckins, meuCheckinAberto } from '@/data/checkins'
import { eventosDoCliente, eventosDoPeriodo, feriadosDoPeriodo, indicadoresDaAgenda, meuGoogle } from '@/data/agenda'
import { limparPastaDoCliente, listarArquivos, listarPastas } from '@/data/arquivos'
import { lerChecklist, marcarTarefa } from '@/data/checklists'
import { apagarCliente, buscarCliente, checkinsPorSemana, horasPorConsultor, horasPorMes, listarEventos } from '@/data/clientes'
import { cartoesDoQuadro, limparQuadroDoCliente, quadroDoCliente } from '@/data/quadro'
import { ouvirQuadro } from '@/data/quadroAoVivo'
import { renderizarTela } from '@/test/renderizar'
import Cliente from './Cliente'

vi.mock('@/data/clientes', () => ({
  buscarCliente: vi.fn(), listarEventos: vi.fn(), buscarClientes: vi.fn(),
  horasPorMes: vi.fn(), horasPorConsultor: vi.fn(), checkinsPorSemana: vi.fn(),
  criarCliente: vi.fn(), editarCliente: vi.fn(), arquivarCliente: vi.fn(), reativarCliente: vi.fn(), apagarCliente: vi.fn(),
  mandarParaConsultoria: vi.fn(), escolherConsultor: vi.fn(), ajustarPrevisao: vi.fn(),
}))
vi.mock('@/data/checkins', () => ({
  meuCheckinAberto: vi.fn(), fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), lancarHoras: vi.fn(),
  listarCheckins: vi.fn(), editarCheckin: vi.fn(), apagarCheckin: vi.fn(),
}))
vi.mock('@/data/agenda', async (importOriginal) => {
  const real = await importOriginal()
  return {
    voltaDoGoogle: real.voltaDoGoogle,
    eventosDoPeriodo: vi.fn(), eventosDoCliente: vi.fn(), buscarEvento: vi.fn(), indicadoresDaAgenda: vi.fn(), ausenciasDoPeriodo: vi.fn(),
    feriadosDoPeriodo: vi.fn(), meuGoogle: vi.fn(), conectarGoogle: vi.fn(), concluirGoogle: vi.fn(),
    desconectarGoogle: vi.fn(), salvarEvento: vi.fn(), apagarEvento: vi.fn(), responderConvite: vi.fn(),
    novoIdDeEvento: vi.fn(), buscarAgora: vi.fn(), tentarDeNovo: vi.fn(), pessoasParaConvidar: vi.fn(),
  }
})
vi.mock('@/data/arquivos', () => ({
  listarArquivos: vi.fn(), enviarArquivo: vi.fn(), linkParaBaixar: vi.fn(), apagarArquivo: vi.fn(), limparPastaDoCliente: vi.fn(),
  listarPastas: vi.fn(), criarPasta: vi.fn(), renomearPasta: vi.fn(), apagarPasta: vi.fn(),
}))
vi.mock('@/data/quadro', () => ({
  CARTOES_POR_PAGINA: 50, ARQUIVADOS_POR_PAGINA: 15, limparQuadroDoCliente: vi.fn(),
  quadroDoCliente: vi.fn(), quadrosDoCliente: vi.fn(), quadroPorId: vi.fn(), cartoesDoQuadro: vi.fn(),
  cartoesArquivados: vi.fn(), pessoasDoQuadro: vi.fn(), moverCartao: vi.fn(), moverColuna: vi.fn(), apagarColuna: vi.fn(),
  criarCartao: vi.fn(), restaurarCartao: vi.fn(), apagarCartao: vi.fn(), criarColuna: vi.fn(), editarColuna: vi.fn(),
}))
vi.mock('@/data/quadroAoVivo', () => ({ ouvirQuadro: vi.fn(() => () => {}) }))
vi.mock('@/data/checklists', () => ({
  lerChecklist: vi.fn(), modelosParaAplicar: vi.fn(), aplicarModelo: vi.fn(), mudarInicio: vi.fn(), tirarModelo: vi.fn(),
  marcarTarefa: vi.fn(), anotarTarefa: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
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
// A aba Check-ins lê o check-list do cliente (sem modelo, por padrão).
const SEM_MODELO = {
  pode_aplicar: false, pode_marcar: false, consultor: { id: 'p1', nome: 'Ana' }, checklist: null, etapas: [], tarefas: [],
  resumo: { tarefas: 0, feitas: 0, obrigatorias: 0, obrigatorias_feitas: 0, vencem_7_dias: 0, atrasadas: 0, proxima: null },
  sessao: null, ultimo_checkin: null,
}
const COM_MODELO = {
  ...SEM_MODELO, pode_marcar: true,
  checklist: { id: 'cl1', modelo_id: 'm1', modelo_nome: 'Gestão financeira', inicio: '2026-11-10', aplicado_em: '2026-11-10T13:00:00Z', aplicado_por: { nome: 'Gil' } },
  etapas: [{ id: 'e1', nome: 'Diagnóstico', posicao: 1, tarefas: 1, feitas: 0 }],
  tarefas: [{
    id: 't1', etapa_id: 'e1', posicao: 1, titulo: 'Análise do DRE', descricao: null, obrigatoria: true, prazo_dias: 10,
    vence_em: '2099-11-20', estado: 'a_fazer', nota: null, feita_em: null, feita_por: null, depende_de: [], na_sessao: false,
  }],
  resumo: { tarefas: 1, feitas: 0, obrigatorias: 1, obrigatorias_feitas: 0, vencem_7_dias: 0, atrasadas: 0, proxima: { id: 't1', titulo: 'Análise do DRE', vence_em: '2099-11-20' } },
}
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
  vi.mocked(eventosDoPeriodo).mockResolvedValue({ itens: [], haMais: false })
  vi.mocked(eventosDoCliente).mockResolvedValue({ itens: [], total: 0, proximoId: null })
  vi.mocked(indicadoresDaAgenda).mockResolvedValue({ semana: 0, mes: 0, aguardando: 0, pastas_no_mes: 0 })
  vi.mocked(feriadosDoPeriodo).mockResolvedValue([])
  vi.mocked(meuGoogle).mockResolvedValue({ conectado: false, email: null, erro: null })
  vi.mocked(horasPorMes).mockResolvedValue([])
  vi.mocked(horasPorConsultor).mockResolvedValue([])
  vi.mocked(checkinsPorSemana).mockResolvedValue([])
  vi.mocked(meuCheckinAberto).mockResolvedValue(null)
  vi.mocked(listarArquivos).mockResolvedValue({ itens: [], total: 0 })
  vi.mocked(editarCheckin).mockResolvedValue({ erro: null })
  vi.mocked(apagarCheckin).mockResolvedValue({ erro: null })
  vi.mocked(lerChecklist).mockResolvedValue(SEM_MODELO)
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

  it('a aba Agenda (entre Quadro e Check-ins) é o calendário do menu só com os compromissos do cliente', async () => {
    tela(adminDaSti, '/clientes/k1?aba=agenda')
    expect(await screen.findByRole('region', { name: 'Calendário' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Geral', 'Quadro', 'Agenda', 'Check-ins', 'Arquivos', 'Histórico'])
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'k1' })))
    expect(eventosDoPeriodo.mock.calls.every(([filtros]) => filtros.clienteId === 'k1')).toBe(true)
    // Sem cartões de números dentro do cliente (pedido do Diego, 17/11).
    expect(indicadoresDaAgenda).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Indicadores da agenda' })).not.toBeInTheDocument()
    // Só compromissos: os check-ins ficam na aba Check-ins e o histórico na aba Histórico.
    expect(listarCheckins).not.toHaveBeenCalled()
    expect(listarEventos).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Consultor')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo evento' })).toBeInTheDocument()
    // Os eventos do cliente de todas as datas ficam na 4ª visão, Todos (pedido do Diego, 17/11): nada embaixo do calendário.
    expect(eventosDoCliente).not.toHaveBeenCalled()
    await userEvent.setup().click(within(screen.getByRole('group', { name: 'Visão do calendário' })).getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(eventosDoCliente).toHaveBeenCalledWith({ clienteId: 'k1', pagina: 1 }))
    expect(await screen.findByText('Nenhum evento marcado para este cliente.')).toBeInTheDocument()
  })

  it('o histórico mostra o que aconteceu, com quem fez', async () => {
    tela(central, '/clientes/k1?aba=historico')
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
    tela(central, '/clientes/k1?aba=historico')
    expect(await screen.findByText('Movido para STI Consult')).toBeInTheDocument()
  })

  it('lista os check-ins do cliente com consultor e horas', async () => {
    tela(central, '/clientes/k1?aba=checkins')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(listarCheckins).toHaveBeenCalledWith({ clienteId: 'k1', pagina: 1 })
    const linha = within(tabela).getByRole('row', { name: /Reunião/ })
    expect(within(linha).getByText('Ana')).toBeInTheDocument()
    expect(within(linha).getByText('1,5 h')).toBeInTheDocument()
  })

  it('o gestor sem times vê o nome de quem fez cada check-in', async () => {
    tela({ id: 'g1', papel: 'gestor', consultoria_id: 's1' }, '/clientes/k1?aba=checkins')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(within(within(tabela).getByRole('row', { name: /Reunião/ })).getByText('Ana')).toBeInTheDocument()
    expect(within(within(tabela).getByRole('row', { name: /Ajuste/ })).getByText('Beto')).toBeInTheDocument()
    // Nenhum nome escondido na coluna Consultor.
    expect(within(tabela).getAllByRole('row').slice(1).map((r) => r.cells[1].textContent)).toEqual(['Ana', 'Beto'])
  })

  it('a central só vê os check-ins, sem Editar nem Apagar', async () => {
    tela(central, '/clientes/k1?aba=checkins')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(within(tabela).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(tabela).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('o consultor edita e apaga só os próprios check-ins', async () => {
    tela(consultor, '/clientes/k1?aba=checkins')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    const dele = within(tabela).getByRole('row', { name: /Reunião/ })
    const de_outro = within(tabela).getByRole('row', { name: /Ajuste/ })
    expect(within(dele).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(de_outro).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(de_outro).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('o consultor que mudou de consultoria não edita nem apaga os check-ins da antiga', async () => {
    tela({ id: 'p1', papel: 'pessoa', consultoria_id: 's2' }, '/clientes/k1?aba=checkins')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    const dele = within(tabela).getByRole('row', { name: /Reunião/ })
    expect(within(dele).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(dele).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('Editar check-in abre preenchido e salva com editarCheckin', async () => {
    tela(adminDaSti, '/clientes/k1?aba=checkins')
    const dele = within(await screen.findByRole('table', { name: 'Check-ins' })).getByRole('row', { name: /Reunião/ })
    await userEvent.click(within(dele).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar check-in em Provedor Alfa' })
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarCheckin).toHaveBeenCalledWith('c1', { descricao: 'Reunião' })
    expect(buscarCliente).toHaveBeenCalledTimes(2)
  })

  it('o check-in aberto também tem Editar (para fechá-lo com um fim)', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({
      itens: [{ ...CHECKINS[1], id: 'c3', fim: null, descricao: null, inicio: new Date(Date.now() - 3_600_000).toISOString() }],
      total: 1,
    })
    tela(adminDaSti, '/clientes/k1?aba=checkins')
    const linha = within(await screen.findByRole('table', { name: 'Check-ins' })).getByRole('row', { name: /Em aberto/ })
    await userEvent.click(within(linha).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar check-in em Provedor Alfa' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Fechado pelo administrador')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarCheckin).toHaveBeenCalledWith('c3', { fim: expect.any(String), descricao: 'Fechado pelo administrador' })
  })

  it('Apagar check-in pede confirmação antes, dizendo que as tarefas marcadas nele continuam feitas', async () => {
    tela(adminDaSti, '/clientes/k1?aba=checkins')
    const dele = within(await screen.findByRole('table', { name: 'Check-ins' })).getByRole('row', { name: /Reunião/ })
    await userEvent.click(within(dele).getByRole('button', { name: 'Apagar' }))
    expect(apagarCheckin).not.toHaveBeenCalled()
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent(
      'As horas deste atendimento somem do realizado do cliente. As tarefas marcadas nele continuam feitas no check-list. Não dá para desfazer.')
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Apagar check-in' }))
    expect(apagarCheckin).toHaveBeenCalledWith('c1')
  })

  it('a aba Check-ins tem o check-list do cliente em cima da tabela de check-ins', async () => {
    tela(consultor, '/clientes/k1?aba=checkins')
    const modelo = await screen.findByRole('region', { name: 'Modelo de check-in' })
    expect(lerChecklist).toHaveBeenCalledWith('k1')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(modelo.compareDocumentPosition(tabela) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Check-in' })).toBeInTheDocument()
  })

  it('a tabela Check-ins tem a coluna Tarefas marcadas: até 3 e "+N"', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({
      itens: [
        { ...CHECKINS[0], tarefas: [{ titulo: 'Análise do DRE' }, { titulo: 'Mapa de custos' }, { titulo: 'Plano de ação' }], total_tarefas: 5 },
        { ...CHECKINS[1], tarefas: [], total_tarefas: 0 },
      ],
      total: 2,
    })
    tela(central, '/clientes/k1?aba=checkins')
    const tabela = await screen.findByRole('table', { name: 'Check-ins' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['Data', 'Consultor', 'Horas', 'Tarefas marcadas', 'O que foi feito', 'Ações'])
    const comTarefas = within(within(tabela).getByRole('row', { name: /Reunião/ }))
    expect(comTarefas.getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Análise do DRE', 'Mapa de custos', 'Plano de ação', '+2'])
    expect(within(within(tabela).getByRole('row', { name: /Ajuste/ })).queryByRole('list')).not.toBeInTheDocument()
  })

  it('marcar uma tarefa no check-list recarrega a página (o botão de check-in, a sessão e a tabela andam juntos)', async () => {
    vi.mocked(lerChecklist).mockResolvedValue(COM_MODELO)
    vi.mocked(marcarTarefa).mockResolvedValue({ estado: 'feita', liberadas: [], na_sessao: false, erro: null })
    tela(consultor, '/clientes/k1?aba=checkins')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Análise do DRE' }))
    expect(marcarTarefa).toHaveBeenCalledWith('t1', 'feita')
    await waitFor(() => expect(buscarCliente).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(listarCheckins).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(lerChecklist).toHaveBeenCalledTimes(2))
  })

  it('o histórico mostra aplicar, trocar e tirar o modelo de check-in, com o nome do modelo', async () => {
    vi.mocked(listarEventos).mockResolvedValue({
      itens: [
        { id: 'e5', tipo: 'modelo_tirado', em: '2026-11-15T10:00:00Z', modelo: 'Sucesso do Cliente', autor: 'Gil' },
        { id: 'e4', tipo: 'modelo_trocado', em: '2026-11-14T10:00:00Z', modelo: 'Sucesso do Cliente', autor: 'Gil' },
        { id: 'e3', tipo: 'modelo_aplicado', em: '2026-11-13T10:00:00Z', modelo: 'Gestão financeira', autor: 'Gil' },
        // O nome do modelo só vai para a Central e para a consultoria do check-list.
        { id: 'e2', tipo: 'modelo_aplicado', em: '2026-11-12T10:00:00Z', modelo: null, autor: null },
      ],
      total: 4,
    })
    tela(central, '/clientes/k1?aba=historico')
    const tabela = await screen.findByRole('table', { name: 'Histórico' })
    expect(within(tabela).getAllByRole('row').slice(1).map((r) => r.cells[1].textContent)).toEqual([
      'Modelo de check-in tirado: Sucesso do Cliente',
      'Modelo de check-in trocado para Sucesso do Cliente',
      'Modelo de check-in aplicado: Gestão financeira',
      'Modelo de check-in aplicado',
    ])
  })

  it('o título fica sozinho no topo; abas e ações ficam numa barra no estilo da de filtros (pedido do Diego, 17/11)', async () => {
    tela()
    const titulo = await screen.findByRole('heading', { name: 'Provedor Alfa' })
    const cabecalho = titulo.parentElement.parentElement
    expect(cabecalho).toHaveTextContent('Alfa Telecom Ltda')
    expect(within(cabecalho).queryAllByRole('button')).toHaveLength(0)
    const regiao = screen.getByRole('region', { name: 'Abas e ações do cliente' })
    expect(regiao).toHaveClass('card', 'flex', 'flex-wrap')
    expect(regiao).not.toHaveTextContent('Filtros')
    const abas = within(regiao).getByRole('tablist', { name: 'Seções do cliente' })
    const botoes = within(regiao).getAllByRole('button')
    expect(botoes.map((b) => b.textContent.trim())).toEqual(['Mover', 'Editar', 'Arquivar', 'Apagar'])
    // Abas à esquerda, botões depois delas, no fim da barra (à direita).
    expect(abas.compareDocumentPosition(botoes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(botoes[0].parentElement).toHaveClass('ml-auto', 'flex-wrap')
    // O conteúdo da aba vem abaixo da barra, fora dela.
    expect(regiao).not.toContainElement(screen.getByRole('tabpanel'))
  })

  it('no celular as ações secundárias ficam só com o ícone, mantendo o nome; a principal mantém o texto', async () => {
    tela(consultor)
    const regiao = within(await screen.findByRole('region', { name: 'Abas e ações do cliente' }))
    const principal = await regiao.findByRole('button', { name: 'Fazer check-in' })
    expect(principal.querySelector('[class*="sr-only"]')).toBeNull()
    expect(within(regiao.getByRole('button', { name: 'Lançar horas' })).getByText('Lançar horas')).toHaveClass('max-sm:sr-only')
  })

  it('as ações da lista seguem o papel: a central edita e arquiva', async () => {
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    const barra = within(screen.getByRole('region', { name: 'Abas e ações do cliente' }))
    expect(barra.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(barra.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument()
    expect(barra.getByRole('button', { name: 'Mover' })).toBeInTheDocument()
    expect(barra.getByRole('button', { name: 'Editar' })).toHaveClass('border')
    expect(barra.getByRole('button', { name: 'Apagar' })).toHaveClass('border')
    expect(barra.getByRole('button', { name: 'Apagar' })).not.toHaveClass('bg-primary-cheio')
    expect(barra.getByRole('button', { name: 'Apagar' })).toHaveClass('hover:text-destructive')
  })

  it('o administrador troca o consultor e ajusta a previsão', async () => {
    tela(adminDaSti, '/clientes/k1?aba=checkins')
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    const barra = within(screen.getByRole('region', { name: 'Abas e ações do cliente' }))
    expect(barra.getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Trocar consultor', 'Ajustar previsão'])
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument()
    // Padrão Hub: na barra da página, sem a principal do contexto, tudo é outline (nada de link solto).
    for (const nome of ['Trocar consultor', 'Ajustar previsão']) {
      const botao = barra.getByRole('button', { name: nome })
      expect(botao).toHaveClass('border')
      expect(botao).not.toHaveClass('bg-primary-cheio')
      expect(botao.className).not.toMatch(/text-muted-foreground/)
    }
  })

  it('o consultor do cliente faz check-in e lança horas; outra pessoa não tem ações', async () => {
    const { unmount } = tela(consultor)
    const barra = within(await screen.findByRole('region', { name: 'Abas e ações do cliente' }))
    expect(await barra.findByRole('button', { name: 'Fazer check-in' })).toBeInTheDocument()
    expect(barra.getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Fazer check-in', 'Lançar horas'])
    // Padrão Hub: a principal do contexto cheia, as demais outline.
    expect(barra.getByRole('button', { name: 'Fazer check-in' })).toHaveClass('bg-primary-cheio')
    expect(barra.getByRole('button', { name: 'Lançar horas' })).toHaveClass('border')
    expect(barra.getByRole('button', { name: 'Lançar horas' })).not.toHaveClass('bg-primary-cheio')
    unmount()
    tela(outraPessoa)
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    // A barra continua (com as abas), só sem botões.
    const semAcoes = within(screen.getByRole('region', { name: 'Abas e ações do cliente' }))
    expect(semAcoes.getByRole('tablist', { name: 'Seções do cliente' })).toBeInTheDocument()
    expect(semAcoes.queryAllByRole('button')).toHaveLength(0)
  })

  it('mostra as abas na ordem e abre Geral com os dados e as ações', async () => {
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Geral', 'Quadro', 'Agenda', 'Check-ins', 'Arquivos', 'Histórico'])
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('table', { name: 'Check-ins' })).not.toBeInTheDocument()
    expect(screen.getByText('Alfa Telecom Ltda')).toBeInTheDocument()
  })

  it('a aba Quadro (logo depois de Geral) abre o quadro do cliente', async () => {
    vi.mocked(quadroDoCliente).mockResolvedValue({
      id: 'q1', cliente_id: 'k1', consultoria_id: 's1', pode_mexer: true, pode_gerir: false,
      colunas: [{ id: 'col1', nome: 'A fazer', cor: null, concluidos: false, posicao: 1024, cartoes: 0, arquivados: 0 }],
    })
    vi.mocked(cartoesDoQuadro).mockResolvedValue({ itens: [], total: 0 })
    tela(consultor, '/clientes/k1?aba=quadro')
    expect(await screen.findByRole('region', { name: 'Coluna A fazer' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Quadro' })).toHaveAttribute('aria-selected', 'true')
    expect(quadroDoCliente).toHaveBeenCalledWith('k1')
    expect(ouvirQuadro).toHaveBeenCalledWith('q1', expect.any(Function), { juntarMs: 300 })
  })

  it('colega sem acesso ao cliente não vê nenhuma aba (nem o Quadro)', async () => {
    vi.mocked(buscarCliente).mockResolvedValue(null)
    tela(outraPessoa, '/clientes/k1?aba=quadro')
    expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Quadro' })).not.toBeInTheDocument()
    expect(quadroDoCliente).not.toHaveBeenCalled()
  })

  it('?aba=arquivos abre Arquivos', async () => {
    vi.mocked(listarArquivos).mockResolvedValue({
      itens: [{ id: 'a1', nome: 'contrato.pdf', tamanho: 100, enviado_em: '2026-11-10T12:00:00Z', consultoria_id: 's1', caminho: 'k1/a', autor: 'Ana' }],
      total: 1,
    })
    vi.mocked(listarPastas).mockResolvedValue({ itens: [], total: 0 })
    tela(central, '/clientes/k1?aba=arquivos')
    expect(await screen.findByRole('table', { name: 'Arquivos' })).toBeInTheDocument()
    expect(listarArquivos).toHaveBeenCalledWith('k1', { pastaId: null, pagina: 1 })
  })

  it('trocar de aba mantém o cliente carregado', async () => {
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    expect(await screen.findByRole('table', { name: 'Histórico' })).toBeInTheDocument()
    expect(buscarCliente).toHaveBeenCalledTimes(1)
  })

  it('aba desconhecida volta para Geral', async () => {
    tela(central, '/clientes/k1?aba=nada')
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true')
  })

  it('apagar o cliente avisa que só dá sem horas, arquivos nem cartões (senão, arquivar) e limpa a pasta dele', async () => {
    vi.mocked(apagarCliente).mockResolvedValue({ erro: null })
    vi.mocked(limparPastaDoCliente).mockResolvedValue({ erro: null })
    vi.mocked(limparQuadroDoCliente).mockResolvedValue({ erro: null })
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    const janela = screen.getByRole('alertdialog')
    expect(within(janela).getByText(
      'O cliente some de vez. Só dá para apagar cliente sem horas, arquivos nem cartões registrados; se tiver, arquive em vez de apagar.',
    )).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Apagar cliente' }))
    await waitFor(() => expect(limparPastaDoCliente).toHaveBeenCalledWith('k1'))
    // O que sobrou do quadro no balde "quadros" (anexos e imagens de cartões já apagados) também sai.
    await waitFor(() => expect(limparQuadroDoCliente).toHaveBeenCalledWith('k1'))
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('se a pasta não limpar, avisa mas o cliente continua apagado', async () => {
    vi.mocked(apagarCliente).mockResolvedValue({ erro: null })
    vi.mocked(limparPastaDoCliente).mockResolvedValue({ erro: 'ficou' })
    vi.mocked(limparQuadroDoCliente).mockResolvedValue({ erro: null })
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar cliente' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      'O cliente foi apagado, mas alguns arquivos não saíram do armazenamento. Avise o suporte.'))
  })

  it('se o que sobrou do quadro não sair, avisa do mesmo jeito', async () => {
    vi.mocked(apagarCliente).mockResolvedValue({ erro: null })
    vi.mocked(limparPastaDoCliente).mockResolvedValue({ erro: null })
    vi.mocked(limparQuadroDoCliente).mockResolvedValue({ erro: 'ficou' })
    tela()
    await screen.findByRole('heading', { name: 'Provedor Alfa' })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar cliente' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      'O cliente foi apagado, mas alguns arquivos não saíram do armazenamento. Avise o suporte.'))
  })
})
