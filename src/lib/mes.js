// Mês de trabalho: "YYYY-MM-01". "Hoje" é sempre o de São Paulo, onde a equipe está.
export const FUSO = 'America/Sao_Paulo'

export function mesAtual(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).formatToParts(agora)
  const valor = (tipo) => partes.find((p) => p.type === tipo).value
  return `${valor('year')}-${valor('month')}-01`
}

export function deslocarMes(mes, quantidade) {
  const [ano, numero] = mes.split('-').map(Number)
  const data = new Date(Date.UTC(ano, numero - 1 + quantidade, 1))
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// Deslocamento de São Paulo em relação a UTC naquele instante, em minutos (-180 para "GMT-03:00"), pelo fuso do
// Intl: acompanha o horário de verão (o de 2018/2019 era -02:00) e qualquer mudança futura da regra.
const DESLOCAMENTO = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, timeZoneName: 'longOffset' })

export function deslocamentoEmSP(instante) {
  const nome = DESLOCAMENTO.formatToParts(instante).find((p) => p.type === 'timeZoneName').value
  const [, sinal, horas, minutos] = nome.match(/^GMT(?:([+-])(\d{2}):?(\d{2})?)?$/) ?? []
  if (!sinal) return 0
  return (sinal === '-' ? -1 : 1) * (Number(horas) * 60 + Number(minutos ?? 0))
}

const doisDigitos = (n) => String(n).padStart(2, '0')

// Meia-noite de "YYYY-MM-DD" em São Paulo, como "YYYY-MM-DDT00:00:00-03:00". O deslocamento é o do instante da
// meia-noite local: tenta o da meia-noite em UTC e confere de novo (na virada do horário de verão eles diferem).
export function meiaNoiteEmSP(dia) {
  const meiaNoiteUtc = Date.parse(`${dia}T00:00:00Z`)
  let deslocamento = deslocamentoEmSP(new Date(meiaNoiteUtc))
  deslocamento = deslocamentoEmSP(new Date(meiaNoiteUtc - deslocamento * 60000))
  const absoluto = Math.abs(deslocamento)
  const sinal = deslocamento < 0 ? '-' : '+'
  return `${dia}T00:00:00${sinal}${doisDigitos(Math.floor(absoluto / 60))}:${doisDigitos(absoluto % 60)}`
}

// Limites do mês "YYYY-MM-01" no fuso de São Paulo: [início do mês, início do mês seguinte), para filtrar
// instantes (timestamptz) do mês com gte/lt.
export function limitesDoMesEmSP(mes) {
  return [meiaNoiteEmSP(mes.slice(0, 10)), meiaNoiteEmSP(deslocarMes(mes, 1))]
}

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "2026-03-01" -> "mar/26" (rótulo dos gráficos de horas por mês).
export const rotuloCurto = (mes) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`

// "2026-11-01" -> "Novembro de 2026" (só a primeira letra maiúscula; o capitalize do CSS faria "Novembro De 2026").
export function rotuloDoMes(mes) {
  const [ano, numero] = mes.split('-').map(Number)
  const rotulo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(ano, numero - 1, 1)))
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1)
}

// "2026-11-16" -> "16/11/2026", sem passar por fuso (a data do banco não tem hora).
export function formatarDia(dia) {
  const [a, m, d] = String(dia).split('-')
  return `${d}/${m}/${a}`
}

// "Hoje" em São Paulo, no formato "YYYY-MM-DD".
export function hoje(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}
