export function iniciais(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const primeira = partes[0][0]
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

export function primeiroNome(nome = '') {
  return nome.trim().split(/\s+/)[0] || ''
}

// "A", "A e B", "A, B e C" (lista em português; vazia vira "").
const LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' })
export const juntar = (itens) => LISTA.format(itens)

// "1 tarefa", "2 tarefas", "1.234 clientes".
export const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
