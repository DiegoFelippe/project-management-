import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { painelDoInicio } from '@/data/painel'
import { deslocarMes, mesAtual } from '@/lib/mes'
import { escolherData, escolherNoSeletor } from '@/test/campos'
import { cartoesAbaixoDaBarra, numeroDoCartao } from '@/test/cartoes'
import { renderizarTela } from '@/test/renderizar'
import Inicio from './Inicio'

vi.mock('@/data/painel', () => ({ painelDoInicio: vi.fn() }))

const MES = mesAtual()
const meses = Array.from({ length: 6 }, (_, i) => ({ mes: `2026-0${i + 6}-01`, realizado: i * 10 }))
const base = {
  mes: MES, passado: false, horas_por_mes: meses, previsao_atual: 120, ranking: [], esperando: [],
  extremos: { acima: [], folga: [] }, meus_clientes: [],
  indicadores: { clientes_ativos: 12, clientes_novos: 3, aguardando: 4, a_distribuir: 3, sem_consultor: 1, capacidade: 200, reservado: 120, realizado: 80, ocupacao: 0.6 },
}
const CENTRAL = {
  ...base, recorte: 'tudo',
  ranking: [{ id: 'k1', nome: 'Consultoria Exemplo', ocupacao: 1.2, capacidade: 100 }],
  esperando: [{ id: 'c1', nome: 'Cliente Novo', desde: new Date(Date.now() - 9 * 86_400_000).toISOString(), situacao: 'a_distribuir', consultoria_nome: null }],
  extremos: { acima: [{ id: 'p1', nome: 'Ana Acima', ocupacao: 1.3, capacidade: 100, consultoria_nome: 'Consultoria Exemplo', visivel: true }], folga: [] },
}
const ADMIN = {
  ...base, recorte: 'consultoria', indicadores: { ...base.indicadores, a_distribuir: 0, aguardando: 1, sem_consultor: 1 },
  ranking: [{ id: 'p2', nome: 'Beto Consultor', ocupacao: 0.5, capacidade: 80 }],
  esperando: [{ id: 'c2', nome: 'Cliente Sem Consultor', desde: '2026-11-02T12:00:00Z', situacao: 'sem_consultor', consultoria_nome: 'Consultoria Exemplo' }],
}
const PESSOA = {
  ...base, recorte: 'pessoa', meus_clientes: [{ id: 'c3', nome: 'Cliente Meu', previsto: 10, realizado: 4 }],
  indicadores: { ...base.indicadores, aguardando: 0, a_distribuir: 0, sem_consultor: 0 },
}
const perfil = (papel) => ({ id: 'u1', nome: 'Ana Lima', papel, consultoria: papel === 'central' ? null : { nome: 'Consultoria Exemplo' } })

beforeEach(() => vi.clearAllMocks())

