import { describe, expect, it } from 'vitest'
import { rotuloDaSituacao, situacaoDaTarefa } from './situacao'

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
    expect(rotulo(t('z', { estado: 'andamento', vence_em: '2026-11-01', depende_de: ['pendente'] }))).toBe('Bloqueada, atrasada')
  })
})
