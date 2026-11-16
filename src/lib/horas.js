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
