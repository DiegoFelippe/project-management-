import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarEvento, novoIdDeEvento, pessoasParaConvidar, responderConvite, salvarEvento } from '@/data/agenda'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { buscarClientes } from '@/data/clientes'
import { escolherData, escolherHora, escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import JanelaEvento from './JanelaEvento'

vi.mock('@/data/agenda', () => ({
  salvarEvento: vi.fn(), apagarEvento: vi.fn(), responderConvite: vi.fn(), novoIdDeEvento: vi.fn(),
  buscarAgora: vi.fn(), tentarDeNovo: vi.fn(), pessoasParaConvidar: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))
vi.mock('@/data/clientes', () => ({ buscarClientes: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const EVENTO = {
  id: 'e1', consultoria_id: 's1', consultor_id: 'p1', cliente_id: 'k1', titulo: 'Kickoff Alfa', descricao: 'Pauta do kickoff',
  inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-20T15:00:00-03:00', dia_inteiro: false, cor: 2, com_meet: true,
  gravar: true, meet_link: 'https://meet.google.com/abc-defg-hij', meet_codigo: 'abc-defg-hij', google_evento_id: 'g1',
  reuniao: 'agendada', reuniao_erro: null, gravacao_url: null, pasta_id: 'pa1', criado_por: 'p1',
  consultor: { id: 'p1', nome: 'Ana Souza', cor: '#16a34a' }, cliente: { id: 'k1', nome: 'Provedor Alfa' },
  participantes: [
    { id: 'pt1', perfil_id: 'p2', email: null, resposta: 'confirmou', nome: 'Beto Lima' },
    { id: 'pt2', perfil_id: null, email: 'carla@alfa.com.br', resposta: 'pendente', nome: null },
  ],
}
const consultora = { id: 'p1', nome: 'Ana Souza', papel: 'pessoa', consultoria_id: 's1' }
const colega = { id: 'p2', nome: 'Beto Lima', papel: 'pessoa', consultoria_id: 's1' }
const gestora = { id: 'g1', nome: 'Gabi Rocha', papel: 'gestor', consultoria_id: 's1' }
const GOOGLE = { conectado: true, email: 'ana@ixcsoft.com.br', erro: null }

function janela({ perfil = gestora, evento = EVENTO, dia = '2026-11-20', google = GOOGLE, ...props } = {}) {
  const funcoes = { aoFechar: vi.fn(), aoSalvo: vi.fn(), aoApagado: vi.fn(), aoMudar: vi.fn(), aoConectarGoogle: vi.fn() }
  renderizarTela(<JanelaEvento aberto evento={evento} diaInicial={dia} perfil={perfil} google={google} {...funcoes} {...props} />, { perfil })
  return funcoes
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T15:00:00Z'))
  vi.mocked(novoIdDeEvento).mockReturnValue('novo-1')
  vi.mocked(salvarEvento).mockResolvedValue({ erro: null, evento: EVENTO, aviso: null })
  vi.mocked(apagarEvento).mockResolvedValue({ erro: null, aviso: null })
  vi.mocked(responderConvite).mockResolvedValue({ erro: null, resposta: 'confirmou' })
  vi.mocked(buscarClientes).mockResolvedValue({ itens: [
    { id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1', contato_nome: 'Carla Dias', contato_email: 'carla@alfa.com.br' },
    { id: 'k2', nome: 'Provedor Beta', consultoria_id: 's1', contato_nome: null, contato_email: null },
  ], total: 2 })
  vi.mocked(pessoasParaConvidar).mockResolvedValue({ itens: [
    { id: 'p1', nome: 'Ana Souza', cor: '#16a34a' }, { id: 'p2', nome: 'Beto Lima', cor: null }, { id: 'p3', nome: 'Caio Melo', cor: null },
  ], total: 3 })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [
    { id: 'p1', nome: 'Ana Souza', email: 'ana@x.test', consultoria_id: 's1', consultoria_nome: 'STI' },
    { id: 'p2', nome: 'Beto Lima', email: 'beto@x.test', consultoria_id: 's1', consultoria_nome: 'STI' },
    { id: 'p3', nome: 'Caio Melo', email: 'caio@x.test', consultoria_id: 's1', consultoria_nome: 'STI' },
  ], total: 3 })
})
afterEach(() => vi.useRealTimers())

describe('JanelaEvento: editar', () => {
  it('Editar abre a janela com o evento preenchido; consultor e Meet ficam só para leitura', async () => {
    janela()
    const dialogo = screen.getByRole('dialog', { name: 'Editar evento' })
    expect(within(dialogo).getByLabelText('Título')).toHaveValue('Kickoff Alfa')
    expect(within(dialogo).getByLabelText('Descrição')).toHaveValue('Pauta do kickoff')
    expect(within(dialogo).getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    expect(within(dialogo).getByLabelText('Data')).toHaveTextContent('20 de nov de 2026')
    expect(within(dialogo).getByLabelText('Das')).toHaveTextContent('14:00')
    expect(within(dialogo).getByLabelText('Até')).toHaveTextContent('15:00')
    const participantes = within(dialogo).getByRole('list', { name: 'Participantes' })
    expect(within(participantes).getByText('Beto Lima')).toBeInTheDocument()
    expect(within(participantes).getByText('Confirmou')).toBeInTheDocument()
    const deFora = within(dialogo).getByRole('list', { name: 'Convidados de fora' })
    expect(within(deFora).getByText('carla@alfa.com.br')).toBeInTheDocument()
    // A resposta de quem é de fora não volta do Google: a lista diz só que o convite saiu.
    expect(within(deFora).getByText('Convite enviado')).toBeInTheDocument()
    expect(within(deFora).queryByText('Pendente')).not.toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Consultor')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Consultor')).toHaveTextContent('Ana Souza')
    expect(within(dialogo).getByRole('switch', { name: 'Google Meet' })).toBeDisabled()
    expect(within(dialogo).getByRole('switch', { name: 'Google Meet' })).toBeChecked()
    expect(within(dialogo).getByRole('radio', { name: 'Verde' })).toBeChecked()
    expect(within(dialogo).getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
  })

  it('Salvar manda o que mudou com o mesmo id e sem mudar o consultor', async () => {
    const user = userEvent.setup()
    const { aoSalvo } = janela()
    const titulo = screen.getByLabelText('Título')
    await user.clear(titulo)
    await user.type(titulo, 'Kickoff Alfa (2ª parte)')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledTimes(1))
    const dados = vi.mocked(salvarEvento).mock.calls[0][0]
    expect(dados).toMatchObject({
      id: 'e1', titulo: 'Kickoff Alfa (2ª parte)', cliente_id: 'k1', inicio: '2026-11-20T14:00:00-03:00',
      fim: '2026-11-20T15:00:00-03:00', dia_inteiro: false, cor: 2, com_meet: true, gravar: true,
      participantes: ['p2'], convidados: ['carla@alfa.com.br'],
    })
    expect(dados).not.toHaveProperty('novo')
    expect(dados).not.toHaveProperty('consultor_id')
    expect(novoIdDeEvento).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Alterações salvas.')
    expect(aoSalvo).toHaveBeenCalled()
  })

  it('convidado de fora: "Convite enviado" só quando o convite saiu pelo Google; o recém-adicionado não tem selo', async () => {
    const user = userEvent.setup()
    janela({ evento: { ...EVENTO, google_evento_id: null } })
    const soNoApp = screen.getByRole('list', { name: 'Convidados de fora' })
    expect(within(soNoApp).getByText('carla@alfa.com.br')).toBeInTheDocument()
    expect(within(soNoApp).queryByText(/Convite enviado|Pendente/)).not.toBeInTheDocument()
    cleanup()

    janela()
    await user.type(screen.getByLabelText('E-mail do convidado de fora'), 'novo@alfa.com.br{Enter}')
    const item = within(screen.getByRole('list', { name: 'Convidados de fora' })).getByText('novo@alfa.com.br').closest('li')
    expect(item).not.toHaveTextContent(/Convite enviado|Pendente|Novo/)
  })

  it('com a pasta da reunião criada, o cliente fica só para leitura', () => {
    janela()
    expect(screen.getByLabelText('Cliente')).toBeDisabled()
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    expect(screen.getByText('A pasta da reunião já está neste cliente.')).toBeInTheDocument()
    cleanup()
    janela({ evento: { ...EVENTO, pasta_id: null } })
    expect(screen.getByLabelText('Cliente')).toBeEnabled()
    expect(screen.queryByText('A pasta da reunião já está neste cliente.')).not.toBeInTheDocument()
  })

  it('aviso de "fica só no app" vira aviso na tela (o Google é de outra pessoa: sem botão)', async () => {
    const user = userEvent.setup()
    vi.mocked(salvarEvento).mockResolvedValue({ erro: null, evento: EVENTO, aviso: 'Fica só no app: Ana Souza não conectou o Google.' })
    janela()
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Fica só no app: Ana Souza não conectou o Google.'))
  })

  // Usabilidade, U9: quem organiza é quem conecta o Google; o aviso leva ao "Conectar Google" de sempre.
  it('"Fica só no app" do meu evento traz "Conectar Google" no aviso, pelo mesmo caminho do Calendário', async () => {
    const user = userEvent.setup()
    vi.mocked(salvarEvento).mockResolvedValue({ erro: null, evento: EVENTO, aviso: 'Fica só no app: Ana Souza não conectou o Google.' })
    const { aoConectarGoogle } = janela({ perfil: consultora, google: { conectado: false, email: null, erro: null } })
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Fica só no app: Ana Souza não conectou o Google.', expect.objectContaining({
      action: expect.objectContaining({ label: 'Conectar Google' }),
    })))
    vi.mocked(toast.warning).mock.calls[0][1].action.onClick()
    expect(aoConectarGoogle).toHaveBeenCalledTimes(1)
  })

  it('"pede para reconectar" traz "Reconectar Google"; acesso desativado não traz botão', async () => {
    const user = userEvent.setup()
    vi.mocked(salvarEvento).mockResolvedValueOnce({ erro: null, evento: EVENTO, aviso: 'Fica só no app: o Google de Ana Souza pede para reconectar.' })
    janela({ perfil: consultora })
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast.warning).mock.calls[0][1].action.label).toBe('Reconectar Google')
    cleanup()
    vi.mocked(salvarEvento).mockResolvedValueOnce({ erro: null, evento: EVENTO, aviso: 'Fica só no app: o acesso de Ana Souza está desativado.' })
    janela({ perfil: consultora })
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(2))
    expect(vi.mocked(toast.warning).mock.calls[1]).toEqual(['Fica só no app: o acesso de Ana Souza está desativado.'])
  })

  it('um evento de dia inteiro abre com a chave "Dia inteiro" ligada e sem Das e Até', () => {
    janela({ evento: { ...EVENTO, dia_inteiro: true, inicio: '2026-11-20T00:00:00-03:00', fim: '2026-11-21T00:00:00-03:00' } })
    expect(screen.getByRole('switch', { name: 'Dia inteiro' })).toBeChecked()
    expect(screen.queryByLabelText('Das')).toBeNull()
    expect(screen.queryByLabelText('Até')).toBeNull()
  })

  it('fechar com algo mudado pergunta antes de descartar (usabilidade, U4)', async () => {
    const user = userEvent.setup()
    const { aoFechar } = janela()
    await user.type(screen.getByLabelText('Título'), ' 2')
    await user.keyboard('{Escape}')
    expect(aoFechar).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alertdialog', { name: 'Descartar o que você digitou?' })).getByRole('button', { name: 'Descartar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })
})

