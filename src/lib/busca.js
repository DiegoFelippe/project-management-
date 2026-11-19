// Busca no banco (clientes, pessoas, consultorias): compara com colunas já sem acento e em minúsculas.
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
