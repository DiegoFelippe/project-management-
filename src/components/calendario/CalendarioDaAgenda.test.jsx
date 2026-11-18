import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import {
  ausenciasDoPeriodo, buscarEvento, eventosDoCliente, eventosDoPeriodo, feriadosDoPeriodo, indicadoresDaAgenda, meuGoogle,
  salvarEvento,
} from '@/data/agenda'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { buscarClientes } from '@/data/clientes'
import CalendarioDaAgenda from './CalendarioDaAgenda'

// O calendário do menu recortado por cliente (a aba Agenda da página do cliente). O menu sem recorte tem os testes em
// src/pages/Calendario.test.jsx.
vi.mock('@/data/agenda', async (importOriginal) => {
  const real = await importOriginal()
  return {
    voltaDoGoogle: real.voltaDoGoogle,
    eventosDoPeriodo: vi.fn(), eventosDoCliente: vi.fn(), buscarEvento: vi.fn(), indicadoresDaAgenda: vi.fn(), ausenciasDoPeriodo: vi.fn(),
    feriadosDoPeriodo: vi.fn(), meuGoogle: vi.fn(), conectarGoogle: vi.fn(), concluirGoogle: vi.fn(),
    desconectarGoogle: vi.fn(), salvarEvento: vi.fn(), apagarEvento: vi.fn(), responderConvite: vi.fn(),
    novoIdDeEvento: vi.fn(() => 'novo-1'), buscarAgora: vi.fn(), tentarDeNovo: vi.fn(), pessoasParaConvidar: vi.fn(),
  }
})
vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))
vi.mock('@/data/clientes', () => ({ buscarClientes: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const CLIENTE = {
  id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1', consultor_id: 'p1', arquivado: false,
  contato_nome: 'Carla Dias', contato_email: 'carla@alfa.com.br',
}
const EVENTO = {
  id: 'e1', consultoria_id: 's1', consultor_id: 'p1', cliente_id: 'k1', titulo: 'Kickoff Alfa', descricao: null,
  inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-20T15:00:00-03:00', dia_inteiro: false, cor: 2, com_meet: true,
  gravar: true, meet_link: 'https://meet.google.com/abc-defg-hij', meet_codigo: 'abc-defg-hij', google_evento_id: 'g1',
  reuniao: 'agendada', reuniao_erro: null, gravacao_url: null, pasta_id: null, criado_por: 'p1',
  consultor: { id: 'p1', nome: 'Ana Souza', cor: '#16a34a' }, cliente: { id: 'k1', nome: 'Provedor Alfa' }, participantes: [],
}
// Os da tabela "Eventos do cliente": um de hoje que já passou (8h; agora é meio-dia) e um antigo, com pasta e gravação.
const DE_HOJE = {
  ...EVENTO, id: 'e2', titulo: 'Alinhamento rápido', inicio: '2026-11-17T08:00:00-03:00', fim: '2026-11-17T08:30:00-03:00',
  com_meet: false, gravar: false, meet_link: null, meet_codigo: null,
}
const ANTIGO = {
  ...EVENTO, id: 'e0', titulo: 'Diagnóstico Alfa', inicio: '2026-11-03T09:00:00-03:00', fim: '2026-11-03T10:30:00-03:00',
  reuniao: 'pasta_criada', pasta_id: 'pa1', gravacao_url: 'https://drive.google.com/gravacao', consultor_id: 'p2',
  consultor: { id: 'p2', nome: 'Bruno Lima', cor: null },
}
const consultor = { id: 'p1', nome: 'Ana Souza', papel: 'pessoa', consultoria_id: 's1' }
const gestora = { id: 'g1', nome: 'Gabi Rocha', papel: 'gestor', consultoria_id: 's1' }
const central = { id: 'c0', nome: 'Central', papel: 'central', consultoria_id: null }

const MES = { de: '2026-11-01T00:00:00-03:00', ate: '2026-12-06T00:00:00-03:00' }
const AGENDA = { de: '2026-11-17T00:00:00-03:00', ate: '2027-01-16T00:00:00-03:00' }

function Endereco() {
  const { pathname, search } = useLocation()
  return <output data-testid="endereco">{pathname + search}</output>
}

function tela(perfil, { cliente = CLIENTE, endereco = '/clientes/k1?aba=agenda' } = {}) {
  return render(
    <AuthContext.Provider value={{ perfil }}>
      <MemoryRouter initialEntries={[endereco]}>
        <CalendarioDaAgenda cliente={cliente} />
        <Endereco />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// A 4ª visão, só do cliente: "Todos" troca a grade pela tabela de todos os eventos dele.
const visoes = () => within(screen.getByRole('group', { name: 'Visão do calendário' })).getAllByRole('button').map((b) => b.textContent)
async function abrirTodos(user) {
  await screen.findByRole('group', { name: 'Visão do calendário' })
  await user.click(within(screen.getByRole('group', { name: 'Visão do calendário' })).getByRole('button', { name: 'Todos' }))
  return screen.findByRole('table', { name: 'Eventos do cliente' })
}

function celular(sim) {
  vi.stubGlobal('matchMedia', vi.fn((consulta) => ({
    matches: !sim, media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T15:00:00Z')) // terça, 17/11, meio-dia em São Paulo
  celular(false)
  vi.mocked(eventosDoPeriodo).mockResolvedValue({ itens: [EVENTO], haMais: false })
  vi.mocked(eventosDoCliente).mockResolvedValue({ itens: [EVENTO, DE_HOJE, ANTIGO], total: 3, proximoId: 'e1' })
  vi.mocked(ausenciasDoPeriodo).mockResolvedValue({ itens: [], haMais: false })
  vi.mocked(feriadosDoPeriodo).mockResolvedValue(['2026-11-20'])
  vi.mocked(indicadoresDaAgenda).mockResolvedValue({ semana: 1, mes: 2, aguardando: 0, pastas_no_mes: 1 })
  vi.mocked(meuGoogle).mockResolvedValue({ conectado: true, email: 'ana@ixcsoft.com.br', erro: null })
  vi.mocked(salvarEvento).mockResolvedValue({ erro: null, evento: EVENTO, aviso: null })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [
    { id: 'p1', nome: 'Ana Souza', email: 'ana@x.test', consultoria_id: 's1', consultoria_nome: 'STI' },
  ], total: 1 })
  vi.mocked(buscarClientes).mockResolvedValue({ itens: [{ id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1' }], total: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Agenda do cliente (calendário do menu com o recorte do cliente)', () => {
  it('lê só os eventos do cliente, sem cartões de números (e sem pedir os números), sem o título da página do menu', async () => {
    tela(gestora)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(await within(grade).findByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(1)
    // Na aba, todo evento é do cliente (uma reunião com cliente): o "Mostrar" pede as reuniões dele.
    expect(eventosDoPeriodo).toHaveBeenCalledWith({ ...MES, consultorId: undefined, consultoriaId: undefined, clienteId: 'k1', tipo: 'reunioes' })
    expect(screen.queryByRole('region', { name: 'Indicadores da agenda' })).not.toBeInTheDocument()
    expect(indicadoresDaAgenda).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Calendário', level: 1 })).not.toBeInTheDocument()
    // Embaixo do calendário, nada a mais: nem o detalhe do dia, nem os próximos 7 dias, nem a tabela (que é a visão Todos).
    expect(screen.queryByRole('region', { name: 'Detalhe do dia' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Próximos 7 dias' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Eventos do cliente' })).not.toBeInTheDocument()
    expect(eventosDoCliente).not.toHaveBeenCalled()
  })

  it('a troca de visão tem uma 4ª opção, Todos; nas outras visões a tabela não aparece', async () => {
    const user = userEvent.setup()
    tela(gestora)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(visoes()).toEqual(['Mês', 'Semana', 'Agenda', 'Todos'])
    for (const visao of ['Semana', 'Agenda']) {
      await user.click(within(screen.getByRole('group', { name: 'Visão do calendário' })).getByRole('button', { name: visao }))
      expect(screen.queryByRole('table', { name: 'Eventos do cliente' })).not.toBeInTheDocument()
    }
    expect(eventosDoCliente).not.toHaveBeenCalled()
  })

  it('Todos: a tabela "Eventos do cliente" no lugar da grade, com todos os eventos dele na ordem do banco', async () => {
    const user = userEvent.setup()
    tela(gestora)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    const pedidosDoPeriodo = vi.mocked(eventosDoPeriodo).mock.calls.length
    const tabela = await abrirTodos(user)
    expect(eventosDoCliente).toHaveBeenCalledWith({ clienteId: 'k1', pagina: 1 })
    expect(within(screen.getByRole('group', { name: 'Visão do calendário' })).getByRole('button', { name: 'Todos' }))
      .toHaveAttribute('aria-pressed', 'true')
    // Dentro do cartão do calendário, no lugar da grade; o Hoje ‹ › não vale aqui e some; o período nem é lido.
    const calendario = screen.getByRole('region', { name: 'Calendário' })
    expect(calendario).toContainElement(tabela)
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(within(calendario).getByRole('heading', { name: 'Todos os eventos do cliente' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Período anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Próximo período' })).not.toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(pedidosDoPeriodo)
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['Data', 'Horário', 'Título', 'Organizador', 'Situação', 'Ações'])
    const [, futuro, hoje, antigo] = within(tabela).getAllByRole('row')
    // O próximo (o banco diz qual) e o de hoje ganham o selo; datas e horas no relógio de São Paulo.
    expect(futuro).toHaveTextContent('20/11/2026')
    expect(futuro).toHaveTextContent('14:00 – 15:00')
    expect(futuro).toHaveTextContent('Kickoff Alfa')
    expect(futuro).toHaveTextContent('Ana Souza')
    expect(within(futuro).getByText('Próximo')).toBeInTheDocument()
    expect(within(futuro).getByText('Meet')).toBeInTheDocument()
    expect(within(futuro).queryByText('Hoje')).not.toBeInTheDocument()
    expect(hoje).toHaveTextContent('17/11/2026')
    expect(hoje).toHaveTextContent('08:00 – 08:30')
    expect(within(hoje).getByText('Hoje')).toBeInTheDocument()
    expect(within(hoje).queryByText('Próximo')).not.toBeInTheDocument()
    expect(within(hoje).queryByText('Meet')).not.toBeInTheDocument()
    expect(antigo).toHaveTextContent('03/11/2026')
    expect(antigo).toHaveTextContent('09:00 – 10:30')
    expect(antigo).toHaveTextContent('Bruno Lima')
    // A situação da reunião com os mesmos nomes do detalhe do evento.
    expect(within(antigo).getByText('Gravação')).toBeInTheDocument()
    expect(within(antigo).getByText('Pasta criada')).toBeInTheDocument()
    expect(within(tabela).getAllByRole('button', { name: /^Abrir/ })).toHaveLength(3)
  })

  it('a dica do mês não promete o detalhe do dia embaixo (no cliente ele não existe)', async () => {
    tela(gestora)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(screen.queryByText(/detalhes abaixo/)).not.toBeInTheDocument()
    expect(screen.getByText('Dois cliques num dia criam um evento')).toBeInTheDocument()
  })

  it('Todos, cliente sem eventos: a lista vazia diz isso', async () => {
    const user = userEvent.setup()
    vi.mocked(eventosDoCliente).mockResolvedValue({ itens: [], total: 0, proximoId: null })
    tela(consultor)
    await screen.findByRole('group', { name: 'Visão do calendário' })
    await user.click(within(screen.getByRole('group', { name: 'Visão do calendário' })).getByRole('button', { name: 'Todos' }))
    expect(await screen.findByText('Nenhum evento marcado para este cliente.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Eventos do cliente' })).not.toBeInTheDocument()
  })

  it('Todos: "Novo evento" continua abrindo com o cliente travado; voltar ao Mês traz a grade', async () => {
    const user = userEvent.setup()
    tela(consultor)
    await abrirTodos(user)
    await user.click(screen.getByRole('button', { name: 'Novo evento' }))
    const janela = await screen.findByRole('dialog', { name: 'Novo evento' })
    expect(within(janela).getByLabelText('Cliente')).toBeDisabled()
    expect(within(janela).getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    await user.click(within(janela).getByRole('button', { name: 'Cancelar' }))
    await user.click(within(screen.getByRole('group', { name: 'Visão do calendário' })).getByRole('button', { name: 'Mês' }))
    expect(await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Eventos do cliente' })).not.toBeInTheDocument()
  })

  it('paginação do banco: some com 15, aparece com 16 ("1–15 de 16") e Próxima pede a página 2', async () => {
    const user = userEvent.setup()
    const quinze = Array.from({ length: 15 }, (_, i) => ({ ...EVENTO, id: `r${i}`, titulo: `Reunião ${i + 1}` }))
    vi.mocked(eventosDoCliente).mockResolvedValue({ itens: quinze, total: 15, proximoId: null })
    const { unmount } = tela(gestora)
    const tabela = await abrirTodos(user)
    expect(within(tabela).getAllByRole('row')).toHaveLength(16)
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()

    vi.mocked(eventosDoCliente).mockResolvedValue({ itens: quinze, total: 16, proximoId: null })
    tela(gestora)
    await abrirTodos(user)
    const paginacao = await screen.findByRole('navigation', { name: 'Paginação' })
    expect(paginacao).toHaveTextContent('1–15 de 16')
    await user.click(within(paginacao).getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(eventosDoCliente).toHaveBeenLastCalledWith({ clienteId: 'k1', pagina: 2 }))
  })

  it('"Abrir" na linha abre a janela do evento, a mesma do calendário', async () => {
    const user = userEvent.setup()
    tela(gestora)
    const tabela = await abrirTodos(user)
    await user.click(within(tabela).getByRole('button', { name: 'Abrir Diagnóstico Alfa' }))
    const janela = await screen.findByRole('dialog', { name: 'Editar evento' })
    expect(within(janela).getByLabelText('Título')).toHaveValue('Diagnóstico Alfa')
  })

  it('salvar um evento relê a lista na mesma página (na 2, continua na 2)', async () => {
    const user = userEvent.setup()
    vi.mocked(eventosDoCliente).mockResolvedValue({ itens: [EVENTO, DE_HOJE, ANTIGO], total: 18, proximoId: 'e1' })
    tela(consultor)
    await abrirTodos(user)
    await user.click(within(await screen.findByRole('navigation', { name: 'Paginação' })).getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('Página 2 de 2'))
    expect(eventosDoCliente).toHaveBeenCalledTimes(2)
    expect(eventosDoCliente).toHaveBeenLastCalledWith({ clienteId: 'k1', pagina: 2 })
    const tabela = screen.getByRole('table', { name: 'Eventos do cliente' })
    await user.click(within(tabela).getByRole('button', { name: 'Abrir Kickoff Alfa' }))
    const janela = await screen.findByRole('dialog', { name: 'Editar evento' })
    await user.click(within(janela).getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(eventosDoCliente).toHaveBeenCalledTimes(3))
    expect(eventosDoCliente).toHaveBeenLastCalledWith({ clienteId: 'k1', pagina: 2 })
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('Página 2 de 2')
  })

  it('Todos, eventos de vários dias: o que está acontecendo hoje ganha "Hoje"; o de dia inteiro mostra até quando vai', async () => {
    const user = userEvent.setup()
    const imersao = { ...EVENTO, id: 'e3', titulo: 'Imersão', inicio: '2026-11-16T09:00:00-03:00', fim: '2026-11-18T18:00:00-03:00' }
    const treino = { ...EVENTO, id: 'e4', titulo: 'Treinamento', dia_inteiro: true, inicio: '2026-11-18T00:00:00-03:00', fim: '2026-11-21T00:00:00-03:00' }
    const virada = { ...EVENTO, id: 'e5', titulo: 'Virada', dia_inteiro: true, inicio: '2026-11-30T00:00:00-03:00', fim: '2026-12-03T00:00:00-03:00' }
    const umDia = { ...EVENTO, id: 'e6', titulo: 'Feira', dia_inteiro: true, inicio: '2026-11-10T00:00:00-03:00', fim: '2026-11-11T00:00:00-03:00' }
    vi.mocked(eventosDoCliente).mockResolvedValue({ itens: [virada, treino, imersao, umDia], total: 4, proximoId: null })
    tela(gestora)
    const tabela = await abrirTodos(user)
    const linha = (titulo) => within(tabela).getByRole('row', { name: new RegExp(titulo) })
    // Começou ontem e acaba amanhã: está acontecendo hoje.
    expect(linha('Imersão')).toHaveTextContent('16/11/2026')
    expect(within(linha('Imersão')).getByText('Hoje')).toBeInTheDocument()
    // Dia inteiro de 18 a 20/11 (o fim é a meia-noite do dia 21): a data mostra o fim; ainda não é hoje.
    expect(within(linha('Treinamento')).getByText('18–20/11/2026')).toBeInTheDocument()
    expect(linha('Treinamento')).toHaveTextContent('Dia inteiro')
    expect(within(linha('Treinamento')).queryByText('Hoje')).not.toBeInTheDocument()
    expect(within(linha('Virada')).getByText('30/11–02/12/2026')).toBeInTheDocument()
    // Dia inteiro de um dia só: só a data.
    expect(within(linha('Feira')).getByText('10/11/2026')).toBeInTheDocument()
  })

  it('a barra não tem consultor, consultoria nem cliente; o Mostrar só tem reuniões e feriados (ausências nem são lidas)', async () => {
    const user = userEvent.setup()
    for (const perfil of [central, gestora, consultor]) {
      const { unmount } = tela(perfil)
      await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
      expect(screen.queryByLabelText('Consultor')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument()
      unmount()
    }
    expect(ausenciasDoPeriodo).not.toHaveBeenCalled()
    expect(feriadosDoPeriodo).toHaveBeenCalledWith('2026-11-01', '2026-12-05')

    tela(gestora)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await user.click(screen.getByRole('button', { name: /Mostrar: tudo/ }))
    expect(screen.getByRole('checkbox', { name: 'Reuniões com cliente' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Feriados' })).toBeChecked()
    // Compromisso é evento sem cliente: dentro do cliente nunca aparece, então não está no Mostrar.
    expect(screen.queryByRole('checkbox', { name: 'Compromissos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Ausências' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    // Esconder os feriados conta "1 de 2"; sem as reuniões, os eventos nem são pedidos; Limpar filtros volta ao Mostrar
    // do cliente (ainda sem ausências).
    await user.click(screen.getByRole('checkbox', { name: 'Feriados' }))
    expect(screen.getByRole('button', { name: /Mostrar: 1 de 2/ })).toBeInTheDocument()
    const pedidos = vi.mocked(eventosDoPeriodo).mock.calls.length
    await user.click(screen.getByRole('checkbox', { name: 'Reuniões com cliente' }))
    expect(screen.getByRole('button', { name: /Mostrar: 0 de 2/ })).toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(pedidos)
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('button', { name: /Mostrar: tudo/ })).toBeInTheDocument()
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenLastCalledWith(expect.objectContaining({ clienteId: 'k1', tipo: 'reunioes' })))
    expect(ausenciasDoPeriodo).not.toHaveBeenCalled()
  })

  it('"Novo evento" abre com o cliente escolhido e travado, e grava no cliente', async () => {
    const user = userEvent.setup()
    tela(consultor)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await waitFor(() => expect(screen.getByText('Google conectado')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Novo evento' }))
    const janela = await screen.findByRole('dialog', { name: 'Novo evento' })
    const campoCliente = within(janela).getByLabelText('Cliente')
    expect(campoCliente).toBeDisabled()
    expect(campoCliente).toHaveTextContent('Provedor Alfa')
    expect(within(janela).getByText('Novo evento na agenda deste cliente. Para outro cliente, use o Calendário do menu.')).toBeInTheDocument()
    await user.type(within(janela).getByLabelText('Título'), 'Alinhamento')
    await user.click(within(janela).getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: 'k1', titulo: 'Alinhamento' })))
  })

  it('dois cliques num dia também abrem o Novo evento com o cliente travado', async () => {
    const user = userEvent.setup()
    tela(gestora)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await user.dblClick(within(grade).getByRole('gridcell', { name: /^24 de novembro/ }))
    const janela = await screen.findByRole('dialog', { name: 'Novo evento' })
    expect(within(janela).getByLabelText('Data')).toHaveTextContent('24 de nov de 2026')
    expect(within(janela).getByLabelText('Cliente')).toBeDisabled()
    expect(within(janela).getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
  })

  it('cliente arquivado ou sem consultoria: não oferece Novo evento (nenhum consultor poderia gravar nele)', async () => {
    for (const cliente of [{ ...CLIENTE, arquivado: true }, { ...CLIENTE, consultoria_id: null, consultor_id: null }]) {
      const user = userEvent.setup()
      const { unmount } = tela(central, { cliente })
      const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
      expect(await within(grade).findByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Novo evento' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Novo evento em/ })).not.toBeInTheDocument()
      await user.dblClick(within(grade).getByRole('gridcell', { name: /^24 de novembro/ }))
      expect(screen.queryByRole('dialog', { name: 'Novo evento' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('clicar no evento abre a janela dele, como no menu', async () => {
    const user = userEvent.setup()
    tela(gestora)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await user.click(await within(grade).findByRole('button', { name: /Kickoff Alfa/ }))
    const janela = await screen.findByRole('dialog', { name: 'Editar evento' })
    expect(within(janela).getByLabelText('Título')).toHaveValue('Kickoff Alfa')
  })

  it('?evento=<id> abre o evento dentro da aba e tira só o evento do endereço', async () => {
    vi.mocked(buscarEvento).mockResolvedValue(EVENTO)
    tela(consultor, { endereco: '/clientes/k1?aba=agenda&evento=e1' })
    const janela = await screen.findByRole('dialog', { name: 'Editar evento' })
    expect(within(janela).getByLabelText('Título')).toHaveValue('Kickoff Alfa')
    expect(buscarEvento).toHaveBeenCalledWith('e1')
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/clientes\/k1\?aba=agenda$/))
  })

  it('no Mês, o chip do evento continua botão no toque (a aba não tem o detalhe do dia: o toque no dia não mostraria nada)', async () => {
    const user = userEvent.setup()
    tela(consultor)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    const chip = await within(grade).findByRole('button', { name: /Kickoff Alfa/ })
    expect(chip.className).toContain('pointer-coarse:min-h-11')
    expect(chip.className).not.toMatch(/pointer-coarse:hidden|max-sm:hidden/)
    // No celular a faixa vira o próprio botão: o título fica para o leitor de tela.
    expect(within(chip).getByText('Kickoff Alfa')).toHaveClass('max-sm:sr-only')
    await user.click(chip)
    expect(await screen.findByRole('dialog', { name: 'Editar evento' })).toBeInTheDocument()
  })

  it('no celular abre na visão Agenda, só com o cliente', async () => {
    celular(true)
    tela(consultor)
    expect(await screen.findByText('Próximos 60 dias')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenCalledWith(expect.objectContaining({ ...AGENDA, clienteId: 'k1' })))
    const agenda = screen.getByRole('region', { name: 'Agenda dos próximos 60 dias' })
    expect(await within(agenda).findByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
  })

  it('o aviso de "há mais eventos" não manda usar filtros que a aba não tem', async () => {
    vi.mocked(eventosDoPeriodo).mockResolvedValue({ itens: [EVENTO], haMais: true })
    tela(gestora)
    const aviso = await screen.findByText(/mais eventos neste período do que o calendário mostra/)
    expect(aviso).not.toHaveTextContent(/consultor|cliente/)
  })
})

describe('Calendário do menu (sem cliente)', () => {
  it('continua com o detalhe do dia e os próximos 7 dias, sem a visão Todos nem a tabela do cliente', async () => {
    tela(gestora, { cliente: null, endereco: '/calendario' })
    expect(await screen.findByRole('region', { name: 'Detalhe do dia' })).toBeInTheDocument()
    expect(visoes()).toEqual(['Mês', 'Semana', 'Agenda'])
    expect(screen.getByRole('region', { name: 'Próximos 7 dias' })).toBeInTheDocument()
    expect(screen.getByText('Clique num dia para ver os detalhes · dois cliques criam um evento')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Eventos do cliente' })).not.toBeInTheDocument()
    expect(eventosDoCliente).not.toHaveBeenCalled()
  })
})
