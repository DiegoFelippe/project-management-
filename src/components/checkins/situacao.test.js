import { describe, expect, it } from 'vitest'
import { diaCurto, feitaPorEm, quandoVence, resumoDaSituacao, rotuloDaSituacao, situacaoDaTarefa } from './situacao'

const HOJE = '2026-11-17'
const t = (id, campos = {}) => ({ id, titulo: id, estado: 'a_fazer', vence_em: '2026-11-25', depende_de: [], ...campos })

// O check-list de exemplo: uma feita, uma a fazer e as que dependem delas.
const FEITA = t('feita', { estado: 'feita', vence_em: '2026-11-10' })
const PENDENTE = t('pendente')
const ANDAMENTO = t('andamento', { estado: 'andamento', vence_em: '2026-11-20' })
const LIVRE = t('livre', { depende_de: ['feita'] })
const BLOQUEADA = t('bloqueada', { depende_de: ['feita', 'pendente', 'andamento'] })
const TODAS = [FEITA, PENDENTE, ANDAMENTO, LIVRE, BLOQUEADA]
const POR_ID = Object.fromEntries(TODAS.map((x) => [x.id, x]))

const situacao = (tarefa, porId = POR_ID) => situacaoDaTarefa(tarefa, porId, HOJE)

describe('situacaoDaTarefa', () => {
  it('feita: verde, mesmo com a data já passada e com dependência aberta', () => {
    const s = situacao(t('x', { estado: 'feita', vence_em: '2026-11-01', depende_de: ['pendente'] }))
    expect(s).toMatchObject({ cor: 'feita', bloqueada: false, atrasada: false, venceHoje: false, espera: [] })
  })

  it('livre: a fazer, no prazo, com as dependências feitas; "faltam" conta os dias corridos até a data', () => {
    expect(situacao(LIVRE)).toMatchObject({ cor: 'livre', bloqueada: false, atrasada: false, venceHoje: false, faltam: 8, espera: [] })
  })

  it('em andamento', () => {
    expect(situacao(ANDAMENTO)).toMatchObject({ cor: 'andamento', faltam: 3, bloqueada: false })
  })

  it('bloqueada: diz quem ela espera (só as dependências que não estão feitas, na ordem)', () => {
    const s = situacao(BLOQUEADA)
    expect(s.cor).toBe('bloqueada')
    expect(s.bloqueada).toBe(true)
    expect(s.espera.map((x) => x.id)).toEqual(['pendente', 'andamento'])
  })

  it('vence hoje: a data é o dia de hoje (o de São Paulo, que vem de quem chama)', () => {
    const s = situacao(t('x', { vence_em: HOJE }))
    expect(s).toMatchObject({ cor: 'hoje', venceHoje: true, atrasada: false, faltam: 0 })
  })

  it('atrasada: não feita e o dia já passou (ontem já conta); atrasada vence bloqueada e em andamento na cor', () => {
    expect(situacao(t('x', { vence_em: '2026-11-16' }))).toMatchObject({ cor: 'atrasada', atrasada: true, faltam: -1 })
    const s = situacao(t('y', { estado: 'andamento', vence_em: '2026-10-31', depende_de: ['pendente'] }))
    expect(s).toMatchObject({ cor: 'atrasada', atrasada: true, bloqueada: true, faltam: -17 })
  })

  it('vence hoje vem antes de em andamento; em andamento vem antes de bloqueada', () => {
    expect(situacao(t('x', { estado: 'andamento', vence_em: HOJE })).cor).toBe('hoje')
    expect(situacao(t('y', { estado: 'andamento', depende_de: ['pendente'] })).cor).toBe('andamento')
  })

  it('a conta dos dias atravessa mês e ano sem errar (e não depende do fuso do computador)', () => {
    expect(situacaoDaTarefa(t('x', { vence_em: '2027-01-01' }), {}, '2026-12-31').faltam).toBe(1)
    expect(situacaoDaTarefa(t('x', { vence_em: '2026-02-28' }), {}, '2026-03-01').faltam).toBe(-1)
    expect(situacaoDaTarefa(t('x', { vence_em: '2026-11-03' }), {}, '2026-10-20').faltam).toBe(14)
  })

  it('dependência desconhecida é ignorada; aceita o índice como Map; sem data, nem atrasada nem "vence hoje"', () => {
    expect(situacao(t('x', { depende_de: ['sumiu'] })).cor).toBe('livre')
    const porMapa = new Map(TODAS.map((x) => [x.id, x]))
    expect(situacao(BLOQUEADA, porMapa).espera.map((x) => x.id)).toEqual(['pendente', 'andamento'])
    expect(situacao(t('x', { vence_em: null }))).toMatchObject({ cor: 'livre', faltam: null, atrasada: false, venceHoje: false })
  })
})

