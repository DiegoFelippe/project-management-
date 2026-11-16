const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function formatarHoras(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${NUMERO.format(n)} h`
}

export function formatarOcupacao(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Math.round(n * 100)}%`
}

export function horasEntre(inicio, fim) {
  return (fim.getTime() - inicio.getTime()) / 3_600_000
}

// Tempo decorrido em "1 h 05"; abaixo de uma hora, "5 min".
export function formatarDuracao(milissegundos) {
  const minutos = Math.max(0, Math.floor(milissegundos / 60_000))
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')}`
}

// Mês já fechado: o reservado é a previsão de hoje, não a de então, então some; a ocupação vira "Utilização".
export function colunasDoMes(passado) {
  return ['Capacidade', ...(passado ? [] : ['Reservado']), 'Realizado', passado ? 'Utilização' : 'Ocupação']
}
