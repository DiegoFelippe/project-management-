import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { meuCheckinAberto } from '@/data/checkins'
import { checkinsPorSemana, clientesEmRisco, comparacaoDoInicio, filaDeClientes, horasPorCliente, painelDoInicio } from '@/data/painel'
import { avisarQueOCheckinMudou } from '@/lib/checkinMudou'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Inicio from './Inicio'

vi.mock('@/data/painel', () => ({
  painelDoInicio: vi.fn(), comparacaoDoInicio: vi.fn(), filaDeClientes: vi.fn(), clientesEmRisco: vi.fn(), horasPorCliente: vi.fn(),
  checkinsPorSemana: vi.fn(),
}))
vi.mock('@/data/checkins', () => ({ meuCheckinAberto: vi.fn(), fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), tarefasDoCheckin: vi.fn() }))

// Hoje fica fixo em 17/11/2026 (12h em São Paulo).
const MES = '2026-11-01'
const MESES = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']
  .map((mes, i) => ({ mes, realizado: 100 + i * 10, capacidade: 1000, no_periodo: i === 5, parcial: i === 5 }))
const IND = { realizado: 112, ocupacao: 0.65, capacidade: 1480, capacidade_ate_hoje: 900, reservado: 960, clientes_em_atendimento: 12,
  aguardando: 4, a_distribuir: 3, sem_consultor: 1, checkins: null }
const base = { mes: MES, de: MES, ate: '2026-11-30', ate_efetivo: '2026-11-17', intervalo: false, passado: false, capacidade_ate: null,
  horas_por_mes: MESES, indicadores: IND, ranking: [], ranking_resumo: { total: 0, acima: 0, folga: 0, no_meio: 0 } }
const CENTRAL = { ...base, recorte: 'tudo', ranking: [{ id: 'k1', nome: 'Consultoria Exemplo', ocupacao: 1.2, capacidade: 100, reservado: 120, realizado: 50, pessoas: 6 }],
  ranking_resumo: { total: 1, acima: 1, folga: 0, no_meio: 0 } }
const ADMIN = { ...base, recorte: 'consultoria', ranking: [{ id: 'p2', nome: 'Beto Consultor', ocupacao: 0.5, capacidade: 80, reservado: 40, realizado: 20, visivel: true }],
  ranking_resumo: { total: 1, acima: 0, folga: 1, no_meio: 0 } }
const PESSOA = { ...base, recorte: 'pessoa', indicadores: { ...IND, aguardando: 0, a_distribuir: 0, sem_consultor: 0, checkins: 9 } }
const COMPARACAO = { de: '2026-10-01', ate: '2026-10-17', forma: 'mes_parcial',
  indicadores: { realizado: 100, ocupacao: 0.61, clientes_em_atendimento: 10, aguardando: 2, checkins: 8 } }
const FILA = { a_distribuir: { total: 3, media_dias: 4, maior_dias: 9 }, sem_consultor: { total: 1, media_dias: 2, maior_dias: 2 },
  em_atendimento: { total: 12, novos_no_periodo: 2 }, receberam_consultor: 2, espera_media_dias: 3.5, total_esperando: 4,
  pontos: [{ id: 'c1', nome: 'Cliente Novo', situacao: 'a_distribuir', dias: 9, consultoria_nome: null }] }
const RISCO = { itens: [{ id: 'c9', nome: 'Cliente Parado', ultimo_checkin: '2026-10-01', sem_checkin_dias: 47, ritmo: null, horas_30: 0, horas_mes: 20,
  sem_checkin: true, acima_do_ritmo: false, consultor_nome: 'Ana Lima' }], total: 1, sem_checkin: 1, acima_do_ritmo: 0 }
const HORAS = { itens: [{ id: 'c3', nome: 'Cliente Meu', sub: null, horas: 4, previsto: 10 }], resto: { clientes: 0, horas: 0 }, total_horas: 4,
  total_clientes: 1, participacao_3: 1, participacao_10: 1 }
const SEMANAS = { semanas: ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']
  .map((semana, i) => ({ semana, checkins: 5 + i, horas: 10, no_periodo: i >= 4, parcial: i === 7 })), media: 9.5, pico: { semana: '2026-11-09', checkins: 11 } }

const perfil = (papel) => ({ id: 'u1', nome: 'Ana Lima', papel, consultoria: papel === 'central' ? null : { nome: 'Consultoria Exemplo' } })
const regioes = () => [...document.querySelectorAll('[data-bloco] > section')].map((s) => s.querySelector('h2').textContent)
const ultimaChamada = () => vi.mocked(painelDoInicio).mock.calls.at(-1)[0]