describe('rotuloDaSituacao', () => {
  const rotulo = (tarefa) => rotuloDaSituacao(tarefa, situacao(tarefa))

  it('o estado em palavras, com o aviso de prazo junto', () => {
    expect(rotulo(FEITA)).toBe('Feita')
    expect(rotulo(LIVRE)).toBe('A fazer')
    expect(rotulo(ANDAMENTO)).toBe('Em andamento')
    expect(rotulo(BLOQUEADA)).toBe('Bloqueada')
    expect(rotulo(t('x', { vence_em: HOJE }))).toBe('A fazer, vence hoje')
    expect(rotulo(t('y', { vence_em: '2026-11-01' }))).toBe('A fazer, atrasada')
    expect(rotulo(t('z', { estado: 'andamento', vence_em: '2026-11-01', depende_de: ['pendente'] })))
      .toBe('Em andamento · espera 1 tarefa, atrasada')
  })

  // Em andamento e bloqueada (uma dependência foi reaberta depois de ela começar): a cor é a de "em andamento", então o
  // nome também diz "Em andamento" (e quantas ela espera), não "Bloqueada".
  it('em andamento e bloqueada: cor e nome dizem "em andamento", com quantas tarefas ela espera', () => {
    const uma = t('x', { estado: 'andamento', depende_de: ['pendente'] })
    expect(situacao(uma).cor).toBe('andamento')
    expect(rotulo(uma)).toBe('Em andamento · espera 1 tarefa')
    const duas = t('y', { estado: 'andamento', depende_de: ['pendente', 'andamento', 'feita'] })
    expect(rotulo(duas)).toBe('Em andamento · espera 2 tarefas')
  })

  it('o nome sempre combina com a cor: "andamento" diz Em andamento; "bloqueada" diz Bloqueada; "feita" diz Feita', () => {
    const casos = []
    for (const estado of ['a_fazer', 'andamento', 'feita']) {
      for (const vence_em of ['2026-11-25', HOJE, '2026-11-01', null]) {
        for (const depende_de of [[], ['feita'], ['pendente']]) casos.push(t('c', { estado, vence_em, depende_de }))
      }
    }
    const comeco = { andamento: 'Em andamento', bloqueada: 'Bloqueada', feita: 'Feita', livre: 'A fazer' }
    for (const caso of casos) {
      const s = situacao(caso)
      if (comeco[s.cor]) expect(rotulo(caso), JSON.stringify(caso)).toMatch(new RegExp(`^${comeco[s.cor]}`))
    }
  })
})

describe('datas e o resumo curto', () => {
  it('diaCurto: dia e mês', () => {
    expect(diaCurto('2026-11-05')).toBe('05/11')
  })

  it('feitaPorEm: quem e o dia (em São Paulo); sem o nome quando o banco o esconde', () => {
    expect(feitaPorEm({ feita_em: '2026-11-13T02:00:00Z', feita_por: { nome: 'Ana Lima' } })).toBe('por Ana Lima em 12/11/2026')
    expect(feitaPorEm({ feita_em: '2026-11-12T15:00:00Z', feita_por: { nome: null } })).toBe('feita em 12/11/2026')
  })

  it('quandoVence: "vence 20/11", "vence hoje" ou "venceu 12/11"', () => {
    expect(quandoVence('2026-11-20', HOJE)).toBe('vence 20/11')
    expect(quandoVence(HOJE, HOJE)).toBe('vence hoje')
    expect(quandoVence('2026-11-12', HOJE)).toBe('venceu 12/11')
  })

  it('resumoDaSituacao: a linha de baixo da caixa do fluxograma, que combina com a cor', () => {
    const resumo = (tarefa) => resumoDaSituacao(tarefa, situacao(tarefa))
    // feita_em é um instante: o dia é o de São Paulo (23h de 12/11 em SP já é 13/11 em UTC).
    expect(resumo(t('a', { estado: 'feita', feita_em: '2026-11-13T02:00:00Z' }))).toBe('Feita em 12/11')
    expect(resumo(t('b', { vence_em: '2026-11-15' }))).toBe('Atrasada desde 15/11')
    expect(resumo(t('c', { vence_em: HOJE, depende_de: ['pendente'] }))).toBe('Vence hoje')
    expect(resumo(t('d', { estado: 'andamento', vence_em: '2026-11-20' }))).toBe('Em andamento · 20/11')
    expect(resumo(t('e', { estado: 'andamento', depende_de: ['pendente', 'andamento'] }))).toBe('Em andamento · espera 2')
    expect(resumo(t('f', { depende_de: ['pendente'] }))).toBe('Bloqueada · vence 25/11')
    expect(resumo(t('g', { obrigatoria: true }))).toBe('A fazer · vence 25/11')
    expect(resumo(t('h', { obrigatoria: false }))).toBe('Opcional · vence 25/11')
  })
})
