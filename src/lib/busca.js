// Busca dos clientes.
// Termo da busca: sem acento, minúsculo, com \, % e _ escapados (procuram o próprio caractere).
export function padraoDeBusca(busca) {
  const termo = String(busca ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // O PostgREST trata * como % no like/ilike e não há como escapá-lo: sai do termo.
    .replace(/\*/g, '')
    .trim()
  if (!termo) return null
  return `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

// Termo para um ilike no meio do texto (nomes): sem * (o PostgREST o trata como %), com \, % e _ escapados.
// Não tira acentos (compara com o nome como está gravado). Vazio devolve null.
export function padraoParcial(busca) {
  const termo = String(busca ?? '').replace(/\*/g, '').trim()
  return termo ? `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
}
