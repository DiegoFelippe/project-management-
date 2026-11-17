import { describe, expect, it } from 'vitest'
import { ALTURA_DO_NO, LARGURA_DO_NO, caminhoDaSeta, layoutDoFluxo, quebrarTitulo } from './fluxo'

const etapa = (id, nome = id) => ({ id, nome })
const tarefa = (id, etapaId, dependeDe = []) => ({ id, etapa_id: etapaId, depende_de: dependeDe })

// Duas caixas (x, y no canto de cima à esquerda, todas do mesmo tamanho) se tocam por dentro?
const encostam = (a, b) => a.x < b.x + LARGURA_DO_NO && b.x < a.x + LARGURA_DO_NO
  && a.y < b.y + ALTURA_DO_NO && b.y < a.y + ALTURA_DO_NO

function sobrepostas(nos) {
  const lista = Object.entries(nos)
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (encostam(lista[i][1], lista[j][1])) return [lista[i][0], lista[j][0]]
    }
  }
  return null
}

// O modelo grande do teste de volume: 500 tarefas em 12 etapas, cada uma esperando até 3 anteriores (de qualquer
// etapa, como o banco deixa). Sorteio com semente fixa: o mesmo desenho a cada rodada.
function modeloGrande(nEtapas = 12, nTarefas = 500) {
  let semente = 20261117
  const sortear = (n) => {
    semente = (semente * 48271) % 2147483647
    return semente % n
  }
  const etapas = Array.from({ length: nEtapas }, (_, i) => etapa(`e${i}`, `Etapa ${i + 1}`))
  const tarefas = Array.from({ length: nTarefas }, (_, i) => {
    const dependeDe = i === 0 ? [] : [...new Set(Array.from({ length: sortear(4) }, () => `t${sortear(i)}`))]
    return tarefa(`t${i}`, `e${Math.floor((i * nEtapas) / nTarefas)}`, dependeDe)
  })
  return { etapas, tarefas }
}

describe('layoutDoFluxo (deitado)', () => {
  it('sem dependências: uma coluna por etapa, as tarefas empilhadas na ordem, e uma raia por etapa', () => {
    const etapas = [etapa('e1'), etapa('e2')]
    const tarefas = [tarefa('a', 'e1'), tarefa('b', 'e1'), tarefa('c', 'e1'), tarefa('d', 'e2')]
    const { nos, raias, largura, altura } = layoutDoFluxo(etapas, tarefas, { vertical: false })

    expect(nos.a.x).toBe(nos.b.x)
    expect(nos.b.x).toBe(nos.c.x)
    expect(nos.a.y).toBeLessThan(nos.b.y)
    expect(nos.b.y).toBeLessThan(nos.c.y)
    expect(nos.b.y - nos.a.y).toBeGreaterThanOrEqual(ALTURA_DO_NO)
    expect(nos.d.x).toBeGreaterThan(nos.a.x + LARGURA_DO_NO)
    expect(nos.d.y).toBe(nos.a.y)

    expect(raias.map((r) => r.etapaId)).toEqual(['e1', 'e2'])
    expect(raias[0].inicio).toBeLessThanOrEqual(nos.a.x)
    expect(raias[0].fim).toBeGreaterThanOrEqual(nos.a.x + LARGURA_DO_NO)
    expect(raias[1].inicio).toBeGreaterThan(raias[0].fim)
    expect(largura).toBeGreaterThan(nos.d.x + LARGURA_DO_NO)
    expect(altura).toBeGreaterThan(nos.c.y + ALTURA_DO_NO)
  })

  it('dependência dentro da etapa empurra a tarefa para o nível seguinte (a raia cresce)', () => {
    const etapas = [etapa('e1')]
    const sozinha = layoutDoFluxo(etapas, [tarefa('a', 'e1'), tarefa('b', 'e1')], { vertical: false })
    const { nos, raias } = layoutDoFluxo(etapas, [tarefa('a', 'e1'), tarefa('b', 'e1', ['a']), tarefa('c', 'e1', ['b'])], {})

    expect(nos.b.x).toBeGreaterThanOrEqual(nos.a.x + LARGURA_DO_NO)
    expect(nos.c.x).toBeGreaterThanOrEqual(nos.b.x + LARGURA_DO_NO)
    expect(nos.b.y).toBe(nos.a.y)
    expect(raias[0].fim - raias[0].inicio).toBeGreaterThan(sozinha.raias[0].fim - sozinha.raias[0].inicio)
  })

  it('dependência de outra etapa não muda o nível: a tarefa procura a altura média das que ela espera', () => {
    const etapas = [etapa('e1'), etapa('e2')]
    const tarefas = [
      tarefa('a', 'e1'), tarefa('b', 'e1'), tarefa('c', 'e1'),
      tarefa('d', 'e2', ['c']), tarefa('e', 'e2', ['a', 'c']),
    ]
    const { nos } = layoutDoFluxo(etapas, tarefas, {})
    expect(nos.d.x).toBe(nos.e.x)
    expect(nos.e.y).toBe((nos.a.y + nos.c.y) / 2)
    expect(nos.d.y).toBe(nos.c.y)
  })

  it('etapa vazia ainda tem raia; dependência desconhecida (ou de tarefa que não está no desenho) é ignorada', () => {
    const etapas = [etapa('e1'), etapa('vazia'), etapa('e3')]
    const tarefas = [tarefa('a', 'e1', ['nao-existe']), tarefa('b', 'e3', ['a', 'sumiu'])]
    const { nos, raias } = layoutDoFluxo(etapas, tarefas, {})
    expect(raias.map((r) => r.etapaId)).toEqual(['e1', 'vazia', 'e3'])
    expect(raias[1].fim).toBeGreaterThan(raias[1].inicio)
    expect(Object.keys(nos).sort()).toEqual(['a', 'b'])
    expect(nos.b.y).toBe(nos.a.y)
  })

  it('tarefa de etapa que não está na lista fica fora do desenho; sem etapas, um quadro vazio', () => {
    const { nos } = layoutDoFluxo([etapa('e1')], [tarefa('a', 'e1'), tarefa('x', 'outra')], {})
    expect(Object.keys(nos)).toEqual(['a'])
    const vazio = layoutDoFluxo([], [], {})
    expect(vazio.nos).toEqual({})
    expect(vazio.raias).toEqual([])
    expect(Number.isFinite(vazio.largura) && vazio.largura > 0).toBe(true)
    expect(Number.isFinite(vazio.altura) && vazio.altura > 0).toBe(true)
  })
})

