import { describe, expect, it } from 'vitest'
import {
  contagemDaEtapa, diaCurto, entraNoFiltro, estaResolvida, feitaPorEm, mesmaSituacao, naoSeAplicaEmPalavras, progressoEmPalavras,
  quandoVence, resumoDaSituacao, rotuloDaSituacao, situacaoDaTarefa,
} from './situacao'

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

  it('não se aplica: cinza, nunca atrasada nem "vence hoje", e não espera ninguém', () => {
    const s = situacao(t('x', { estado: 'nao_se_aplica', motivo: 'Já feito pelo cliente', vence_em: '2026-11-01', depende_de: ['pendente'] }))
    expect(s).toMatchObject({ cor: 'nao_se_aplica', bloqueada: false, atrasada: false, venceHoje: false, espera: [] })
    expect(situacao(t('y', { estado: 'nao_se_aplica', vence_em: HOJE })).venceHoje).toBe(false)
  })

  it('a que não se aplica libera as que dependem dela, como a feita', () => {
    const naoSeAplica = t('nsa', { estado: 'nao_se_aplica', motivo: 'Não precisa' })
    const depende = t('d', { depende_de: ['feita', 'nsa'] })
    expect(situacaoDaTarefa(depende, { ...POR_ID, nsa: naoSeAplica }, HOJE)).toMatchObject({ cor: 'livre', bloqueada: false })
  })

  // Pedido do Diego (18/11): a bloqueada pode ser "não se aplica"; as que dependem dela esperam as dependências dela.
  it('cadeia: C depende de B (não se aplica), B depende de A (pendente): C espera A; A feita libera C', () => {
    const A = t('A')
    const B = t('B', { estado: 'nao_se_aplica', motivo: 'x', depende_de: ['A'] })
    const C = t('C', { depende_de: ['B'] })
    expect(situacaoDaTarefa(C, { A, B, C }, HOJE)).toMatchObject({ cor: 'bloqueada', bloqueada: true })
    expect(situacaoDaTarefa(C, { A, B, C }, HOJE).espera.map((x) => x.id)).toEqual(['A'])
    expect(situacaoDaTarefa(C, { A: { ...A, estado: 'feita' }, B, C }, HOJE)).toMatchObject({ cor: 'livre', espera: [] })
    // Reaberta B (pendente): C espera B.
    expect(situacaoDaTarefa(C, { A, B: { ...B, estado: 'a_fazer' }, C }, HOJE).espera.map((x) => x.id)).toEqual(['B'])
  })

  it('cadeia longa e em losango: atravessa várias que não se aplicam, sem repetir quem ela espera', () => {
    const A = t('A', { estado: 'andamento' })
    const X = t('X', { estado: 'nao_se_aplica', depende_de: ['A'] })
    const Y = t('Y', { estado: 'nao_se_aplica', depende_de: ['A', 'X'] })
    const F = t('F', { estado: 'feita', depende_de: ['A'] })
    const C = t('C', { depende_de: ['X', 'Y', 'F'] })
    const s = situacaoDaTarefa(C, { A, X, Y, F, C }, HOJE)
    expect(s.espera.map((x) => x.id)).toEqual(['A'])
    // A feita interrompe a cadeia (feita conta sozinha, como antes).
    expect(situacaoDaTarefa(t('D', { depende_de: ['F'] }), { A, F }, HOJE).bloqueada).toBe(false)
  })

  it('estaResolvida: feita ou não se aplica', () => {
    expect([FEITA, PENDENTE, ANDAMENTO, t('n', { estado: 'nao_se_aplica' })].map(estaResolvida)).toEqual([true, false, false, true])
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

describe('pausada (acréscimo de 18/11 (2))', () => {
  const PAUSADA = t('pausada', { estado: 'pausada', vence_em: '2026-11-20' })
  const COM_PAUSADA = { ...POR_ID, pausada: PAUSADA }

  it('cor própria e pendente: atrasada e "vence hoje" vêm antes na cor; segura as que dependem dela', () => {
    expect(situacao(PAUSADA, COM_PAUSADA)).toMatchObject({ cor: 'pausada', faltam: 3, bloqueada: false })
    expect(situacao(t('p', { estado: 'pausada', vence_em: '2026-11-16' }))).toMatchObject({ cor: 'atrasada', atrasada: true })
    expect(situacao(t('p', { estado: 'pausada', vence_em: HOJE }))).toMatchObject({ cor: 'hoje', venceHoje: true })
    expect(situacao(t('d', { depende_de: ['pausada'] }), COM_PAUSADA)).toMatchObject({ cor: 'bloqueada', bloqueada: true })
    expect(estaResolvida(PAUSADA)).toBe(false)
    expect(entraNoFiltro(PAUSADA, 'pendentes')).toBe(true)
    expect(entraNoFiltro(PAUSADA, 'feitas')).toBe(false)
  })

  it('o nome e a linha de baixo do fluxograma dizem "Pausada" (bloqueada: com quantas ela espera)', () => {
    expect(rotuloDaSituacao(PAUSADA, situacao(PAUSADA, COM_PAUSADA))).toBe('Pausada')
    expect(resumoDaSituacao(PAUSADA, situacao(PAUSADA, COM_PAUSADA))).toBe('Pausada · 20/11')
    const presa = t('presa', { estado: 'pausada', depende_de: ['pendente'] })
    expect(rotuloDaSituacao(presa, situacao(presa))).toBe('Pausada · espera 1 tarefa')
    expect(resumoDaSituacao(presa, situacao(presa))).toBe('Pausada · espera 1')
  })
})

describe('mesmaSituacao', () => {
  it('compara pelo que a tela mostra, não pela identidade do objeto', () => {
    expect(mesmaSituacao(situacao(BLOQUEADA), situacao(BLOQUEADA))).toBe(true)
    expect(mesmaSituacao(situacao(LIVRE), situacao(PENDENTE))).toBe(true)
    // A de que ela depende ficou feita: deixa de esperar.
    const liberou = { ...POR_ID, pendente: { ...PENDENTE, estado: 'feita' } }
    expect(mesmaSituacao(situacao(BLOQUEADA), situacao(BLOQUEADA, liberou))).toBe(false)
    expect(mesmaSituacao(situacao(LIVRE), situacao({ ...LIVRE, vence_em: '2026-11-26' }))).toBe(false)
    expect(mesmaSituacao(situacao(LIVRE), undefined)).toBe(false)
  })
})

describe('rotuloDaSituacao', () => {
  const rotulo = (tarefa) => rotuloDaSituacao(tarefa, situacao(tarefa))

  it('o estado em palavras, com o aviso de prazo junto', () => {
    expect(rotulo(FEITA)).toBe('Feita')
    expect(rotulo(LIVRE)).toBe('A fazer')
    expect(rotulo(ANDAMENTO)).toBe('Em andamento')
    expect(rotulo(BLOQUEADA)).toBe('Bloqueada')
    expect(rotulo(t('n', { estado: 'nao_se_aplica', vence_em: '2026-11-01' }))).toBe('Não se aplica')
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
    for (const estado of ['a_fazer', 'andamento', 'feita', 'nao_se_aplica']) {
      for (const vence_em of ['2026-11-25', HOJE, '2026-11-01', null]) {
        for (const depende_de of [[], ['feita'], ['pendente']]) casos.push(t('c', { estado, vence_em, depende_de }))
      }
    }
    const comeco = { andamento: 'Em andamento', bloqueada: 'Bloqueada', feita: 'Feita', livre: 'A fazer', nao_se_aplica: 'Não se aplica' }
    for (const caso of casos) {
      const s = situacao(caso)
      if (comeco[s.cor]) expect(rotulo(caso), JSON.stringify(caso)).toMatch(new RegExp(`^${comeco[s.cor]}`))
    }
  })
})

describe('progresso em palavras', () => {
  it('"3 de 5 feitas"; com alguma que não se aplica, "resolvidas" e a concordância certa', () => {
    expect(progressoEmPalavras({ tarefas: 5, feitas: 3 })).toBe('3 de 5 feitas')
    expect(progressoEmPalavras({ tarefas: 5, feitas: 3, nao_se_aplica: 1 })).toBe('4 de 5 resolvidas: 3 feitas, 1 não se aplica')
    expect(progressoEmPalavras({ tarefas: 6, feitas: 1, nao_se_aplica: 2 })).toBe('3 de 6 resolvidas: 1 feita, 2 não se aplicam')
    expect(naoSeAplicaEmPalavras(1)).toBe('1 não se aplica')
    expect(naoSeAplicaEmPalavras(1200)).toBe('1.200 não se aplicam')
  })

  it('contagemDaEtapa: "1 de 3 feitas" ou, com alguma que não se aplica, "2 de 3 resolvidas"', () => {
    expect(contagemDaEtapa([t('a', { estado: 'feita' }), t('b'), t('c')])).toBe('1 de 3 feitas')
    expect(contagemDaEtapa([t('a', { estado: 'feita' }), t('b', { estado: 'nao_se_aplica' }), t('c')])).toBe('2 de 3 resolvidas')
  })
})

describe('datas e o resumo curto', () => {
  it('diaCurto: dia e mês', () => {
    expect(diaCurto('2026-11-05')).toBe('05/11')
  })

  it('feitaPorEm: quem e o dia (em São Paulo); sem o nome quando o banco o esconde', () => {
    expect(feitaPorEm({ feita_em: '2026-11-13T02:00:00Z', feita_por: { nome: 'Ana Lima' } })).toBe('por Ana Lima em 12/11/2026')
    expect(feitaPorEm({ feita_em: '2026-11-12T15:00:00Z', feita_por: { nome: null } })).toBe('feita em 12/11/2026')
    // Na que não se aplica, feita_por e feita_em dizem quem marcou e quando.
    expect(feitaPorEm({ estado: 'nao_se_aplica', feita_em: '2026-11-12T15:00:00Z', feita_por: { nome: null } }))
      .toBe('marcada em 12/11/2026')
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
    expect(resumo(t('i', { estado: 'nao_se_aplica', vence_em: '2026-11-01', feita_em: '2026-11-13T02:00:00Z' })))
      .toBe('Não se aplica')
  })
})
