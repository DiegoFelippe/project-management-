// Quando o Supabase recusa um link (Google, convite, senha), o motivo vem no endereço (hash ou query).
export function codigoDeErroNoEndereco() {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
  return params.get('error_code') ?? (params.get('error') ? 'desconhecido' : null)
}
