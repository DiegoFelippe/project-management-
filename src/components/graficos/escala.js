// Escala dos eixos dos gráficos (design 2026-11-17-graficos-do-inicio-e-do-cliente): números redondos no eixo Y
// (0 / 500 / 1.000; "10 mil" a partir de 10.000) e rótulos do eixo X com pelo menos 44 px entre eles.
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const limpo = (n) => Math.round(n * 1e9) / 1e9

// Topo e marcas redondas (passos de 1, 2, 2,5, 5 ou 10 × 10ⁿ) cobrindo `maximo` em cerca de `partes` faixas.
// `inteiro`: contagens (check-ins), passo inteiro e bonito (no mínimo 1; o 2,5 vira 2, nunca 0/3/6/9).
export function escalaBonita(maximo, partes = 4, inteiro = false) {
  const bruto = Math.max(maximo, 1e-9) / partes
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / ordem
  let passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * ordem
  if (inteiro && !Number.isInteger(limpo(passo))) passo = passo < 1 ? 1 : limpo(2 * ordem)
  const topo = limpo(Math.ceil(maximo / passo - 1e-9) * passo) || passo
  const marcas = []
  for (let i = 0; limpo(i * passo) <= topo; i++) marcas.push(limpo(i * passo))
  return { topo, marcas }
}

// De quantos em quantos itens vai um rótulo no eixo X para ficarem a `minimo` px um do outro (contando do último,
// que sempre aparece).
export function passoDosRotulos(n, largura, minimo = 44) {
  return Math.max(1, Math.ceil(n / Math.max(1, Math.floor(largura / minimo))))
}

// Rótulo do eixo Y: "1.500 h", "10 mil h", "2,5".
export function formatarEixo(valor, unidade = '') {
  const numero = valor >= 10000 ? `${NUMERO.format(valor / 1000)} mil` : NUMERO.format(valor)
  return unidade ? `${numero} ${unidade}` : numero
}

// Valor de um ponto na dica e no leitor de tela, com a unidade do gráfico (o número inteiro, sem "mil").
export function formatarValor(valor, unidade = '') {
  return unidade ? `${NUMERO.format(valor)} ${unidade}` : NUMERO.format(valor)
}

// Largura estimada de um rótulo de gráfico a 11 px (TAMANHO.legenda, Inter, números tabulares), por caractere, para
// a margem do eixo: o SVG não mede texto antes de desenhar. A estimativa fica um pouco acima da real.
const LARGURA_DO_CARACTERE = { ' ': 3.1, '.': 3.1, ',': 3.1, i: 2.8, l: 2.8, m: 9.6, h: 6.4, '%': 9 }
export function larguraDoTexto(texto) {
  return [...String(texto)].reduce((soma, c) => soma + (LARGURA_DO_CARACTERE[c] ?? 6.8), 0)
}

// Margem da esquerda do gráfico: o maior rótulo do eixo Y, os 8 px até a grade e 2 px de folga na borda.
export function margemDoEixo(rotulos) {
  return Math.ceil(Math.max(0, ...rotulos.map(larguraDoTexto))) + 10
}

// Coluna com a ponta de cima arredondada (`raio`; 0 = reta, para os segmentos de baixo de uma pilha) e a base reta.
export function caminhoDaColuna(x, base, largura, altura, raio = 4) {
  if (altura <= 0.5) return null
  const r = Math.min(raio, altura, largura / 2)
  const topo = base - altura
  return `M${x},${base}V${topo + r}A${r},${r} 0 0 1 ${x + r},${topo}H${x + largura - r}A${r},${r} 0 0 1 ${x + largura},${topo + r}V${base}Z`
}
