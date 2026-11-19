import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkinsPorSemana, horasPorConsultor, horasPorDia, horasPorMes } from '@/data/clientes'
import { quadroPorId } from '@/data/quadro'
import GraficosDoCliente from './GraficosDoCliente'

vi.mock('@/data/clientes', () => ({ horasPorDia: vi.fn(), horasPorMes: vi.fn(), horasPorConsultor: vi.fn(), checkinsPorSemana: vi.fn() }))
vi.mock('@/data/quadro', () => ({ quadroPorId: vi.fn() }))

// Quinta, 19/11/2026, em São Paulo.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-19T12:00:00-03:00') }))
afterEach(() => vi.useRealTimers())

const CLIENTE = { id: 'k1', horas_mes: 30, criado_em: '2025-09-10T15:00:00Z' }
const NOVEMBRO = { tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' }
const OUTUBRO = { tipo: 'mes', mes: '2026-10-01', de: '2026-10-01', ate: '2026-10-31' }
const ULTIMOS_30 = { tipo: 'ultimos-30', de: '2026-10-21', ate: '2026-11-19' }
const ESTE_ANO = { tipo: 'ano', de: '2026-01-01', ate: '2026-11-19' }
const ULTIMOS_90 = { tipo: 'ultimos-90', de: '2026-08-22', ate: '2026-11-19' }
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
// Um período qualquer (90 dias, ano): todos os dias até hoje, 1 h em cada um.
const doPeriodo = ({ de, ate }) => {
  const n = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1
  return { de, ate, ate_efetivo: ate, dias: dias(de, n), realizado: n, previsao: 0, previsao_mes: 30 }
}
// hoje_do_cliente: as etapas com as seis situações (a fazer = o resto), o tempo das tarefas e o quadro.
const ETAPAS = [
  { id: 'e1', nome: 'Diagnóstico', tarefas: 10, feitas: 7, nao_se_aplica: 1, andamento: 1, pausadas: 0, atrasadas: 0 },
  { id: 'e2', nome: 'Financeiro', tarefas: 18, feitas: 4, nao_se_aplica: 1, andamento: 2, pausadas: 1, atrasadas: 3 },
]
const MAIS_TEMPO = [
  { titulo: 'Análise do DRE', segundos: 13_200 }, { titulo: 'Mapa de custos', segundos: 8100 }, { titulo: 'Fluxo de caixa', segundos: 6600 },
  { titulo: 'Metas por área', segundos: 3900 }, { titulo: 'Reunião de alinhamento', segundos: 2700 },
]
const HOJE = {
  arquivado_em: null,
  quadro: { id: 'q1', cartoes: 14, atrasados: 2, sem_responsavel: 1 },
  checklist: { modelo_nome: 'Gestão financeira', tarefas: 28, feitas: 11, nao_se_aplica: 2, atrasadas: 3, proxima: null, etapas: ETAPAS, mais_tempo: MAIS_TEMPO },
}
// quadro_por_id: cor nula = a automática pela posição (índigo na 1ª, roxo na 4ª); 2 = azul; 7 = vermelho (vai no rosa da paleta).
const QUADRO = {
  id: 'q1',
  colunas: [
    { id: 'c1', nome: 'A fazer', cor: null, concluidos: false, cartoes: 4 },
    { id: 'c2', nome: 'Em andamento', cor: 2, concluidos: false, cartoes: 3 },
    { id: 'c3', nome: 'Concluído', cor: 7, concluidos: true, cartoes: 7 },
    { id: 'c4', nome: 'Arquivo', cor: null, concluidos: false, cartoes: 0 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(horasPorDia).mockImplementation(async (_id, periodo) => (periodo?.de === '2026-10-21' ? DIAS_30 : periodo?.de ? doPeriodo(periodo)
    : periodo === '2026-10-01' ? DIAS_OUTUBRO : DIAS_NOVEMBRO))
  // Mais de 6 meses: os n meses até novembro de 2026, 10 h cada.
  vi.mocked(horasPorMes).mockImplementation(async (_id, _ate, meses) => (meses > 6
    ? Array.from({ length: meses }, (_, i) => ({ mes: new Date(Date.UTC(2026, 10 - (meses - 1 - i), 1)).toISOString().slice(0, 10), realizado: 10 }))
    : MESES))
  vi.mocked(horasPorConsultor).mockResolvedValue(CONSULTORES)
  vi.mocked(checkinsPorSemana).mockResolvedValue(SEMANAS)
  vi.mocked(quadroPorId).mockResolvedValue(QUADRO)
})

const cartao = (inicio) => screen.getByRole('region', { name: new RegExp(`^${inicio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
const tela = (props = {}) => render(<GraficosDoCliente cliente={CLIENTE} periodo={NOVEMBRO} hoje={{ dados: HOJE }} {...props} />)
const de = (props) => <GraficosDoCliente cliente={CLIENTE} periodo={NOVEMBRO} hoje={{ dados: HOJE }} {...props} />

describe('GraficosDoCliente', () => {
  it('a seção "No período" com os gráficos na ordem do protótipo, cada título com o período (os do check-list e do quadro dizem que são de hoje)', async () => {
    const { container } = tela()
    const secao = screen.getByRole('region', { name: 'No período' })
    await screen.findByRole('group', { name: 'Horas por consultor · Novembro de 2026' })
    const nomes = ['Horas × previsão · Novembro de 2026', 'Horas por consultor · Novembro de 2026', 'Últimos 6 meses · até nov/26',
      'Dias com check-in · Novembro de 2026', 'Check-list por etapa', 'Onde foi o tempo', 'Check-ins por semana · Novembro de 2026', 'Quadro do cliente']
    expect(within(secao).getAllByRole('region').map((r) => r.querySelector('h2').textContent)).toEqual(nomes)
    // Grade de 12 colunas: 8 + 4 e depois pares de 6 (nenhum bloco sozinho na linha).
    expect([...container.querySelectorAll('[data-bloco]')].map((b) => b.className.split(' ').filter((c) => c.includes('col-span')).join(' ')))
      .toEqual(['lg:col-span-12 xl:col-span-8', 'lg:col-span-12 xl:col-span-4', ...Array(6).fill('lg:col-span-6')])
    for (const nome of ['Check-list por etapa', 'Onde foi o tempo', 'Quadro do cliente']) expect(cartao(nome)).toHaveTextContent('Situação de hoje')
    // A navegação do mês fica na barra de filtros da página, não aqui.
    expect(within(secao).queryByRole('group', { name: 'Mês' })).toBeNull()
    expect(horasPorDia).toHaveBeenCalledWith('k1', '2026-11-01')
    expect(horasPorDia).toHaveBeenCalledTimes(1) // o burn-up e o calendário de calor usam a mesma leitura
    expect(horasPorMes).toHaveBeenCalledWith('k1', '2026-11-01', 6)
    expect(horasPorConsultor).toHaveBeenCalledWith('k1', '2026-11-01')
    expect(checkinsPorSemana).toHaveBeenCalledWith('k1', '2026-11-01')
    // O quadro pelo id que hoje_do_cliente mandou (quadro_por_id nunca cria quadro; quadro_do_cliente criaria).
    await waitFor(() => expect(quadroPorId).toHaveBeenCalledWith('q1'))
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

    rerender(de({ periodo: OUTUBRO }))
    await waitFor(() => expect(cartao('Horas × previsão · Outubro de 2026')).toHaveTextContent('Fechou o mês com 28 h (93% da previsão atual)'))
    burnup = cartao('Horas × previsão')
    expect(within(burnup).getByRole('list', { name: 'Legenda' })).not.toHaveTextContent('Projeção')
    expect(burnup.querySelector('[data-serie="1"]')).toBeNull()
  })

  it('a projeção fica vermelha quando passa da previsão (e azul quando não passa)', async () => {
    const legendaDaProjecao = (burnup) => within(within(burnup).getByRole('list', { name: 'Legenda' })).getByText('Projeção').previousElementSibling
    const { unmount } = tela()
    let burnup = cartao('Horas × previsão')
    await waitFor(() => expect(burnup.querySelector('[data-serie="1"]')).not.toBeNull())
    expect(burnup.querySelector('[data-serie="1"]').style.stroke).toBe('') // ≈ 30 h de 30 h: azul da série
    expect(legendaDaProjecao(burnup).style.borderTopColor).toBe('var(--grafico-serie)')
    unmount()
    vi.mocked(horasPorDia).mockResolvedValue({ ...DIAS_NOVEMBRO, projecao: 34 })
    tela()
    burnup = cartao('Horas × previsão')
    await waitFor(() => expect(burnup).toHaveTextContent('No ritmo atual, fecha o mês com ≈ 34 h (113% da previsão)'))
    expect(burnup.querySelector('[data-serie="1"]').style.stroke).toBe('var(--grafico-acima)')
    expect(legendaDaProjecao(burnup).style.borderTopColor).toBe('var(--grafico-acima)')
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
    expect(await screen.findByRole('group', { name: 'Horas por consultor · Últimos 30 dias' })).toBeInTheDocument()
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

  it('trocar o período chama de novo por dia, por consultor, os meses e as semanas (o quadro e o check-list, de hoje, não)', async () => {
    const { rerender } = tela()
    await screen.findByRole('group', { name: 'Horas por consultor · Novembro de 2026' })
    await waitFor(() => expect(quadroPorId).toHaveBeenCalledTimes(1))
    rerender(de({ periodo: OUTUBRO }))
    await waitFor(() => expect(horasPorDia).toHaveBeenLastCalledWith('k1', '2026-10-01'))
    expect(horasPorMes).toHaveBeenLastCalledWith('k1', '2026-10-01', 6)
    expect(horasPorConsultor).toHaveBeenLastCalledWith('k1', '2026-10-01')
    expect(checkinsPorSemana).toHaveBeenLastCalledWith('k1', '2026-10-01')
    expect(await screen.findByRole('group', { name: 'Horas por consultor · Outubro de 2026' })).toBeInTheDocument()
    expect(quadroPorId).toHaveBeenCalledTimes(1)
  })

  it('horas por consultor em rosca (o total no meio), leitura e "Outro consultor" para quem a pessoa não vê', async () => {
    tela()
    const rosca = await screen.findByRole('group', { name: 'Horas por consultor · Novembro de 2026' })
    expect(within(rosca).getAllByRole('img').map((a) => a.getAttribute('aria-label'))).toEqual(['Ana Lima: 15 h (79%)', 'Outro consultor: 4 h (21%)'])
    expect(within(rosca).getByText('19 h')).toBeInTheDocument()
    expect(within(rosca).getByText('no mês')).toBeInTheDocument()
    // As cores pela ordem da paleta.
    expect([...rosca.querySelectorAll('[data-arco]')].map((a) => a.style.stroke)).toEqual(['var(--cor-azul-forte)', 'var(--cor-turquesa-forte)'])
    expect(cartao('Horas por consultor')).toHaveTextContent('Ana Lima fez 79% das horas')
  })

  it('horas por consultor: vários escondidos ganham números (nomes únicos, sem chave repetida) e mais de 8 viram os 8 maiores + "Outros"', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const doze = Array.from({ length: 12 }, (_, i) => ({ consultorId: `p${i}`, nome: i === 1 || i === 3 ? null : `Pessoa ${i + 1}`, horas: 24 - i * 2 }))
    vi.mocked(horasPorConsultor).mockResolvedValue(doze)
    tela()
    const rosca = await screen.findByRole('group', { name: 'Horas por consultor · Novembro de 2026' })
    const nomes = within(rosca).getAllByRole('img').map((a) => a.getAttribute('aria-label').split(':')[0])
    expect(nomes).toEqual(['Pessoa 1', 'Outro consultor', 'Pessoa 3', 'Outro consultor 2', 'Pessoa 5', 'Pessoa 6', 'Pessoa 7', 'Pessoa 8', 'Outros'])
    // Outros = os 4 menores (8 + 6 + 4 + 2 h), em grafite; o total no meio soma tudo (156 h).
    expect(within(rosca).getAllByRole('img').at(-1)).toHaveAccessibleName('Outros: 20 h (13%)')
    expect([...rosca.querySelectorAll('[data-arco]')].at(-1).style.stroke).toBe('var(--cor-grafite-forte)')
    expect(within(rosca).getByText('156 h')).toBeInTheDocument()
    expect(erro.mock.calls.flat().join(' ')).not.toMatch(/same key/)
    erro.mockRestore()
  })

  it('últimos 6 meses: o mês escolhido em destaque, a previsão e a leitura só com os meses fechados', async () => {
    tela()
    const seis = cartao('Últimos 6 meses')
    await waitFor(() => expect(seis).toHaveTextContent('Média de 18,4 h/mês · 1 mês acima da previsão'))
    const colunas = [...seis.querySelectorAll('[data-coluna]')]
    // jun/26 não tem coluna (0 h). No Mês, os 6 meses são o contexto do escolhido: nenhum esmaecido (o escolhido vai em azul).
    expect(colunas.map((c) => c.getAttribute('fill-opacity'))).toEqual([null, null, null, null, null])
    expect(within(seis).getByRole('img', { name: 'nov/26: 19 h (até 19/11)' })).toBeInTheDocument()
    expect(seis.querySelector('[data-referencia-horizontal]')).not.toBeNull()
  })

  it('horas por mês: o mês que passou da previsão em vermelho (com ▲ e o número), o atual em azul, os outros em turquesa', async () => {
    tela()
    const seis = cartao('Últimos 6 meses')
    await waitFor(() => expect(seis.querySelectorAll('[data-coluna]')).toHaveLength(5))
    // jul, ago (32 h > 30 h de previsão), set, out e nov (o mês de hoje).
    expect([...seis.querySelectorAll('[data-coluna]')].map((c) => c.style.fill))
      .toEqual(['var(--cor-turquesa-forte)', 'var(--grafico-acima)', 'var(--cor-turquesa-forte)', 'var(--cor-turquesa-forte)', ''])
    expect(within(seis).getByRole('img', { name: 'ago/26: 32 h (passou da previsão)' })).toBeInTheDocument()
    expect([...seis.querySelectorAll('svg text')].map((t) => t.textContent)).toContain('▲ 32')
    expect(within(within(seis).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem').map((l) => l.textContent))
      .toEqual(['Meses anteriores', 'Este mês (até hoje)', 'Passou da previsão', 'Previsão atual (30 h)'])
  })

  it('horas por mês num mês passado: o escolhido em azul; num período, os de fora esmaecidos em turquesa (sem vermelho)', async () => {
    const { unmount } = tela({ periodo: OUTUBRO })
    let meses = cartao('Últimos 6 meses · até out/26')
    await waitFor(() => expect(meses.querySelectorAll('[data-coluna]')).toHaveLength(5))
    expect([...meses.querySelectorAll('[data-coluna]')].at(-2).style.fill).toBe('') // out/26 (28 h), no azul da série
    expect(within(within(meses).getByRole('list', { name: 'Legenda' })).getByText('Mês escolhido')).toBeInTheDocument()
    unmount()
    tela({ periodo: ULTIMOS_30 })
    meses = cartao('Horas por mês · Últimos 30 dias')
    await waitFor(() => expect(meses.querySelectorAll('[data-coluna]')).toHaveLength(5))
    // ago/26 passou da previsão, mas está fora do período: turquesa esmaecido, sem ▲.
    expect([...meses.querySelectorAll('[data-coluna]')].map((c) => c.style.fill))
      .toEqual(['var(--cor-turquesa-forte)', 'var(--cor-turquesa-forte)', 'var(--cor-turquesa-forte)', 'var(--cor-turquesa-forte)', ''])
    expect([...meses.querySelectorAll('svg text')].map((t) => t.textContent)).not.toContain('▲ 32')
  })

  it('horas por mês com mais de 6 meses: só o "▲" em cima do mês que passou (o número não cabe a 360 px; fica na dica e na tabela)', async () => {
    vi.mocked(horasPorMes).mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({ mes: `2026-${String(i + 1).padStart(2, '0')}-01`, realizado: i === 4 || i === 5 ? 40 : 10 })))
    tela({ periodo: ESTE_ANO })
    const meses = cartao('Horas por mês · Este ano')
    await waitFor(() => expect(meses.querySelectorAll('[data-coluna]')).toHaveLength(11))
    expect([...meses.querySelectorAll('svg text')].map((t) => t.textContent).filter((t) => t.startsWith('▲'))).toEqual(['▲', '▲'])
    expect(within(meses).getByRole('img', { name: 'mai/26: 40 h (passou da previsão)' })).toBeInTheDocument()
  })

  it('check-ins por semana: o número em cima de cada coluna e a leitura', async () => {
    tela()
    const semanas = cartao('Check-ins por semana')
    await waitFor(() => expect(semanas).toHaveTextContent('14 check-ins no mês · 1 h em média'))
    expect(within(semanas).getByRole('img', { name: 'Semana de 09/11: 5 check-ins, 5 h' })).toBeInTheDocument()
    expect([...semanas.querySelectorAll('svg text')].map((t) => t.textContent)).toEqual(expect.arrayContaining(['5', '3']))
  })

  it('dias com check-in: calendário de calor semanas × dias do mês, em turquesa; o que não é do mês e o que não chegou fica em branco', async () => {
    const usuario = userEvent.setup()
    tela()
    const calor = await screen.findByRole('group', { name: 'Dias com check-in · Novembro de 2026' })
    // 1º/11 é domingo: as semanas de 26/10 a 30/11 (6 colunas); só os dias 1 a 19 (os que o banco mandou) desenham.
    expect(calor.querySelectorAll('[data-celula]')).toHaveLength(19)
    expect([...calor.querySelectorAll('[data-rotulo-y]')].map((t) => t.textContent)).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'])
    expect([...calor.querySelectorAll('[data-rotulo-x]')].map((t) => t.textContent)).toEqual(['26/10', '02/11', '09/11', '16/11', '23/11', '30/11'])
    expect(calor.querySelector('[data-celula="6-0"]').style.fill).toBe('var(--cor-turquesa-forte)') // dom, 01/11
    expect(calor.querySelector('[data-celula="0-0"]')).toBeNull() // seg, 26/10: fora do período
    expect(calor.querySelector('[data-celula="4-3"]')).toBeNull() // sex, 20/11: ainda não chegou
    expect(cartao('Dias com check-in')).toHaveTextContent('19 dias com check-in no mês · mais horas no domingo (3 h)')
    await usuario.click(within(cartao('Dias com check-in')).getByRole('img'))
    await usuario.keyboard('{ArrowRight}')
    const anuncio = calor.parentElement.querySelector('[aria-live="polite"]')
    expect(anuncio).toHaveTextContent('seg, 02/11: 1 h')
    await usuario.keyboard('{ArrowLeft}')
    expect(anuncio).toHaveTextContent('seg, 26/10: fora do período')
    await usuario.keyboard('{End}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowLeft}')
    expect(anuncio).toHaveTextContent('sex, 27/11: ainda não chegou')
  })

  it('dias com check-in nos últimos 90 dias e no ano: uma coluna por semana que o período toca', async () => {
    const { unmount } = tela({ periodo: ULTIMOS_90 })
    let calor = await screen.findByRole('group', { name: 'Dias com check-in · Últimos 90 dias' })
    // 22/08 (sábado) a 19/11: as semanas de 17/08 a 16/11 (14 colunas), 90 dias desenhados.
    await waitFor(() => expect(calor.querySelectorAll('[data-celula]')).toHaveLength(90))
    expect(calor.querySelector('[data-celula="5-0"]')).not.toBeNull() // sáb, 22/08
    expect(calor.querySelector('[data-celula="4-0"]')).toBeNull() // sex, 21/08
    expect(calor.querySelector('[data-celula="3-13"]')).not.toBeNull() // qui, 19/11
    expect(calor.querySelector('[data-celula="0-14"]')).toBeNull()
    unmount()
    tela({ periodo: ESTE_ANO })
    calor = await screen.findByRole('group', { name: 'Dias com check-in · Este ano' })
    // 1º/01 (quinta) a 19/11: 47 semanas, de 29/12/2025 a 16/11.
    await waitFor(() => expect(calor.querySelectorAll('[data-celula]')).toHaveLength(323))
    expect(calor.querySelector('[data-celula="3-0"]')).not.toBeNull()
    expect(calor.querySelector('[data-celula="2-0"]')).toBeNull()
    expect(calor.querySelector('[data-celula="3-46"]')).not.toBeNull()
    expect(calor.querySelector('[data-celula="0-47"]')).toBeNull()
  })

  it('check-list por etapa: as seis situações em cada barra, "N de M" e a legenda com ícone e palavra', async () => {
    tela()
    const etapas = cartao('Check-list por etapa')
    expect(etapas).toHaveTextContent('Situação de hoje · Gestão financeira')
    expect(etapas).toHaveTextContent('13 de 28 resolvidas · Financeiro tem 3 tarefas atrasadas')
    const financeiro = within(etapas).getByRole('img', { name: 'Financeiro: 5 de 18 resolvidas, 3 atrasadas' }).closest('li')
    expect([...financeiro.querySelectorAll('[data-parte]')].map((p) => [p.dataset.parte, p.style.flexGrow]))
      .toEqual([['feita', '4'], ['nsa', '1'], ['andamento', '2'], ['pausada', '1'], ['afazer', '7'], ['atrasada', '3']])
    expect(financeiro).toHaveTextContent('5 de 18')
    expect(financeiro.querySelector('[data-icone="atrasada"]')).toHaveClass('text-destructive-cheio')
    const diagnostico = within(etapas).getByRole('img', { name: 'Diagnóstico: 8 de 10 resolvidas' }).closest('li')
    expect(diagnostico.querySelector('[data-icone]')).toBeNull()
    const legenda = within(within(etapas).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(legenda.map((l) => l.textContent)).toEqual(['Feitas', 'Não se aplicam', 'Em andamento', 'Pausadas', 'A fazer no prazo', 'Atrasadas'])
    for (const l of legenda) expect(l.querySelector('svg')).not.toBeNull()
  })

  it('onde foi o tempo: as 5 tarefas com mais tempo marcado', async () => {
    tela()
    const tempo = cartao('Onde foi o tempo')
    expect(tempo).toHaveTextContent('Análise do DRE levou mais tempo: 3 h 40')
    expect(within(tempo).getAllByRole('img').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Análise do DRE: 3 h 40', 'Mapa de custos: 2 h 15', 'Fluxo de caixa: 1 h 50', 'Metas por área: 1 h 05', 'Reunião de alinhamento: 45 min',
    ])
  })

  it('onde foi o tempo: menos de 1 minuto cabe na coluna do valor ("< 1 min"; por extenso na dica e no leitor de tela)', async () => {
    tela({ hoje: { dados: { ...HOJE, checklist: { ...HOJE.checklist, mais_tempo: [{ titulo: 'Revisão', segundos: 40 }] } } } })
    const tempo = cartao('Onde foi o tempo')
    expect(within(tempo).getByRole('img', { name: 'Revisão: menos de 1 min' }).closest('li')).toHaveTextContent('< 1 min')
  })

  it('quadro do cliente: uma faixa com os cartões de cada coluna, na cor da coluna', async () => {
    tela()
    const quadro = cartao('Quadro do cliente')
    await waitFor(() => expect(within(quadro).getByRole('group', { name: 'Cartões por coluna' })).toBeInTheDocument())
    const partes = within(within(quadro).getByRole('group', { name: 'Cartões por coluna' })).getAllByRole('img')
    expect(partes.map((p) => p.getAttribute('aria-label'))).toEqual(['A fazer: 4 (29%)', 'Em andamento: 3 (21%)', 'Concluído: 7 (50%)'])
    expect(partes.map((p) => p.style.background)).toEqual(['var(--cor-indigo-forte)', 'var(--cor-azul-forte)', 'var(--cor-rosa-forte)'])
    expect(quadro).toHaveTextContent('Situação de hoje · 14 cartões por coluna')
    expect(quadro).toHaveTextContent('7 de 14 cartões concluídos · 2 atrasados')
    // A coluna vazia fica na legenda, com 0.
    expect(within(within(quadro).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem').at(-1)).toHaveTextContent('Arquivo0')
  })

  it('vazios de hoje: sem check-list, sem tempo marcado, sem quadro e quadro sem cartões', async () => {
    const { rerender } = tela({ hoje: { dados: { ...HOJE, checklist: null, quadro: null } } })
    expect(cartao('Check-list por etapa')).toHaveTextContent('Nenhum modelo de check-list aplicado.')
    expect(cartao('Onde foi o tempo')).toHaveTextContent('Nenhum modelo de check-list aplicado.')
    expect(cartao('Quadro do cliente')).toHaveTextContent('Este cliente ainda não tem quadro.')
    expect(quadroPorId).not.toHaveBeenCalled()
    rerender(de({ hoje: { dados: { ...HOJE, checklist: { ...HOJE.checklist, mais_tempo: [] } } } }))
    expect(cartao('Onde foi o tempo')).toHaveTextContent('Nenhuma tarefa com tempo marcado.')
    expect(within(cartao('Onde foi o tempo')).queryByRole('button', { name: 'Ver em tabela' })).toBeNull()
    vi.mocked(quadroPorId).mockResolvedValue({ ...QUADRO, colunas: QUADRO.colunas.map((c) => ({ ...c, cartoes: 0 })) })
    rerender(de({ hoje: { dados: { ...HOJE, quadro: { id: 'q2', cartoes: 0, atrasados: 0, sem_responsavel: 0 } } } }))
    await waitFor(() => expect(cartao('Quadro do cliente')).toHaveTextContent('Nenhum cartão no quadro.'))
    // quadro_por_id devolve nulo quando a pessoa não vê o quadro: vazio, nunca "Carregando…" para sempre.
    vi.mocked(quadroPorId).mockResolvedValue(null)
    rerender(de({ hoje: { dados: { ...HOJE, quadro: { id: 'q3', cartoes: 2, atrasados: 0, sem_responsavel: 0 } } } }))
    await waitFor(() => expect(cartao('Quadro do cliente')).toHaveTextContent('Este cliente ainda não tem quadro.'))
  })

  it('hoje carregando e com erro: os blocos de hoje esperam e "Tentar de novo" relê a faixa', async () => {
    const aoRelerHoje = vi.fn()
    const { rerender } = tela({ hoje: { carregando: true } })
    for (const nome of ['Check-list por etapa', 'Onde foi o tempo', 'Quadro do cliente']) expect(cartao(nome)).toHaveTextContent('Carregando')
    rerender(de({ hoje: { erro: true }, aoRelerHoje }))
    await userEvent.setup().click(within(cartao('Quadro do cliente')).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoRelerHoje).toHaveBeenCalledTimes(1)
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
    await waitFor(() => expect(cartao('Dias com check-in')).toHaveTextContent('Sem horas no período.'))
    await waitFor(() => expect(cartao('Horas por mês')).toHaveTextContent('Sem horas nos últimos 6 meses.'))
    expect(cartao('Horas por consultor').querySelector('[data-arco]')).toBeNull()
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

  it('a versão da página (check-in feito) relê os gráficos sem desenhar de novo; trocar o período desenha', async () => {
    const { rerender } = tela({ versao: 0 })
    const rosca = await screen.findByRole('group', { name: 'Horas por consultor · Novembro de 2026' })
    const arco = rosca.querySelector('[data-arco]')
    const celula = screen.getByRole('group', { name: 'Dias com check-in · Novembro de 2026' }).querySelector('[data-celula="6-0"]')
    const linha = cartao('Horas × previsão').querySelector('[data-serie="0"]')
    await waitFor(() => expect(quadroPorId).toHaveBeenCalledTimes(1))
    const parte = within(cartao('Quadro do cliente')).getAllByRole('img')[0]
    rerender(de({ versao: 1 }))
    await waitFor(() => expect(horasPorDia).toHaveBeenCalledTimes(2))
    expect(horasPorMes).toHaveBeenCalledTimes(2)
    expect(horasPorConsultor).toHaveBeenCalledTimes(2)
    expect(checkinsPorSemana).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(quadroPorId).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(cartao('Horas × previsão')).not.toHaveTextContent('Carregando'))
    expect(screen.getByRole('group', { name: 'Horas por consultor · Novembro de 2026' }).querySelector('[data-arco]')).toBe(arco)
    expect(screen.getByRole('group', { name: 'Dias com check-in · Novembro de 2026' }).querySelector('[data-celula="6-0"]')).toBe(celula)
    expect(cartao('Horas × previsão').querySelector('[data-serie="0"]')).toBe(linha)
    expect(within(cartao('Quadro do cliente')).getAllByRole('img')[0]).toBe(parte)
    rerender(de({ versao: 1, periodo: OUTUBRO }))
    const roscaNova = await screen.findByRole('group', { name: 'Horas por consultor · Outubro de 2026' })
    expect(roscaNova.querySelector('[data-arco]')).not.toBe(arco)
    await waitFor(() => expect(cartao('Horas × previsão · Outubro de 2026').querySelector('[data-serie="0"]')).not.toBe(linha))
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