function responder(painel) {
  vi.mocked(painelDoInicio).mockResolvedValue(painel)
  vi.mocked(comparacaoDoInicio).mockResolvedValue(COMPARACAO)
  vi.mocked(filaDeClientes).mockResolvedValue(FILA)
  vi.mocked(clientesEmRisco).mockResolvedValue(RISCO)
  vi.mocked(horasPorCliente).mockResolvedValue(HORAS)
  vi.mocked(checkinsPorSemana).mockResolvedValue(SEMANAS)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T15:00:00Z'))
  vi.mocked(meuCheckinAberto).mockResolvedValue(null)
  return () => vi.useRealTimers()
})

describe('Início (gráficos)', () => {
  it('barra → cartões → gráficos', async () => {
    responder(ADMIN)
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(screen.getByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument()
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do mês')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Realizado')).toBe('112 h'))
    expect(cartoes.nextElementSibling.querySelector('[data-bloco="meses"]')).not.toBeNull()
  })

  it('central: blocos na ordem meses, fila, ocupação por consultoria, risco, horas por cliente, semanas', async () => {
    responder(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    await screen.findByRole('region', { name: 'Ocupação por consultoria' })
    expect(regioes()).toEqual(['Realizado × capacidade por mês', 'Fila de clientes', 'Ocupação por consultoria', 'Clientes em risco',
      'Horas por cliente (10 maiores)', 'Check-ins por semana'])
    const cartoes = screen.getByRole('region', { name: 'Indicadores do mês' })
    expect(within(cartoes).getByText('Aguardando (consultoria ou consultor)')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Fila de clientes' })).getByRole('group', { name: /Aguardando consultoria: 3 clientes/ })).toBeInTheDocument()
    expect(document.querySelector('[data-bloco="meses"]')).toHaveClass('lg:col-span-12', 'xl:col-span-8')
    expect(document.querySelector('[data-bloco="fila"]')).toHaveClass('lg:col-span-12', 'xl:col-span-4')
    expect(document.querySelector('[data-bloco="risco"]')).toHaveClass('lg:col-span-6')
  })

  it('gestão: fila sem "Aguardando consultoria" e "Ocupação por consultor"', async () => {
    responder(ADMIN)
    vi.mocked(filaDeClientes).mockResolvedValue({ ...FILA, a_distribuir: null, pontos: [] })
    renderizarTela(<Inicio />, { perfil: perfil('gestor') })
    const fila = await screen.findByRole('region', { name: 'Fila de clientes' })
    await within(fila).findByRole('list', { name: 'Etapas da fila hoje' })
    expect(within(fila).queryByText('Aguardando consultoria')).toBeNull()
    expect(screen.getByRole('region', { name: 'Ocupação por consultor' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Indicadores do mês' })).getByText('Aguardando consultor')).toBeInTheDocument()
  })

  it('consultor: meses, "Meus clientes em risco", "Horas nos meus clientes" com "Fazer check-in em Cliente Meu", semanas, e nenhuma chamada à fila', async () => {
    responder(PESSOA)
    renderizarTela(<Inicio />, { perfil: perfil('pessoa') })
    expect(await screen.findByRole('button', { name: 'Fazer check-in em Cliente Meu' })).toBeEnabled()
    expect(regioes()).toEqual(['Realizado × capacidade por mês', 'Meus clientes em risco', 'Horas nos meus clientes', 'Check-ins por semana'])
    expect(document.querySelector('[data-bloco="risco"]')).toHaveClass('xl:col-span-4')
    const cartoes = screen.getByRole('region', { name: 'Indicadores do mês' })
    expect(numeroDoCartao(cartoes, 'Check-ins')).toBe('9')
    expect(within(cartoes).getByText('Minha ocupação')).toBeInTheDocument()
    expect(filaDeClientes).not.toHaveBeenCalled()
    expect(meuCheckinAberto).toHaveBeenCalledWith('u1')
  })

  it('check-in feito ou fechado em outra parte do app (o selo da barra de cima) relê o check-in aberto e o painel (auditoria, G2)', async () => {
    responder(PESSOA)
    renderizarTela(<Inicio />, { perfil: perfil('pessoa') })
    expect(await screen.findByRole('button', { name: 'Fazer check-in em Cliente Meu' })).toBeEnabled()
    const leituras = vi.mocked(meuCheckinAberto).mock.calls.length
    vi.mocked(meuCheckinAberto).mockResolvedValue({ id: 'a1', cliente_id: 'c3', inicio: new Date().toISOString(), cliente: { nome: 'Cliente Meu' } })
    act(() => { avisarQueOCheckinMudou() })
    expect(await screen.findByRole('button', { name: /^Fazer check-out de Cliente Meu/ })).toBeInTheDocument()
    expect(meuCheckinAberto).toHaveBeenCalledTimes(leituras + 1)
    expect(painelDoInicio).toHaveBeenCalledTimes(2)
  })

  it('trocar o período chama de novo painel, comparação, fila, horas e semanas, e não o risco', async () => {
    responder(ADMIN)
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    await screen.findByRole('list', { name: 'Clientes em risco' })
    await waitFor(() => expect(horasPorCliente).toHaveBeenCalledTimes(1))
    for (const f of [painelDoInicio, comparacaoDoInicio, filaDeClientes, checkinsPorSemana]) expect(f).toHaveBeenCalledWith(MES)
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    for (const f of [painelDoInicio, comparacaoDoInicio, filaDeClientes, checkinsPorSemana]) {
      await waitFor(() => expect(f).toHaveBeenLastCalledWith('2026-10-01'))
    }
    await waitFor(() => expect(horasPorCliente).toHaveBeenLastCalledWith('2026-10-01'))
    expect(clientesEmRisco).toHaveBeenCalledTimes(1)
  })

  it('a variação aparece quando a comparação chega ("▲ 12%" e "vs 1–17 de out."), "—" antes, e some se ela falhar', async () => {
    responder(ADMIN)
    let chegar
    vi.mocked(comparacaoDoInicio).mockReturnValue(new Promise((r) => { chegar = r }))
    const { unmount } = renderizarTela(<Inicio />, { perfil: perfil('admin') })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do mês')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Realizado')).toBe('112 h'))
    const linha = () => cartoes.querySelector('[data-cartao="realizado"] [data-variacao]')
    expect(linha()).toHaveTextContent('—')
    chegar(COMPARACAO)
    await waitFor(() => expect(linha()).toHaveTextContent('▲ 12%'))
    expect(linha()).toHaveTextContent('vs 1–17 de out.')
    unmount()

    vi.mocked(comparacaoDoInicio).mockRejectedValue(new Error('x'))
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    const deNovo = await cartoesAbaixoDaBarra('Indicadores do mês')
    await waitFor(() => expect(numeroDoCartao(deNovo, 'Realizado')).toBe('112 h'))
    await waitFor(() => expect(deNovo.querySelector('[data-variacao]')).toBeNull())
  })

  it('Mês futuro (comparação vazia): os números sem a linha de variação', async () => {
    responder({ ...ADMIN, mes: '2026-12-01' })
    vi.mocked(comparacaoDoInicio).mockResolvedValue({ de: null, ate: null, forma: null, indicadores: null })
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=mes&mes=2026-12-01' })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do mês')
    await waitFor(() => expect(comparacaoDoInicio).toHaveBeenCalledWith('2026-12-01'))
    await waitFor(() => expect(cartoes.querySelector('[data-variacao]')).toBeNull())
  })

  it('um bloco com erro mostra "Tentar de novo" e os outros seguem', async () => {
    responder(ADMIN)
    vi.mocked(checkinsPorSemana).mockRejectedValueOnce(new Error('x')).mockResolvedValue(SEMANAS)
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    const semanas = await screen.findByRole('region', { name: 'Check-ins por semana' })
    expect(await within(semanas).findByRole('alert')).toHaveTextContent('Não foi possível carregar os check-ins por semana.')
    expect(await screen.findByRole('region', { name: 'Ocupação por consultor' })).toBeInTheDocument()
    expect(numeroDoCartao(screen.getByRole('region', { name: 'Indicadores do mês' }), 'Realizado')).toBe('112 h')
    await userEvent.click(within(semanas).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(semanas).findByRole('group', { name: 'Check-ins por semana' })).toBeInTheDocument()
    expect(checkinsPorSemana).toHaveBeenCalledTimes(2)
    expect(painelDoInicio).toHaveBeenCalledTimes(1)
  })

  it('período inválido não chama nenhuma função', async () => {
    responder(ADMIN)
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-11-01&ate=2026-12-05' })
    expect(await screen.findByRole('alert')).toHaveTextContent('O período vai no máximo até o fim do mês atual.')
    expect(screen.getByText('Ajuste as datas na barra de filtros para ver o painel.')).toBeInTheDocument()
    for (const f of [painelDoInicio, comparacaoDoInicio, filaDeClientes, clientesEmRisco, horasPorCliente, checkinsPorSemana, meuCheckinAberto]) {
      expect(f).not.toHaveBeenCalled()
    }
    expect(screen.queryByRole('region', { name: /Indicadores/ })).toBeNull()
  })

  it('o banco recusa o período: mostra a frase dele, em português, no lugar dos gráficos', async () => {
    responder(ADMIN)
    vi.mocked(painelDoInicio).mockRejectedValue({ code: '22023', message: 'periodo_invalido', details: 'O período pode ter no máximo 2 anos.' })
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-31' })
    expect(await screen.findByText('O período pode ter no máximo 2 anos.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Realizado × capacidade por mês' })).toBeNull()
  })
})

