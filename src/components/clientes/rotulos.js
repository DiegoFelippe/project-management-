import { formatarHoras, formatarOcupacao } from '@/lib/horas'

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

// Texto de cada evento do histórico. Nome nulo = o banco escondeu (é de outra consultoria).
export function textoDoEvento(e) {
  const consultoria = (nome) => nome ?? 'outra consultoria'
  const consultor = (nome) => nome ?? 'outro consultor'
  switch (e.tipo) {
    case 'cadastrado': return 'Cadastrado'
    case 'editado': return 'Dados editados'
    case 'enviado': return `Mandado para ${consultoria(e.para_consultoria)}`
    case 'movido': return e.de_consultoria
      ? `Movido de ${e.de_consultoria} para ${consultoria(e.para_consultoria)}`
      : `Movido para ${consultoria(e.para_consultoria)}`
    case 'devolvido': return 'Devolvido à central'
    case 'consultor_escolhido': return `Consultor: ${consultor(e.para_consultor)}`
    case 'consultor_trocado': return `Consultor trocado para ${consultor(e.para_consultor)}`
    case 'consultor_removido': return 'Ficou sem consultor'
    case 'previsao_ajustada': return `Previsão de ${formatarHoras(e.de_horas)} para ${formatarHoras(e.para_horas)}`
    case 'arquivado': return 'Arquivado'
    case 'reativado': return 'Reativado'
    default: return e.tipo
  }
}