describe('Início (painel)', () => {
  it('central: ranking de consultorias, fila a distribuir e extremos', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    expect(screen.getByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Ocupação por consultoria' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', `/consultorias?aba=ocupacao&mes=${MES}`)
    expect(screen.getByText(/3 a distribuir/)).toBeInTheDocument()
    const fila = screen.getByRole('table', { name: 'Clientes esperando' })
    expect(within(fila).getByRole('link', { name: 'Cliente Novo' })).toHaveAttribute('href', '/clientes/c1')
    expect(within(fila).getByText('A distribuir')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ana Acima/ })).toHaveAttribute('href', `/usuarios?pessoa=p1&mes=${MES}`)
    expect(screen.getByText('Ocupação', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Seus projetos vão aparecer aqui')).not.toBeInTheDocument()
  })

  it('o mês fica dentro da barra Filtros', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    const barra = screen.getByText('Filtros').parentElement
    expect(within(barra).getByRole('button', { name: 'Mês anterior' })).toBeInTheDocument()
  })

  it('os números do mês ficam logo abaixo da barra, com "—" enquanto o painel carrega', async () => {
    vi.mocked(painelDoInicio).mockReturnValue(new Promise(() => {}))
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do mês')
    expect(numeroDoCartao(cartoes, 'Clientes ativos')).toBe('—')
    expect(numeroDoCartao(cartoes, 'Ocupação')).toBe('—')
    expect(screen.getByText('Carregando o painel…')).toBeInTheDocument()
  })

  it('com o painel, os cartões trazem os números do banco (e a cor de alerta quando passa de 100%)', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...ADMIN, indicadores: { ...ADMIN.indicadores, ocupacao: 1.25 } })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do mês')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Clientes ativos')).toBe('12'))
    expect(numeroDoCartao(cartoes, 'Aguardando consultor')).toBe('1')
    expect(numeroDoCartao(cartoes, 'Ocupação')).toBe('125%')
    expect(numeroDoCartao(cartoes, 'Realizado')).toBe('80 h')
    expect(within(cartoes).getByText('125%')).toHaveClass('text-destructive')
  })

  it('administrador: ranking de consultores e sem "a distribuir"', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByRole('region', { name: 'Ocupação por consultor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', `/usuarios?mes=${MES}`)
    expect(screen.queryByText(/a distribuir/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cliente Sem Consultor' })).toHaveAttribute('href', '/clientes/c2')
  })

  it('consultor: meus clientes e sem ranking', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(PESSOA)
    renderizarTela(<Inicio />, { perfil: perfil('pessoa') })
    const tabela = await screen.findByRole('table', { name: 'Meus clientes' })
    expect(within(tabela).getByRole('link', { name: 'Cliente Meu' })).toHaveAttribute('href', '/clientes/c3')
    expect(screen.queryByRole('region', { name: /Ocupação por/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Clientes esperando há mais tempo' })).not.toBeInTheDocument()
    expect(screen.getByText('Meus clientes', { selector: 'p' })).toBeInTheDocument()
  })

  it('vazio: frases curtas em vez dos blocos', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...ADMIN, esperando: [], ranking: [] })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByText('Nenhum cliente esperando. Tudo distribuído.')).toBeInTheDocument()
  })

  it('mês passado: Utilização e nada de reservado ou previsto', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...PESSOA, passado: true })
    renderizarTela(<Inicio />, { perfil: perfil('pessoa') })
    const tabela = await screen.findByRole('table', { name: 'Meus clientes' })
    expect(screen.getByText('Utilização', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/reservado/i)).not.toBeInTheDocument()
    expect(within(tabela).queryByText('Previsto')).not.toBeInTheDocument()
    expect(within(tabela).getByText('Realizado')).toBeInTheDocument()
  })

  it('mês passado: clientes ativos, aguardando e a fila são rotulados como de hoje', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...CENTRAL, passado: true })
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    expect(await screen.findByText('Clientes ativos hoje')).toBeInTheDocument()
    expect(screen.getByText('Aguardando consultor hoje')).toBeInTheDocument()
    expect(screen.getByText('Situação de hoje, não do mês.')).toBeInTheDocument()
  })
  it('mês atual: sem o rótulo "hoje"', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    expect(await screen.findByText('Clientes ativos')).toBeInTheDocument()
    expect(screen.queryByText(/Situação de hoje/)).not.toBeInTheDocument()
  })
  it('trocar de mês limpa o erro e mostra o carregando', async () => {
    vi.mocked(painelDoInicio).mockRejectedValueOnce(new Error('x')).mockReturnValueOnce(new Promise(() => {}))
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Carregando o painel…')).toBeInTheDocument()
  })
  it('os nomes levam o mês do painel e só abrem a pessoa quando ela é visível', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...ADMIN, ranking: [{ ...ADMIN.ranking[0], visivel: false }],
      extremos: { acima: [{ id: 'p9', nome: 'Caio Cheio', ocupacao: 1.4, capacidade: 100, consultoria_nome: 'X', visivel: true }], folga: [] } })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByRole('link', { name: /Caio Cheio/ })).toHaveAttribute('href', `/usuarios?pessoa=p9&mes=${MES}`)
    expect(screen.queryByRole('link', { name: 'Beto Consultor' })).not.toBeInTheDocument()
  })
  it('trocar de mês chama o painel uma vez com o mês novo', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    await screen.findByRole('region', { name: 'Horas por mês' })
    expect(painelDoInicio).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(painelDoInicio).toHaveBeenCalledTimes(2))
    expect(vi.mocked(painelDoInicio).mock.calls[1][0]).toBe(deslocarMes(MES, -1))
  })

  it('resposta velha não sobrescreve a do mês novo', async () => {
    let soltarVelha
    vi.mocked(painelDoInicio)
      .mockImplementationOnce(() => new Promise((r) => { soltarVelha = r }))
      .mockResolvedValueOnce({ ...ADMIN, mes: '2026-10-01', indicadores: { ...ADMIN.indicadores, clientes_ativos: 77 } })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByText('77')).toBeInTheDocument()
    soltarVelha({ ...ADMIN, indicadores: { ...ADMIN.indicadores, clientes_ativos: 11 } })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('11')).not.toBeInTheDocument()
    expect(screen.getByText('77')).toBeInTheDocument()
  })

  it('erro: um aviso e a saudação continua', async () => {
    vi.mocked(painelDoInicio).mockRejectedValue(new Error('x'))
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o painel')
    expect(screen.getByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument()
  })

  it('mês passado (administrador): Utilização, capacidade sem reservado, ranking e extremos em utilização', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...ADMIN, passado: true,
      extremos: { acima: [{ id: 'p9', nome: 'Caio Cheio', ocupacao: 1.4, capacidade: 100, consultoria_nome: 'X' }], folga: [] } })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByText('Utilização', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText(/Capacidade 200 h/)).toBeInTheDocument()
    expect(screen.queryByText(/reservado/i)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Beto Consultor: 50% de utilização' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Acima de 100% de utilização' })).toBeInTheDocument()
  })

  it('erro ao trocar de mês: some o painel do mês anterior e fica só o aviso', async () => {
    vi.mocked(painelDoInicio).mockResolvedValueOnce(ADMIN).mockRejectedValueOnce(new Error('x'))
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    await screen.findByRole('region', { name: 'Horas por mês' })
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Horas por mês' })).not.toBeInTheDocument()
    expect(screen.queryByText('Clientes ativos')).not.toBeInTheDocument()
  })

  it('fila: situação e há quanto tempo; consultoria só para a central', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...CENTRAL, esperando: [{ ...CENTRAL.esperando[0], consultoria_nome: 'Consultoria Exemplo' }] })
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    const fila = await screen.findByRole('table', { name: 'Clientes esperando' })
    expect(within(fila).getByText('há 9 dias')).toBeInTheDocument()
    expect(within(fila).getByText('Consultoria Exemplo')).toBeInTheDocument()
    expect(within(fila).queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
  })

  it('largura: as grades usam minmax(0,1fr) para um bloco largo não estourar a tela; a tabela rola no cartão', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    const { container } = renderizarTela(<Inicio />, { perfil: perfil('central') })
    const fila = await screen.findByRole('table', { name: 'Clientes esperando' })
    for (const grade of [container.querySelector('section'), screen.getByRole('region', { name: 'Horas por mês' }).parentElement]) {
      expect(grade.className).toContain('grid-cols-[minmax(0,1fr)]')
    }
    expect(fila.parentElement).toHaveClass('overflow-x-auto')
    expect(screen.getByRole('region', { name: 'Horas por mês' })).toHaveClass('min-w-0')
  })

  it('"há N dias" conta dias do calendário de São Paulo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-16T15:00:00Z')) // 12h em SP
    vi.mocked(painelDoInicio).mockResolvedValue({ ...CENTRAL, esperando: [
      { ...CENTRAL.esperando[0], id: 'a', nome: 'Ontem 23h', desde: '2026-11-16T02:00:00Z' }, // 15/11 23h em SP
      { ...CENTRAL.esperando[0], id: 'b', nome: 'Hoje cedo', desde: '2026-11-16T10:00:00Z' },
    ] })
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    const fila = await screen.findByRole('table', { name: 'Clientes esperando' })
    vi.useRealTimers()
    expect(within(fila.querySelectorAll('tbody tr')[0]).getByText('há 1 dia')).toBeInTheDocument()
    expect(within(fila.querySelectorAll('tbody tr')[1]).getByText('hoje')).toBeInTheDocument()
  })
})

