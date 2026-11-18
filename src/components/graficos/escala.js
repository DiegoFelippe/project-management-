// Escala dos eixos dos gráficos (design 2026-11-17-graficos-do-inicio-e-do-cliente): números redondos no eixo Y
// (0 / 500 / 1.000; "10 mil" a partir de 10.000) e rótulos do eixo X com pelo menos 44 px entre eles.
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const limpo = (n) => Math.round(n * 1e9) / 1e9

// Topo e marcas redondas (passos de 1, 2, 2,5, 5 ou 10 × 10ⁿ) cobrindo `maximo` em cerca de `partes` faixas.
// `inteiro`: contagens (check-ins), passo de no mínimo 1.
export function escalaBonita(maximo, partes = 4, inteiro = false) {
  const bruto = Math.max(maximo, 1e-9) / partes
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / ordem
  let passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * ordem
  if (inteiro) passo = Math.max(1, Math.round(passo))
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
