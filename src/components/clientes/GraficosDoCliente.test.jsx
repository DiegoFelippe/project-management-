import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkinsPorSemana, horasPorConsultor, horasPorDia, horasPorMes } from '@/data/clientes'
import GraficosDoCliente from './GraficosDoCliente'

vi.mock('@/data/clientes', () => ({ horasPorDia: vi.fn(), horasPorMes: vi.fn(), horasPorConsultor: vi.fn(), checkinsPorSemana: vi.fn() }))

// Quinta, 19/11/2026, em São Paulo.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-19T12:00:00-03:00') }))
afterEach(() => vi.useRealTimers())

const CLIENTE = { id: 'k1', horas_mes: 30, criado_em: '2025-09-10T15:00:00Z' }
const NOVEMBRO = { tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' }
const OUTUBRO = { tipo: 'mes', mes: '2026-10-01', de: '2026-10-01', ate: '2026-10-31' }
const ULTIMOS_30 = { tipo: 'ultimos-30', de: '2026-10-21', ate: '2026-11-19' }
const ESTE_ANO = { tipo: 'ano', de: '2026-01-01', ate: '2026-11-19' }
const dias = (de, n, porDia = () => 1) => {
  let acumulado = 0
  const inicio = Date.parse(`${de}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => {
    const horas = porDia(i)
    acumulado += horas
    return { dia: new Date(inicio + i * 86_400_000).toISOString().slice(0, 10), horas, acumulado }
  })
}
const DIAS_NOVEMBRO = { mes: '2026-11-01', dias: dias('2026-11-01', 19), realizado: 19, previsao: 30, projecao: 30, dias_no_mes: 30 }
const DIAS_OUTUBRO = { mes: '2026-10-01', dias: dias('2026-10-01', 31, (i) => (i < 28 ? 1 : 0)), realizado: 28, previsao: 30, projecao: null, dias_no_mes: 31 }
// Últimos 30 dias: 2 h em dias alternados (15 dias com horas).
const DIAS_30 = {
  de: '2026-10-21', ate: '2026-11-19', ate_efetivo: '2026-11-19', dias: dias('2026-10-21', 30, (i) => (i % 2 ? 0 : 2)),
  realizado: 30, previsao: 29.5, previsao_mes: 30,
}
const MESES = [
  { mes: '2026-06-01', realizado: 0 }, { mes: '2026-07-01', realizado: 12 }, { mes: '2026-08-01', realizado: 32 },
  { mes: '2026-09-01', realizado: 20 }, { mes: '2026-10-01', realizado: 28 }, { mes: '2026-11-01', realizado: 19 },
]
const CONSULTORES = [{ consultorId: 'p1', nome: 'Ana Lima', horas: 15 }, { consultorId: 'p2', nome: null, horas: 4 }]
const SEMANAS = [
  { semana: '2026-10-26', quantidade: 1, horas: 1 }, { semana: '2026-11-02', quantidade: 5, horas: 5 },
  { semana: '2026-11-09', quantidade: 5, horas: 5 }, { semana: '2026-11-16', quantidade: 3, horas: 3 },
  { semana: '2026-11-23', quantidade: 0, horas: 0 }, { semana: '2026-11-30', quantidade: 0, horas: 0 },
]
const ETAPAS = [
  { id: 'e1', nome: 'Diagnóstico', tarefas: 10, feitas: 8, nao_se_aplica: 0, atrasadas: 0 },
  { id: 'e2', nome: 'Financeiro', tarefas: 18, feitas: 4, nao_se_aplica: 1, atrasadas: 3 },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(horasPorDia).mockImplementation(async (_id, periodo) => (periodo?.de ? DIAS_30 : periodo === '2026-10-01' ? DIAS_OUTUBRO : DIAS_NOVEMBRO))
  // Mais de 6 meses: os n meses até novembro de 2026, 10 h cada.
  vi.mocked(horasPorMes).mockImplementation(async (_id, _ate, meses) => (meses > 6
    ? Array.from({ length: meses }, (_, i) => ({ mes: new Date(Date.UTC(2026, 10 - (meses - 1 - i), 1)).toISOString().slice(0, 10), realizado: 10 }))
    : MESES))
  vi.mocked(horasPorConsultor).mockResolvedValue(CONSULTORES)
  vi.mocked(checkinsPorSemana).mockResolvedValue(SEMANAS)
})

const cartao = (inicio) => screen.getByRole('region', { name: new RegExp(`^${inicio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
const tela = (props = {}) => render(<GraficosDoCliente cliente={CLIENTE} periodo={NOVEMBRO} {...props} />)

describe('GraficosDoCliente', () => {
  it('a seção "No período" com os gráficos, cada título com o período (o check-list diz que é de hoje)', async () => {
    tela({ etapas: ETAPAS })
    const secao = screen.getByRole('region', { name: 'No período' })
    await screen.findByRole('list', { name: 'Horas por consultor · Novembro de 2026' })
    for (const nome of ['Horas × previsão · Novembro de 2026', 'Horas por consultor · Novembro de 2026', 'Últimos 6 meses · até nov/26',
      'Check-ins por semana · Novembro de 2026', 'Andamento do check-list por etapa · hoje']) {
      expect(within(secao).getByRole('region', { name: nome })).toBeInTheDocument()
    }
    // A navegação do mês fica na barra de filtros da página, não aqui.
    expect(within(secao).queryByRole('group', { name: 'Mês' })).toBeNull()
    expect(horasPorDia).toHaveBeenCalledWith('k1', '2026-11-01')
    expect(horasPorMes).toHaveBeenCalledWith('k1', '2026-11-01', 6)
    expect(horasPorConsultor).toHaveBeenCalledWith('k1', '2026-11-01')
    expect(checkinsPorSemana).toHaveBeenCalledWith('k1', '2026-11-01')
  })

  it('leitura do burn-up no mês atual (projeção) e num mês passado (fechou com)', async () => {
    const { rerender } = tela()
    let burnup = cartao('Horas × previsão')
    await waitFor(() => expect(burnup).toHaveTextContent('No ritmo atual, fecha o mês com ≈ 30 h (100% da previsão)'))
    expect(within(burnup).getByRole('list', { name: 'Legenda' })).toHaveTextContent('Projeção')
    expect(within(burnup).getByRole('group', { name: /Horas acumuladas · Novembro de 2026: 19 h de 30 h/ })).toBeInTheDocument()
    expect(burnup.querySelector('[data-serie="1"]')).not.toBeNull() // a projeção tracejada
    expect(burnup.querySelector('[data-referencia-horizontal]')).not.toBeNull() // a previsão
    expect(within(burnup).getByText('Previsão 30 h')).toBeInTheDocument()

    rerender(<GraficosDoCliente cliente={CLIENTE} periodo={OUTUBRO} />)
    await waitFor(() => expect(cartao('Horas × previsão · Outubro de 2026')).toHaveTextContent('Fechou o mês com 28 h (93% da previsão atual)'))
    burnup = cartao('Horas × previsão')
    expect(within(burnup).getByRole('list', { name: 'Legenda' })).not.toHaveTextContent('Projeção')
    expect(burnup.querySelector('[data-serie="1"]')).toBeNull()
  })

  it('no começo do mês (sem projeção do banco) só o que já foi feito', async () => {
    vi.mocked(horasPorDia).mockResolvedValue({ ...DIAS_NOVEMBRO, dias: dias('2026-11-01', 4), realizado: 4, projecao: null })
    tela()
    await waitFor(() => expect(cartao('Horas × previsão')).toHaveTextContent('4 h até agora'))
  })

  it('num período (Últimos 30 dias): as funções do período, o burn-up contra a previsão proporcional e sem projeção', async () => {
    tela({ periodo: ULTIMOS_30 })
    const burnup = await waitFor(() => {
      const regiao = cartao('Horas × previsão · Últimos 30 dias')
      expect(regiao).toHaveTextContent('No período: 30 h de 29,5 h previstas (102%)')
      return regiao
    })
    expect(horasPorDia).toHaveBeenCalledWith('k1', { de: '2026-10-21', ate: '2026-11-19' })
    expect(horasPorConsultor).toHaveBeenCalledWith('k1', { de: '2026-10-21', ate: '2026-11-19' })
    expect(checkinsPorSemana).toHaveBeenCalledWith('k1', { de: '2026-10-21', ate: '2026-11-19' })
    expect(horasPorMes).toHaveBeenCalledWith('k1', '2026-11-01', 6)
    expect(within(burnup).getByRole('list', { name: 'Legenda' })).toHaveTextContent('Previsão do período (proporcional)')
    expect(within(burnup).getByRole('list', { name: 'Legenda' })).not.toHaveTextContent('Projeção')
    expect(burnup.querySelector('[data-serie="1"]')).toBeNull()
    expect(within(burnup).getByText('Previsão 29,5 h')).toBeInTheDocument()
    // Os outros gráficos dizem o período, no título e na frase.
    expect(await screen.findByRole('list', { name: 'Horas por consultor · Últimos 30 dias' })).toBeInTheDocument()
    expect(cartao('Horas por consultor')).toHaveTextContent('Ana Lima fez 79% das horas no período')
    await waitFor(() => expect(cartao('Check-ins por semana · Últimos 30 dias')).toHaveTextContent('14 check-ins no período · 1 h em média'))
    // Os meses: os que o período toca (out e nov) cheios, os outros esmaecidos, com "Fora do período" na legenda.
    const meses = cartao('Horas por mês · Últimos 30 dias')
    await waitFor(() => expect(meses.querySelectorAll('[data-coluna]')).toHaveLength(5))
    expect([...meses.querySelectorAll('[data-coluna]')].map((c) => c.getAttribute('fill-opacity'))).toEqual(['0.42', '0.42', '0.42', null, null])
    expect(within(meses).getByRole('list', { name: 'Legenda' })).toHaveTextContent('Fora do período')
  })

  it('"Ver em tabela" do período: só os dias com horas, com a data inteira e o período no nome', async () => {
    const usuario = userEvent.setup()
    tela({ periodo: ULTIMOS_30 })
    const burnup = await waitFor(() => {
      const regiao = cartao('Horas × previsão')
      expect(regiao).toHaveTextContent('No período')
      return regiao
    })
    await usuario.click(within(burnup).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(burnup).getByRole('table', { name: 'Horas por dia · Últimos 30 dias' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(16) // cabeçalho + 15 dias com horas
    expect(within(tabela).getAllByRole('row')[1]).toHaveTextContent('21/10/20262 h2 h')
  })

  it('Este ano: os meses que o período cobre (mais de 6), até o mês do fim', async () => {
    tela({ periodo: ESTE_ANO })
    await waitFor(() => expect(horasPorMes).toHaveBeenCalledWith('k1', '2026-11-01', 11))
    const meses = await waitFor(() => {
      const regiao = cartao('Horas por mês · Este ano')
      expect(regiao.querySelectorAll('[data-coluna]')).toHaveLength(11)
      return regiao
    })
    expect(meses.querySelector('[data-coluna][fill-opacity]')).toBeNull() // todos no período
    expect(cartao('Horas × previsão · Este ano')).toBeInTheDocument()
  })

  it('trocar o período chama de novo por dia, por consultor, os meses e as semanas', async () => {
    const { rerender } = tela()
    await screen.findByRole('list', { name: 'Horas por consultor · Novembro de 2026' })
    rerender(<GraficosDoCliente cliente={CLIENTE} periodo={OUTUBRO} />)
    await waitFor(() => expect(horasPorDia).toHaveBeenLastCalledWith('k1', '2026-10-01'))
    expect(horasPorMes).toHaveBeenLastCalledWith('k1', '2026-10-01', 6)
    expect(horasPorConsultor).toHaveBeenLastCalledWith('k1', '2026-10-01')
    expect(checkinsPorSemana).toHaveBeenLastCalledWith('k1', '2026-10-01')
    expect(await screen.findByRole('list', { name: 'Horas por consultor · Outubro de 2026' })).toBeInTheDocument()
  })

  it('horas por consultor: barras, leitura e "outro consultor" para quem a pessoa não vê', async () => {
    tela()
    const lista = await screen.findByRole('list', { name: 'Horas por consultor · Novembro de 2026' })
    expect(within(lista).getAllByRole('img').map((b) => b.getAttribute('aria-label'))).toEqual(['Ana Lima: 15 h', 'outro consultor: 4 h'])
    expect(cartao('Horas por consultor')).toHaveTextContent('Ana Lima fez 79% das horas')
  })

  it('últimos 6 meses: o mês escolhido em destaque, a previsão e a leitura só com os meses fechados', async () => {
    tela()
    const seis = cartao('Últimos 6 meses')
    await waitFor(() => expect(seis).toHaveTextContent('Média de 18,4 h/mês · 1 mês acima da previsão'))
    const colunas = [...seis.querySelectorAll('[data-coluna]')]
    // jun/26 não tem coluna (0 h); a de nov/26 (o escolhido) é a única cheia.
    expect(colunas.map((c) => c.getAttribute('fill-opacity'))).toEqual(['0.42', '0.42', '0.42', '0.42', null])
    expect(within(seis).getByRole('img', { name: 'nov/26: 19 h (até 19/11)' })).toBeInTheDocument()
    expect(seis.querySelector('[data-referencia-horizontal]')).not.toBeNull()
  })

  it('check-ins por semana: o número em cima de cada coluna e a leitura', async () => {
    tela()
    const semanas = cartao('Check-ins por semana')
    await waitFor(() => expect(semanas).toHaveTextContent('14 check-ins no mês · 1 h em média'))
    expect(within(semanas).getByRole('img', { name: 'Semana de 09/11: 5 check-ins, 5 h' })).toBeInTheDocument()
    expect([...semanas.querySelectorAll('svg text')].map((t) => t.textContent)).toEqual(expect.arrayContaining(['5', '3']))
  })

  it('etapas só com modelo', async () => {
    const { rerender } = tela({ etapas: ETAPAS })
    const etapas = cartao('Andamento do check-list por etapa')
    expect(etapas).toHaveTextContent('Financeiro tem 3 tarefas atrasadas · situação de hoje')
    expect(within(etapas).getByRole('img', { name: 'Financeiro: 5 de 18 resolvidas, 3 atrasadas' })).toBeInTheDocument()
    rerender(<GraficosDoCliente cliente={CLIENTE} periodo={NOVEMBRO} etapas={null} />)
    expect(screen.queryByRole('region', { name: /^Andamento do check-list/ })).toBeNull()
    rerender(<GraficosDoCliente cliente={CLIENTE} periodo={NOVEMBRO} etapas={[]} />)
    expect(screen.queryByRole('region', { name: /^Andamento do check-list/ })).toBeNull()
  })

  it('vazios dizem o período', async () => {
    vi.mocked(horasPorDia).mockResolvedValue({ ...DIAS_30, dias: dias('2026-10-21', 30, () => 0), realizado: 0 })
    vi.mocked(horasPorConsultor).mockResolvedValue([{ consultorId: 'p1', nome: 'Ana Lima', horas: 0 }]) // só um check-in aberto
    vi.mocked(checkinsPorSemana).mockResolvedValue(SEMANAS.map((s) => ({ ...s, quantidade: 0, horas: 0 })))
    vi.mocked(horasPorMes).mockResolvedValue(MESES.map((m) => ({ ...m, realizado: 0 })))
    tela({ periodo: ULTIMOS_30 })
    await waitFor(() => expect(cartao('Horas × previsão')).toHaveTextContent('Sem horas no período.'))
    await waitFor(() => expect(cartao('Horas por consultor')).toHaveTextContent('Sem horas no período.'))
    await waitFor(() => expect(cartao('Check-ins por semana')).toHaveTextContent('Sem check-ins no período.'))
    await waitFor(() => expect(cartao('Horas por mês')).toHaveTextContent('Sem horas nos últimos 6 meses.'))
  })

  it('vazios no Mês', async () => {
    vi.mocked(horasPorDia).mockResolvedValue({ ...DIAS_NOVEMBRO, dias: dias('2026-11-01', 19, () => 0), realizado: 0, projecao: 0 })
    vi.mocked(horasPorConsultor).mockResolvedValue([])
    tela()
    await waitFor(() => expect(cartao('Horas × previsão')).toHaveTextContent('Sem horas neste mês.'))
    await waitFor(() => expect(cartao('Horas por consultor')).toHaveTextContent('Sem horas neste mês.'))
  })

  it('erro com "Tentar de novo" relê só aquele gráfico', async () => {
    const usuario = userEvent.setup()
    vi.mocked(horasPorDia).mockRejectedValueOnce(new Error('x'))
    tela()
    const burnup = cartao('Horas × previsão')
    await waitFor(() => expect(within(burnup).getByRole('alert')).toHaveTextContent('Não foi possível carregar o gráfico de horas e previsão.'))
    await usuario.click(within(burnup).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(burnup).toHaveTextContent('No ritmo atual'))
    expect(horasPorDia).toHaveBeenCalledTimes(2)
    expect(horasPorConsultor).toHaveBeenCalledTimes(1)
  })

  it('recarrega os gráficos quando a versão da página muda', async () => {
    const { rerender } = tela({ versao: 0 })
    await screen.findByRole('list', { name: 'Horas por consultor · Novembro de 2026' })
    rerender(<GraficosDoCliente cliente={CLIENTE} periodo={NOVEMBRO} versao={1} />)
    await waitFor(() => expect(horasPorDia).toHaveBeenCalledTimes(2))
    expect(horasPorMes).toHaveBeenCalledTimes(2)
    expect(horasPorConsultor).toHaveBeenCalledTimes(2)
    expect(checkinsPorSemana).toHaveBeenCalledTimes(2)
  })

  it('"Ver em tabela" do Mês mostra os mesmos números do burn-up, dia a dia', async () => {
    const usuario = userEvent.setup()
    tela()
    const burnup = cartao('Horas × previsão')
    await waitFor(() => expect(burnup).toHaveTextContent('No ritmo atual'))
    await usuario.click(within(burnup).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(burnup).getByRole('table', { name: 'Horas por dia · Novembro de 2026' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(20) // cabeçalho + 19 dias
    expect(within(tabela).getAllByRole('row').at(-1)).toHaveTextContent('19/111 h19 h')
  })
})
