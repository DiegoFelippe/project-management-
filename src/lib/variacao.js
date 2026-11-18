// Variação de um número dos cartões contra o período anterior (design 2026-11-17-graficos-do-inicio-e-do-cliente,
// "Números e frases"): "▲ 12%" com o tom (bom, ruim ou neutro) e o sentido em palavras para o leitor de tela. Os dois
// números vêm do banco (painel_do_inicio e comparacao_do_inicio); aqui só a conta da diferença e o texto.
// - percentual (Realizado, Check-ins): em %; sem base no anterior (0), a diferença na unidade ("▲ 42 h").
// - pontos (Ocupação, em fração: 0,65 = 65%): em pontos percentuais. Com limiteDoBom (1 = 100%), acima dele subir é
//   ruim e descer é bom.
// - quantidade (Clientes, Aguardando): a diferença, e o % junto só quando o anterior tem 5 ou mais.
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

const IGUAL = { texto: '= igual', tom: 'neutro', paraLeitor: 'igual' }
const ehNumero = (n) => typeof n === 'number' && Number.isFinite(n)

function resultado(subiu, bom, mostrado, falado = mostrado) {
  return { texto: `${subiu ? '▲' : '▼'} ${mostrado}`, tom: bom ? 'bom' : 'ruim', paraLeitor: `${subiu ? 'subiu' : 'caiu'} ${falado}` }
}

export function variacao(atual, anterior, { tipo, subirEhBom = true, limiteDoBom = null, unidade = '' } = {}) {
  if (!ehNumero(atual) || !ehNumero(anterior)) return null
  const comUnidade = (n) => `${NUMERO.format(n)}${unidade ? ` ${unidade}` : ''}`

  if (tipo === 'pontos') {
    const pontos = Math.round((atual - anterior) * 100)
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
    if (anterior < 5) return resultado(subiu, bom, quanto)
    const pct = `${Math.round((Math.abs(diferenca) / anterior) * 100)}%`
    return resultado(subiu, bom, `${quanto} · ${pct}`, `${quanto} (${pct})`)
  }

  // percentual
  if (anterior === 0) return resultado(subiu, bom, comUnidade(Math.abs(diferenca)))
  const pct = Math.round((Math.abs(diferenca) / Math.abs(anterior)) * 100)
  if (pct === 0) return IGUAL
  return resultado(subiu, bom, `${pct}%`)
}
