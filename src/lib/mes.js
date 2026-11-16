// Mês de trabalho: "YYYY-MM-01". "Hoje" é sempre o de São Paulo, onde a equipe está.
const FUSO = 'America/Sao_Paulo'

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