// Filtro por período (pedido do Diego, 17/11): Mês (padrão, com a navegação do mês), Últimos 30 e 90 dias, Este ano e
// Personalizado (De e Até).
describe('Início (período)', () => {
  beforeEach(() => responder(ADMIN))

  it('a barra começa em Filtros, com Período = Mês e a navegação do mês', async () => {
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    const barra = screen.getByText('Filtros').closest('.card')
    expect(within(barra).getByLabelText('Período')).toHaveTextContent('Mês')
    expect(within(barra).getByRole('group', { name: 'Mês' })).toHaveTextContent('Novembro de 2026')
    await waitFor(() => expect(painelDoInicio).toHaveBeenCalledWith('2026-11-01'))
  })

  it.each([
    ['Últimos 30 dias', '2026-10-19', '19/10/2026 a 17/11/2026'],
    ['Últimos 90 dias', '2026-08-20', '20/08/2026 a 17/11/2026'],
    ['Este ano', '2026-01-01', '01/01/2026 a 17/11/2026'],
  ])('%s: pede ao banco de %s até hoje, mostra as datas e tira a navegação do mês', async (rotulo, de, texto) => {
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    await escolherNoSeletor(user, 'Período', rotulo)
    await waitFor(() => expect(ultimaChamada()).toEqual({ de, ate: '2026-11-17' }))
    const barra = screen.getByText('Filtros').closest('.card')
    expect(within(barra).getByText(texto)).toBeInTheDocument()
    expect(within(barra).queryByRole('button', { name: 'Mês anterior' })).not.toBeInTheDocument()
  })

  it('Personalizado: De e Até começam no período mostrado e mudar uma data pede o período novo', async () => {
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=mes&mes=2026-10-01' })
    await escolherNoSeletor(user, 'Período', 'Personalizado')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-10-01', ate: '2026-10-31' }))
    expect(screen.getByLabelText('De')).toHaveTextContent('1 de out de 2026')
    expect(screen.getByLabelText('Até')).toHaveTextContent('31 de out de 2026')
    await escolherData(user, 'De', '2026-09-16')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-09-16', ate: '2026-10-31' }))
  })

  it('Personalizado: mais de 2 anos avisa em português e não pede ao banco', async () => {
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-31' })
    await waitFor(() => expect(painelDoInicio).toHaveBeenCalledTimes(1))
    await escolherData(user, 'De', '2024-10-01')
    expect(await screen.findByRole('alert')).toHaveTextContent('O período pode ter no máximo 2 anos.')
    expect(painelDoInicio).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: /Indicadores/ })).not.toBeInTheDocument()
  })

  it('o período vem do endereço e volta para ele', async () => {
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ultimos-90' })
    expect(screen.getByLabelText('Período')).toHaveTextContent('Últimos 90 dias')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-08-20', ate: '2026-11-17' }))
    await escolherNoSeletor(user, 'Período', 'Mês')
    await waitFor(() => expect(ultimaChamada()).toBe('2026-11-01'))
    expect(screen.getByRole('group', { name: 'Mês' })).toHaveTextContent('Novembro de 2026')
  })

  it('no período, os cartões dizem "período" e mostram utilização; os blocos também', async () => {
    responder({ ...ADMIN, intervalo: true, passado: true, de: '2026-10-19', ate: '2026-11-17', indicadores: { ...IND, reservado: null, ocupacao: 0.4 } })
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ultimos-30' })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do período')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Utilização')).toBe('40%'))
    expect(await screen.findByRole('region', { name: 'Utilização por consultor' })).toBeInTheDocument()
    expect(screen.queryByText(/reservado/i)).not.toBeInTheDocument()
  })

  it('no período, os cartões carregam com o rótulo do período ("—")', async () => {
    vi.mocked(painelDoInicio).mockReturnValue(new Promise(() => {}))
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ano' })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do período')
    expect(numeroDoCartao(cartoes, 'Utilização')).toBe('—')
  })

  it('largura: a grade usa minmax(0,1fr) (nada estoura a 360 px) e a barra quebra linha', async () => {
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-31' })
    await screen.findByRole('region', { name: 'Realizado × capacidade por mês' })
    const grade = document.querySelector('[data-bloco]').parentElement
    expect(grade.className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(grade.className).toContain('lg:grid-cols-12')
    const barra = screen.getByText('Filtros').closest('.card')
    expect(barra).toHaveClass('flex-wrap')
    expect(barra.innerHTML).not.toMatch(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/)
  })
})
