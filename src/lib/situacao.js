// Em que pé está o acesso de uma pessoa (coluna Situação em Usuários).
export function situacao(perfil) {
  if (perfil.ativo === false) return 'Desativado'
  if (perfil.convite_pendente) return 'Convite pendente'
  if (perfil.precisa_trocar_senha) return 'Senha provisória'
  return 'Ativo'
}