describe('layoutDoFluxo (em pé)', () => {
  it('"Em pé" troca os eixos: etapas e níveis descem, as tarefas do mesmo nível ficam lado a lado', () => {
    const etapas = [etapa('e1'), etapa('e2')]
    const tarefas = [tarefa('a', 'e1'), tarefa('b', 'e1'), tarefa('c', 'e1', ['a']), tarefa('d', 'e2', ['c'])]
    const deitado = layoutDoFluxo(etapas, tarefas, { vertical: false })
    const emPe = layoutDoFluxo(etapas, tarefas, { vertical: true })

    // Deitado: a e b empilhadas (mesmo x); c à direita de a; d mais à direita.
    expect(deitado.nos.a.x).toBe(deitado.nos.b.x)
    expect(deitado.nos.c.x).toBeGreaterThan(deitado.nos.a.x)
    // Em pé: a e b lado a lado (mesmo y); c embaixo de a; d mais embaixo, alinhada com c.
    expect(emPe.nos.a.y).toBe(emPe.nos.b.y)
    expect(emPe.nos.b.x).toBeGreaterThanOrEqual(emPe.nos.a.x + LARGURA_DO_NO)
    expect(emPe.nos.c.y).toBeGreaterThanOrEqual(emPe.nos.a.y + ALTURA_DO_NO)
    expect(emPe.nos.c.x).toBe(emPe.nos.a.x)
    expect(emPe.nos.d.y).toBeGreaterThan(emPe.nos.c.y)
    expect(emPe.nos.d.x).toBe(emPe.nos.c.x)
    expect(emPe.raias[1].inicio).toBeGreaterThan(emPe.raias[0].fim)
    expect(emPe.altura).toBeGreaterThan(emPe.nos.d.y + ALTURA_DO_NO)
  })

  it('em pé cabe num celular de 360 px quando só há uma tarefa por nível', () => {
    const { largura } = layoutDoFluxo([etapa('e1')], [tarefa('a', 'e1'), tarefa('b', 'e1', ['a'])], { vertical: true })
    expect(largura).toBeLessThanOrEqual(320)
    expect(largura).toBeGreaterThanOrEqual(LARGURA_DO_NO + 40)
  })
})