describe('JanelaEvento: novo', () => {
  // Usabilidade, U9: a chave "Dia inteiro" é explícita e começa desligada; sem horário, o erro aponta a hora.
  it('"Dia inteiro" começa desligada; sem título e sem horário, os dois erros aparecem juntos, cada um no seu campo', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    expect(screen.getByRole('switch', { name: 'Dia inteiro' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    expect(salvarEvento).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Título')).toHaveAccessibleDescription('Escreva o título do evento.')
    expect(screen.getByLabelText('Das')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Das')).toHaveAccessibleDescription(/Escolha o horário de início ou ligue "Dia inteiro"\./)
    expect(screen.getByLabelText('Título')).toHaveFocus()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ligar "Dia inteiro" tira Das e Até, a prévia diz "dia inteiro" e o evento vai como dia inteiro', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    expect(screen.getByText(/· escolha o horário$/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Título'), 'Imersão')
    await user.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    expect(screen.queryByLabelText('Das')).toBeNull()
    expect(screen.queryByLabelText('Até')).toBeNull()
    expect(screen.getByText(/· dia inteiro$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({
      inicio: '2026-11-20T00:00:00-03:00', fim: '2026-11-21T00:00:00-03:00', dia_inteiro: true,
    })))
  })

  it('com horário, a chave fica desligada e o evento vai com a hora', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    await user.type(screen.getByLabelText('Título'), 'Reunião')
    await escolherHora(user, 'Das', '14:00')
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({
      inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-20T15:00:00-03:00', dia_inteiro: false,
    })))
  })

  it('o id nasce uma vez por janela; o botão trava enquanto grava e tentar de novo usa o mesmo id', async () => {
    const user = userEvent.setup()
    let responder
    vi.mocked(salvarEvento).mockImplementationOnce(() => new Promise((pronto) => { responder = pronto }))
    janela({ perfil: consultora, evento: null })
    expect(screen.getByRole('dialog', { name: 'Novo evento' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Título'), 'Alinhamento')
    // Sem horário, só com a chave "Dia inteiro" ligada (usabilidade, U9).
    await user.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    const gravando = screen.getByRole('button', { name: 'Criando…' })
    expect(gravando).toBeDisabled()
    await user.click(gravando)
    expect(salvarEvento).toHaveBeenCalledTimes(1)
    responder({ erro: 'O Google não respondeu. Tente de novo.' })
    expect(await screen.findByText('O Google não respondeu. Tente de novo.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledTimes(2))
    const [primeiro, segundo] = vi.mocked(salvarEvento).mock.calls.map(([d]) => d)
    expect(primeiro).toMatchObject({
      id: 'novo-1', novo: true, titulo: 'Alinhamento', inicio: '2026-11-20T00:00:00-03:00', fim: '2026-11-21T00:00:00-03:00',
      dia_inteiro: true, cliente_id: null, com_meet: false, gravar: false, convidados: [], participantes: [],
    })
    expect(segundo.id).toBe('novo-1')
    expect(novoIdDeEvento).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Evento criado.')
  })

  it('termina em outro dia sem o horário do fim: a tela pede o horário e não grava uma hora só', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    await user.type(screen.getByLabelText('Título'), 'Imersão')
    await escolherHora(user, 'Das', '14:00')
    await user.click(screen.getByRole('button', { name: 'Termina em outro dia' }))
    await escolherData(user, 'Termina em', '2026-11-22')
    expect(screen.getByText(/até Dom, 22 de nov\. · 14:00$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    // O erro fica embaixo do campo Até (usabilidade, U2), que recebe o foco.
    expect(screen.getByLabelText('Até')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Até')).toHaveAccessibleDescription(/Escolha o horário em que termina\./)
    expect(screen.getByLabelText('Até')).toHaveFocus()
    expect(salvarEvento).not.toHaveBeenCalled()
    await escolherHora(user, 'Até', '10:00')
    // Mexeu no Quando: o erro do horário some.
    expect(screen.getByLabelText('Até')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Escolha o horário em que termina.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({
      inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-22T10:00:00-03:00', dia_inteiro: false,
    })))
  })

  it('escolher o cliente sugere o contato dele como convidado e liga o Meet com a gravação', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    await escolherNoSeletor(user, 'Cliente', 'Provedor Alfa')
    expect(buscarClientes).toHaveBeenCalledWith(expect.objectContaining({ ativos: true, consultoriaId: 's1' }))
    const sugestao = screen.getByRole('group', { name: 'Sugestão de convidado' })
    expect(sugestao).toHaveTextContent('Carla Dias')
    expect(sugestao).toHaveTextContent('carla@alfa.com.br')
    expect(screen.getByRole('switch', { name: 'Google Meet' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Gravar e transcrever' })).toBeChecked()
    expect(screen.getByText(/precisa de Google Workspace com gravação/)).toBeInTheDocument()
    await user.click(within(sugestao).getByRole('button', { name: 'Convidar' }))
    expect(within(screen.getByRole('list', { name: 'Convidados de fora' })).getByText('carla@alfa.com.br')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Sugestão de convidado' })).not.toBeInTheDocument()
  })

  it('a prévia é o chip do calendário: o tipo (compromisso sem cliente, reunião com cliente) e a cor na bolinha (auditoria, M2)', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    const previa = screen.getByText('Como aparece no calendário').parentElement
    const bolinha = () => previa.querySelector('[data-bolinha]')
    expect(bolinha().parentElement).toHaveClass('bg-evento-compromisso')
    expect(bolinha().parentElement).toHaveTextContent('Título do evento')
    expect(bolinha()).toHaveStyle({ backgroundColor: '#2563eb' })
    await user.click(within(screen.getByRole('radiogroup', { name: 'Cor do evento' })).getByRole('radio', { name: 'Verde' }))
    expect(bolinha()).toHaveStyle({ backgroundColor: '#047857' })
    await escolherNoSeletor(user, 'Cliente', 'Provedor Alfa')
    expect(bolinha().parentElement).toHaveClass('bg-evento-reuniao')
    expect(within(previa).queryByRole('button')).not.toBeInTheDocument()
  })

  it('atalhos do Quando (Hoje, Amanhã, Semana que vem): 44 px e 8 px entre eles no toque; texto azul firme (auditoria, G5)', () => {
    janela({ perfil: consultora, evento: null })
    const atalhos = screen.getByRole('group', { name: 'Atalhos da data' })
    expect(atalhos.className).toContain('pointer-coarse:gap-2')
    const botoes = within(atalhos).getAllByRole('button')
    expect(botoes.map((b) => b.textContent)).toEqual(['Hoje', 'Amanhã', 'Semana que vem'])
    for (const b of botoes) expect(b.className).toContain('pointer-coarse:min-h-11')
    const solto = botoes.find((b) => b.getAttribute('aria-pressed') === 'false')
    expect(solto).toHaveClass('text-primary-texto')
    expect(solto).not.toHaveClass('text-primary')
  })

  it('o meu Google pede para reconectar: sem Meet e com o botão Reconectar Google', async () => {
    const user = userEvent.setup()
    const { aoConectarGoogle } = janela({
      perfil: consultora, evento: null, google: { ...GOOGLE, erro: 'O Google não aceita mais esta conexão. Reconecte o Google.' },
    })
    await escolherNoSeletor(user, 'Cliente', 'Provedor Alfa')
    expect(screen.getByRole('switch', { name: 'Google Meet' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Google Meet' })).not.toBeChecked()
    expect(screen.getByText('Reconecte o Google para a reunião ter Meet.')).toBeInTheDocument()
    expect(screen.queryByText('Vai para o seu Google Agenda, com os convidados.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reconectar Google' }))
    expect(aoConectarGoogle).toHaveBeenCalled()
  })

  it('o 21º convidado de fora é recusado na tela; e-mail inválido também', async () => {
    const user = userEvent.setup()
    const vinte = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, perfil_id: null, email: `pessoa${i}@fora.test`, resposta: 'pendente', nome: null }))
    janela({ evento: { ...EVENTO, participantes: vinte } })
    const campo = screen.getByLabelText('E-mail do convidado de fora')
    await user.type(campo, 'nao-e-email')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByText('Confira o e-mail do convidado.')).toBeInTheDocument()
    await user.clear(campo)
    await user.type(campo, 'vinte-e-um@fora.test{Enter}')
    expect(screen.getByText('No máximo 20 convidados de fora por evento.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Convidados de fora' })).getAllByRole('listitem')).toHaveLength(20)
    expect(salvarEvento).not.toHaveBeenCalled()
  })

  it('o consultor busca colegas da consultoria (pela função do banco) e convida; ele mesmo não aparece', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null })
    await user.click(screen.getByLabelText('Convidar consultor'))
    const opcoes = () => screen.getAllByRole('option').map((o) => o.querySelector('span > span')?.textContent)
    await waitFor(() => expect(opcoes()).toEqual(['Beto Lima', 'Caio Melo']))
    expect(pessoasParaConvidar).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1', termo: '' }))
    await user.click(screen.getAllByRole('option').find((o) => o.textContent.endsWith('Beto Lima')))
    const lista = screen.getByRole('list', { name: 'Participantes' })
    expect(within(lista).getByText('Beto Lima')).toBeInTheDocument()
    expect(within(lista).getByText('Novo')).toBeInTheDocument()
    // Quem já está na lista sai das opções.
    await user.click(screen.getByLabelText('Convidar consultor'))
    await waitFor(() => expect(opcoes()).toEqual(['Caio Melo']))
    await user.keyboard('{Escape}')
    await user.type(screen.getByLabelText('Título'), 'Alinhamento do time')
    await user.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({ participantes: ['p2'] })))
  })

  it('a gestora escolhe de quem é a agenda e convida consultores da consultoria', async () => {
    const user = userEvent.setup()
    janela({ evento: null })
    expect(screen.getByLabelText('Consultor')).toHaveTextContent('Gabi Rocha')
    await escolherNoSeletor(user, 'Consultor', 'Ana Souza')
    await escolherNoSeletor(user, 'Convidar consultor', 'Caio Melo')
    expect(within(screen.getByRole('list', { name: 'Participantes' })).getByText('Caio Melo')).toBeInTheDocument()
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1' }))
    expect(pessoasParaConvidar).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1', termo: '' }))
    await user.type(screen.getByLabelText('Título'), 'Revisão')
    await user.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({ consultor_id: 'p1', participantes: ['p3'] })))
  })
})

