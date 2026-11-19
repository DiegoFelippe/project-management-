// Padrão Hub: nas linhas das tabelas as ações são ghost sm; no cabeçalho da página, a principal do contexto é
// cheia (default) e as demais são outline, em tamanho padrão.
export function estiloDaAcao(noCabecalho, principal = false) {
  if (!noCabecalho) return { variant: 'ghost', size: 'sm' }
  return { variant: principal ? 'default' : 'outline' }
}