describe('layoutDoFluxo: nenhuma caixa sobre outra e volume', () => {
  it.each([false, true])('500 tarefas em 12 etapas (vertical=%s): todas no desenho, nenhuma encosta em outra, cada uma na sua raia', (vertical) => {
    const { etapas, tarefas } = modeloGrande()
    const { nos, raias, largura, altura } = layoutDoFluxo(etapas, tarefas, { vertical })
    expect(Object.keys(nos)).toHaveLength(500)
    expect(sobrepostas(nos)).toBeNull()
    expect(Number.isFinite(largura) && Number.isFinite(altura)).toBe(true)
    const raiaDe = Object.fromEntries(raias.map((r) => [r.etapaId, r]))
    for (const t of tarefas) {
      const p = nos[t.id]
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + LARGURA_DO_NO).toBeLessThanOrEqual(largura)
      expect(p.y + ALTURA_DO_NO).toBeLessThanOrEqual(altura)
      const r = raiaDe[t.etapa_id]
      const [ponta, tamanho] = vertical ? [p.y, ALTURA_DO_NO] : [p.x, LARGURA_DO_NO]
      expect(ponta).toBeGreaterThanOrEqual(r.inicio)
      expect(ponta + tamanho).toBeLessThanOrEqual(r.fim)
    }
  })

  it('500 tarefas em 12 etapas cabem numa caixa finita em menos de 100 ms (deitado e em pé)', () => {
    const { etapas, tarefas } = modeloGrande()
    for (const vertical of [false, true]) {
      const inicio = performance.now()
      const { nos, largura, altura } = layoutDoFluxo(etapas, tarefas, { vertical })
      const gasto = performance.now() - inicio
      expect(gasto).toBeLessThan(100)
      expect(Object.keys(nos)).toHaveLength(500)
      expect(largura).toBeGreaterThan(0)
      expect(altura).toBeGreaterThan(0)
      expect(largura).toBeLessThan(200_000)
      expect(altura).toBeLessThan(200_000)
    }
  })

  it('uma corrente de 500 tarefas numa etapa só (o pior caso de níveis) também é rápida e sem sobreposição', () => {
    const tarefas = Array.from({ length: 500 }, (_, i) => tarefa(`t${i}`, 'e1', i ? [`t${i - 1}`] : []))
    const inicio = performance.now()
    const { nos } = layoutDoFluxo([etapa('e1')], tarefas, { vertical: true })
    expect(performance.now() - inicio).toBeLessThan(100)
    expect(Object.keys(nos)).toHaveLength(500)
    expect(sobrepostas(nos)).toBeNull()
  })
})

describe('caminhoDaSeta', () => {
  it('deitado: sai do meio do lado direito da caixa e chega (antes da ponta) no meio do lado esquerdo da outra', () => {
    const d = caminhoDaSeta({ x: 0, y: 0 }, { x: 300, y: 100 }, { vertical: false })
    expect(d).toMatch(new RegExp(`^M${LARGURA_DO_NO} ${ALTURA_DO_NO / 2} C`))
    expect(d).toMatch(new RegExp(` 297 ${100 + ALTURA_DO_NO / 2}$`))
  })

  it('em pé: sai do meio de baixo e chega no meio de cima da outra', () => {
    const d = caminhoDaSeta({ x: 0, y: 0 }, { x: 300, y: 200 }, { vertical: true })
    expect(d).toMatch(new RegExp(`^M${LARGURA_DO_NO / 2} ${ALTURA_DO_NO} C`))
    expect(d).toMatch(new RegExp(` ${300 + LARGURA_DO_NO / 2} 197$`))
  })

  it('a curva nunca fica achatada: caixas coladas ainda dão uma curva (controle de pelo menos 16 px)', () => {
    const d = caminhoDaSeta({ x: 0, y: 0 }, { x: LARGURA_DO_NO + 3, y: 0 }, {})
    const [, x1, , c1x] = d.match(/^M([\d.]+) ([\d.]+) C([\d.]+)/)
    expect(Number(c1x) - Number(x1)).toBeGreaterThanOrEqual(16)
  })
})

describe('quebrarTitulo', () => {
  it('título curto: uma linha só', () => {
    expect(quebrarTitulo('Análise do DRE', 20)).toEqual(['Análise do DRE'])
  })

  it('título longo: quebra nas palavras em até duas linhas; o que sobra vira reticências', () => {
    expect(quebrarTitulo('Reunião de abertura com sócios', 20)).toEqual(['Reunião de abertura', 'com sócios'])
    const linhas = quebrarTitulo('Levantamento dos custos fixos e variáveis da operação', 20)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toBe('Levantamento dos')
    expect(linhas[1].endsWith('…')).toBe(true)
    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(20)
  })

  it('palavra maior que a linha é cortada com reticências; espaços a mais não contam; vazio não tem linha', () => {
    expect(quebrarTitulo('Supercalifragilisticexpialidocious', 20)).toEqual(['Supercalifragilisti…'])
    expect(quebrarTitulo('  Plano   de   ação  ', 20)).toEqual(['Plano de ação'])
    expect(quebrarTitulo('   ', 20)).toEqual([])
  })
})
