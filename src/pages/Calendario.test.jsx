import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { buscarClientes } from '@/data/clientes'
import { buscarConsultorias } from '@/data/consultorias'
import {
  ausenciasDoPeriodo, concluirGoogle, conectarGoogle, desconectarGoogle, eventosDoPeriodo, feriadosDoPeriodo,
  indicadoresDaAgenda, meuGoogle,
} from '@/data/agenda'
import { escolherNoSeletor } from '@/test/campos'
import Calendario from './Calendario'

vi.mock('@/data/agenda', async (importOriginal) => {
  const real = await importOriginal()
  return {
    voltaDoGoogle: real.voltaDoGoogle,
    eventosDoPeriodo: vi.fn(), buscarEvento: vi.fn(), indicadoresDaAgenda: vi.fn(), ausenciasDoPeriodo: vi.fn(),
    feriadosDoPeriodo: vi.fn(), meuGoogle: vi.fn(), conectarGoogle: vi.fn(), concluirGoogle: vi.fn(),
    desconectarGoogle: vi.fn(), salvarEvento: vi.fn(), apagarEvento: vi.fn(), responderConvite: vi.fn(),
    novoIdDeEvento: vi.fn(() => 'novo-1'), buscarAgora: vi.fn(), tentarDeNovo: vi.fn(),
  }
})
vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))
vi.mock('@/data/clientes', () => ({ buscarClientes: vi.fn() }))
vi.mock('@/data/consultorias', () => ({ buscarConsultorias: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const EVENTO = {
  id: 'e1', consultoria_id: 's1', consultor_id: 'p1', cliente_id: 'k1', titulo: 'Kickoff Alfa', descricao: null,
  inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-20T15:00:00-03:00', dia_inteiro: false, cor: 2, com_meet: true,
  gravar: true, meet_link: 'https://meet.google.com/abc-defg-hij', meet_codigo: 'abc-defg-hij', google_evento_id: 'g1',
  reuniao: 'agendada', reuniao_erro: null, gravacao_url: null, pasta_id: null, criado_por: 'p1',
  consultor: { id: 'p1', nome: 'Ana Souza', cor: '#16a34a' }, cliente: { id: 'k1', nome: 'Provedor Alfa' }, participantes: [],
}
const COMPROMISSO = {
  ...EVENTO, id: 'e2', cliente_id: null, cliente: null, titulo: 'Planejamento interno', com_meet: false, meet_link: null,
  inicio: '2026-11-20T09:00:00-03:00', fim: '2026-11-20T10:00:00-03:00',
}
const consultor = { id: 'p1', nome: 'Ana Souza', papel: 'pessoa', consultoria_id: 's1' }
const gestora = { id: 'g1', nome: 'Gabi Rocha', papel: 'gestor', consultoria_id: 's1' }
const central = { id: 'c0', nome: 'Central', papel: 'central', consultoria_id: null }

// O que o banco recebe em cada visão (meia-noite de São Paulo).
const MES = { de: '2026-11-01T00:00:00-03:00', ate: '2026-12-06T00:00:00-03:00' }
const SEMANA = { de: '2026-11-15T00:00:00-03:00', ate: '2026-11-22T00:00:00-03:00' }
const SEMANA_SEGUINTE = { de: '2026-11-22T00:00:00-03:00', ate: '2026-11-29T00:00:00-03:00' }
const AGENDA = { de: '2026-11-17T00:00:00-03:00', ate: '2027-01-16T00:00:00-03:00' }
const pedidosCom = (periodo) => vi.mocked(eventosDoPeriodo).mock.calls.filter(([p]) => p.de === periodo.de && p.ate === periodo.ate)

function Endereco() {
  const { pathname, search } = useLocation()
  return <output data-testid="endereco">{pathname + search}</output>
}

function tela(perfil, endereco = '/calendario') {
  return render(
    <AuthContext.Provider value={{ perfil }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Calendario />
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
  vi.mocked(eventosDoPeriodo).mockResolvedValue({ itens: [EVENTO, COMPROMISSO], haMais: false })
  vi.mocked(ausenciasDoPeriodo).mockResolvedValue({ itens: [], haMais: false })
  vi.mocked(feriadosDoPeriodo).mockResolvedValue(['2026-11-20'])
  vi.mocked(indicadoresDaAgenda).mockResolvedValue({ semana: 3, mes: 9, aguardando: 1, pastas_no_mes: 4 })
  vi.mocked(meuGoogle).mockResolvedValue({ conectado: false, email: null, erro: null })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [
    { id: 'p1', nome: 'Ana Souza', email: 'ana@x.test', consultoria_id: 's1', consultoria_nome: 'STI', capacidade: 100, reservado: 40, ocupacao: 0.4 },
    { id: 'p2', nome: 'Beto Lima', email: 'beto@x.test', consultoria_id: 's1', consultoria_nome: 'STI', capacidade: 100, reservado: 60, ocupacao: 0.6 },
  ], total: 2 })
  vi.mocked(buscarClientes).mockResolvedValue({ itens: [{ id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1' }], total: 1 })
  vi.mocked(buscarConsultorias).mockResolvedValue({ itens: [{ id: 's1', nome: 'STI' }, { id: 's2', nome: 'Outra' }], total: 2 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Calendário: consultor (visão privada)', () => {
  it('lê só o mês visível, sem filtro de consultor nem de consultoria, e o chip tem a cor do evento', async () => {
    tela(consultor)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    const chip = await within(grade).findByRole('button', { name: /Kickoff Alfa/ })
    expect(chip).toHaveStyle({ backgroundColor: '#059669' })
    expect(chip).toHaveAccessibleName(/com Meet/)
    expect(screen.queryByLabelText('Consultor')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cliente')).toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(1)
    expect(eventosDoPeriodo).toHaveBeenCalledWith({ ...MES, consultorId: undefined, consultoriaId: undefined, clienteId: undefined })
    expect(ausenciasDoPeriodo).toHaveBeenCalledWith({ de: '2026-11-01', ate: '2026-12-05', consultorId: undefined, consultoriaId: undefined })
    expect(feriadosDoPeriodo).toHaveBeenCalledWith('2026-11-01', '2026-12-05')
    expect(screen.getByRole('button', { name: 'Novo evento' })).toBeInTheDocument()
  })

  it('mostra os 4 indicadores do banco', async () => {
    tela(consultor)
    const indicadores = await screen.findByRole('region', { name: 'Indicadores da agenda' })
    await waitFor(() => expect(within(indicadores).getByText('Reuniões na semana').parentElement).toHaveTextContent('3'))
    expect(within(indicadores).getByText('Reuniões no mês').parentElement).toHaveTextContent('9')
    expect(within(indicadores).getByText('Aguardando transcrição').parentElement).toHaveTextContent('1')
    expect(within(indicadores).getByText('Pastas criadas no mês').parentElement).toHaveTextContent('4')
    expect(indicadoresDaAgenda).toHaveBeenCalledWith('2026-11-17')
  })

  it('clicar num dia mostra o detalhe dele; os próximos 7 dias vêm do mesmo pedido', async () => {
    const user = userEvent.setup()
    tela(consultor)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await within(grade).findByRole('button', { name: /Kickoff Alfa/ })
    await user.click(within(grade).getByRole('gridcell', { name: /^20 de novembro/ }))
    const detalhe = screen.getByRole('region', { name: 'Detalhe do dia' })
    expect(within(detalhe).getByText('20 de novembro')).toBeInTheDocument()
    expect(within(detalhe).getByText('Consciência Negra')).toBeInTheDocument()
    expect(within(detalhe).getByText('Planejamento interno')).toBeInTheDocument()
    expect(within(detalhe).getByText('14:00 – 15:00')).toBeInTheDocument()
    const proximos = screen.getByRole('region', { name: 'Próximos 7 dias' })
    expect(within(proximos).getByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(1)
  })

  it('Mostrar: tirar as reuniões com cliente esconde os chips sem ler de novo', async () => {
    const user = userEvent.setup()
    tela(consultor)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await within(grade).findByRole('button', { name: /Kickoff Alfa/ })
    await user.click(screen.getByRole('button', { name: /Mostrar: tudo/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Reuniões com cliente' }))
    expect(within(grade).queryByRole('button', { name: /Kickoff Alfa/ })).not.toBeInTheDocument()
    expect(within(grade).getByRole('button', { name: /Planejamento interno/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mostrar: 3 de 4/ })).toBeInTheDocument()
    expect(eventosDoPeriodo).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(within(grade).getByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
  })

  it('dois cliques num dia abrem o Novo evento naquele dia', async () => {
    const user = userEvent.setup()
    tela(consultor)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await user.dblClick(within(grade).getByRole('gridcell', { name: /^24 de novembro/ }))
    const janela = await screen.findByRole('dialog', { name: 'Novo evento' })
    expect(within(janela).getByLabelText('Data')).toHaveTextContent('24 de nov de 2026')
  })

  it('clicar no chip abre o evento preenchido', async () => {
    const user = userEvent.setup()
    tela(consultor)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await user.click(await within(grade).findByRole('button', { name: /Kickoff Alfa/ }))
    const janela = await screen.findByRole('dialog', { name: 'Editar evento' })
    expect(within(janela).getByLabelText('Título')).toHaveValue('Kickoff Alfa')
  })

  it('avisa quando o período tem mais eventos do que o calendário mostra', async () => {
    vi.mocked(eventosDoPeriodo).mockResolvedValue({ itens: [EVENTO], haMais: true })
    tela(consultor)
    expect(await screen.findByText(/mais eventos neste período do que o calendário mostra/)).toBeInTheDocument()
  })
})

describe('Calendário: visões e períodos', () => {
  it('mudar de visão pede ao banco só o novo intervalo', async () => {
    const user = userEvent.setup()
    tela(consultor)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(pedidosCom(MES)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Semana' }))
    await waitFor(() => expect(pedidosCom(SEMANA)).toHaveLength(1))
    expect(screen.getByText('15 a 21 de novembro de 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próximo período' }))
    await waitFor(() => expect(pedidosCom(SEMANA_SEGUINTE)).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Agenda' }))
    await waitFor(() => expect(pedidosCom(AGENDA)).toHaveLength(1))
    expect(screen.getByText('Próximos 60 dias')).toBeInTheDocument()
    // Nenhum intervalo foi pedido duas vezes, e o mês nunca de novo.
    expect(pedidosCom(MES)).toHaveLength(1)
    expect(pedidosCom(SEMANA)).toHaveLength(1)
  })

  it('Hoje volta ao período de hoje e ‹ › andam um mês', async () => {
    const user = userEvent.setup()
    tela(consultor)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await user.click(screen.getByRole('button', { name: 'Período anterior' }))
    expect(await screen.findByRole('grid', { name: 'Calendário de Outubro de 2026' })).toBeInTheDocument()
    await waitFor(() => expect(pedidosCom({ de: '2026-09-27T00:00:00-03:00', ate: '2026-11-01T00:00:00-03:00' })).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })).toBeInTheDocument()
  })

  it('no celular a visão inicial é a Agenda (o mês do Hub não cabe)', async () => {
    celular(true)
    tela(consultor)
    expect(await screen.findByText('Próximos 60 dias')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenCalledWith(expect.objectContaining(AGENDA)))
    expect(pedidosCom(MES)).toHaveLength(0)
    const agenda = screen.getByRole('region', { name: 'Agenda dos próximos 60 dias' })
    expect(await within(agenda).findByRole('button', { name: /Kickoff Alfa/ })).toBeInTheDocument()
  })
})

describe('Calendário: gestão e central', () => {
  it('a gestora filtra por consultor e o pedido ao banco leva o filtro; sem filtro, o chip tem a cor do consultor', async () => {
    const user = userEvent.setup()
    tela(gestora)
    const grade = await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(await within(grade).findByRole('button', { name: /Kickoff Alfa/ })).toHaveStyle({ backgroundColor: '#16a34a' })
    expect(screen.queryByLabelText('Consultoria')).not.toBeInTheDocument()
    await escolherNoSeletor(user, 'Consultor', 'Beto Lima')
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenLastCalledWith({ ...MES, consultorId: 'p2', consultoriaId: undefined, clienteId: undefined }))
    expect(ausenciasDoPeriodo).toHaveBeenLastCalledWith(expect.objectContaining({ consultorId: 'p2' }))
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1' }))
    // Com um consultor só, é a agenda dele: a cor volta a ser a do evento.
    expect(await within(grade).findByRole('button', { name: /Kickoff Alfa/ })).toHaveStyle({ backgroundColor: '#059669' })
  })

  it('o filtro de cliente vai ao banco', async () => {
    const user = userEvent.setup()
    tela(gestora)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    await escolherNoSeletor(user, 'Cliente', 'Provedor Alfa')
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenLastCalledWith(expect.objectContaining({ clienteId: 'k1' })))
    expect(buscarClientes).toHaveBeenCalledWith(expect.objectContaining({ termo: '' }))
  })

  it('a central filtra por consultoria', async () => {
    const user = userEvent.setup()
    tela(central)
    await screen.findByRole('grid', { name: 'Calendário de Novembro de 2026' })
    expect(screen.getByLabelText('Consultor')).toBeInTheDocument()
    await escolherNoSeletor(user, 'Consultoria', 'Outra')
    await waitFor(() => expect(eventosDoPeriodo).toHaveBeenLastCalledWith(expect.objectContaining({ consultoriaId: 's2' })))
  })
})

describe('Calendário: Google da pessoa', () => {
  it('a volta do Google conclui a conexão uma vez, diz o e-mail e tira code e state do endereço', async () => {
    vi.mocked(concluirGoogle).mockResolvedValue({ erro: null, email: 'ana@ixcsoft.com.br' })
    tela(consultor, '/calendario?code=abc&state=xyz')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Google conectado: ana@ixcsoft.com.br'))
    expect(concluirGoogle).toHaveBeenCalledTimes(1)
    expect(concluirGoogle).toHaveBeenCalledWith({ estado: 'xyz', codigo: 'abc', recusou: false })
    expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/calendario$/)
    await waitFor(() => expect(meuGoogle).toHaveBeenCalledTimes(2)) // relê o selo depois de conectar
  })

  it('permissão desmarcada no Google: a tela diz o que faltou', async () => {
    vi.mocked(concluirGoogle).mockResolvedValue({
      erro: 'Faltou autorizar no Google os eventos da agenda. Clique em Conectar Google de novo e marque todas as permissões.',
      faltam: ['https://www.googleapis.com/auth/calendar.events'],
    })
    tela(consultor, '/calendario?code=abc&state=xyz')
    expect(await screen.findByText(/Faltou autorizar no Google os eventos da agenda/)).toBeInTheDocument()
    expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/calendario$/)
  })

  it('recusou no Google: nada a concluir', async () => {
    tela(consultor, '/calendario?error=access_denied&state=xyz')
    expect(await screen.findByText(/Você não autorizou o Google/)).toBeInTheDocument()
    expect(concluirGoogle).not.toHaveBeenCalled()
    expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/calendario$/)
  })

  it('Conectar Google pede a URL; se não der, diz o motivo', async () => {
    const user = userEvent.setup()
    vi.mocked(conectarGoogle).mockResolvedValue({ erro: 'Falta configurar o app do Google na plataforma (veja o README).' })
    tela(consultor)
    await user.click(await screen.findByRole('button', { name: 'Conectar Google' }))
    expect(conectarGoogle).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Falta configurar o app do Google na plataforma (veja o README).')
  })

  it('conectado: selo com o e-mail, e desconectar pede confirmação', async () => {
    const user = userEvent.setup()
    vi.mocked(meuGoogle).mockResolvedValue({ conectado: true, email: 'ana@ixcsoft.com.br', erro: null })
    vi.mocked(desconectarGoogle).mockResolvedValue({ erro: null, revogado: true })
    tela(consultor)
    expect(await screen.findByText('Google conectado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desconectar o Google' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent(/Os eventos que já estão lá continuam/)
    await user.click(within(confirmar).getByRole('button', { name: 'Desconectar' }))
    expect(desconectarGoogle).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Conectar Google' })).toBeInTheDocument()
  })
})