describe('JanelaEvento: novo na agenda do cliente', () => {
  const DA_AGENDA = { id: 'k1', nome: 'Provedor Alfa', consultoria_id: 's1', contato_nome: 'Carla Dias', contato_email: 'carla@alfa.com.br' }
  const central = { id: 'c0', nome: 'Central', papel: 'central', consultoria_id: null }

  it('o cliente vem escolhido e travado, com a legenda; nasce com Meet e gravação e sugere o contato', async () => {
    const user = userEvent.setup()
    janela({ perfil: consultora, evento: null, clienteDaAgenda: DA_AGENDA })
    const cliente = screen.getByLabelText('Cliente')
    expect(cliente).toBeDisabled()
    expect(cliente).toHaveTextContent('Provedor Alfa')
    expect(screen.getByText('Novo evento na agenda deste cliente. Para outro cliente, use o Calendário do menu.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Google Meet' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Gravar e transcrever' })).toBeChecked()
    expect(screen.getByRole('group', { name: 'Sugestão de convidado' })).toHaveTextContent('carla@alfa.com.br')
    await user.type(screen.getByLabelText('Título'), 'Kickoff')
    await user.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({
      novo: true, consultor_id: 'p1', cliente_id: 'k1', com_meet: true, gravar: true,
    })))
  })

  it('sem o meu Google, o cliente travado não liga o Meet', () => {
    janela({ perfil: consultora, evento: null, clienteDaAgenda: DA_AGENDA, google: { conectado: false, email: null, erro: null } })
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    expect(screen.getByRole('switch', { name: 'Google Meet' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Google Meet' })).toBeDisabled()
  })

  it('a central escolhe o consultor só da consultoria do cliente, e o cliente não sai', async () => {
    const user = userEvent.setup()
    janela({ perfil: central, evento: null, google: null, clienteDaAgenda: DA_AGENDA })
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    await escolherNoSeletor(user, 'Consultor', 'Beto Lima')
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1' }))
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    expect(screen.getByLabelText('Cliente')).toBeDisabled()
    await user.type(screen.getByLabelText('Título'), 'Revisão')
    await user.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))
    await waitFor(() => expect(salvarEvento).toHaveBeenCalledWith(expect.objectContaining({ consultor_id: 'p2', cliente_id: 'k1' })))
  })

  it('editar um evento aberto na agenda do cliente segue o menu: o cliente não fica travado', () => {
    janela({ evento: { ...EVENTO, pasta_id: null }, clienteDaAgenda: DA_AGENDA })
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Provedor Alfa')
    expect(screen.getByLabelText('Cliente')).not.toBeDisabled()
    expect(screen.queryByText(/Novo evento na agenda deste cliente/)).not.toBeInTheDocument()
  })
})

describe('JanelaEvento: só leitura e convite', () => {
  it('quem não edita vê o evento só para leitura; o participante confirma ou recusa', async () => {
    const user = userEvent.setup()
    janela({ perfil: colega })
    const dialogo = screen.getByRole('dialog', { name: 'Kickoff Alfa' })
    expect(within(dialogo).queryByLabelText('Título')).not.toBeInTheDocument()
    expect(within(dialogo).getByText('Só quem organiza e a gestão da consultoria editam.')).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: /Salvar|Apagar/ })).not.toBeInTheDocument()
    expect(within(dialogo).getByText('Sua resposta: Confirmou')).toBeInTheDocument()
    const deFora = within(dialogo).getByRole('list', { name: 'Convidados de fora' })
    expect(within(deFora).getByText('Convite enviado')).toBeInTheDocument()
    expect(within(deFora).queryByText('Pendente')).not.toBeInTheDocument()
    vi.mocked(responderConvite).mockResolvedValue({ erro: null, resposta: 'recusou' })
    await user.click(within(dialogo).getByRole('button', { name: 'Recusar' }))
    expect(responderConvite).toHaveBeenCalledWith('e1', 'recusou')
    expect(await within(dialogo).findByText('Sua resposta: Recusou')).toBeInTheDocument()
  })

  it('o participante com a resposta pendente vê Confirmar e Recusar', async () => {
    const user = userEvent.setup()
    vi.mocked(responderConvite).mockResolvedValue({ erro: null, resposta: 'confirmou' })
    const pendente = { ...EVENTO, participantes: [{ ...EVENTO.participantes[0], resposta: 'pendente' }] }
    const { aoMudar } = janela({ perfil: colega, evento: pendente })
    expect(screen.getByText('Sua resposta: Pendente')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(responderConvite).toHaveBeenCalledWith('e1', 'confirmou')
    expect(await screen.findByText('Sua resposta: Confirmou')).toBeInTheDocument()
    expect(aoMudar).toHaveBeenCalled()
  })
})

