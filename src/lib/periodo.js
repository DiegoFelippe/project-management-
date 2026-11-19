// Período do painel do Início (pedido do Diego, 17/11): o Mês (padrão) ou um intervalo de dias de São Paulo.
// Os atalhos contam a partir de hoje; Personalizado traz as datas escolhidas. O banco recebe o mês ou { de, ate }
// e confere os mesmos limites (painel_do_inicio). Datas sempre como texto "AAAA-MM-DD", sem passar por fuso.
import { MESES_CURTOS, formatarDia, rotuloCurto } from '@/lib/mes'

export const TIPOS_DE_PERIODO = [
  { valor: 'mes', rotulo: 'Mês' },
  { valor: 'ultimos-30', rotulo: 'Últimos 30 dias' },
  { valor: 'ultimos-90', rotulo: 'Últimos 90 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
]
const TIPOS = new Set(TIPOS_DE_PERIODO.map((t) => t.valor))

const doisDigitos = (n) => String(n).padStart(2, '0')
const paraTexto = (data) => `${data.getUTCFullYear()}-${doisDigitos(data.getUTCMonth() + 1)}-${doisDigitos(data.getUTCDate())}`
const partes = (dia) => dia.split('-').map(Number)

// "2026-11-17" + n dias (n pode ser negativo).
export function somarDias(dia, n) {
  const [a, m, d] = partes(dia)
  return paraTexto(new Date(Date.UTC(a, m - 1, d + n)))
}

// Último dia do mês de "AAAA-MM-01".
export function fimDoMes(mes) {
  const [a, m] = partes(mes)
  return paraTexto(new Date(Date.UTC(a, m, 0)))
}

const primeiroDoMes = (dia) => `${dia.slice(0, 7)}-01`

// Mesmo dia, n anos depois; 29/02 cai em 28/02 num ano comum (como o "+ interval '2 years'" do banco).
function somarAnos(dia, n) {
  const [a, m, d] = partes(dia)
  return `${a + n}-${doisDigitos(m)}-${doisDigitos(Math.min(d, Number(fimDoMes(`${a + n}-${doisDigitos(m)}-01`).slice(8))))}`
}

const ehMes = (texto) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(texto ?? '')
function ehDia(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto ?? '')) return false
  const [a, m, d] = partes(texto)
  return m >= 1 && m <= 12 && d >= 1 && d <= Number(fimDoMes(`${a}-${doisDigitos(m)}-01`).slice(8))
}

// De e até de cada atalho, a partir de hoje.
function diasDoAtalho(tipo, hoje) {
  if (tipo === 'ultimos-30') return { de: somarDias(hoje, -29), ate: hoje }
  if (tipo === 'ultimos-90') return { de: somarDias(hoje, -89), ate: hoje }
  return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje } // ano
}

// O período pedido no endereço (?periodo=mes&mes=AAAA-MM-01, ?periodo=ultimos-30|ultimos-90|ano ou
// ?periodo=personalizado&de=…&ate=…). Sem nada, ou com algo que não se entende, é o Mês atual. Sempre traz de e até.
export function lerPeriodo(parametros, hoje) {
  const pedido = parametros.get('periodo')
  const tipo = TIPOS.has(pedido) ? pedido : 'mes'
  if (tipo === 'mes') {
    const mes = ehMes(parametros.get('mes')) ? parametros.get('mes') : primeiroDoMes(hoje)
    return { tipo, mes, de: mes, ate: fimDoMes(mes) }
  }
  if (tipo === 'personalizado') {
    const de = parametros.get('de')
    const ate = parametros.get('ate')
    return ehDia(de) && ehDia(ate) ? { tipo, de, ate } : { tipo, de: primeiroDoMes(hoje), ate: hoje }
  }
  return { tipo, ...diasDoAtalho(tipo, hoje) }
}

// O que vai para o endereço: só o que o período precisa (os atalhos se recontam a partir de hoje ao abrir).
export function paraEndereco(periodo) {
  if (periodo.tipo === 'mes') return { periodo: 'mes', mes: periodo.mes }
  if (periodo.tipo === 'personalizado') return { periodo: 'personalizado', de: periodo.de, ate: periodo.ate }
  return { periodo: periodo.tipo }
}

// Ao trocar o tipo: Personalizado começa no período mostrado (sem passar do fim do mês atual; um mês futuro volta para
// o mês atual) e o Mês vai para o mês do fim do período mostrado.
export function periodoAoTrocar(atual, tipo, hoje) {
  if (tipo === 'mes') return { tipo, mes: primeiroDoMes(atual.ate) }
  if (tipo !== 'personalizado') return { tipo }
  const limite = fimDoMes(primeiroDoMes(hoje))
  if (atual.de > limite) return { tipo, de: primeiroDoMes(hoje), ate: limite }
  return { tipo, de: atual.de, ate: atual.ate > limite ? limite : atual.ate }
}

// Frase do erro (ou nulo quando o período vale): as mesmas regras do banco.
export function validarPeriodo(de, ate, hoje) {
  if (!de || !ate) return 'Escolha as duas datas.'
  if (de > ate) return 'A data inicial vem depois da final.'
  if (ate > fimDoMes(primeiroDoMes(hoje))) return 'O período vai no máximo até o fim do mês atual.'
  if (ate >= somarAnos(de, 2)) return 'O período pode ter no máximo 2 anos.'
  return null
}

// "19/10/2026 a 17/11/2026" (ou só o dia, quando de = até).
export const descreverPeriodo = (de, ate) => (de === ate ? formatarDia(de) : `${formatarDia(de)} a ${formatarDia(ate)}`)

// Último dia que o Até pode ter: o fim do mês atual.
export const ultimoDiaPermitido = (hoje) => fimDoMes(primeiroDoMes(hoje))

const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// Rótulo do período anterior na linha de variação dos cartões ("▲ 12% vs set/26"). O banco calcula o anterior
// (private.periodo_anterior) e manda { de, ate, forma }; aqui só o texto: mês inteiro "vs set/26", mês até um dia
// "vs 1–17 de out.", ano "vs mesmo período de 2025" e os N dias antes "vs 18/09 a 17/10" (com o ano quando muda).
export function rotuloDaComparacao({ de, ate, forma }) {
  if (forma === 'mes') return `vs ${rotuloCurto(de)}`
  if (forma === 'mes_parcial') {
    const [inicio, fim] = [Number(de.slice(8, 10)), Number(ate.slice(8, 10))]
    return `vs ${inicio === fim ? inicio : `${inicio}–${fim}`} de ${MESES_CURTOS[Number(de.slice(5, 7)) - 1]}.`
  }
  if (forma === 'ano_anterior') return `vs mesmo período de ${de.slice(0, 4)}`
  if (de === ate) return `vs ${diaMes(de)}`
  return de.slice(0, 4) === ate.slice(0, 4) ? `vs ${diaMes(de)} a ${diaMes(ate)}` : `vs ${formatarDia(de)} a ${formatarDia(ate)}`
}
