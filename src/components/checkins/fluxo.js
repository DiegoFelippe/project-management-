// Desenho do fluxograma das tarefas (modelo de check-in e check-list do cliente), o algoritmo do protótipo
// (docs/prototipo/checkins-modelo-poc.html, layoutFluxo): uma raia por etapa; dentro dela, níveis pelas dependências da
// mesma etapa (a tarefa vai para o nível seguinte ao da última que ela espera); em cada nível, cada tarefa procura a
// altura média das que ela espera (menos setas cruzadas) e desce o que for preciso para não ficar sobre a de cima.
// "Em pé" troca os eixos: as etapas e os níveis descem e as tarefas do mesmo nível ficam lado a lado.
//
// Toda dependência aponta para uma tarefa anterior (o banco garante), então não há ciclo; uma que aponte para depois
// (rascunho do editor) ou para quem não está no desenho é ignorada aqui. Cada tarefa e cada dependência são vistas uma
// vez: 500 tarefas desenham em poucos milissegundos.

// Tela de celular (até 639 px): lá o fluxograma começa "Em pé".
export const ehCelular = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches

export const LARGURA_DO_NO = 184
export const ALTURA_DO_NO = 62
// Em pé, a largura mínima do desenho (cabe no cartão de um celular de 360 px com uma tarefa por nível).
export const LARGURA_MINIMA_EM_PE = 300
const MARGEM = 22

// "maior" é o eixo das etapas e dos níveis (x deitado, y em pé); "menor", o das tarefas do mesmo nível.
const DEITADO = {
  tamMaior: LARGURA_DO_NO, tamMenor: ALTURA_DO_NO, gapMaior: 36, gapMenor: 14, gapEtapa: 54, cabecalho: 0, inicioMenor: 58,
}
const EM_PE = {
  tamMaior: ALTURA_DO_NO, tamMenor: LARGURA_DO_NO, gapMaior: 34, gapMenor: 16, gapEtapa: 30, cabecalho: 34, inicioMenor: MARGEM,
}

// → { nos: { [id]: { x, y } } (canto de cima à esquerda da caixa), raias: [{ etapaId, inicio, fim }] (no eixo das
// etapas), largura, altura }. `etapas` e `tarefas` na ordem do modelo; tarefa de etapa que não está na lista fica fora.
export function layoutDoFluxo(etapas, tarefas, { vertical = false } = {}) {
  const cfg = vertical ? EM_PE : DEITADO
  const daEtapa = new Map(etapas.map((e) => [e.id, []]))
  for (const t of tarefas) daEtapa.get(t.etapa_id)?.push(t)

  const pos = new Map()
  const raias = []
  let maior = MARGEM
  for (const etapa of etapas) {
    const inicio = maior
    maior += cfg.cabecalho
    // Níveis: só as dependências da mesma etapa contam (as de outras etapas já estão em raias anteriores).
    const nivel = new Map()
    const porNivel = []
    for (const t of daEtapa.get(etapa.id)) {
      let n = 0
      for (const d of t.depende_de ?? []) {
        const nd = nivel.get(d)
        if (nd !== undefined && nd + 1 > n) n = nd + 1
      }
      nivel.set(t.id, n)
      ;(porNivel[n] ??= []).push(t)
    }
    const niveis = Math.max(1, porNivel.length)
    porNivel.forEach((doNivel, lv) => {
      const grupo = doNivel.map((t, i) => {
        let soma = 0
        let quantas = 0
        for (const d of t.depende_de ?? []) {
          const p = pos.get(d)
          if (p) {
            soma += p.menor
            quantas += 1
          }
        }
        return { t, alvo: quantas ? soma / quantas : cfg.inicioMenor + i * (cfg.tamMenor + cfg.gapMenor) }
      }).sort((a, b) => a.alvo - b.alvo)
      let cursor = cfg.inicioMenor
      for (const { t, alvo } of grupo) {
        const menor = Math.max(cursor, alvo)
        pos.set(t.id, { maior: maior + lv * (cfg.tamMaior + cfg.gapMaior), menor })
        cursor = menor + cfg.tamMenor + cfg.gapMenor
      }
    })
    maior += niveis * cfg.tamMaior + (niveis - 1) * cfg.gapMaior
    raias.push({ etapaId: etapa.id, inicio, fim: maior })
    maior += cfg.gapEtapa
  }

  const fimMaior = (raias.length ? maior - cfg.gapEtapa : maior) + MARGEM
  let fimMenor = cfg.inicioMenor + cfg.tamMenor
  for (const p of pos.values()) fimMenor = Math.max(fimMenor, p.menor + cfg.tamMenor)
  fimMenor += MARGEM

  const nos = {}
  for (const [id, p] of pos) nos[id] = vertical ? { x: p.menor, y: p.maior } : { x: p.maior, y: p.menor }
  return vertical
    ? { nos, raias, largura: Math.max(LARGURA_MINIMA_EM_PE, fimMenor), altura: fimMaior }
    : { nos, raias, largura: fimMaior, altura: fimMenor }
}

// O `d` da seta de `de` (a tarefa esperada) para `para` (a que espera): uma curva do lado de saída de uma caixa ao de
// chegada da outra, parando 3 px antes para a ponta da seta não entrar na caixa.
export function caminhoDaSeta(de, para, { vertical = false } = {}) {
  if (!vertical) {
    const x1 = de.x + LARGURA_DO_NO
    const y1 = de.y + ALTURA_DO_NO / 2
    const x2 = para.x - 3
    const y2 = para.y + ALTURA_DO_NO / 2
    const d = Math.max(18, Math.abs(x2 - x1) / 2)
    return `M${x1} ${y1} C${x1 + d} ${y1} ${x2 - d} ${y2} ${x2} ${y2}`
  }
  const x1 = de.x + LARGURA_DO_NO / 2
  const y1 = de.y + ALTURA_DO_NO
  const x2 = para.x + LARGURA_DO_NO / 2
  const y2 = para.y - 3
  const d = Math.max(16, Math.abs(y2 - y1) / 2)
  return `M${x1} ${y1} C${x1} ${y1 + d} ${x2} ${y2 - d} ${x2} ${y2}`
}

export const cortar = (texto, max) => (texto.length > max ? `${texto.slice(0, Math.max(1, max - 1))}…` : texto)

// Título da caixa em até duas linhas de `max` letras, quebrando nas palavras; o que não cabe vira reticências.
export function quebrarTitulo(texto, max) {
  const linhas = []
  let atual = ''
  for (const palavra of String(texto ?? '').split(/\s+/).filter(Boolean)) {
    if (!atual) atual = palavra
    else if (`${atual} ${palavra}`.length <= max) atual += ` ${palavra}`
    else {
      linhas.push(atual)
      atual = palavra
    }
  }
  if (atual) linhas.push(atual)
  if (linhas.length > 2) {
    linhas.length = 2
    linhas[1] = cortar(`${linhas[1]} …`, max)
  }
  return linhas.map((l) => cortar(l, max))
}
