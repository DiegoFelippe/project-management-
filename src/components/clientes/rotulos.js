import { formatarOcupacao } from '@/lib/horas'

// Valor à direita de cada opção: a ocupação, ou o aviso de que não há capacidade.
export function rotuloDeOcupacao(item) {
  return item.ocupacao === null || item.ocupacao === undefined ? 'sem capacidade' : formatarOcupacao(item.ocupacao)
}

// A sugestão é o primeiro com ocupação conhecida (a lista já vem da menor para a maior), fora o atual.
export function sugestaoDe(itens, atualId) {
  return itens?.find((i) => i.id !== atualId && i.ocupacao !== null && i.ocupacao !== undefined) ?? null
}

export const MAXIMO_DE_HORAS_NO_MES = 744

// Aceita "40", "40,5" e "40.5"; devolve o número ou null quando não é número.
export function lerHoras(texto) {
  const limpo = String(texto).trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(limpo)) return null
  return Number(limpo)
}
