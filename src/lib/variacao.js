// Variação de um número dos cartões contra o período anterior (design 2026-11-17-graficos-do-inicio-e-do-cliente,
// "Números e frases"): "▲ 12%" com o tom (bom, ruim ou neutro) e o sentido em palavras para o leitor de tela. Os dois
// números vêm do banco (painel_do_inicio e comparacao_do_inicio); aqui só a conta da diferença e o texto.
// - percentual (Realizado, Check-ins): em %; sem base no anterior (0), a diferença na unidade ("▲ 42 h").
// - pontos (Ocupação, em fração: 0,65 = 65%): em pontos percentuais. Com limiteDoBom (1 = 100%), acima dele subir é
//   ruim e descer é bom.
// - quantidade (Clientes, Aguardando): a diferença, e o % junto só quando o anterior tem 5 ou mais (e o % não dá 0).
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

const IGUAL = { texto: '= igual', tom: 'neutro', paraLeitor: 'igual' }
const ehNumero = (n) => typeof n === 'number' && Number.isFinite(n)
// Meio para longe do zero nos dois sentidos (Math.round(-1.5) daria -1 e Math.round(1.5), 2).
const arredondar = (n) => Math.sign(n) * Math.round(Math.abs(n))

function resultado(subiu, bom, mostrado, falado = mostrado) {
  return { texto: `${subiu ? '▲' : '▼'} ${mostrado}`, tom: bom ? 'bom' : 'ruim', paraLeitor: `${subiu ? 'subiu' : 'caiu'} ${falado}` }
}

// Sem um dos números (ex.: a ocupação vem nula com capacidade 0) devolve undefined: o cartão fica sem a linha. (Nulo,
// no CartoesDeNumeros, é "a comparação ainda carrega".)
export function variacao(atual, anterior, { tipo, subirEhBom = true, limiteDoBom = null, unidade = '' } = {}) {
  if (!ehNumero(atual) || !ehNumero(anterior)) return undefined
  const comUnidade = (n) => `${NUMERO.format(n)}${unidade ? ` ${unidade}` : ''}`

  if (tipo === 'pontos') {
    const pontos = arredondar((atual - anterior) * 100)
    if (pontos === 0) return IGUAL
    const subiu = pontos > 0
    const sobeBem = limiteDoBom != null && atual > limiteDoBom ? !subirEhBom : subirEhBom
    return resultado(subiu, subiu === sobeBem, `${Math.abs(pontos)} p.p.`, `${Math.abs(pontos)} pontos percentuais`)
  }

  const diferenca = atual - anterior
  if (diferenca === 0) return IGUAL
  const subiu = diferenca > 0
  const bom = subiu === subirEhBom

  if (tipo === 'quantidade') {
    const quanto = INTEIRO.format(Math.abs(diferenca))
    const pct = anterior >= 5 ? arredondar((Math.abs(diferenca) / anterior) * 100) : 0
    if (!pct) return resultado(subiu, bom, quanto)
    return resultado(subiu, bom, `${quanto} · ${pct}%`, `${quanto} (${pct}%)`)
  }

  // percentual
  if (anterior === 0) return resultado(subiu, bom, comUnidade(Math.abs(diferenca)))
  const pct = arredondar((Math.abs(diferenca) / Math.abs(anterior)) * 100)
  if (pct === 0) return IGUAL
  return resultado(subiu, bom, `${pct}%`)
}