// Filtro por período (pedido do Diego, 17/11): Mês (padrão, com a navegação do mês), Últimos 30 e 90 dias, Este ano e
// Personalizado (De e Até). Hoje fica fixo em 17/11/2026 (12h em São Paulo).
describe('Início (período)', () => {
  const PERIODO = { ...ADMIN, intervalo: true, passado: true, mes: '2026-11-01', de: '2026-10-19', ate: '2026-11-17', previsao_atual: null,
    indicadores: { ...ADMIN.indicadores, reservado: null, ocupacao: 0.4 } }
  const ultimaChamada = () => vi.mocked(painelDoInicio).mock.calls.at(-1)[0]
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T15:00:00Z'))
    return () => vi.useRealTimers()
  })

  it('a barra começa em Filtros, com Período = Mês e a navegação do mês', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
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
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    await escolherNoSeletor(user, 'Período', rotulo)
    await waitFor(() => expect(ultimaChamada()).toEqual({ de, ate: '2026-11-17' }))
    const barra = screen.getByText('Filtros').closest('.card')
    expect(within(barra).getByText(texto)).toBeInTheDocument()
    expect(within(barra).queryByRole('button', { name: 'Mês anterior' })).not.toBeInTheDocument()
  })

  it('Personalizado: De e Até começam no período mostrado e mudar uma data pede o período novo', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=mes&mes=2026-10-01' })
    await escolherNoSeletor(user, 'Período', 'Personalizado')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-10-01', ate: '2026-10-31' }))
    expect(screen.getByLabelText('De')).toHaveTextContent('1 de out de 2026')
    expect(screen.getByLabelText('Até')).toHaveTextContent('31 de out de 2026')
    await escolherData(user, 'De', '2026-09-16')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-09-16', ate: '2026-10-31' }))
  })

  it('Personalizado: De depois do Até leva o Até junto (um dia só)', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-15' })
    await escolherData(user, 'De', '2026-10-20')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-10-20', ate: '2026-10-20' }))
  })

  it('Personalizado: mais de 2 anos avisa em português e não pede ao banco', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-31' })
    await waitFor(() => expect(painelDoInicio).toHaveBeenCalledTimes(1))
    await escolherData(user, 'De', '2024-10-01')
    expect(await screen.findByRole('alert')).toHaveTextContent('O período pode ter no máximo 2 anos.')
    expect(painelDoInicio).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: /Indicadores/ })).not.toBeInTheDocument()
  })

  it('Personalizado: o Até não passa do fim do mês atual (o calendário trava e o endereço avisa)', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-11-01&ate=2026-12-05' })
    expect(await screen.findByRole('alert')).toHaveTextContent('O período vai no máximo até o fim do mês atual.')
    expect(painelDoInicio).not.toHaveBeenCalled()
    await user.click(screen.getByLabelText('Até'))
    const calendario = await screen.findByRole('dialog', { name: 'Escolher data' })
    expect(within(calendario).getByRole('button', { name: '1 de dezembro de 2026' })).toBeDisabled()
    await user.click(within(calendario).getByRole('button', { name: 'Mês anterior' }))
    expect(within(calendario).getByRole('button', { name: '30 de novembro de 2026' })).toBeEnabled()
  })

  it('o período vem do endereço e volta para ele', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ultimos-90' })
    expect(screen.getByLabelText('Período')).toHaveTextContent('Últimos 90 dias')
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-08-20', ate: '2026-11-17' }))
    await escolherNoSeletor(user, 'Período', 'Mês')
    await waitFor(() => expect(ultimaChamada()).toBe('2026-11-01'))
    expect(screen.getByRole('group', { name: 'Mês' })).toHaveTextContent('Novembro de 2026')
  })

  it('de Personalizado para Mês: o mês do fim do período', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    const user = userEvent.setup()
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-09-16&ate=2026-10-15' })
    await waitFor(() => expect(ultimaChamada()).toEqual({ de: '2026-09-16', ate: '2026-10-15' }))
    await escolherNoSeletor(user, 'Período', 'Mês')
    await waitFor(() => expect(ultimaChamada()).toBe('2026-10-01'))
    expect(screen.getByRole('group', { name: 'Mês' })).toHaveTextContent('Outubro de 2026')
  })

  it('no período, os cartões e os blocos dizem "período" e mostram utilização, sem reservado', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(PERIODO)
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ultimos-30' })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do período')
    await waitFor(() => expect(numeroDoCartao(cartoes, 'Utilização')).toBe('40%'))
    expect(within(cartoes).getByText('3 novos no período')).toBeInTheDocument()
    expect(within(cartoes).getByText('Clientes ativos hoje')).toBeInTheDocument()
    expect(screen.queryByText(/reservado/i)).not.toBeInTheDocument()
    expect(screen.getByText('Situação de hoje, não do período.')).toBeInTheDocument()
    expect(screen.queryByText(/previsão atual/)).not.toBeInTheDocument()
  })

  it('o banco recusa o período: mostra a frase dele, em português, no lugar do aviso genérico', async () => {
    vi.mocked(painelDoInicio).mockRejectedValue({ code: '22023', message: 'periodo_invalido', details: 'O período pode ter no máximo 2 anos.' })
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-31' })
    expect(await screen.findByRole('alert')).toHaveTextContent('O período pode ter no máximo 2 anos.')
    expect(screen.queryByText(/Não foi possível carregar o painel/)).not.toBeInTheDocument()
  })

  it('período que passa de hoje: a capacidade diz "até hoje"', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...PERIODO, de: '2026-11-01', ate: '2026-11-30', capacidade_ate: '2026-11-17' })
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-11-01&ate=2026-11-30' })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do período')
    expect(await within(cartoes).findByText('Capacidade 200 h até hoje')).toBeInTheDocument()
  })

  it('no período, o ranking fala de utilização', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(PERIODO)
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ultimos-30' })
    expect(await screen.findByRole('region', { name: 'Utilização por consultor' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ocupação por consultor' })).not.toBeInTheDocument()
  })

  it('no período, os cartões carregam com o rótulo do período ("—")', async () => {
    vi.mocked(painelDoInicio).mockReturnValue(new Promise(() => {}))
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=ano' })
    const cartoes = await cartoesAbaixoDaBarra('Indicadores do período')
    expect(numeroDoCartao(cartoes, 'Utilização')).toBe('—')
  })

  it('consultor no período: meus clientes no período, sem previsto', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...PESSOA, intervalo: true, passado: true, previsao_atual: null })
    renderizarTela(<Inicio />, { perfil: perfil('pessoa'), endereco: '/?periodo=ultimos-30' })
    const tabela = await screen.findByRole('table', { name: 'Meus clientes' })
    expect(screen.getByRole('heading', { name: 'Meus clientes no período' })).toBeInTheDocument()
    expect(within(tabela).queryByText('Previsto')).not.toBeInTheDocument()
  })

  it('a 360 px a barra quebra linha (nada de largura fixa que role para o lado)', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    renderizarTela(<Inicio />, { perfil: perfil('admin'), endereco: '/?periodo=personalizado&de=2026-10-01&ate=2026-10-31' })
    const barra = screen.getByText('Filtros').closest('.card')
    expect(barra).toHaveClass('flex-wrap')
    expect(barra.innerHTML).not.toMatch(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/)
  })
})