describe('JanelaEvento: apagar', () => {
  it('pede confirmação dizendo o que acontece no Google e que a pasta fica; o aviso vira toast', async () => {
    const user = userEvent.setup()
    vi.mocked(apagarEvento).mockResolvedValue({ erro: null, aviso: 'Saiu só do app: Ana Souza não conectou o Google. O evento pode continuar no Google Agenda de Ana Souza.' })
    const { aoApagado } = janela()
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    const confirmar = screen.getByRole('alertdialog')
    expect(confirmar).toHaveTextContent('Apagar o evento Kickoff Alfa?')
    expect(confirmar).toHaveTextContent(/cancelado no Google Agenda de Ana Souza/)
    expect(confirmar).toHaveTextContent(/os convidados recebem o cancelamento/)
    expect(confirmar).toHaveTextContent(/A pasta da reunião fica nos Arquivos do cliente/)
    expect(confirmar).toHaveTextContent(/pode continuar na agenda/)
    await user.click(within(confirmar).getByRole('button', { name: 'Apagar evento' }))
    expect(apagarEvento).toHaveBeenCalledWith('e1')
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/^Saiu só do app/)))
    expect(aoApagado).toHaveBeenCalled()
  })

  it('erro ao apagar fica na confirmação', async () => {
    const user = userEvent.setup()
    vi.mocked(apagarEvento).mockResolvedValue({ erro: 'O Google recusou. Tente de novo.' })
    const { aoApagado } = janela()
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar evento' }))
    expect(await within(screen.getByRole('alertdialog')).findByText('O Google recusou. Tente de novo.')).toBeInTheDocument()
    expect(aoApagado).not.toHaveBeenCalled()
  })
})
