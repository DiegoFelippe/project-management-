import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import {
  ausenciasDoPeriodo, buscarEvento, eventosDoPeriodo, feriadosDoPeriodo, indicadoresDaAgenda, meuGoogle, salvarEvento,
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
    eventosDoPeriodo: vi.fn(), buscarEvento: vi.fn(), indicadoresDaAgenda: vi.fn(), ausenciasDoPeriodo: vi.fn(),
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
  it('lê só os eventos do cliente e os números dele, sem o título da página do menu', async () => {
    tela(gestora)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(await within(grade).findByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(1)
    expect(eventosDoPeriodo).toHaveBeenCalledWith({ ...MES, consultorId: undefined, consultoriaId: undefined, clienteId: 'k1', tipo: undefined })
    expect(indicadoresDaAgenda).toHaveBeenCalledWith('2026-11-17', { clienteId: 'k1' })
    const indicadores = screen.getByRole('region', { name: 'Indicadores da agenda' })
    await waitFor(() => expect(within(indicadores).getByText('Reuniões no mês').parentElement).toHaveTextContent('2'))
    expect(within(indicadores).getByText('Pastas criadas no mês').parentElement).toHaveTextContent('1')
    expect(screen.queryByRole('heading', { name: 'Calendário', level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Detalhe do dia' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Próximos 7 dias' })).toBeInTheDocument()
  })

  it('a barra não tem consultor, consultoria nem cliente; o Mostrar não tem ausências e elas nem são lidas', async () => {
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
    expect(screen.getByRole('checkbox', { name: 'Compromissos' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Feriados' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Ausências' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    // Esconder os feriados conta "2 de 3"; Limpar filtros volta ao Mostrar do cliente (ainda sem ausências).
    await user.click(screen.getByRole('checkbox', { name: 'Feriados' }))
    expect(screen.getByRole('button', { name: /Mostrar: 2 de 3/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('button', { name: /Mostrar: tudo/ })).toBeInTheDocument()
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
